/**
 * Visit-narrative provenance client (vnt-04 §4).
 * POST /api/v1/visit-narrative/provenance
 *
 * Fail-soft: never throws except AbortError. A missed audit row must not
 * block the clinical accept.
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import type { VisitParseTabId } from "@/lib/cockpit/visit-parse-orchestrator";

export interface RecordVisitNarrativeProvenanceInput {
  consultationSessionId: string;
  transcriptId: string;
  spanStart: number;
  spanEnd: number;
  targetKind: VisitParseTabId;
  createdRowId?: string;
  signal?: AbortSignal;
}

export interface RecordVisitNarrativeProvenanceResult {
  recorded: boolean;
  id: string | null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

export async function recordVisitNarrativeProvenance(
  token: string,
  input: RecordVisitNarrativeProvenanceInput
): Promise<RecordVisitNarrativeProvenanceResult> {
  try {
    const res = await fetch(`${requireApiBaseUrl()}/api/v1/visit-narrative/provenance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: input.signal,
      body: JSON.stringify({
        consultationSessionId: input.consultationSessionId,
        transcriptId: input.transcriptId,
        spanStart: input.spanStart,
        spanEnd: input.spanEnd,
        targetKind: input.targetKind,
        createdRowId: input.createdRowId,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as
      | ApiSuccess<RecordVisitNarrativeProvenanceResult>
      | ApiError;
    if (!res.ok || isApiError(json)) {
      return { recorded: false, id: null };
    }
    const data = (json as ApiSuccess<RecordVisitNarrativeProvenanceResult>).data;
    return {
      recorded: Boolean(data?.recorded),
      id: data?.id ?? null,
    };
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { recorded: false, id: null };
  }
}
