/**
 * Prescription PDF service (EHR Sub-batch B2 / T3.15).
 *
 * Public surface:
 *   - `generatePrescriptionPdf(prescriptionId)` — full pipeline:
 *       1. Loads prescription + medicines + doctor/patient/appointment +
 *          doctor_settings + auth.users metadata.
 *       2. Renders the React-PDF tree to a Buffer via
 *          `@react-pdf/renderer`'s `renderToBuffer`.
 *       3. Uploads (upsert) to `prescription-pdfs/<doctor_id>/<rx_id>.pdf`
 *          via the service-role Supabase client.
 *       4. Mints a 24h-TTL signed URL.
 *       5. Caches `{ storagePath, signedUrl, generatedAt }` for 5
 *          minutes (in-memory, per-process Map keyed by prescription_id;
 *          per master-batch decision 18).
 *       6. Returns `{ storagePath, signedUrl, generatedAt, byteCount,
 *          cacheHit }`.
 *
 *   - `forceRegeneratePrescriptionPdf(prescriptionId)` — same but
 *     bypasses (and invalidates) the cache. Used by the "Regenerate
 *     PDF" kebab action in T3.19.
 *   - `getOrCreateSignedPdfUrl` — signed URL for share/send. Delegates to
 *     `generatePrescriptionPdf` (sent = remint frozen file; unsent =
 *     re-render). Does not remint a stale stored file for drafts.
 *   - `getPrescriptionPdfBytes` — doctor print/download. Returns the
 *     rendered buffer as soon as it is ready; does not wait for
 *     upload+sign. Sent Rx download the frozen stored file.
 *
 * **Decision recap** (locked):
 *   - T3-D1: PDF runtime is `@react-pdf/renderer` (no Chromium).
 *   - T3-D2: bucket is `prescription-pdfs`, private, signed-URL only;
 *     overwrite-on-regen — we never accumulate per-version PDFs.
 *   - Master batch #16: missing letterhead fields degrade gracefully
 *     (no logo → text-only; no signature image → typed name).
 *   - Master batch #18: 5-min in-memory cache for resends.
 *
 * **What the service does NOT do**:
 *   - Authorise the caller. Callers (controller, send pipeline) are
 *     responsible for verifying the doctor owns the prescription
 *     BEFORE invoking. This mirrors the existing pattern in
 *     `notification-service.sendPrescriptionToPatient`.
 *   - Audit. The send pipeline writes the audit row when the PDF is
 *     actually delivered; the controller-level "regenerate"/"share-link"
 *     paths log via the standard data-modification helper.
 */

import * as React from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { DateTime } from 'luxon';

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError, PrescriptionMedicinesMismatchError } from '../utils/errors';
import { assertUnsentForRegenerate } from '../utils/prescription-pdf-freeze';
import {
  cacheGet,
  cacheGetBytes,
  cacheSet,
  cacheSetBytes,
  invalidatePrescriptionPdfCache,
  pdfCacheGeneration,
  withPdfBytesInflight,
  withPdfGenerateInflight,
} from './prescription-pdf-cache';
import { getDoctorSettings } from './doctor-settings-service';
import { withPrescriptionMedicinesLock } from './prescription-medicine-lock';
import { prescriptionMedicinePrintKey } from '../utils/prescription-medicine-print-key';
import { resolveLetterhead } from './letterhead-service';
import { stampPrescriptionPageNumbers } from '../templates/prescription-pdf/page-numbers';
import { PrescriptionDocument } from '../templates/prescription-pdf/PrescriptionDocument';
import type { PrescriptionPdfData } from '../templates/prescription-pdf/types';
import { resolvePatientAgeLabel } from '../templates/prescription-pdf/patient-identity';
import {
  mapPrescriptionToPdfBody,
  type PrescriptionPdfSourceRow,
} from './prescription-pdf-composer';
import type { AllergyForOutput } from '../utils/allergy-format';
import type { PrescriptionMedicine } from '../types/prescription';
import {
  buildPrescriptionReplacesLine,
  issuedInstantIso,
} from '../utils/prescription-replaces-line';

