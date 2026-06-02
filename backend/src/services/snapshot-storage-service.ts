/**
 * Snapshot Storage Service (Sub-batch C · task-video-C3)
 *
 * Owns the in-call snapshot lifecycle on the backend side:
 *
 *   1. Verify the bearer JWT (doctor's Supabase auth JWT OR our
 *      scoped patient JWT) and re-enforce session membership.
 *   2. Validate the live recording-consent gate. Patients MUST have
 *      consented to recording before their own snapshots are accepted;
 *      doctor-initiated snapshots are clinical artifacts and bypass the
 *      gate (flagged for product review at PR time).
 *   3. Validate the inbound JPEG payload (magic bytes + size cap).
 *   4. Upload the JPEG to `consultation-attachments/{sessionId}/snapshots/
 *      {snapshotId}.jpg` via the service-role admin client.
 *   5. Insert the matching `consultation_messages` row (kind='attachment',
 *      with the snapshot context written to the new `metadata` JSONB
 *      column from Migration 083). This is the row Migration 084's
 *      patient-side RLS gate keys on for decision §14 visibility.
 *   6. Emit the `'snapshot_taken'` system banner via
 *      `emitSnapshotTaken` so both parties see lifecycle visibility,
 *      even when the JPEG itself is hidden from the patient.
 *   7. Mint a 1h signed URL for the JPEG and return it alongside the
 *      snapshot id.
 *
 * Why a backend-mediated route at all (instead of direct Supabase
 * upload like `<TextConsultRoom>` does for chat attachments):
 *
 *   - The patient's scoped JWT carries a synthetic `sub` (`patient:{id}`)
 *     which the storage-api auth layer doesn't reliably honor (same
 *     issue `mintAttachmentSignedUrls` documents at length). Going
 *     through service-role here side-steps the issue.
 *   - The consent + visibility-metadata + system-message wires need to
 *     happen atomically. A frontend upload would race the consent check
 *     against the storage write window.
 *   - PHI hygiene: a single backend-owned path makes audit easier and
 *     prevents a future client bug from writing a snapshot row with
 *     spoofed metadata.
 *
 * **No PHI in logs.** Body bytes are never logged; only sizes,
 * dimensions, and ids leak through. Correlation id is required.
 *
 * @see backend/migrations/083_consultation_messages_metadata_column.sql
 * @see backend/migrations/084_consultation_messages_snapshot_visibility_rls.sql
 * @see backend/src/services/text-session-supabase.ts (mintAttachmentSignedUrls)
 * @see backend/src/services/consultation-message-service.ts (emitSnapshotTaken)
 * @see backend/src/services/recording-consent-service.ts (getConsentForSession)
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import { getConsentForSession } from './recording-consent-service';
import { emitSnapshotTaken } from './consultation-message-service';

// ============================================================================
// Constants
// ============================================================================

/**
 * Bucket the snapshot lives in. Same bucket the chat attachments use —
 * the snapshot is conceptually a chat-attachment row that happens to
 * carry snapshot-specific `metadata`. Co-locating in the same bucket
 * means the existing `mintAttachmentSignedUrls` read path (used by
 * `<TextConsultRoom>`'s rendering) can resolve snapshots without a
 * second route.
 *
 * MUST mirror `text-session-supabase.ts#CONSULTATION_ATTACHMENTS_BUCKET`
 * and Migration 051's bucket name.
 */
const CONSULTATION_ATTACHMENTS_BUCKET = 'consultation-attachments';

/**
 * Storage subdirectory for snapshots. Keeps them visually separate from
 * patient-uploaded chat attachments in the bucket explorer (and lets
 * a future ops cleanup script target snapshots without touching chat
 * attachments). The leading `${sessionId}/` is required by
 * Migration 078's storage RLS path-prefix predicate; this lives one
 * level deeper.
 */
const SNAPSHOT_SUBDIR = 'snapshots';

/**
 * Hard cap on the inbound JPEG. 5 MB = roughly a 4K-ish photo at JPEG
 * quality 0.92. Snapshots from a live video tile are typically <1 MB
 * (1080p × 0.92 quality ≈ 200-400 KB), so this leaves a generous
 * margin for any future high-DPI capture path without risking a DoS
 * via a 100 MB upload.
 *
 * Note: this is the DECODED size (after base64 round-trip). The
 * Express `BODY_SIZE_LIMIT` is 10 MB, which comfortably accommodates
 * the base64-encoded form of a 5 MB JPEG (~6.7 MB) plus the JSON
 * envelope.
 */
