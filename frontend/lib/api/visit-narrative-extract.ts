/**
 * Visit-narrative extraction client (vnt-02 / vnt-03)
 * POST /api/v1/visit-narrative/extract
 *
 * Fail-soft: transport or empty-extraction errors degrade to a `failed`
 * result with no lines — never an error dialog mid-consult. AbortError
 * still throws so the caller can ignore a superseded request.
 * No quote field — slice transcript_text at the span (vnt-03).
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";

export type TranscriptExtractStatus =
  | "ready"
  | "queued"
  | "processing"
  | "failed"
  | "missing"
  | "over_window";

export interface TranscriptExtractLine {
  text: string;
  spanStart: number;
  spanEnd: number;
}

export interface TranscriptExtractResult {
  status: TranscriptExtractStatus;
  transcriptId: string | null;
  transcriptChars: number;
  lines: TranscriptExtractLine[];
  droppedCount: number;
  overWindow: boolean;
  chunksUsed: number;
  redactionApplied: boolean;
  transcriptText: string | null;
}

export interface ExtractVisitNarrativeInput {
  consultationSessionId: string;
  signal?: AbortSignal;
}

export const EMPTY_TRANSCRIPT_EXTRACT: TranscriptExtractResult = {
  status: "failed",
  transcriptId: null,
  transcriptChars: 0,
  lines: [],
  droppedCount: 0,
  overWindow: false,
  chunksUsed: 0,
  redactionApplied: false,
  transcriptText: null,
};

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

function emptyResult(status: TranscriptExtractStatus): TranscriptExtractResult {
  return { ...EMPTY_TRANSCRIPT_EXTRACT, status };
}

export async function extractVisitNarrative(
  token: string,
  input: ExtractVisitNarrativeInput
): Promise<TranscriptExtractResult> {
  try {
    const res = await fetch(`${requireApiBaseUrl()}/api/v1/visit-narrative/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: input.signal,
      body: JSON.stringify({
        consultationSessionId: input.consultationSessionId,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as
      | ApiSuccess<TranscriptExtractResult>
      | ApiError;

    if (!res.ok || isApiError(json)) {
      return emptyResult("failed");
    }

    const data = (json as ApiSuccess<TranscriptExtractResult>).data;
    if (!data || !Array.isArray(data.lines)) {
      return emptyResult("failed");
    }
    return data;
  } catch (err) {
    if (isAbortError(err)) throw err;
    return emptyResult("failed");
  }
}
