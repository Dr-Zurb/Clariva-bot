/**
 * Drug Interactions API client (EHR Sub-batch C / T4.20 — C.3).
 *
 * Typed wrapper around GET /api/v1/drug-interactions/check.
 *
 * Usage in PrescriptionForm:
 *   const result = await checkDrugInteractions(token, ['uuid-a', 'uuid-b']);
 *   // result.data.results → InteractionRow[]
 *
 * Short-circuits to an empty result when fewer than 2 ids are supplied
 * (no pairs possible) so the caller never needs to guard.
 *
 * @see backend/src/routes/api/v1/drug-interactions-routes.ts
 * @see backend/src/services/drug-interactions-service.ts
 * @see frontend/components/ehr/InteractionChips.tsx
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types (mirror of backend/src/types/drug-interactions.ts)
// ---------------------------------------------------------------------------

/**
 * Four-value severity scale (Decision §20 LOCKED).
 * Used by InteractionChips for colour coding.
 */
export type InteractionSeverity = "minor" | "moderate" | "major" | "contraindicated";

/** Full DB row shape returned by the check endpoint. */
export interface InteractionRow {
  id: string;
  drug_a_id: string;
  drug_b_id: string;
  severity: InteractionSeverity;
  /** Mechanism / interaction summary text. */
  description: string;
  /** Clinical action guidance. */
  recommendation: string;
  /** Source note / reference citation. */
  source: string;
  /** URL to primary source (BNF etc.). Nullable. */
  source_url: string | null;
}

export interface CheckInteractionsData {
  results: InteractionRow[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/drug-interactions/check?ids=<uuid,uuid,...>
 *
 * Returns all drug_interactions rows for the unordered pairs formed from
 * the supplied list.  Unknown ids produce no rows (no false positives, no
 * errors). Input order does not matter — the service normalises pairs with
 * LEAST/GREATEST.
 *
 * @param token - Doctor JWT (required by the route).
 * @param ids   - Array of drug_master UUIDs. Hard ceiling 20 enforced
 *               server-side; anything beyond is silently truncated there.
 *               Fewer than 2 ids → early return [] without a network call.
 */
export async function checkDrugInteractions(
  token: string,
  ids: string[],
): Promise<ApiSuccess<CheckInteractionsData>> {
  if (ids.length < 2) {
    return {
      success: true,
      data: { results: [] },
      meta: { timestamp: new Date().toISOString(), requestId: "" },
    };
  }

  const params = new URLSearchParams({ ids: ids.join(",") });
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/drug-interactions/check?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<CheckInteractionsData>
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
  return json as ApiSuccess<CheckInteractionsData>;
}