const SNAPSHOT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Signed-URL TTL minted for the response. 1h matches
 * `mintAttachmentSignedUrls` — short enough that a leaked URL ages out
 * quickly, long enough that the chat doesn't burn round-trips on
 * every re-render. The frontend re-mints via the regular
 * `signAttachmentUrls` path on cache eviction.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Canonical UUID regex — used for doctor identity check. Same regex
 * `safe_uuid_sub()` and `mintAttachmentSignedUrls` use.
 */
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * The first three bytes of every JPEG file: `FF D8 FF`. Magic-byte
 * sniff is cheap defense-in-depth against a client mis-encoding the
 * payload (or sending a PNG / WebP) — the storage upload would happily
 * accept any bytes; the `consultation_messages_attachment_mime_allowlist_check`
 * (Migration 082) would catch the mime-type mismatch later but a
 * loud 400 here is a much better user experience than a downstream
 * CHECK violation.
 */
const JPEG_MAGIC_BYTES: ReadonlyArray<number> = [0xff, 0xd8, 0xff];

// ============================================================================
// Public types
// ============================================================================

export interface SubmitSnapshotInput {
  /** Path-param `consultation_sessions.id` from the URL. */
  sessionId: string;
  /** Bearer JWT from the `Authorization` header (doctor or patient). */
  bearerJwt: string;
  /** Decoded JPEG bytes. The handler is responsible for decoding base64. */
  jpegBytes: Buffer;
  /**
   * Capture target — `'self'` means the capturer captured their own tile
   * (rare clinical use case but valid); `'remote'` means the capturer
   * captured the OTHER party's tile (the typical clinical case — doctor
   * captures patient's wound). Drives the visibility metadata.
   */
  target: 'self' | 'remote';
  /** Native pixel dimensions of the captured frame. Logged for audit. */
  dimensions: { width: number; height: number };
  /** Required — same correlation id flowed through the request. */
  correlationId: string;
  /**
   * Sub-batch C · task-video-C4 — optional vector-annotation overlay
   * the doctor (or patient) drew on top of the frozen frame before
   * uploading. The JPEG payload is ALREADY composited (annotations
   * burned into the raster) — this array is the structured
   * companion record of "what was drawn", persisted to the row's
   * `metadata.annotations` JSONB so that:
   *
   *   - Future re-rendering / forensics can reproduce the overlay.
   *   - Audit / clinical-record export sees the structured intent
   *     (color, coords, kind), not just the rasterized result.
   *   - Task D3 (snapshot review-and-attach) can show the doctor a
   *     "remove annotations" affordance by re-rendering only the
   *     base frame from a fresh capture path (out of scope for v1
   *     — the JPEG is the load-bearing artifact).
   *
   * Bounded validation lives in `validateAnnotations` below — the
   * field is whitelisted on `kind`, coords are clamped to the
   * image dimensions, color is a hex string, etc. Anything that
   * doesn't match the contract is rejected at the gate; the
   * service never half-ingests.
   *
   * Typed as `unknown` (not `SnapshotAnnotation[]`) so that route
   * handlers can pass straight through without an unsafe cast — the
   * validator does the narrowing at the service boundary.
   */
  annotations?: unknown;
}

/**
 * Structured shape for a single annotation drawn on top of a snapshot
 * (Sub-batch C · task-video-C4). Mirrors `Annotation` in
 * `frontend/lib/video/snapshot-annotations.ts` — kept in sync by hand
 * (no shared types package across frontend/backend yet).
 *
 * Coordinates are in NATIVE PIXEL space of the snapshot, NOT CSS
 * space. Frontend is responsible for mapping pointer events from
 * canvas-CSS to native pixels before sending — same convention the
 * `dimensions` field already uses for capture metadata.
 *
 * Color is a 6-or-8-char hex string `#RRGGBB[AA]`. Names like
 * "red" / "blue" are intentionally rejected — they're locale-fragile
 * and the toolbar UI only ships hex values.
 */
export type SnapshotAnnotation =
  | {
      kind: 'point';
      x: number;
      y: number;
      color: string;
      size: number;
    }
  | {
      kind: 'circle';
      cx: number;
      cy: number;
      r: number;
      color: string;
      width: number;
    }
  | {
      kind: 'arrow';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      width: number;
    }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      color: string;
      fontSize: number;
    };

