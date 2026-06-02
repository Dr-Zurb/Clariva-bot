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
import { InternalError, NotFoundError } from '../utils/errors';
import { getDoctorSettings } from './doctor-settings-service';
import { PrescriptionDocument } from '../templates/prescription-pdf/PrescriptionDocument';
import type { PrescriptionPdfData } from '../templates/prescription-pdf/types';
import type { PrescriptionMedicine } from '../types/prescription';

// ============================================================================
// Public types
// ============================================================================

export interface PrescriptionPdfResult {
  /** Storage object path in the `prescription-pdfs` bucket. */
  storagePath: string;
  /** 24h-TTL signed URL (re-mint via this service for fresh URLs). */
  signedUrl:   string;
  /** ISO timestamp the file was rendered (cached or fresh). */
  generatedAt: string;
  /** PDF byte count (helpful for budgeting + smoke-test asserts). */
  byteCount:   number;
  /** True when served from the in-memory cache without re-rendering. */
  cacheHit:    boolean;
}

// ============================================================================
// Internal: 5-min in-memory cache
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  result:  PrescriptionPdfResult;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

function cacheGet(prescriptionId: string): PrescriptionPdfResult | null {
  const entry = cache.get(prescriptionId);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(prescriptionId);
    return null;
  }
  // Mark cacheHit=true even though the underlying file/signed URL was
  // produced earlier. The signedUrl is still valid for ~24h from
  // mint time, so a 5-min cache is comfortably within its lifetime.
  return { ...entry.result, cacheHit: true };
}

function cacheSet(prescriptionId: string, result: PrescriptionPdfResult): void {
  cache.set(prescriptionId, {
    result: { ...result, cacheHit: false },
    expires: Date.now() + CACHE_TTL_MS,
  });
}

function cacheDelete(prescriptionId: string): void {
  cache.delete(prescriptionId);
}

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
  id:                   string;
  doctor_id:            string;
  patient_id:           string | null;
  patient_name:         string | null;
  appointment_date:     string | null;
}

interface PatientRow {
  id:            string;
  name:          string | null;
  date_of_birth: string | null;
  gender:        string | null;
}

interface PrescriptionRow {
  id:                    string;
  appointment_id:        string;
  doctor_id:             string;
  cc:                    string | null;
  hopi:                  string | null;
  provisional_diagnosis: string | null;
  // cockpit-v2 / migration 103: renamed from `investigations`.
  investigations_orders: string | null;
  follow_up:             string | null;
  patient_education:     string | null;
  clinical_notes:        string | null;
  created_at:            string;
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
  correlationId: string,
): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(doctorId);
    if (error || !data?.user) return null;
    const meta = (data.user.user_metadata as
      | { full_name?: string; name?: string }
      | null
      | undefined) ?? {};
    const raw =
      (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
      (typeof meta.name === 'string' && meta.name.trim()) ||
      (data.user.email ? data.user.email.split('@')[0] : '') ||
      '';
    if (!raw) return null;
    return raw.toLowerCase().startsWith('dr')
      ? raw.replace(/^dr\.?\s*/i, 'Dr. ')
      : `Dr. ${raw}`;
  } catch (err) {
    logger.warn(
      {
        correlationId,
        doctorId,
        error: err instanceof Error ? err.message : String(err),
      },
      'getDoctorDisplayName: auth.admin.getUserById threw; using clinic fallback',
    );
    return null;
  }
}

/** Compute integer years from `date_of_birth` (YYYY-MM-DD). */
function computeAgeLabel(dob: string | null): string | null {
  if (!dob) return null;
  const dt = DateTime.fromISO(dob);
  if (!dt.isValid) return null;
  const years = Math.floor(DateTime.now().diff(dt, 'years').years);
  if (years < 0 || years > 130) return null;
  return `${years} y`;
}

function formatVisitDate(iso: string | null, timezone: string | undefined): string {
  const tz = timezone ?? 'Asia/Kolkata';
  if (!iso) return DateTime.now().setZone(tz).toFormat('LLL d, yyyy');
  const dt = DateTime.fromISO(iso, { zone: tz });
  return dt.isValid ? dt.toFormat('LLL d, yyyy · h:mm a') : iso;
}

