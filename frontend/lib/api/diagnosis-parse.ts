/**
 * AI ICD-11 diagnosis resolver API client (assessment-tab · asmt-07)
 * POST /api/v1/diagnoses/parse
 *
 * Gated, suggestion-only. The deterministic catalog autocomplete runs first;
 * this is called only on the free-text (no catalog match) path or an explicit
 * "✨ refine". Every returned suggestion is a REAL catalog code — the server
 * re-resolves the model's terms against `diagnosis_catalog`.
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";

export type DiagnosisResolveTier = "default" | "escalation";

/** One resolved suggestion — `code`/`title` always come from the catalog. */
export interface DiagnosisResolveSuggestion {
  code: string;
  title: string;
  /** Model confidence 0–1 (advisory only; may be absent). */
  confidence?: number;
}

export interface DiagnosisResolveResultData {
  suggestions: DiagnosisResolveSuggestion[];
}

export interface ResolveDiagnosisInput {
  /** Doctor's free-typed diagnosis line. */
  text: string;
  /** `escalation` (flagship) for explicit refine; `default` (mini) for auto-gate. */
  tier?: DiagnosisResolveTier;
  /** Abort the in-flight request when the text changes / card is removed. */
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

export async function resolveDiagnosisWithAI(
  token: string,
  input: ResolveDiagnosisInput,
): Promise<ApiSuccess<DiagnosisResolveResultData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/diagnoses/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: input.signal,
    body: JSON.stringify({
      text: input.text,
      tier: input.tier,
    }),
  });
  return parseJsonResponse<DiagnosisResolveResultData>(res);
}
