/**
 * AI medicine-parse API client (medical-history med redesign)
 * POST /api/v1/medicines/parse
 *
 * Gated, suggestion-only. The deterministic line parser runs first; this is
 * called only when the gate fires or the doctor taps "✨". The server owns the
 * output vocabulary, so the request is just the typed line + tier.
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";

export type MedicineParseTier = "default" | "escalation";

/** One ingredient of a fixed-dose combination ("600/300" → two entries). */
export interface AiParsedStrengthComponent {
  value: number;
  unit?: string | null;
}

/** One AI-detected medicine — keys mirror the deterministic parser / chart patch. */
export interface AiParsedMedicine {
  name: string;
  strengthValue?: number | null;
  strengthUnit?: string | null;
  /** Combo strength, one entry per active ingredient. Set instead of the scalar. */
  strengthComponents?: AiParsedStrengthComponent[] | null;
  doseQty?: number | null;
  doseUnit?: string | null;
  frequencyCode?: string | null;
  doseSchedule?: string | null;
  form?: string | null;
  intakePattern?: string | null;
  source?: string | null;
  startedAgoValue?: number | null;
  startedAgoUnit?: string | null;
  /** "past" when the line says the drug was discontinued; else omitted. */
  status?: string | null;
  /** Time since the drug was stopped ("stopped 2 months ago"). */
  stoppedAgoValue?: number | null;
  stoppedAgoUnit?: string | null;
  /** Why it was stopped, when stated. */
  stopReason?: string | null;
  foodTiming?: string | null;
  instructions?: string | null;
}

export interface ParseMedicineResultData {
  medicines: AiParsedMedicine[];
}

export interface ParseMedicineInput {
  text: string;
  /** `escalation` (flagship) for explicit refine; `default` (mini) for auto-gate. */
  tier?: MedicineParseTier;
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

export async function parseMedicineWithAI(
  token: string,
  input: ParseMedicineInput,
): Promise<ApiSuccess<ParseMedicineResultData>> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/medicines/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: input.signal,
    body: JSON.stringify({ text: input.text, tier: input.tier }),
  });
  return parseJsonResponse<ParseMedicineResultData>(res);
}
