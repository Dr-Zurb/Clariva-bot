/**
 * Modality-change HTTP client (Plan 09 · Task 50 · Decision 11 LOCKED).
 *
 * Thin wrappers over the four endpoints exposed by
 * `backend/src/routes/api/v1/consultation.ts`:
 *
 *   · POST /api/v1/consultation/:sessionId/modality-change/request
 *   · POST /api/v1/consultation/:sessionId/modality-change/approve
 *   · POST /api/v1/consultation/:sessionId/modality-change/patient-consent
 *   · GET  /api/v1/consultation/:sessionId/modality-change/state
 *
 * All four return the shared `ApiSuccess<T>` envelope on 2xx. On 4xx /
 * 5xx we throw a plain `Error` with `status` + `code` annotated so the
 * modal can branch on well-known rejection reasons. Service-level
 * domain rejections (e.g. `max_upgrades_reached`) come back as 200
 * with `result.kind === 'rejected'` — the modal branches on that.
 *
 * @see backend/src/controllers/modality-change-controller.ts
 */

import type { ApiError, ApiSuccess } from "../api";
import { requireApiBaseUrl } from "@/lib/api-base";
import type {
  ModalityChangeRequestBody,
  ModalityChangeResult,
  ModalityChangeState,
  ModalityHistoryResponse,
} from "@/types/modality-change";

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

async function parseOrThrow<T>(res: Response): Promise<ApiSuccess<T>> {
  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<T>
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
  return json;
}

// ----------------------------------------------------------------------------
// POST /modality-change/request
// ----------------------------------------------------------------------------

export async function postModalityChangeRequest(
  token: string,
  sessionId: string,
  body: ModalityChangeRequestBody,
): Promise<ModalityChangeResult> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/modality-change/request`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const envelope = await parseOrThrow<ModalityChangeResult>(res);
  return envelope.data;
}

// ----------------------------------------------------------------------------
// POST /modality-change/approve  (doctor seat only — exposed here for symmetry;
// Task 51's doctor modal consumes this. Task 50 does NOT call it.)
// ----------------------------------------------------------------------------

export interface ApproveBody {
  approvalRequestId: string;
  decision: "paid" | "free" | "decline";
  /** Required for `paid`; pricing authority is server-side — this is echoed for doctor-UI confirmation. */
  amountPaise?: number;
  /** Required for `decline`. 5..200 chars. */
  declineReason?: string;
  correlationId?: string;
}

export async function postModalityChangeApprove(
  token: string,
  sessionId: string,
  body: ApproveBody,
): Promise<ModalityChangeResult> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/modality-change/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const envelope = await parseOrThrow<ModalityChangeResult>(res);
  return envelope.data;
}

// ----------------------------------------------------------------------------
// POST /modality-change/patient-consent  (patient seat only — Task 52 consumes;
// exposed here for module completeness.)
// ----------------------------------------------------------------------------

export interface PatientConsentBody {
  consentRequestId: string;
  decision: "allow" | "decline";
  declineReason?: string;
  correlationId?: string;
}

export async function postModalityChangePatientConsent(
  token: string,
  sessionId: string,
  body: PatientConsentBody,
): Promise<ModalityChangeResult> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/modality-change/patient-consent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const envelope = await parseOrThrow<ModalityChangeResult>(res);
  return envelope.data;
}

// ----------------------------------------------------------------------------
// GET /modality-change/state
// ----------------------------------------------------------------------------

export interface ModalityChangeStateResponse {
  state: ModalityChangeState | null;
}

export async function getModalityChangeState(
  token: string,
  sessionId: string,
): Promise<ModalityChangeStateResponse> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/modality-change/state`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const envelope = await parseOrThrow<ModalityChangeStateResponse>(res);
  return envelope.data;
}

// ----------------------------------------------------------------------------
// GET /modality-change/history  (Plan 09 · Task 55)
// ----------------------------------------------------------------------------

/**
 * Fetch the post-consult modality timeline. Returns the session
 * summary + chronological transition entries. Participants-only
 * (backend enforces via JWT sub match against session seats).
 *
 * Throws with `err.status = 404` when the session doesn't exist,
 * `403` when the requester isn't a participant. Callers in the
 * `<ModalityHistoryTimeline>` component branch on `err.status` to
 * render the appropriate error surface.
 */
export async function fetchModalityHistory(
  token: string,
  sessionId: string,
): Promise<ModalityHistoryResponse> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/modality-change/history`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const envelope = await parseOrThrow<ModalityHistoryResponse>(res);
  return envelope.data;
}