// ============================================================================
// Public types
// ============================================================================

export interface PrescriptionPdfResult {
  /** Storage object path in the `prescription-pdfs` bucket. */
  storagePath: string;
  /** 24h-TTL signed URL (re-mint via this service for fresh URLs). */
  signedUrl: string;
  /** ISO timestamp the file was rendered (cached or fresh). */
  generatedAt: string;
  /** PDF byte count (helpful for budgeting + smoke-test asserts). */
  byteCount: number;
  /** True when served from the in-memory cache without re-rendering. */
  cacheHit: boolean;
  /**
   * Rendered bytes when this process still holds them (print + email
   * attach). Omitted for frozen remints that never downloaded the file.
   */
  bytes?: Buffer;
}

export { invalidatePrescriptionPdfCache };

// ============================================================================
// Internal: env-derived constants
// ============================================================================

const BUCKET = 'prescription-pdfs';
const CONTENT_TYPE = 'application/pdf';
/** 24h. The patient share-link route mints fresh URLs on each visit; the
 *  send pipeline re-mints on resend within the 5-min cache window. */
const SIGNED_URL_TTL_SEC = 24 * 60 * 60;

// ============================================================================
// Internal: data assembly
// ============================================================================

interface AppointmentRow {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_date: string | null;
}

interface PatientRow {
  id: string;
  name: string | null;
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  guardian_name: string | null;
  guardian_relation: string | null;
  address: string | null;
  medical_record_number: string | null;
}

interface PrescriptionRow extends PrescriptionPdfSourceRow {
  id: string;
  appointment_id: string;
  doctor_id: string;
  created_at: string;
  sent_to_patient_at: string | null;
  version?: number | null;
  supersedes_id?: string | null;
  issued_at?: string | null;
  attested_at?: string | null;
}

/**
 * Pull the doctor's display name from `auth.users.raw_user_meta_data`.
 * Mirrors the convention established by `post-call-summary-service.ts`
 * (the auth schema isn't exposed via PostgREST so we go through
 * `auth.admin.getUserById`).
 *
 * Returns the prefixed `Dr. ...` string; `null` when lookup fails so
 * the caller can fall back to clinic_name + a literal "Doctor".
 */
async function getDoctorDisplayName(
  doctorId: string,
  correlationId: string
): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(doctorId);
    if (error || !data?.user) return null;
    const meta =
      (data.user.user_metadata as { full_name?: string; name?: string } | null | undefined) ?? {};
    const raw =
      (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
      (typeof meta.name === 'string' && meta.name.trim()) ||
      (data.user.email ? data.user.email.split('@')[0] : '') ||
      '';
    if (!raw) return null;
    return raw.toLowerCase().startsWith('dr') ? raw.replace(/^dr\.?\s*/i, 'Dr. ') : `Dr. ${raw}`;
  } catch (err) {
    logger.warn(
      {
        correlationId,
        doctorId,
        error: err instanceof Error ? err.message : String(err),
      },
      'getDoctorDisplayName: auth.admin.getUserById threw; using clinic fallback'
    );
    return null;
  }
}

/** Matches frontend `formatDate` medium (en-GB), e.g. "25 Aug 2026". */
const VISIT_DATE_FORMAT = 'd LLL yyyy';

function formatVisitDate(iso: string | null, timezone: string | undefined): string {
  const tz = timezone ?? 'Asia/Kolkata';
  if (!iso) return DateTime.now().setZone(tz).toFormat(VISIT_DATE_FORMAT);
  const dt = DateTime.fromISO(iso, { zone: tz });
  return dt.isValid ? dt.toFormat(VISIT_DATE_FORMAT) : iso;
}

function formatGeneratedAt(iso: string, timezone: string | undefined): string {
  const tz = timezone ?? 'Asia/Kolkata';
  const dt = DateTime.fromISO(iso, { zone: tz });
  return dt.isValid ? dt.toFormat("LLL d, yyyy · h:mm a 'IST'") : iso;
}

type BuiltPdfData =
  | { kind: 'frozen'; doctorId: string }
  | { kind: 'ready'; data: PrescriptionPdfData; doctorId: string };

