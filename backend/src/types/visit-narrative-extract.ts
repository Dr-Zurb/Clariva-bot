/**
 * Visit-narrative extraction contract (vnt-02).
 *
 * Condensed draft lines + character spans into the stored transcript.
 * No model-echoed quote field — vnt-03 slices `transcript_text` at the span.
 * Not a SOAP object. Not field assignment.
 */

export type TranscriptExtractStatus =
  | 'ready'
  | 'queued'
  | 'processing'
  | 'failed'
  | 'missing'
  | 'over_window';

/** One condensed, doctor-editable line. Spans index the full transcript_text. */
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
  /** Full stored transcript_text for client-side quote slices. Never a model echo. */
  transcriptText: string | null;
}

export interface ExtractVisitNarrativeRequest {
  consultationSessionId: string;
}