function formatGeneratedAt(iso: string, timezone: string | undefined): string {
  const tz = timezone ?? 'Asia/Kolkata';
  const dt = DateTime.fromISO(iso, { zone: tz });
  return dt.isValid ? dt.toFormat("LLL d, yyyy · h:mm a 'IST'") : iso;
}

async function buildPdfData(
  prescriptionId: string,
  correlationId: string,
): Promise<{ data: PrescriptionPdfData; doctorId: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for PDF generation');
  }

  // 1. Prescription + medicines (parallel)
  const [{ data: rxData, error: rxErr }, { data: medsData, error: medsErr }] =
    await Promise.all([
      admin.from('prescriptions').select('*').eq('id', prescriptionId).single(),
      admin
        .from('prescription_medicines')
        .select('*')
        .eq('prescription_id', prescriptionId)
        .order('sort_order', { ascending: true, nullsFirst: false }),
    ]);

  if (rxErr || !rxData) {
    throw new NotFoundError('Prescription not found');
  }
  if (medsErr) {
    throw new InternalError(`Medicines fetch failed: ${medsErr.message}`);
  }

  const rx = rxData as PrescriptionRow;
  const medicines = (medsData ?? []) as PrescriptionMedicine[];

  // 2. Appointment (for visit date + patient_id) and doctor settings
  //    + doctor display name in parallel.
  const [
    { data: aptData, error: aptErr },
    doctorSettings,
    doctorDisplayName,
  ] = await Promise.all([
    admin
      .from('appointments')
      .select('id, doctor_id, patient_id, patient_name, appointment_date')
      .eq('id', rx.appointment_id)
      .single(),
    getDoctorSettings(rx.doctor_id),
    getDoctorDisplayName(rx.doctor_id, correlationId),
  ]);

  if (aptErr || !aptData) {
    throw new NotFoundError('Appointment not found for prescription');
  }
  const apt = aptData as AppointmentRow;

  // 3. Patient row (optional). Patient may be null on bot-flow Rx
  //    where only the appointment.patient_name was captured.
  let patient: PatientRow | null = null;
  if (apt.patient_id) {
    const { data: pData } = await admin
      .from('patients')
      .select('id, name, date_of_birth, gender')
      .eq('id', apt.patient_id)
      .single();
    patient = (pData as PatientRow | null) ?? null;
  }

  // 4. Header data assembly with graceful fallbacks (decision T3-D4).
  //    The `doctor_settings` table currently lacks `registration_number`,
  //    `signature_string`, and `logo_url` columns (see T3-D4 follow-up
  //    note in plan-t3-ehr-output.md). Until that schema lands, those
  //    fields render as `null` → the Header / Footer components hide
  //    them. The PDF is still production-quality with a clean text
  //    header + typed-name signature line.
  const clinicName = doctorSettings?.practice_name?.trim() || null;
  const doctorName =
    doctorDisplayName?.trim() ||
    (clinicName ? clinicName : 'Doctor');

  const data: PrescriptionPdfData = {
    header: {
      doctorName,
      qualifications:     null, // gap: doctor_settings has no qualifications col
      specialty:          doctorSettings?.specialty?.trim() || null,
      registrationNumber: null, // gap: doctor_settings has no registration_number col
      clinicName:         clinicName,
      clinicAddress:      doctorSettings?.address_summary?.trim() || null,
      logoUrl:            null, // gap: doctor_settings has no logo_url col
    },
    footer: {
      doctorName,
      shortId:          rx.id.slice(-8),
      generatedAtLabel: formatGeneratedAt(
        new Date().toISOString(),
        doctorSettings?.timezone,
      ),
    },
    patient: {
      patientName:
        (patient?.name?.trim() ||
          apt.patient_name?.trim() ||
          'Patient'),
      patientAge:    computeAgeLabel(patient?.date_of_birth ?? null),
      patientGender: patient?.gender?.trim() || null,
      visitDateLabel: formatVisitDate(
        apt.appointment_date,
        doctorSettings?.timezone,
      ),
    },
    body: {
      cc:                   rx.cc,
      hopi:                 rx.hopi,
      provisionalDiagnosis: rx.provisional_diagnosis,
      // cockpit-v2 / migration 103: DB column renamed; PDF body field
      // name `investigations` stays for the deprecation window (the
      // template <SectionBlock label="Investigations"> still reads
      // `body.investigations`).
      // TODO(cv2-07): rename PDF body field `investigations` → `investigationsOrders`
      // alongside the cockpit form rename.
      investigations:       rx.investigations_orders,
      followUp:             rx.follow_up,
      patientEducation:     rx.patient_education,
      clinicalNotes:        rx.clinical_notes,
      medicines,
    },
  };

  return { data, doctorId: rx.doctor_id };
}

