/**
 * Typed client for the Plan 08 · Task 41 video-recording escalation API.
 *
 * Scope:
 *   - `POST /api/v1/consultation/:sessionId/video-escalation/request` — doctor
 *     asks the patient to consent to video recording mid-consult.
 *   - `GET  /api/v1/consultation/:sessionId/video-escalation-state`    — derived
 *     doctor-UI state (used for re-hydration on page refresh).
 *
 * **Task 41 has not landed yet.** These shapes are the contract Task 40's UI
 * codes against; Task 41 owns the server-side implementation and both PRs
 * must agree on the wire format before the server ships. Until Task 41 is
 * deployed, `requestVideoEscalation` will surface a graceful "Couldn't send
 * the request" error (the POST 404s) and `getVideoEscalationState` will
 * return the `idle` state via the fallback in `useVideoEscalationState`.
 *
 * Why we're shipping this wrapper now rather than blocking on Task 41:
 *   - Execution plan (`EXECUTION-ORDER.md`) sequences Tasks 40 + 41 as
 *     parallel streams. The frontend-first discipline means the UI is
 *     reviewable + pixel-iterable independently.
 *   - Task 45 already shipped the `video_escalation_audit` table with the
 *     canonical columns + CHECK constraints, so the contract is pinned at
 *     the schema layer — the endpoints just surface those columns.
 *   - Task 43 (rule-flip service) landed today, so the downstream call the
 *     server will make (`escalateToFullVideoRecording`) already exists.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-40-doctor-video-escalation-button-and-reason-modal.md
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-41-patient-video-consent-modal-and-escalation-service.md
 * @see backend/migrations/070_video_escalation_audit_and_otp_window.sql
 */

import { requireApiBaseUrl } from "@/lib/api-base";

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

/**
 * Preset radio selection from the reason-capture modal. Mirrors
 * `video_escalation_audit.preset_reason_code` CHECK values (Migration 070).
 * Server will reject any other value with 400.
 */
export type VideoEscalationPresetReason =
  | "visible_symptom"
  | "document_procedure"
  | "patient_request"
  | "other";

export interface RequestVideoEscalationInput {
  /** `consultation_sessions.id`. */
  sessionId:         string;
  /** Doctor Supabase auth UID. Server cross-checks against the Bearer JWT. */
  doctorId:          string;
  /** Modal radio selection. */
  presetReasonCode:  VideoEscalationPresetReason;
  /**
   * Free-text clinical reason. Task 40 validates `5..200` chars client-side;
   * the server CHECK (Migration 070) enforces the same range at the DB level.
   * Trimmed by the server before write.
   */
  reason:            string;
}

export interface RequestVideoEscalationData {
  /** `video_escalation_audit.id` for the row Task 41 just inserted. */
  requestId:      string;
  /**
   * Server-assigned ISO timestamp when the patient's 60s consent window
   * closes. The UI uses this (not `Date.now() + 60000`) to avoid clock-skew
   * drift — see task-40 Note #3.
   */
  expiresAt:      string;
  /** Same value the server stored on the audit row. Threads through logs. */
  correlationId:  string;
}

/**
 * Derived state returned by `GET /video-escalation-state`. Task 41 computes
 * this by reading the last two `video_escalation_audit` rows for the session
 * and applying the Task 40 acceptance-criteria state machine:
 *
 *   - 0 rows                                → `idle`
 *   - 1 row, response=`allow`               → `locked:already_recording_video`
 *   - 1 row, response=`decline`|`timeout`,
 *     requested_at > now - 5min             → `cooldown (attemptsUsed=1)`
 *   - 1 row, response=`decline`|`timeout`,
 *     requested_at <= now - 5min            → `idle` (with attemptsUsed=1)
 *   - 2 rows                                → `locked:max_attempts`
 *   - 1 row still pending (response=null)   → `requesting`
 */
export type VideoEscalationStateData =
  | { kind: "idle";       attemptsUsed: 0 | 1 }
  | { kind: "requesting"; requestId: string; expiresAt: string; attemptsUsed: 1 | 2 }
  | {
      kind:           "cooldown";
      availableAt:    string;
      attemptsUsed:   1 | 2;
      lastOutcome:    "decline" | "timeout";
      /** Patient's free-text reason if one was captured. v1 has no
       *  free-text patient-decline field, so this is always `null` in
       *  Task 40/41's v1 — forward-compat for a v1.1 additive field. */
      lastReason:     string | null;
    }
  | {
      kind:    "locked";
      reason:  "max_attempts" | "already_recording_video";
      /**
       * Only set when `reason === 'already_recording_video'`. Drives the
       * `<VideoRecordingIndicator>` (Task 42) over the real estate. Null
       * otherwise.
       */
      requestId: string | null;
    };

