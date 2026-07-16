/**
 * AI investigation order resolver API client (plan-investigations-library · inv-lib-04)
 * POST /api/v1/investigations/parse
 *
 * Gated, suggestion-only. The deterministic catalog autocomplete + local fuzzy
 * suggest run first; this is called only on the free-text (no local match) path.
 *
 * Unlike the diagnosis resolver, the order catalog is a FRONTEND static library,
 * so the server returns candidate TERMS only (never catalog ids). The caller
 * re-resolves each term against the static catalog — the model can never inject
 * an order the catalog does not know.
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";

export type InvestigationResolveTier = "default" | "escalation";

/** One normalized order-term candidate (mapped to the catalog by the caller). */
export interface InvestigationResolveCandidate {
  /** Clean lab / imaging order name in English (e.g. "Liver function test"). */
  term: string;
  /** Model confidence 0–1 (advisory only; may be absent). */
  confidence?: number;
}

export interface InvestigationResolveResultData {
  candidates: InvestigationResolveCandidate[];
}

export interface ResolveInvestigationInput {
  /** Doctor's free-typed order line. */
  text: string;
  /** `escalation` (flagship) for explicit refine; `default` (mini) for auto-gate. */
  tier?: InvestigationResolveTier;
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

export async function resolveInvestigationWithAI(
  token: string,
  input: ResolveInvestigationInput,
): Promise<ApiSuccess<InvestigationResolveResultData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/investigations/parse`, {
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
  return parseJsonResponse<InvestigationResolveResultData>(res);
}