// ============================================================================
// Internal: render + upload + sign
// ============================================================================

async function renderUploadAndSign(
  prescriptionId: string,
  doctorId: string,
  data: PrescriptionPdfData,
  correlationId: string,
): Promise<PrescriptionPdfResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for PDF generation');
  }

  // Render the React-PDF tree to a Buffer. `renderToBuffer` returns
  // a Node Buffer (when running on the server) — its types declare
  // `Promise<Blob | Buffer>` to support browser usage.
  //
  // Type cast: `renderToBuffer` is overloaded to accept
  // `ReactElement<DocumentProps>`. Our `PrescriptionDocument` wraps
  // a `<Document>` at the root so the runtime contract holds; we
  // narrow the FunctionComponent's element type to satisfy the
  // signature.
  const element = React.createElement(PrescriptionDocument, { data }) as
    unknown as React.ReactElement<DocumentProps>;
  const t0 = Date.now();
  const buffer = (await renderToBuffer(element)) as Buffer;
  const renderMs = Date.now() - t0;

  if (!buffer || buffer.length === 0) {
    throw new InternalError('PDF render produced empty buffer');
  }

  const storagePath = `${doctorId}/${prescriptionId}.pdf`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: CONTENT_TYPE,
      upsert: true,
    });
  if (uploadErr) {
    throw new InternalError(
      `prescription-pdf-service: Storage upload failed (${uploadErr.message})`,
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (signErr || !signed?.signedUrl) {
    throw new InternalError(
      `prescription-pdf-service: signed URL mint failed (${signErr?.message ?? 'unknown'})`,
    );
  }

  const result: PrescriptionPdfResult = {
    storagePath,
    signedUrl:   signed.signedUrl,
    generatedAt: new Date().toISOString(),
    byteCount:   buffer.length,
    cacheHit:    false,
  };

  logger.info(
    {
      correlationId,
      prescriptionId,
      doctorId,
      byteCount: buffer.length,
      renderMs,
    },
    'prescription-pdf-service: render+upload complete',
  );

  return result;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate (or fetch from 5-min cache) a fresh PDF + signed URL for a
 * prescription. Idempotent for the cache window; safe to call from
 * the send pipeline + the doctor's "Resend" action.
 */
export async function generatePrescriptionPdf(
  prescriptionId: string,
  correlationId: string,
): Promise<PrescriptionPdfResult> {
  const cached = cacheGet(prescriptionId);
  if (cached) {
    logger.info(
      { correlationId, prescriptionId, byteCount: cached.byteCount },
      'prescription-pdf-service: cache hit',
    );
    return cached;
  }

  const { data, doctorId } = await buildPdfData(prescriptionId, correlationId);
  const result = await renderUploadAndSign(prescriptionId, doctorId, data, correlationId);
  cacheSet(prescriptionId, result);
  return result;
}

/**
 * Force a fresh render + upload, bypassing (and invalidating) the
 * 5-min cache. Used by the "Regenerate PDF" kebab action when the
 * doctor's letterhead has changed.
 */
export async function forceRegeneratePrescriptionPdf(
  prescriptionId: string,
  correlationId: string,
): Promise<PrescriptionPdfResult> {
  cacheDelete(prescriptionId);
  const { data, doctorId } = await buildPdfData(prescriptionId, correlationId);
  const result = await renderUploadAndSign(prescriptionId, doctorId, data, correlationId);
  cacheSet(prescriptionId, result);
  return result;
}

/**
 * Mint a fresh 24h signed URL for an EXISTING PDF without re-rendering.
 * Used by the patient share-link route to avoid serving stale URLs to
 * patients who revisit hours after the original send.
 *
 * Returns `null` when the file doesn't exist in storage — the caller
 * can then trigger `generatePrescriptionPdf` to bootstrap.
 */
export async function getFreshSignedUrlForExistingPdf(
  prescriptionId: string,
  doctorId: string,
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