// ---------------------------------------------------------------------------
// Error shape
// ---------------------------------------------------------------------------

/**
 * Error thrown by the helpers below. Callers discriminate on `.code` to
 * render the right surface.
 *
 *   - `RATE_LIMITED`           — 429. Parent transitions button to
 *     `cooldown` / `locked` with `cooldownAvailableAt`.
 *   - `SESSION_ENDED`          — 409. Rare — session ended between the
 *     button click and the POST reaching the server. Parent hides the
 *     button.
 *   - `NOT_A_PARTICIPANT`      — 403. Only fires if a doctor mounted in a
 *     session they don't own.
 *   - `BAD_INPUT`              — 400. Usually a stale client — the modal
 *     already validates the 5..200 char range.
 *   - `NETWORK_ERROR`          — fetch() threw (offline, DNS, CORS).
 *   - `UNKNOWN`                — everything else.
 */
export type VideoEscalationErrorCode =
  | "RATE_LIMITED"
  | "SESSION_ENDED"
  | "NOT_A_PARTICIPANT"
  | "BAD_INPUT"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class VideoEscalationError extends Error {
  code:               VideoEscalationErrorCode;
  status:             number | null;
  /**
   * When `code === 'RATE_LIMITED'`, the server may include the server-clock
   * `availableAt` ISO timestamp for the cooldown. Parent uses this to skip
   * the round-trip to `GET /video-escalation-state` right after the 429.
   */
  cooldownAvailableAt: string | null;

  constructor(
    message: string,
    code:    VideoEscalationErrorCode,
    status:  number | null,
    cooldownAvailableAt: string | null = null,
  ) {
    super(message);
    this.name                 = "VideoEscalationError";
    this.code                 = code;
    this.status               = status;
    this.cooldownAvailableAt  = cooldownAvailableAt;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BackendErrorBody {
  success?: false;
  error?: {
    code?:         string;
    message?:      string;
    statusCode?:   number;
    /** Legacy location — older route handlers may put it on `error`. */
    availableAt?:  string;
  };
  /**
   * Task 41's 429 `CooldownInProgressError` carries the cooldown-end ISO
   * timestamp here (the shared `errorResponse` helper nests extra fields
   * under `meta`, not `error`). We check both locations for robustness.
   */
  meta?: {
    availableAt?: string;
    [key: string]: unknown;
  };
}

function mapStatusToCode(
  status: number,
  bodyCode: string | undefined,
): VideoEscalationErrorCode {
  if (status === 429) return "RATE_LIMITED";
  if (status === 409) return "SESSION_ENDED";
  if (status === 403) return "NOT_A_PARTICIPANT";
  if (status === 400) return "BAD_INPUT";
  // Respect an explicit server-provided code when present (forward-compat).
  if (bodyCode === "RATE_LIMITED") return "RATE_LIMITED";
  if (bodyCode === "SESSION_ENDED") return "SESSION_ENDED";
  if (bodyCode === "NOT_A_PARTICIPANT") return "NOT_A_PARTICIPANT";
  if (bodyCode === "BAD_INPUT") return "BAD_INPUT";
  return "UNKNOWN";
}

function parseBody(text: string): BackendErrorBody | null {
  if (!text.length) return null;
  try {
    return JSON.parse(text) as BackendErrorBody;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// POST /video-escalation/request
// ---------------------------------------------------------------------------

/**
 * Doctor asks the patient to consent to video recording.
 *
 * On 200 → resolves with `{ requestId, expiresAt, correlationId }`.
 * On 4xx / 5xx / network → throws `VideoEscalationError` with a typed code.
 */
export async function requestVideoEscalation(
  token: string,
  input: RequestVideoEscalationInput,
): Promise<RequestVideoEscalationData> {
  const base = requireApiBaseUrl();
  const url  = `${base}/api/v1/consultation/${encodeURIComponent(input.sessionId)}/video-escalation/request`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${token}`,
      },
      body: JSON.stringify({
        doctorId:         input.doctorId,
        presetReasonCode: input.presetReasonCode,
        reason:           input.reason,
      }),
      cache: "no-store",
    });
  } catch (networkErr) {
    const message = networkErr instanceof Error
      ? networkErr.message
      : "Network error";
    throw new VideoEscalationError(
      `Couldn't reach the server. ${message}`,
      "NETWORK_ERROR",
      null,
    );
  }

  const text = await res.text();
  const body = parseBody(text);

  if (!res.ok) {
    const serverCode    = body?.error?.code;
    const serverMessage = body?.error?.message;
    const code          = mapStatusToCode(res.status, serverCode);
    const message       = serverMessage ?? "Couldn't send the request. Please try again.";
    const availableAtFromError = typeof body?.error?.availableAt === "string"
      ? body.error.availableAt
      : null;
    const availableAtFromMeta  = typeof body?.meta?.availableAt === "string"
      ? body.meta.availableAt
      : null;
    const availableAt = availableAtFromError ?? availableAtFromMeta;
    throw new VideoEscalationError(message, code, res.status, availableAt);
  }

  // Contract success envelope: `{ success: true, data: RequestVideoEscalationData, meta }`.
  const parsed = body as unknown as { data?: unknown } | null;
  const data   = parsed?.data as RequestVideoEscalationData | undefined;
  if (
    !data ||
    typeof data.requestId     !== "string" ||
    typeof data.expiresAt     !== "string" ||
    typeof data.correlationId !== "string"
  ) {
    throw new VideoEscalationError(
      "Received an unexpected response shape from the server.",
      "UNKNOWN",
      res.status,
    );
  }
  return data;
}

// ---------------------------------------------------------------------------
// GET /video-escalation-state
// ---------------------------------------------------------------------------

/**
 * Re-hydrates the doctor-UI state on mount / page refresh. Returns `idle`
 * for any non-200 response so the UI degrades gracefully when Task 41
 * hasn't shipped yet — the button is still usable; submit-time errors
 * will surface the real failure to the doctor.
 */
export async function getVideoEscalationState(
  token: string,
  sessionId: string,
): Promise<VideoEscalationStateData> {
  const base = requireApiBaseUrl();
  const url  = `${base}/api/v1/consultation/${encodeURIComponent(sessionId)}/video-escalation-state`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache:   "no-store",
    });
  } catch {
    // Network failure → fall back to idle. UI is still functional; any
    // subsequent POST will surface the real error.
    return { kind: "idle", attemptsUsed: 0 };
  }

  if (!res.ok) {
    // 404 = endpoint not deployed yet (Task 41 pending). Treat as idle.
    // 5xx = server glitch. Treat as idle for graceful degradation — the
    // POST path will surface any real error path.
    return { kind: "idle", attemptsUsed: 0 };
  }

  const text   = await res.text();
  const body   = parseBody(text);
  const parsed = body as unknown as { data?: VideoEscalationStateData } | null;
  const data   = parsed?.data;

  if (!data || typeof (data as { kind?: unknown }).kind !== "string") {
    return { kind: "idle", attemptsUsed: 0 };
  }

  return data;
}

