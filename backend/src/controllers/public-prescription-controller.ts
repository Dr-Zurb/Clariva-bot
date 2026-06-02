/**
 * Public prescription controller (EHR Sub-batch B2 / T3.16).
 *
 * Patient-facing read endpoint mounted at
 *   GET /api/v1/public/prescriptions/:id?t=<token>
 *
 * **No auth middleware** — the HMAC token IS the auth surface
 * (Decision T3-D3). Token verification:
 *   - signature valid (binds to RX_SHARE_TOKEN_SECRET)
 *   - rxId in payload matches URL param (no swap-id-keep-token attack)
 *   - exp not in the past
 *
 * Returned shape mirrors what `<PatientRxView>` consumes (the shared
 * component used by both the doctor's preview modal AND the patient
 * `/r/[id]` page). The page does the snake→camel conversion on
 * receipt; the API stays in snake-case for parity with other
 * Postgres-shaped endpoints.
 *
 * Failure modes:
 *   - Token absent / malformed / wrong-rx-id    → 401
 *   - Token expired                              → 410 (semantically "gone";
 *     the patient page renders a friendly "Link expired" with a CTA)
 *   - Prescription not found                     → 404
 *   - Anything else                              → asyncHandler → 500
 *
 * No PHI is logged in the route layer beyond the prescription_id
 * itself (which is a UUID, not PHI on its own).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { AppError, NotFoundError, ValidationError } from '../utils/errors';
import { getSupabaseAdminClient } from '../config/database';
import { getDoctorSettings } from '../services/doctor-settings-service';
import {
  generatePrescriptionPdf,
  getFreshSignedUrlForExistingPdf,
} from '../services/prescription-pdf-service';
import { verifyRxToken } from '../services/prescription-token-service';
import { logger } from '../config/logger';
import { logDataAccess } from '../utils/audit-logger';
import type {
  Prescription,
  PrescriptionMedicine,
} from '../types/prescription';

// 410 Gone — patient-facing "this link has expired" surface. Mirrors
// the existing AppError ergonomics; we only need a distinct status
// code (410 vs 401) so the patient page can branch its copy.
class GoneError extends AppError {
  constructor(message = 'Resource is gone or expired') {
    super(message, 410);
  }
}

// 401 Unauthorized via AppError so the response shape matches the
// other non-auth errors in this controller (we deliberately avoid
// `UnauthorizedError` because that's reserved for missing/invalid
// auth-middleware tokens, which has different semantics + dev-only
// stack trace context).
class InvalidLinkError extends AppError {
  constructor(message = 'Invalid link') {
    super(message, 401);
  }
}

// 503 Service Unavailable for the (rare) case where the admin client
// hasn't been initialised yet.
class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable') {
    super(message, 503);
  }
}

// Loose UUID guard — we don't import zod here to keep the public surface
// fast and dependency-free. 36-char canonical UUID with dashes.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/public/prescriptions/:id?t=<token>
 *
 * Resolves the prescription, verifies ownership-via-token, mints a
 * fresh signed URL on every visit (avoids serving a stale URL when
 * the patient revisits the link the next morning), and returns a
 * minimal projection — only what `<PatientRxView>` needs.
 */
