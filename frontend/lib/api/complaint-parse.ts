/**
 * AI complaint-parse API client (subjective-tab · subj-14)
 * POST /api/v1/complaints/parse
 *
 * Gated, suggestion-only. The deterministic parser runs first; this is called
 * only when the gate fires or the doctor taps "✨ refine". Sends the resolved
 * schema field spec so the server constrains + validates the model output.
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import type { ComplaintCategory } from "@/types/prescription";
import type { ParsedComplaintPatch } from "@/lib/cockpit/parse-complaint-text";
import type { ComplaintAttributeFieldDef } from "@/lib/cockpit/complaint-schema";

export type ComplaintParseTier = "default" | "escalation";

/** One AI-detected complaint — same per-complaint shape as the deterministic parser. */
export interface AiParsedComplaint {
  name: string;
  patch: ParsedComplaintPatch;
  associated: string[];
}

export interface ParseComplaintResultData {
  complaints: AiParsedComplaint[];
}

export interface ParseComplaintInput {
  text: string;
  category?: ComplaintCategory;
  /** Resolved client schema — server bounds output to these keys + chip enums. */
  fieldSpec: ComplaintAttributeFieldDef[];
  /** `escalation` (flagship) for explicit refine; `default` (mini) for auto-gate. */
  tier?: ComplaintParseTier;
  /** Abort the in-flight request when the card is removed / text changes. */
  signal?: AbortSignal;
}

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

async function parseJsonResponse<T>(res: Response): Promise<ApiSuccess<T>> {
  const json = (await res.json().catch(() => ({}))) as ApiSuccess<T> | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & { status?: number };
    err.status = json.error.statusCode ?? 500;
    throw err;
  }
  return json as ApiSuccess<T>;
}

export async function parseComplaintWithAI(
  token: string,
  input: ParseComplaintInput,
): Promise<ApiSuccess<ParseComplaintResultData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/complaints/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: input.signal,
    body: JSON.stringify({
      text: input.text,
      category: input.category,
      tier: input.tier,
      fieldSpec: input.fieldSpec.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        ...(f.chips?.length ? { chips: f.chips } : {}),
      })),
    }),
  });
  return parseJsonResponse<ParseComplaintResultData>(res);
}