// ---------------------------------------------------------------------------
// POST /video-escalation-requests/:requestId/respond  (patient-side)
// ---------------------------------------------------------------------------

/** Patient's decision on the consent modal. The modal surfaces the two CTAs
 *  `[Decline]` / `[Allow]`; the `'timeout'` state is NEVER submitted from
 *  the client — it's computed server-side by the timeout worker. Keeping
 *  the union tight prevents a bug where a client-side timer fires the
 *  wrong decision on the wire. */
export type VideoEscalationDecision = "allow" | "decline";

export interface RespondVideoEscalationInput {
  requestId: string;
  decision:  VideoEscalationDecision;
}

/** Shape returned by `POST /respond`. 200 is always the HTTP status —
 *  the `accepted` field discriminates success vs "too late" surfaces. */
export type RespondVideoEscalationResult =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | "already_responded"
        | "already_timed_out"
        | "not_a_participant";
    };

/**
 * Patient submits their `'allow'` / `'decline'` decision on the consent
 * modal. The modal mounts for a specific `requestId` that arrived via the
 * `escalation` Realtime channel (or via a refresh of
 * `GET /video-escalation-state` on reconnect).
 *
 * Always returns a resolved `{ accepted }` shape on HTTP 200. Network and
 * non-200 errors throw `VideoEscalationError` so the modal can show
 * inline error copy + keep both CTAs enabled.
 */