async function readMedicinesForPdf(
  prescriptionId: string,
  medicineKey: string | undefined,
): Promise<PrescriptionMedicine[]> {
  return withPrescriptionMedicinesLock(prescriptionId, async () => {
    const admin = getSupabaseAdminClient();
    if (!admin) {
      throw new InternalError('Service role client not available for PDF generation');
    }
    const { data, error } = await admin
      .from('prescription_medicines')
      .select('*')
      .eq('prescription_id', prescriptionId)
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) {
      throw new InternalError(`Medicines fetch failed: ${error.message}`);
    }
    const rows = (data ?? []) as PrescriptionMedicine[];
    if (medicineKey !== undefined) {
      const actual = prescriptionMedicinePrintKey(rows.map((row) => row.medicine_name));
      if (actual !== medicineKey) {
        throw new PrescriptionMedicinesMismatchError();
      }
    }
    return rows;
  });
}

async function buildPdfData(
  prescriptionId: string,
  correlationId: string,
  medicineKey?: string,
): Promise<BuiltPdfData> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for PDF generation');
  }

  // 1. Prescription + medicines. The medicine read waits out any in-flight
  // save so print cannot observe the insert/delete overlap.
  const [{ data: rxData, error: rxErr }, medicines] = await Promise.all([
    admin.from('prescriptions').select('*').eq('id', prescriptionId).single(),
    readMedicinesForPdf(prescriptionId, medicineKey),
  ]);

  if (rxErr || !rxData) {
    throw new NotFoundError('Prescription not found');
  }

  const rx = rxData as PrescriptionRow;

  if (rx.sent_to_patient_at) {
    return { kind: 'frozen', doctorId: rx.doctor_id };
  }

  const needDeskVitals = !rx.vitals_json?.sectionNote?.trim();

  // 2. Appointment, letterhead, doctor name, and desk-vitals note in parallel.
  const needsPreviousIssue =
    (rx.version ?? 1) >= 2 &&
    typeof rx.supersedes_id === 'string' &&
    rx.supersedes_id.length > 0;

  const [
    { data: aptData, error: aptErr },
    doctorSettings,
    doctorDisplayName,
    letterhead,
    deskVitalsResult,
    previousIssueResult,
  ] = await Promise.all([
    admin
      .from('appointments')
      .select('id, doctor_id, patient_id, patient_name, patient_phone, appointment_date')
      .eq('id', rx.appointment_id)
      .single(),
    getDoctorSettings(rx.doctor_id),
    getDoctorDisplayName(rx.doctor_id, correlationId),
    resolveLetterhead(rx.doctor_id, correlationId),
    needDeskVitals
      ? admin
          .from('patient_vitals')
          .select('note')
          .eq('doctor_id', rx.doctor_id)
          .eq('appointment_id', rx.appointment_id)
          .is('archived_at', null)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    needsPreviousIssue
      ? admin
          .from('prescriptions')
          .select('issued_at, attested_at')
          .eq('id', rx.supersedes_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (aptErr || !aptData) {
    throw new NotFoundError('Appointment not found for prescription');
  }
  const apt = aptData as AppointmentRow;

  // 3. Patient row (optional). Patient may be null on bot-flow Rx
  //    where only the appointment.patient_name was captured.
  let patient: PatientRow | null = null;
  let allergies: AllergyForOutput[] = [];
  let noKnownAllergies = false;
  if (apt.patient_id) {
    const [
      { data: pData },
      { data: allergyRows, error: allergyErr },
      { data: allergySection, error: allergySectionErr },
    ] = await Promise.all([
      admin
        .from('patients')
        .select(
          'id, name, date_of_birth, age, gender, phone, guardian_name, guardian_relation, address, medical_record_number'
        )
        .eq('id', apt.patient_id)
        .single(),
      admin
        .from('patient_allergies')
        .select('allergen, severity, reaction')
        .eq('doctor_id', rx.doctor_id)
        .eq('patient_id', apt.patient_id)
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
      admin
        .from('patient_allergies_section_notes')
        .select('no_known_allergies')
        .eq('doctor_id', rx.doctor_id)
        .eq('patient_id', apt.patient_id)
        .maybeSingle(),
    ]);
    patient = (pData as PatientRow | null) ?? null;
    if (allergyErr) {
      throw new InternalError(`Allergies fetch failed: ${allergyErr.message}`);
    }
    if (allergySectionErr) {
      throw new InternalError(`Allergy section fetch failed: ${allergySectionErr.message}`);
    }
    allergies = (allergyRows ?? []) as AllergyForOutput[];
    noKnownAllergies =
      (allergySection as { no_known_allergies?: boolean } | null)?.no_known_allergies === true;
  }

  const deskVitalsNote =
    (deskVitalsResult.data as { note?: string | null } | null)?.note?.trim() || null;

  // 4. Header from resolveLetterhead (BRD-D7). Missing fields stay null
  //    and the template hides them (T3-D4 graceful degrade).
  const clinicName = letterhead.clinicName;
  const doctorName = doctorDisplayName?.trim() || (clinicName ? clinicName : 'Doctor');

  const data: PrescriptionPdfData = {
    header: {
      doctorName,
      qualifications: letterhead.qualifications,
      specialty: letterhead.specialty,
      registrationNumber: letterhead.registrationNumber,
      clinicName,
      clinicAddress: letterhead.clinicAddress,
      logoSrc: letterhead.logo
        ? { data: letterhead.logo.bytes, format: letterhead.logo.format }
        : null,
      headerSrc: letterhead.header
        ? { data: letterhead.header.bytes, format: letterhead.header.format }
        : null,
    },
    footer: {
      doctorName,
      shortId: rx.id.slice(-8),
      generatedAtLabel: formatGeneratedAt(new Date().toISOString(), doctorSettings?.timezone),
      bannerSrc: letterhead.footer
        ? { data: letterhead.footer.bytes, format: letterhead.footer.format }
        : null,
      footerLine: letterhead.footerLine,
      hideHaloCredit: letterhead.hideHaloCredit,
      replacesLine: buildPrescriptionReplacesLine({
        version: rx.version,
        revisedAtIso: issuedInstantIso(rx.issued_at, rx.attested_at),
        previousIssuedAtIso: issuedInstantIso(
          (previousIssueResult.data as { issued_at?: string | null } | null)?.issued_at,
          (previousIssueResult.data as { attested_at?: string | null } | null)?.attested_at
        ),
        timezone: doctorSettings?.timezone,
      }),
    },
    layout: {
      preset: letterhead.preset,
      pageSize: letterhead.pageSize,
      accentColor: letterhead.accentColor,
      chromeColor: letterhead.chromeColor,
      patientColor: letterhead.patientColor,
      preprintMarginTopMm: letterhead.preprintMarginTopMm,
      preprintMarginBottomMm: letterhead.preprintMarginBottomMm,
      headerHeightMm: letterhead.headerHeightMm,
      footerHeightMm: letterhead.footerHeightMm,
      pageMarginTopMm: letterhead.pageMarginTopMm,
      pageMarginRightMm: letterhead.pageMarginRightMm,
      pageMarginBottomMm: letterhead.pageMarginBottomMm,
      pageMarginLeftMm: letterhead.pageMarginLeftMm,
      logoSize: letterhead.logoSize,
      patientIdentityPreset: letterhead.patientIdentityPreset,
      showPatientPhone: letterhead.showPatientPhone,
      showPatientGuardian: letterhead.showPatientGuardian,
      showPatientMrn: letterhead.showPatientMrn,
      showPatientAddress: letterhead.showPatientAddress,
      backgroundSrc: letterhead.background
        ? { data: letterhead.background.bytes, format: letterhead.background.format }
        : null,
      backgroundPreset: letterhead.backgroundPreset,
      backgroundOpacity: letterhead.backgroundOpacity,
      headerFit: letterhead.headerFit,
      footerFit: letterhead.footerFit,
      backgroundFit: letterhead.backgroundFit,
      headerTextSize: letterhead.headerTextSize,
      patientTextSize: letterhead.patientTextSize,
      bodyTextSize: letterhead.bodyTextSize,
    },
    patient: {
      patientName: patient?.name?.trim() || apt.patient_name?.trim() || 'Patient',
      patientAge: resolvePatientAgeLabel(patient?.date_of_birth ?? null, patient?.age),
      patientGender: patient?.gender?.trim() || null,
      visitDateLabel: formatVisitDate(apt.appointment_date, doctorSettings?.timezone),
      patientPhone: patient?.phone?.trim() || apt.patient_phone?.trim() || null,
      guardianName: patient?.guardian_name?.trim() || null,
      guardianRelation: patient?.guardian_relation?.trim() || null,
      address: patient?.address?.trim() || null,
      medicalRecordNumber: patient?.medical_record_number?.trim() || null,
    },
    body: mapPrescriptionToPdfBody(rx, medicines, {
      allergies,
      noKnownAllergies,
      deskVitalsNote,
    }),
  };

  return { kind: 'ready', data, doctorId: rx.doctor_id };
}

// ============================================================================
// Internal: render + upload + sign
// ============================================================================

async function renderPdfBuffer(data: PrescriptionPdfData): Promise<Buffer> {
  // Render the React-PDF tree to a Buffer. `renderToBuffer` returns
  // a Node Buffer (when running on the server) — its types declare
  // `Promise<Blob | Buffer>` to support browser usage.
  //
  // Type cast: `renderToBuffer` is overloaded to accept
  // `ReactElement<DocumentProps>`. Our `PrescriptionDocument` wraps
  // a `<Document>` at the root so the runtime contract holds; we
  // narrow the FunctionComponent's element type to satisfy the
  // signature.
  const element = React.createElement(PrescriptionDocument, {
    data,
  }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = (await renderToBuffer(element)) as Buffer;
  if (!buffer || buffer.length === 0) {
    throw new InternalError('PDF render produced empty buffer');
  }
  return stampPrescriptionPageNumbers(buffer);
}

async function uploadPdfAndSign(
  prescriptionId: string,
  doctorId: string,
  buffer: Buffer,
  correlationId: string
): Promise<PrescriptionPdfResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for PDF generation');
  }

  const storagePath = `${doctorId}/${prescriptionId}.pdf`;

  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: CONTENT_TYPE,
    upsert: true,
  });
  if (uploadErr) {
    throw new InternalError(
      `prescription-pdf-service: Storage upload failed (${uploadErr.message})`
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (signErr || !signed?.signedUrl) {
    throw new InternalError(
      `prescription-pdf-service: signed URL mint failed (${signErr?.message ?? 'unknown'})`
    );
  }

  const result: PrescriptionPdfResult = {
    storagePath,
    signedUrl: signed.signedUrl,
    generatedAt: new Date().toISOString(),
    byteCount: buffer.length,
    cacheHit: false,
    bytes: buffer,
  };

  logger.info(
    {
      correlationId,
      prescriptionId,
      doctorId,
      byteCount: buffer.length,
    },
    'prescription-pdf-service: upload+sign complete'
  );

  return result;
}

async function downloadStoredPdf(storagePath: string): Promise<Buffer | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

interface PdfBytesReady {
  bytes: Buffer;
  doctorId: string;
  storagePath: string;
}

/**
 * Render (unsent) or download (sent) PDF bytes. Resolves as soon as
 * the buffer is ready — does not wait for upload+sign.
 */
async function ensurePdfBytes(
  prescriptionId: string,
  correlationId: string,
  opts?: { skipCache?: boolean; medicineKey?: string }
): Promise<PdfBytesReady> {
  if (!opts?.skipCache) {
    const cached = cacheGetBytes(prescriptionId);
    if (cached) {
      const stamp = await loadSentStamp(prescriptionId);
      if (stamp?.doctorId) {
        return {
          bytes: cached,
          doctorId: stamp.doctorId,
          storagePath: `${stamp.doctorId}/${prescriptionId}.pdf`,
        };
      }
    }
  }

  const renderNow = async (): Promise<PdfBytesReady> => {
    const startedAtGen = pdfCacheGeneration(prescriptionId);
    if (!opts?.skipCache) {
      const again = cacheGetBytes(prescriptionId);
      if (again) {
        const stamp = await loadSentStamp(prescriptionId);
        if (stamp?.doctorId) {
          return {
            bytes: again,
            doctorId: stamp.doctorId,
            storagePath: `${stamp.doctorId}/${prescriptionId}.pdf`,
          };
        }
      }
    }

    const built = await buildPdfData(prescriptionId, correlationId, opts?.medicineKey);
    if (built.kind === 'frozen') {
      const storagePath = `${built.doctorId}/${prescriptionId}.pdf`;
      const downloaded = await downloadStoredPdf(storagePath);
      if (!downloaded) {
        throw new InternalError('Frozen prescription PDF is missing from storage');
      }
      cacheSetBytes(prescriptionId, downloaded, startedAtGen);
      logger.info(
        { correlationId, prescriptionId, byteCount: downloaded.length },
        'prescription-pdf-service: downloaded frozen pdf bytes'
      );
      return { bytes: downloaded, doctorId: built.doctorId, storagePath };
    }

    const t0 = Date.now();
    const buffer = await renderPdfBuffer(built.data);
    const renderMs = Date.now() - t0;
    // Unsent print must not park this buffer — a later save can finish
    // while this render is still in flight and recache the older slip.
    if (!opts?.skipCache) {
      cacheSetBytes(prescriptionId, buffer, startedAtGen);
    }
    logger.info(
      {
        correlationId,
        prescriptionId,
        doctorId: built.doctorId,
        byteCount: buffer.length,
        renderMs,
      },
      'prescription-pdf-service: render complete'
    );
    return {
      bytes: buffer,
      doctorId: built.doctorId,
      storagePath: `${built.doctorId}/${prescriptionId}.pdf`,
    };
  };

  // A skip-cache print must not join a preview-warm render that started
  // against an older medicines list.
  if (opts?.skipCache) {
    return renderNow();
  }

  return withPdfBytesInflight(prescriptionId, renderNow);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate (or fetch from 5-min cache) a fresh PDF + signed URL for a
 * prescription. Concurrent callers share one in-flight render (send +
 * print). Idempotent for the cache window; safe to call from the send
 * pipeline + the doctor's "Resend" action.
 */
async function loadSentStamp(
  prescriptionId: string
): Promise<{ doctorId: string; sentToPatientAt: string | null } | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from('prescriptions')
    .select('doctor_id, sent_to_patient_at')
    .eq('id', prescriptionId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { doctor_id: string; sent_to_patient_at: string | null };
  return { doctorId: row.doctor_id, sentToPatientAt: row.sent_to_patient_at };
}

export async function generatePrescriptionPdf(
  prescriptionId: string,
  correlationId: string
): Promise<PrescriptionPdfResult> {
  const cached = cacheGet(prescriptionId);
  if (cached) {
    logger.info(
      { correlationId, prescriptionId, byteCount: cached.byteCount },
      'prescription-pdf-service: cache hit'
    );
    return { ...cached, bytes: cacheGetBytes(prescriptionId) ?? undefined };
  }

  return withPdfGenerateInflight(prescriptionId, async () => {
    const startedAtGen = pdfCacheGeneration(prescriptionId);
    const again = cacheGet(prescriptionId);
    if (again) return { ...again, bytes: cacheGetBytes(prescriptionId) ?? undefined };

    // BRD-D4: a sent Rx keeps the stored artifact. Remint the URL; do not
    // re-render with current branding.
    const stamp = await loadSentStamp(prescriptionId);
    if (stamp?.sentToPatientAt) {
      const existing = await getFreshSignedUrlForExistingPdf(prescriptionId, stamp.doctorId);
      if (existing) {
        const frozen: PrescriptionPdfResult = {
          storagePath: `${stamp.doctorId}/${prescriptionId}.pdf`,
          signedUrl: existing,
          generatedAt: stamp.sentToPatientAt,
          byteCount: 0,
          cacheHit: false,
          bytes: cacheGetBytes(prescriptionId) ?? undefined,
        };
        cacheSet(prescriptionId, frozen, startedAtGen);
        logger.info(
          { correlationId, prescriptionId },
          'prescription-pdf-service: reminted frozen sent pdf'
        );
        return frozen;
      }
    }

    const { bytes, doctorId } = await ensurePdfBytes(prescriptionId, correlationId);
    const result = await uploadPdfAndSign(prescriptionId, doctorId, bytes, correlationId);
    cacheSet(prescriptionId, result, startedAtGen);
    return { ...result, bytes };
  });
}

/**
 * Doctor print / download. Returns rendered bytes as soon as they are
 * ready — does not wait for storage upload + signed URL mint.
 */
export async function getPrescriptionPdfBytes(
  prescriptionId: string,
  correlationId: string,
  opts?: { medicineKey?: string }
): Promise<{ bytes: Buffer; byteCount: number }> {
  const stamp = await loadSentStamp(prescriptionId);
  // Unsent drafts re-render so a medicine saved after the last print
  // cannot be served from a stale 5-min bytes cache. A sent file is the
  // frozen artifact; still refuse it when the screen list does not match
  // the stored rows.
  if (stamp?.sentToPatientAt && opts?.medicineKey !== undefined) {
    await readMedicinesForPdf(prescriptionId, opts.medicineKey);
  }
  if (stamp?.sentToPatientAt) {
    const cached = cacheGetBytes(prescriptionId);
    if (cached) {
      logger.info(
        { correlationId, prescriptionId, byteCount: cached.length },
        'prescription-pdf-service: bytes cache hit'
      );
      return { bytes: cached, byteCount: cached.length };
    }
  }

  const { bytes } = await ensurePdfBytes(prescriptionId, correlationId, {
    skipCache: !stamp?.sentToPatientAt,
    medicineKey: stamp?.sentToPatientAt ? undefined : opts?.medicineKey,
  });
  return { bytes, byteCount: bytes.length };
}

/**
 * Force a fresh render + upload, bypassing (and invalidating) the
 * 5-min cache. Used by the "Regenerate PDF" kebab action when the
 * doctor's letterhead has changed.
 */
export async function forceRegeneratePrescriptionPdf(
  prescriptionId: string,
  correlationId: string
): Promise<PrescriptionPdfResult> {
  const stamp = await loadSentStamp(prescriptionId);
  assertUnsentForRegenerate(stamp?.sentToPatientAt ?? null);
  invalidatePrescriptionPdfCache(prescriptionId);
  const { bytes, doctorId } = await ensurePdfBytes(prescriptionId, correlationId);
  const result = await uploadPdfAndSign(prescriptionId, doctorId, bytes, correlationId);
  cacheSet(prescriptionId, result);
  return { ...result, bytes };
}

/**
 * Mint a fresh 24h signed URL for an EXISTING PDF without re-rendering.
 * Used by the patient share-link route and the doctor print path to
 * avoid serving stale URLs hours after the original send.
 *
 * Returns `null` when the file doesn't exist in storage — the caller
 * can then trigger `generatePrescriptionPdf` to bootstrap.
 */
export async function getFreshSignedUrlForExistingPdf(
  prescriptionId: string,
  doctorId: string
): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const storagePath = `${doctorId}/${prescriptionId}.pdf`;
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Doctor print / View PDF. Delegates to `generatePrescriptionPdf`:
 * sent Rx remint the frozen stored artifact (BRD-D4); unsent Rx
 * re-render so template + content edits show up on the next print.
 *
 * Caller must verify ownership first. Does not re-fire any patient
 * channel and does not touch `sent_to_patient_at`.
 *
 * `doctorId` is accepted for the existing controller contract; the
 * generate path loads ownership from the prescription row.
 */
export async function getOrCreateSignedPdfUrl(
  prescriptionId: string,
  _doctorId: string,
  correlationId: string
): Promise<{ signedUrl: string }> {
  const result = await generatePrescriptionPdf(prescriptionId, correlationId);
  return { signedUrl: result.signedUrl };
}