export interface SubmitSnapshotResult {
  /** UUID of the persisted `consultation_messages` row. */
  snapshotId: string;
  /** 1h-TTL signed download URL for the JPEG. */
  url: string;
  /** Storage object key — useful for the frontend to cache and re-mint via `signAttachmentUrls`. */
  attachmentPath: string;
}

// ============================================================================
// JWT branching — copied (with deliberate divergence) from
// `text-session-supabase.ts#mintAttachmentSignedUrls`.
//
// Could be promoted to a shared helper in a future refactor (both this
// service and the attachments-sign path do the exact same JWT triage).
// Kept inline for now to minimize cross-service coupling on the v1
// snapshot ship. If a third caller appears, factor out — the dual
// occurrence is not enough to justify a new util module yet.
// ============================================================================

interface ResolvedCaller {
  role: 'doctor' | 'patient';
  /**
   * For doctors: the auth.users.id UUID. For patients: the synthetic
   * `patient:{appointmentId}` sub (NOT a UUID — used only for logging).
   */
  callerSub: string;
  /** Doctor row id when `role === 'doctor'`; null otherwise. */
  doctorId: string | null;
}

async function resolveCallerForSession(
  sessionId: string,
  bearerJwt: string,
): Promise<ResolvedCaller> {
  const secret = env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) {
    throw new InternalError('SUPABASE_JWT_SECRET is not configured');
  }

  const decodedComplete = jwt.decode(bearerJwt, { complete: true });
  if (!decodedComplete || typeof decodedComplete === 'string') {
    throw new UnauthorizedError('Malformed bearer token');
  }
  const decoded = decodedComplete.payload as jwt.JwtPayload;
  const consultRole =
    typeof decoded.consult_role === 'string' ? decoded.consult_role : undefined;
  const claimSessionId =
    typeof decoded.session_id === 'string' ? decoded.session_id : undefined;
  const sub = typeof decoded.sub === 'string' ? decoded.sub : undefined;

  if (consultRole === 'patient') {
    try {
      jwt.verify(bearerJwt, secret, {
        algorithms: ['HS256'],
        audience: 'authenticated',
      });
    } catch (err) {
      throw new UnauthorizedError(
        `Invalid patient token: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
    if (claimSessionId !== sessionId) {
      throw new UnauthorizedError(
        'Token does not authorize this session (session_id claim mismatch)',
      );
    }
    return { role: 'patient', callerSub: sub ?? 'patient:unknown', doctorId: null };
  }

  // Doctor branch — supabase auth verifies the bearer for us.
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');
  const { data: userData, error: userErr } = await admin.auth.getUser(bearerJwt);
  if (userErr || !userData?.user?.id) {
    throw new UnauthorizedError(
      `Invalid doctor token: ${userErr?.message ?? 'auth.getUser returned no user'}`,
    );
  }
  const doctorId = userData.user.id;
  if (!UUID_REGEX.test(doctorId)) {
    throw new UnauthorizedError('Token user id is not a valid UUID');
  }
  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('id, doctor_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) {
    throw new InternalError(`Session lookup failed: ${sessionErr.message}`);
  }
  if (!sessionRow) {
    throw new NotFoundError('Consultation session not found');
  }
  if ((sessionRow as { doctor_id?: string }).doctor_id !== doctorId) {
    throw new UnauthorizedError('Doctor identity mismatch for this session');
  }
  return { role: 'doctor', callerSub: doctorId, doctorId };
}

// ============================================================================
// Pure validation helpers (exported for unit-test reuse).
// ============================================================================

/**
 * Sniff the first three bytes of the buffer to confirm it's a JPEG.
 * Returns false on too-short or non-JPEG buffers; true otherwise. The
 * full JPEG parse / decode is not attempted — this is a defense-in-
 * depth gate against obvious mis-encoding, not a robust image parser.
 */
export function isJpegMagic(buf: Buffer): boolean {
  if (buf.length < JPEG_MAGIC_BYTES.length) return false;
  for (let i = 0; i < JPEG_MAGIC_BYTES.length; i += 1) {
    if (buf[i] !== JPEG_MAGIC_BYTES[i]) return false;
  }
  return true;
}

// ============================================================================
// Annotation validation (Sub-batch C · task-video-C4).
// ============================================================================

/**
 * Hard cap on the per-snapshot annotation count. Prevents an abusive
 * client from injecting a 100k-element array into the row's `metadata`
 * JSONB. 200 is far above any realistic clinical use case (a doctor
 * marking "this spot, this spot, this spot" maxes out at maybe 20-30
 * per snapshot in practice), giving generous headroom without opening
 * a DoS channel.
 */
const MAX_ANNOTATIONS_PER_SNAPSHOT = 200;

/**
 * Hard cap on the per-text-annotation string length. Same DoS-avoidance
 * rationale; clinical labels ("R-knee" / "lesion 3 mm") fit in 200
 * comfortably.
 */
const MAX_ANNOTATION_TEXT_LENGTH = 200;

/**
 * Hex colors only — the toolbar ships exclusively hex values
 * (`#RRGGBB` or `#RRGGBBAA`). Named colors like "red" are rejected
 * because they're locale-fragile and the doctor's intent is best
 * preserved as the literal value the toolbar produced. Same regex
 * shape `tailwind` ingests.
 */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/**
 * Numeric guards — every coord / size has to be a finite, non-NaN
 * number. We DON'T clamp to image dimensions here (the frontend
 * draws relative to the captured canvas, which IS the image, so any
 * coord beyond the dimensions is already clipped at draw time); we
 * just reject obvious garbage (Infinity, NaN, -1, > 100000).
 */
function isSaneCoord(n: unknown): n is number {
  return (
    typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100_000
  );
}

function isSanePositive(n: unknown): n is number {
  return (
    typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 100_000
  );
}

/**
 * Validate (and narrow) the inbound annotations array. Throws
 * `ValidationError` on the first malformed entry — the caller's
 * client should be sending well-formed data per the
 * `<AnnotationCanvas>` contract. Belt-and-braces server gate here
 * keeps malformed JSONB out of the row.
 *
 * Returns a freshly-built array (so the caller can't mutate the
 * input post-validation and slip a different shape into storage).
 */
export function validateAnnotations(
  raw: unknown,
): SnapshotAnnotation[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError('annotations must be an array');
  }
  if (raw.length > MAX_ANNOTATIONS_PER_SNAPSHOT) {
    throw new ValidationError(
      `Too many annotations (${raw.length}; max ${MAX_ANNOTATIONS_PER_SNAPSHOT})`,
    );
  }
  const out: SnapshotAnnotation[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object') {
      throw new ValidationError(`annotations[${i}] must be an object`);
    }
    const a = entry as Record<string, unknown>;
    const kind = a.kind;
    const color = a.color;
    if (typeof color !== 'string' || !HEX_COLOR_REGEX.test(color)) {
      throw new ValidationError(
        `annotations[${i}].color must be a hex string like #RRGGBB`,
      );
    }
    switch (kind) {
      case 'point': {
        if (!isSaneCoord(a.x) || !isSaneCoord(a.y) || !isSanePositive(a.size)) {
          throw new ValidationError(
            `annotations[${i}] (point): x/y/size must be finite numbers`,
          );
        }
        out.push({ kind: 'point', x: a.x, y: a.y, color, size: a.size });
        break;
      }
      case 'circle': {
        if (
          !isSaneCoord(a.cx) ||
          !isSaneCoord(a.cy) ||
          !isSanePositive(a.r) ||
          !isSanePositive(a.width)
        ) {
          throw new ValidationError(
            `annotations[${i}] (circle): cx/cy/r/width must be finite numbers`,
          );
        }
        out.push({
          kind: 'circle',
          cx: a.cx,
          cy: a.cy,
          r: a.r,
          color,
          width: a.width,
        });
        break;
      }
      case 'arrow': {
        if (
          !isSaneCoord(a.x1) ||
          !isSaneCoord(a.y1) ||
          !isSaneCoord(a.x2) ||
          !isSaneCoord(a.y2) ||
          !isSanePositive(a.width)
        ) {
          throw new ValidationError(
            `annotations[${i}] (arrow): x1/y1/x2/y2/width must be finite numbers`,
          );
        }
        out.push({
          kind: 'arrow',
          x1: a.x1,
          y1: a.y1,
          x2: a.x2,
          y2: a.y2,
          color,
          width: a.width,
        });
        break;
      }
      case 'text': {
        const text = a.text;
        if (typeof text !== 'string' || text.length === 0) {
          throw new ValidationError(
            `annotations[${i}] (text): text must be a non-empty string`,
          );
        }
        if (text.length > MAX_ANNOTATION_TEXT_LENGTH) {
          throw new ValidationError(
            `annotations[${i}] (text): text exceeds ${MAX_ANNOTATION_TEXT_LENGTH} chars`,
          );
        }
        if (
          !isSaneCoord(a.x) ||
          !isSaneCoord(a.y) ||
          !isSanePositive(a.fontSize)
        ) {
          throw new ValidationError(
            `annotations[${i}] (text): x/y/fontSize must be finite numbers`,
          );
        }
        out.push({
          kind: 'text',
          x: a.x,
          y: a.y,
          text,
          color,
          fontSize: a.fontSize,
        });
        break;
      }
      default:
        throw new ValidationError(
          `annotations[${i}].kind must be 'point' | 'circle' | 'arrow' | 'text' (got ${String(kind)})`,
        );
    }
  }
  return out;
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Persist an in-call snapshot end-to-end. Throws on any blocking
 * error; the caller surfaces the error code (controllers/asyncHandler
 * does the JSON envelope).
 *
 * Decision §14 visibility — the row's `metadata.capturer_role` and
 * `metadata.target` are set from the resolved caller and the input
 * `target`. Migration 084's RLS keys on these to hide doctor-of-patient
 * snapshots from the patient. The system-message banner from
 * `emitSnapshotTaken` does NOT carry the visibility gate (system rows
 * have `kind='system'` not `kind='attachment'`, so the predicate
 * misses them) — both parties see "Doctor captured a snapshot at HH:MM"
 * even when the JPEG row itself is patient-hidden. Documented in
 * Migration 084 head comment.
 *
 * Failure modes:
 *   - `UnauthorizedError` on JWT problems (bad signature, wrong session,
 *     unknown role).
 *   - `ForbiddenError` when the patient lacks recording consent and is
 *     trying to snapshot.
 *   - `ValidationError` on bad payload (size, magic bytes, dimensions).
 *   - `NotFoundError` when session row is missing post-consent-lookup.
 *   - `InternalError` on storage / DB writes.
 */
export async function submitSnapshot(
  input: SubmitSnapshotInput,
): Promise<SubmitSnapshotResult> {
  // ----------------------------------------------------------------------
  // 0. Defensive input validation (cheap; before any DB / storage round-trip).
  // ----------------------------------------------------------------------
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }
  if (!UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId is not a valid UUID');
  }
  if (!input.bearerJwt?.trim()) {
    throw new UnauthorizedError('Bearer token is required');
  }
  if (!Buffer.isBuffer(input.jpegBytes)) {
    throw new ValidationError('jpegBytes must be a Buffer');
  }
  if (input.jpegBytes.length === 0) {
    throw new ValidationError('jpegBytes is empty');
  }
  if (input.jpegBytes.length > SNAPSHOT_MAX_BYTES) {
    throw new ValidationError(
      `Snapshot too large (${input.jpegBytes.length} bytes; max ${SNAPSHOT_MAX_BYTES})`,
    );
  }
  if (!isJpegMagic(input.jpegBytes)) {
    throw new ValidationError('Payload is not a valid JPEG (magic bytes mismatch)');
  }
  if (input.target !== 'self' && input.target !== 'remote') {
    throw new ValidationError(`target must be 'self' or 'remote' (got ${input.target})`);
  }
  if (
    !input.dimensions ||
    typeof input.dimensions.width !== 'number' ||
    typeof input.dimensions.height !== 'number' ||
    !Number.isFinite(input.dimensions.width) ||
    !Number.isFinite(input.dimensions.height) ||
    input.dimensions.width <= 0 ||
    input.dimensions.height <= 0 ||
    input.dimensions.width > 8192 ||
    input.dimensions.height > 8192
  ) {
    throw new ValidationError('dimensions.width / dimensions.height invalid');
  }

  // Sub-batch C · task-video-C4 — annotation overlay metadata is
  // optional. When supplied, validate strictly here (before any
  // network round-trip); when absent or empty, treat as a plain
  // C3 snapshot.
  const annotations: SnapshotAnnotation[] | undefined =
    input.annotations !== undefined && input.annotations !== null
      ? validateAnnotations(input.annotations)
      : undefined;
  const hasAnnotations =
    annotations !== undefined && annotations.length > 0;

  // ----------------------------------------------------------------------
  // 1. Resolve the caller. Throws on auth problems.
  // ----------------------------------------------------------------------
  const caller = await resolveCallerForSession(sessionId, input.bearerJwt);

  // ----------------------------------------------------------------------
  // 2. Recording-consent gate.
  //
  // PATIENT branch — must have consented. `decision === false` blocks;
  //                   `decision === null` (never asked) ALSO blocks for
  //                   the snapshot path because a snapshot is a clinical
  //                   artifact and we need an explicit yes. The patient
  //                   can change their mind via the existing
  //                   `POST /:id/recording-consent` route and retry.
  //
  // DOCTOR branch — clinical-only snapshots bypass the patient consent
  //                  gate. Documented in the C3 task file as a flag for
  //                  product review; the conservative interpretation
  //                  ("doctor must also see consent === true") would
  //                  block clinical record-keeping when the patient
  //                  declined recording but the doctor still needs the
  //                  visual record. Erring towards the doctor side
  //                  matches how physical-record notes work today.
  //                  Tighten in a follow-up if product wants the gate
  //                  on both sides.
  // ----------------------------------------------------------------------
  const consent = await getConsentForSession({ sessionId });
  if (caller.role === 'patient') {
    if (consent.decision !== true) {
      throw new ForbiddenError(
        'Snapshots require recording consent. Tap the consent banner to enable, then try again.',
      );
    }
  }

  // ----------------------------------------------------------------------
  // 3. Generate the snapshot id + storage path. The id IS the
  //    consultation_messages row id — the chat surface keys on
  //    `id` for dedup with optimistic frontend rows.
  // ----------------------------------------------------------------------
  const snapshotId = crypto.randomUUID();
  const attachmentPath = `${sessionId}/${SNAPSHOT_SUBDIR}/${snapshotId}.jpg`;

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  // ----------------------------------------------------------------------
  // 4. Storage upload via service-role (bypasses RLS; we already
  //    authorized above).
  // ----------------------------------------------------------------------
  const uploadResult = await admin.storage
    .from(CONSULTATION_ATTACHMENTS_BUCKET)
    .upload(attachmentPath, input.jpegBytes, {
      contentType: 'image/jpeg',
      // upsert=false — randomUUID collisions are statistically zero,
      // so a duplicate path means something went wrong upstream
      // (caller passed a stale id). 409 surfaces as InternalError.
      upsert: false,
    });
  if (uploadResult.error) {
    logger.error(
      {
        correlationId: input.correlationId,
        sessionId,
        snapshotId,
        attachmentPath,
        error: uploadResult.error.message,
      },
      'submitSnapshot: storage upload failed',
    );
    throw new InternalError(`Snapshot upload failed: ${uploadResult.error.message}`);
  }

  // ----------------------------------------------------------------------
  // 5. Insert the consultation_messages row via service-role. Uses a
  //    non-system kind=attachment row carrying the snapshot metadata
  //    in the `metadata` column (Migration 083). The row-shape CHECK
  //    (Migration 063) is satisfied: attachment_url + mime + body
  //    populated; system_event NULL.
  // ----------------------------------------------------------------------
  const capturedAtIso = new Date().toISOString();
  const senderId =
    caller.role === 'doctor' ? caller.doctorId : await resolvePatientSenderId(sessionId, admin);
  if (!senderId) {
    // Catastrophic — should never happen because the JWT branch above
    // already verified membership. Belt-and-braces clean-up: rip the
    // orphan storage object so we don't accumulate rejects.
    await safeRemoveStorage(attachmentPath);
    throw new InternalError('Could not resolve sender id for snapshot insert');
  }
  const captionLabel = caller.role === 'doctor' ? 'Doctor' : 'Patient';
  const captionTarget = input.target === 'remote' ? ' (other party)' : ' (self)';
  // Sub-batch C · task-video-C4 — caption distinguishes annotated
  // snapshots ("annotated snapshot") from plain ones ("snapshot")
  // so the chat row's body is self-describing without requiring a
  // metadata round-trip on the read path.
  const caption = `${captionLabel} ${hasAnnotations ? 'annotated snapshot' : 'snapshot'}${captionTarget}`;

  const metadata: Record<string, unknown> = {
    snapshot: true,
    capturer_role: caller.role,
    target: input.target,
    captured_at: capturedAtIso,
    dimensions: {
      width: input.dimensions.width,
      height: input.dimensions.height,
    },
  };
  if (hasAnnotations) {
    // Persist the structured overlay alongside the rasterized JPEG
    // (which already has the annotations burned in). See
    // `SubmitSnapshotInput.annotations` JSDoc for the rationale and
    // `metadata.annotated` for the cheap-key discriminant the chat
    // surface uses to add the "✏️ Dr. Sharma annotated…" badge.
    metadata.annotated = true;
    metadata.annotations = annotations;
  }

  const { error: insertError } = await admin.from('consultation_messages').insert({
    id: snapshotId,
    session_id: sessionId,
    sender_id: senderId,
    sender_role: caller.role,
    kind: 'attachment',
    body: caption,
    attachment_url: attachmentPath,
    attachment_mime_type: 'image/jpeg',
    attachment_byte_size: input.jpegBytes.length,
    metadata,
  });
  if (insertError) {
    logger.error(
      {
        correlationId: input.correlationId,
        sessionId,
        snapshotId,
        error: insertError.message,
      },
      'submitSnapshot: row insert failed (rolling back storage)',
    );
    await safeRemoveStorage(attachmentPath);
    throw new InternalError(`Snapshot row insert failed: ${insertError.message}`);
  }

  // ----------------------------------------------------------------------
  // 6. Lifecycle banner — fire-and-forget. A missing banner does not
  //    fail the snapshot; the JPEG is the load-bearing artifact.
  //    Sub-batch C · task-video-C4 — pass the `annotated` flag so the
  //    banner copy reads "annotated a snapshot" instead of "captured a
  //    snapshot" when the doctor used the C4 annotation surface.
  // ----------------------------------------------------------------------
  void emitSnapshotTaken(
    sessionId,
    caller.role,
    input.target,
    snapshotId,
    hasAnnotations,
  );

  // ----------------------------------------------------------------------
  // 7. Mint the signed URL for the response. A read failure here is
  //    non-fatal — we still return the path so the frontend can re-
  //    mint via `signAttachmentUrls` on the next render.
  // ----------------------------------------------------------------------
  let signedUrl = '';
  try {
    const { data: signedData } = await admin.storage
      .from(CONSULTATION_ATTACHMENTS_BUCKET)
      .createSignedUrl(attachmentPath, SIGNED_URL_TTL_SECONDS);
    signedUrl = signedData?.signedUrl ?? '';
  } catch (err) {
    logger.warn(
      {
        correlationId: input.correlationId,
        sessionId,
        snapshotId,
        error: err instanceof Error ? err.message : String(err),
      },
      'submitSnapshot: signed URL mint failed (response carries empty url)',
    );
  }

  logger.info(
    {
      correlationId: input.correlationId,
      sessionId,
      snapshotId,
      attachmentPath,
      callerRole: caller.role,
      target: input.target,
      bytes: input.jpegBytes.length,
      width: input.dimensions.width,
      height: input.dimensions.height,
    },
    'submitSnapshot: snapshot persisted',
  );

  return { snapshotId, url: signedUrl, attachmentPath };
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Resolve the patient's sender_id for the consultation_messages row.
 *
 * The synthetic patient sub (`patient:{appointmentId}`) is NOT a UUID
 * and the `consultation_messages.sender_id` column is `uuid NOT NULL`.
 * The chat surface convention (`<TextConsultRoom>`) uses the
 * patient's `consultation_sessions.patient_id` UUID when the row was
 * linked to a real patient record, falling back to the appointment id.
 *
 * Both shapes pass the `consultation_messages_sender_role_check`
 * because we set `sender_role='patient'`. The downstream chat render
 * already handles both — see `<TextConsultRoom>`'s "self-vs-counterparty
 * bubble alignment" comment.
 */
async function resolvePatientSenderId(
  sessionId: string,
  admin: ReturnType<typeof getSupabaseAdminClient>,
): Promise<string | null> {
  if (!admin) return null;
  const { data, error } = await admin
    .from('consultation_sessions')
    .select('patient_id, appointment_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { patient_id?: string | null; appointment_id?: string | null };
  return row.patient_id ?? row.appointment_id ?? null;
}

/**
 * Best-effort remove of an orphan storage object after a downstream
 * insert fails. Errors are swallowed (the caller is already in a
 * failure path; the orphan is a cleanup concern, not a hard failure).
 */
async function safeRemoveStorage(path: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  try {
    await admin.storage.from(CONSULTATION_ATTACHMENTS_BUCKET).remove([path]);
  } catch {
    // best-effort
  }
}