export async function respondToVideoEscalation(
  token: string,
  input: RespondVideoEscalationInput,
): Promise<RespondVideoEscalationResult> {
  const base = requireApiBaseUrl();
  const url  = `${base}/api/v1/consultation/video-escalation-requests/${encodeURIComponent(input.requestId)}/respond`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${token}`,
      },
      body: JSON.stringify({ decision: input.decision }),
      cache: "no-store",
    });
  } catch (networkErr) {
    const message = networkErr instanceof Error
      ? networkErr.message
      : "Network error";
    throw new VideoEscalationError(
      `Couldn't reach the server. ${message}`,
      "NETWORK_ERROR",
      null,
    );
  }

  const text = await res.text();
  const body = parseBody(text);

  if (!res.ok) {
    const serverCode    = body?.error?.code;
    const serverMessage = body?.error?.message;
    const code          = mapStatusToCode(res.status, serverCode);
    const message       = serverMessage ?? "Couldn't send your response. Please try again.";
    throw new VideoEscalationError(message, code, res.status);
  }

  const parsed = body as unknown as { data?: unknown } | null;
  const data   = parsed?.data as RespondVideoEscalationResult | undefined;
  if (!data || typeof (data as { accepted?: unknown }).accepted !== "boolean") {
    throw new VideoEscalationError(
      "Received an unexpected response shape from the server.",
      "UNKNOWN",
      res.status,
    );
  }
  return data;
}

// ---------------------------------------------------------------------------
// POST /video-escalation/revoke  (patient-side, Task 42)
// ---------------------------------------------------------------------------

/**
 * Result shape returned by `POST /video-escalation/revoke`. Always 200 on
 * both `revoked` and `already_audio_only` — the latter is the idempotent
 * success path when the patient double-taps [Stop] or the recording
 * rolled back via a concurrent path. The modal's confirmation tooltip
 * closes on either value.
 */
export interface RevokeVideoRecordingResult {
  correlationId: string;
  /**
   *  · `revoked`            — this call flipped an active allow row to revoked.
   *  · `already_audio_only` — no active allow row; idempotent no-op.
   */
  status:        "revoked" | "already_audio_only";
}

/**
 * Patient revokes an in-flight video recording. Called from the
 * `<VideoRecordingIndicator>`'s confirmation tooltip (Task 42 Decision
 * 10 LOCKED). The server:
 *
 *   1. Calls Twilio to revert Recording Rules to `audio_only`
 *      (Task 43's `revertToAudioOnlyRecording`).
 *   2. Atomically stamps `video_escalation_audit.revoked_at` on the
 *      active allow row.
 *   3. Writes a `patient_revoked_video_mid_session` intent row in
 *      `consultation_recording_audit`.
 *   4. Emits a `video_recording_stopped` system message (both parties).
 *   5. Inserts a `patient_revoked_video_mid_session` doctor-dashboard
 *      event (graceful-degrades if the dashboard table's CHECK is
 *      stale).
 *
 * Throws `VideoEscalationError` on 4xx / 5xx / network failure. The
 * Twilio-flip-failed path surfaces as a 5xx so the tooltip re-enables
 * the CTA for retry (per task-42 Option A: "Couldn't stop recording.
 * Try again.").
 */
export async function revokeVideoRecording(
  token:      string,
  sessionId:  string,
): Promise<RevokeVideoRecordingResult> {
  const base = requireApiBaseUrl();
  const url  = `${base}/api/v1/consultation/${encodeURIComponent(sessionId)}/video-escalation/revoke`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${token}`,
      },
      // Empty body — the sessionId + bearer JWT locate the active row.
      body: JSON.stringify({}),
      cache: "no-store",
    });
  } catch (networkErr) {
    const message = networkErr instanceof Error
      ? networkErr.message
      : "Network error";
    throw new VideoEscalationError(
      `Couldn't reach the server. ${message}`,
      "NETWORK_ERROR",
      null,
    );
  }

  const text = await res.text();
  const body = parseBody(text);

  if (!res.ok) {
    const serverCode    = body?.error?.code;
    const serverMessage = body?.error?.message;
    const code          = mapStatusToCode(res.status, serverCode);
    const message       = serverMessage ?? "Couldn't stop recording. Please try again.";
    throw new VideoEscalationError(message, code, res.status);
  }

  const parsed = body as unknown as { data?: unknown } | null;
  const data   = parsed?.data as RevokeVideoRecordingResult | undefined;
  if (
    !data ||
    typeof (data as { status?: unknown }).status !== "string" ||
    typeof (data as { correlationId?: unknown }).correlationId !== "string"
  ) {
    throw new VideoEscalationError(
      "Received an unexpected response shape from the server.",
      "UNKNOWN",
      res.status,
    );
  }
  return data;
}
