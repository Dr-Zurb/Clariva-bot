/**
 * Video Replay OTP API client wrappers (Plan 08 · Task 44 · Decision 10 LOCKED).
 *
 * Paired with `backend/src/routes/api/v1/consultation.ts`'s
 * `/:sessionId/video-replay-otp/{state,send,verify}` handlers. The UI
 * flow orchestrated by `<RecordingReplayPlayer>`:
 *
 *   1. Patient toggles "Show video".
 *   2. `<VideoReplayWarningModal>` renders; on continue →
 *      call `getVideoReplayOtpState()` to decide if the OTP step
 *      can be skipped (inside the 30-day rolling window).
 *   3. If required, `<VideoReplayOtpModal>` opens, calls
 *      `sendVideoReplayOtpApi()`, captures the code, calls
 *      `verifyVideoReplayOtpApi()`.
 *   4. On verified (or skipped because already inside the window),
 *      the player re-calls `mintReplayAudioUrl(token, sessionId, 'video')`
 *      to mint a video composition URL.
 *
 * Every function uses the **patient-scoped replay JWT** (from
 * `exchangeReplayToken`) as its bearer. Doctor JWTs are rejected at
 * the route layer with a 403 `forbidden_role`.
 */

import type { ApiError, ApiSuccess } from "../api";
import { requireApiBaseUrl } from "@/lib/api-base";

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface VideoReplayOtpStateData {
  /**
   * `true` when the patient is outside the 30-day rolling window (or
   * has never verified) and must complete an SMS OTP before video
   * replay is minted. `false` when the patient can skip the OTP step.
   */
  required: boolean;
  /** ISO-8601 of the last successful OTP verification, or `null`. */
  lastVerifiedAt: string | null;
}

export interface VideoReplayOtpSendData {
  /**
   * Surrogate id the client carries into the verify call. NOT the
   * code itself — codes never round-trip through the client state,
   * they only flow code → SMS → patient → verify.
   */
  otpId: string;
  /** ISO-8601 expiry (5 min from issue). Used to render the countdown. */
  expiresAt: string;
  sent: true;
}

export type VerifyVideoReplayOtpReason =
  | "expired"
  | "too_many_attempts"
  | "wrong_code";

export type VerifyVideoReplayOtpResponse =
  | { verified: true }
  | { verified: false; reason: VerifyVideoReplayOtpReason };

/**
 * Surface thrown from the send-API when the backend rejects for
 * reasons the modal renders distinct copy for:
 *   - `rate_limited`             → backend 429, carries `retryAfterSeconds`.
 *   - `sms_unavailable`          → backend 502, "we couldn't reach your phone".
 *   - `already_verified`         → backend 409, "you don't need an OTP right now".
 *   - `no_patient_phone_on_file` → backend 403, "support needs to set up SMS".
 */
export type VideoReplayOtpSendErrorCode =
  | "rate_limited"
  | "sms_unavailable"
  | "already_verified"
  | "no_patient_phone_on_file";

export class VideoReplayOtpSendError extends Error {
  constructor(
    public readonly code: VideoReplayOtpSendErrorCode,
    message: string,
    /** Backend detail payload — typed per-code by the caller. */
    public readonly details?: Record<string, unknown>,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "VideoReplayOtpSendError";
  }

  get retryAfterSeconds(): number | undefined {
    const raw = this.details?.retry_after_seconds;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
  }

  get lastVerifiedAt(): string | null | undefined {
    const raw = this.details?.lastVerifiedAt;
    if (raw === null) return null;
    return typeof raw === "string" ? raw : undefined;
  }
}

// ----------------------------------------------------------------------------
// API calls
// ----------------------------------------------------------------------------

/**
 * GET /api/v1/consultation/:sessionId/video-replay-otp/state
 */
export async function getVideoReplayOtpState(
  token: string,
  sessionId: string,
): Promise<ApiSuccess<VideoReplayOtpStateData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/video-replay-otp/state`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<VideoReplayOtpStateData>
    | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    if (isApiError(json)) err.code = json.error.code;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & {
      status?: number;
      code?: string;
    };
    err.status = json.error.statusCode ?? 500;
    err.code = json.error.code;
    throw err;
  }
  return json as ApiSuccess<VideoReplayOtpStateData>;
}

/**
 * POST /api/v1/consultation/:sessionId/video-replay-otp/send
 *
 * Throws `VideoReplayOtpSendError` on any non-2xx with a recognised
 * code so the UI can branch on `.code` without string matching.
 */
export async function sendVideoReplayOtpApi(
  token: string,
  sessionId: string,
): Promise<ApiSuccess<VideoReplayOtpSendData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/video-replay-otp/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<VideoReplayOtpSendData>
    | ApiError;
  if (!res.ok) {
    if (isApiError(json)) {
      const code = json.error.code as VideoReplayOtpSendErrorCode;
      if (
        code === "rate_limited" ||
        code === "sms_unavailable" ||
        code === "already_verified" ||
        code === "no_patient_phone_on_file"
      ) {
        throw new VideoReplayOtpSendError(
          code,
          json.error.message,
          json.error.details,
          res.status,
        );
      }
    }
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    if (isApiError(json)) err.code = json.error.code;
    throw err;
  }
  if (isApiError(json)) {
    throw new Error(json.error.message);
  }
  return json as ApiSuccess<VideoReplayOtpSendData>;
}

/**
 * POST /api/v1/consultation/:sessionId/video-replay-otp/verify
 *
 * Intentionally returns shape `{ verified: boolean, reason? }` on 200
 * for both success and wrong-code / expired / lockout states — "wrong
 * OTP" is a valid domain result, not a protocol error. The helper
 * still throws on 4xx/5xx (network / malformed / auth failures).
 */
export async function verifyVideoReplayOtpApi(
  token: string,
  sessionId: string,
  input: { otpId: string; code: string },
): Promise<VerifyVideoReplayOtpResponse> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/video-replay-otp/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ otpId: input.otpId, code: input.code }),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<VerifyVideoReplayOtpResponse>
    | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    if (isApiError(json)) err.code = json.error.code;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & {
      status?: number;
      code?: string;
    };
    err.status = json.error.statusCode ?? 500;
    err.code = json.error.code;
    throw err;
  }
  return (json as ApiSuccess<VerifyVideoReplayOtpResponse>).data;
}
