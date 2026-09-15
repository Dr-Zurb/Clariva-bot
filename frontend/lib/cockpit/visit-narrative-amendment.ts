/**
 * Visit-narrative amendment context (vnt-04).
 *
 * Query param opens a past consult's form and proposes transcript rows
 * through the Phase-1 apply spine. Does not change typed/dictated behavior.
 */

import { AMEND_TRANSCRIPT_PARAM } from "@/lib/cockpit/back-target";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAmendTranscriptSessionId(
  raw: string | null | undefined
): string | null {
  if (!raw || !UUID_RE.test(raw)) return null;
  return raw;
}

export function readAmendTranscriptSessionId(searchParams: {
  get(name: string): string | null;
}): string | null {
  return parseAmendTranscriptSessionId(searchParams.get(AMEND_TRANSCRIPT_PARAM));
}

export function stripAmendTranscriptParam(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete(AMEND_TRANSCRIPT_PARAM);
  const next = params.toString();
  return next ? `?${next}` : "";
}