export const getPublicPrescriptionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const { id } = req.params;
    const token = typeof req.query.t === 'string' ? req.query.t : '';

    if (!id || !UUID_RE.test(id)) {
      throw new ValidationError('Invalid prescription id');
    }

    // ---- Token verify ------------------------------------------------------
    const verifyResult = verifyRxToken(token, id);
    if (!verifyResult.ok) {
      // Distinguish expired (410) from invalid (401). Both are
      // friendlier than a generic 403 — the patient page renders
      // different copy per status.
      if (verifyResult.reason === 'expired') {
        throw new GoneError('Link expired');
      }
      // Group the rest under a single 401 surface so we don't leak
      // verifier internals (signature vs missing vs wrong-rx-id).
      logger.info(
        {
          correlationId,
          prescriptionId: id,
          tokenReason: verifyResult.reason,
        },
        'public-prescription: token verify failed',
      );
      throw new InvalidLinkError('Invalid link');
    }

    // ---- Load prescription + medicines -------------------------------------
    const admin = getSupabaseAdminClient();
    if (!admin) {
      throw new ServiceUnavailableError('Service unavailable');
    }

    const [{ data: rxData, error: rxErr }, { data: medsData }] =
      await Promise.all([
        admin
          .from('prescriptions')
          .select(
            // cockpit-v2 / migration 103: `investigations` column was renamed
            // to `investigations_orders`. The public response field name
            // stays as `investigations` for the deprecation window (see
            // mapping below).
            // TODO(cv2-07): rename the public response field once the
            // patient-facing client migrates.
            'id, doctor_id, appointment_id, type, cc, hopi, provisional_diagnosis, investigations_orders, follow_up, patient_education, sent_to_patient_at, created_at, updated_at, patient_id',
          )
          .eq('id', id)
          .single(),
        admin
          .from('prescription_medicines')
          .select('*')
          .eq('prescription_id', id)
          .order('sort_order', { ascending: true, nullsFirst: false }),
      ]);

    if (rxErr || !rxData) {
      throw new NotFoundError('Prescription not found');
    }
    const rx = rxData as Pick<
      Prescription,
      | 'id'
      | 'doctor_id'
      | 'appointment_id'
      | 'type'
      | 'cc'
      | 'hopi'
      | 'provisional_diagnosis'
      | 'investigations_orders'
      | 'follow_up'
      | 'patient_education'
      | 'sent_to_patient_at'
      | 'created_at'
      | 'updated_at'
      | 'patient_id'
    >;
    const medicines = (medsData ?? []) as PrescriptionMedicine[];

    // ---- Doctor + appointment context for the letterhead strip -------------
    const [{ data: aptData }, doctorSettings] = await Promise.all([
      admin
        .from('appointments')
        .select('id, patient_name, patient_id, appointment_date')
        .eq('id', rx.appointment_id)
        .single(),
      getDoctorSettings(rx.doctor_id),
    ]);
    const apt = (aptData ?? null) as {
      id: string;
      patient_name: string | null;
      patient_id: string | null;
      appointment_date: string | null;
    } | null;

    // Prefer the patients-table name when available (apt.patient_name
    // can be a free-text capture from the bot flow).
    let patientName = apt?.patient_name?.trim() || 'Patient';
    if (apt?.patient_id) {
      const { data: pData } = await admin
        .from('patients')
        .select('name')
        .eq('id', apt.patient_id)
        .single();
      const candidate = (pData as { name?: string | null } | null)?.name?.trim();
      if (candidate) patientName = candidate;
    }

    // Doctor display name — same pattern as PDF service. We don't
    // bring the helper across because (a) avoids a service-layer
    // import cycle and (b) keeps this controller focused on the
    // public projection.
    let doctorName = doctorSettings?.practice_name?.trim() || 'Doctor';
    try {
      const { data: userResp } = await admin.auth.admin.getUserById(rx.doctor_id);
      const meta =
        (userResp?.user?.user_metadata as
          | { full_name?: string; name?: string }
          | null
          | undefined) ?? {};
      const raw =
        (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta.name === 'string' && meta.name.trim()) ||
        '';
      if (raw) {
        doctorName = raw.toLowerCase().startsWith('dr')
          ? raw.replace(/^dr\.?\s*/i, 'Dr. ')
          : `Dr. ${raw}`;
      }
    } catch {
      // soft-fail; we already set the practice_name fallback.
    }

    // ---- Signed PDF URL ----------------------------------------------------
    // Try the fast path first: an existing PDF in storage. If it's
    // not there yet (first patient visit before the send pipeline
    // generated one — rare but possible), fall back to generating
    // it on demand. Both paths return a fresh ~24h signed URL.
    let signedPdfUrl: string | null = await getFreshSignedUrlForExistingPdf(
      rx.id,
      rx.doctor_id,
    );
    if (!signedPdfUrl) {
      try {
        const pdfResult = await generatePrescriptionPdf(rx.id, correlationId);
        signedPdfUrl = pdfResult.signedUrl;
      } catch (err) {
        // Non-fatal: the patient still gets the on-screen view.
        // The download button will surface a "PDF not available"
        // tooltip via its own state.
        logger.warn(
          {
            correlationId,
            prescriptionId: rx.id,
            error: err instanceof Error ? err.message : String(err),
          },
          'public-prescription: on-demand PDF generation failed; serving page only',
        );
      }
    }

    // ---- Audit (informational; no PHI in metadata) -------------------------
    // The patient is unauthenticated so we use the doctor_id as the
    // subject — the row attests that a patient-facing read happened
    // for THIS rx, not who the patient is.
    try {
      await logDataAccess(correlationId, rx.doctor_id, 'prescription', rx.id);
    } catch (err) {
      logger.debug(
        {
          correlationId,
          prescriptionId: rx.id,
          error: err instanceof Error ? err.message : String(err),
        },
        'public-prescription: audit write soft-failed',
      );
    }

    res.status(200).json(
      successResponse(
        {
          prescription: {
            id: rx.id,
            type: rx.type,
            cc: rx.cc,
            hopi: rx.hopi,
            provisional_diagnosis: rx.provisional_diagnosis,
            // cockpit-v2 / migration 103: DB column renamed to
            // `investigations_orders`. Public response field stays as
            // `investigations` for the deprecation window so the
            // patient-facing client keeps rendering without churn.
            // TODO(cv2-07): rename response field once the patient client migrates.
            investigations: rx.investigations_orders,
            follow_up: rx.follow_up,
            patient_education: rx.patient_education,
            sent_to_patient_at: rx.sent_to_patient_at,
            created_at: rx.created_at,
            prescription_medicines: medicines,
          },
          doctor: {
            display_name: doctorName,
            specialty: doctorSettings?.specialty?.trim() || null,
            clinic_name: doctorSettings?.practice_name?.trim() || null,
            clinic_address: doctorSettings?.address_summary?.trim() || null,
          },
          patient: {
            display_name: patientName,
          },
          appointment: {
            id: apt?.id ?? null,
            appointment_date: apt?.appointment_date ?? null,
          },
          signed_pdf_url: signedPdfUrl,
          token_expires_at:
            verifyResult.exp !== undefined
              ? new Date(verifyResult.exp * 1000).toISOString()
              : null,
        },
        req,
      ),
    );
  },
);
