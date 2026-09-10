/**
 * Lab report extract API client (rpt-05.2 / rpt-05.3 / rpt-05.6).
 * POST /api/v1/prescriptions/:id/attachments/:attachmentId/extract-lab
 *
 * Suggestion-only. Returns verbatim rows; the caller matches them against
 * the frontend lab library and must verify before applying.
 *
 * One endpoint, two readers: the server dispatches on the attachment's MIME
 * to deterministic PDF text-layer reconstruction or to the gated vision
 * reader for photos. `source` says which ran.
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";

export interface RawExtractedLabRow {
  rawName: string;
  rawValue: string | null;
  rawUnit: string | null;
  rawRange: string | null;
  rawMethod: string | null;
  pageIndex: number;
  lineText: string;
}

/**
 * Which reader produced the rows. For `vision`, `lineText` is reassembled from
 * the model's own output rather than read off the page, so it cannot serve as
 * provenance — the source image is the check.
 */
export type LabExtractSource = "pdf_text" | "vision";

export interface ExtractLabPdfResultData {
  attachmentId: string;
  rows: RawExtractedLabRow[];
  pageCount: number;
  skippedPageIndexes: number[];
  source: LabExtractSource;
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

export async function extractLabPdfFromAttachment(
  token: string,
  prescriptionId: string,
  attachmentId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiSuccess<ExtractLabPdfResultData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/prescriptions/${encodeURIComponent(prescriptionId)}/attachments/${encodeURIComponent(attachmentId)}/extract-lab`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: options.signal,
    },
  );
  return parseJsonResponse<ExtractLabPdfResultData>(res);
}
