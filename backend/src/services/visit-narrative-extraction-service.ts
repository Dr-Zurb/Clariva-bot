/**
 * Transcript → span-anchored draft (visit-narrative · vnt-02).
 *
 * One route, one prompt, one service. Output is condensed cue-shaped text
 * plus spans. The Phase-1 router structures fields; this service does not.
 *
 * Span check is structural (VNT-D2): a line that does not resolve against
 * the stored transcript_text is dropped here, not flagged for the client.
 *
 * Compliance: §1 recorded STOP (attestation does not disclose this hop).
 * Owner overrode 2026-08-30. Clauses were not edited. redaction is mandatory
 * and not sufficient (VNT-D7).
 */

import { getOpenAIClient, getOpenAIComplaintParseConfig } from '../config/openai';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { logAIClassification } from '../utils/audit-logger';
import { isStaffRole } from '../auth/staff-roles';
import { redactPhiForAI } from './ai-service';
import { findSessionById } from './consultation-session-service';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  ServiceUnavailableError,
} from '../utils/errors';
import type { TranscriptStatus } from '../types/consultation-transcript';
import type {
  TranscriptExtractLine,
  TranscriptExtractResult,
  TranscriptExtractStatus,
} from '../types/visit-narrative-extract';

/** One chunk of the full transcript. Offsets are into the whole text. */
export interface TranscriptChunk {
  start: number;
  end: number;
}

export const MAX_CHUNK_CHARS = 12_000;
export const MAX_CHUNKS = 4;
export const MAX_LINES = 40;
export const MAX_LINE_LEN = 240;
const EXTRACT_MAX_TOKENS = 1600;
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'has',
  'had',
  'was',
  'were',
  'been',
  'are',
  'but',
  'not',
  'you',
  'she',
  'his',
  'her',
  'they',
  'them',
  'said',
]);

export interface ExtractRunLlmArgs {
  systemPrompt: string;
  userPrompt: string;
  correlationId: string;
}

export interface ExtractRunLlmResult {
  content: string | null;
  model: string;
  tokens?: number;
  finishReason?: string | null;
}

export type ExtractRunLlm = (args: ExtractRunLlmArgs) => Promise<ExtractRunLlmResult | null>;

export interface TranscriptRow {
  id: string;
  status: TranscriptStatus;
  transcriptText: string;
  transcriptJson: unknown;
}

export interface ExtractVisitNarrativeDeps {
  runLlm?: ExtractRunLlm;
  loadSession?: (sessionId: string) => Promise<{ doctorId: string } | null>;
  loadTranscripts?: (sessionId: string) => Promise<TranscriptRow[]>;
}

export function assertVisitNarrativeActorIsDoctor(role: unknown): void {
  if (isStaffRole(role)) {
    throw new ForbiddenError('Staff access is not permitted on this endpoint');
  }
}

function buildSystemPrompt(): string {
  return [
    'You condense a medical consult transcript into short cue-shaped lines a doctor could type into a visit box.',
    'Output ONLY a JSON object, no markdown:',
    '  {"lines":[{"text":string,"spanStart":number,"spanEnd":number}]}',
    '',
    'Each line MUST start with one of these cues (lowercase):',
    'c/o, exam, impression, order, spo2, bp, temp, plan, advice, note',
    '',
    'Rules:',
    '- text is a condensed draft, not a verbatim quote. Do not invent clinical facts.',
    '- spanStart and spanEnd are character offsets into the FULL transcript (not the chunk).',
    '- The half-open interval [spanStart, spanEnd) must cover the words that justify the line.',
    '- Omit chatter, greetings, and anything not clinically stated.',
    '- Never assign fields, codes, or SOAP keys. Lines only.',
  ].join('\n');
}

export function extractSegmentTexts(transcriptJson: unknown): string[] {
  if (!transcriptJson || typeof transcriptJson !== 'object') return [];
  const obj = transcriptJson as Record<string, unknown>;
  if (Array.isArray(obj.segments)) {
    return obj.segments
      .map((seg) => {
        if (seg && typeof seg === 'object' && typeof (seg as { text?: unknown }).text === 'string') {
          return (seg as { text: string }).text;
        }
        return '';
      })
      .filter((t) => t.length > 0);
  }
  const alt = (obj as { results?: { channels?: Array<{ alternatives?: Array<{ paragraphs?: { paragraphs?: Array<{ sentences?: Array<{ text?: string }> }> } }> }> } })
    .results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs;
  if (Array.isArray(alt)) {
    const out: string[] = [];
    for (const p of alt) {
      const sentences = p?.sentences;
      if (!Array.isArray(sentences)) continue;
      for (const s of sentences) {
        if (typeof s?.text === 'string' && s.text.length > 0) out.push(s.text);
      }
    }
    return out;
  }
  return [];
}

export function locateSegments(transcriptText: string, transcriptJson: unknown): TranscriptChunk[] {
  const texts = extractSegmentTexts(transcriptJson);
  if (texts.length === 0) {
    return transcriptText.length > 0 ? [{ start: 0, end: transcriptText.length }] : [];
  }
  const out: TranscriptChunk[] = [];
  let cursor = 0;
  for (const piece of texts) {
    const idx = transcriptText.indexOf(piece, cursor);
    if (idx === -1) continue;
    out.push({ start: idx, end: idx + piece.length });
    cursor = idx + piece.length;
  }
  if (out.length === 0 && transcriptText.length > 0) {
    return [{ start: 0, end: transcriptText.length }];
  }
  return out;
}

export function packChunks(segments: TranscriptChunk[], maxChars: number): TranscriptChunk[] {
  if (segments.length === 0) return [];
  const chunks: TranscriptChunk[] = [];
  let start = segments[0].start;
  let end = segments[0].end;
  for (let i = 1; i < segments.length; i += 1) {
    const next = segments[i];
    if (next.end - start <= maxChars) {
      end = next.end;
    } else {
      chunks.push({ start, end });
      start = next.start;
      end = next.end;
    }
  }
  chunks.push({ start, end });
  return chunks;
}

function significantTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export function lineCorrespondsToSlice(lineText: string, slice: string): boolean {
  if (!lineText.trim() || !slice.trim()) return false;
  const lineTokens = significantTokens(lineText);
  const sliceNorm = slice.toLowerCase();
  if (lineTokens.length === 0) {
    return slice.trim().length > 0;
  }
  return lineTokens.some((tok) => sliceNorm.includes(tok));
}

export function verifyExtractLines(
  raw: unknown,
  transcriptText: string,
  correlationId: string,
): { lines: TranscriptExtractLine[]; droppedCount: number } {
  const items = extractRawLines(raw);
  const lines: TranscriptExtractLine[] = [];
  let droppedCount = 0;

  for (const item of items.slice(0, MAX_LINES)) {
    if (!item || typeof item !== 'object') {
      droppedCount += 1;
      continue;
    }
    const rec = item as Record<string, unknown>;
    const text = typeof rec.text === 'string' ? rec.text.trim() : '';
    const spanStart = typeof rec.spanStart === 'number' ? rec.spanStart : Number(rec.spanStart);
    const spanEnd = typeof rec.spanEnd === 'number' ? rec.spanEnd : Number(rec.spanEnd);

    if (!text || text.length > MAX_LINE_LEN || !Number.isInteger(spanStart) || !Number.isInteger(spanEnd)) {
      droppedCount += 1;
      continue;
    }
    if (spanStart < 0 || spanEnd > transcriptText.length || spanEnd <= spanStart) {
      droppedCount += 1;
      continue;
    }
    const slice = transcriptText.slice(spanStart, spanEnd);
    if (!lineCorrespondsToSlice(text, slice)) {
      droppedCount += 1;
      continue;
    }
    lines.push({ text, spanStart, spanEnd });
  }

  if (droppedCount > 0) {
    logger.info(
      { correlationId, droppedCount, keptCount: lines.length },
      'visit_narrative_extract: dropped unanchored lines',
    );
  }

  return { lines, droppedCount };
}

function extractRawLines(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { lines?: unknown }).lines)) {
    return (raw as { lines: unknown[] }).lines;
  }
  return [];
}

function safeParseJson(content: string, correlationId: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    logger.warn({ correlationId, len: content.length }, 'visit_narrative_extract: malformed JSON');
    return null;
  }
}

function emptyResult(
  status: TranscriptExtractStatus,
  extras: Partial<TranscriptExtractResult> = {},
): TranscriptExtractResult {
  return {
    status,
    transcriptId: extras.transcriptId ?? null,
    transcriptChars: extras.transcriptChars ?? 0,
    lines: extras.lines ?? [],
    droppedCount: extras.droppedCount ?? 0,
    overWindow: extras.overWindow ?? false,
    chunksUsed: extras.chunksUsed ?? 0,
    redactionApplied: extras.redactionApplied ?? false,
    transcriptText: extras.transcriptText ?? null,
  };
}

function pickTranscript(rows: TranscriptRow[]): TranscriptRow | null {
  if (rows.length === 0) return null;
  return (
    rows.find((r) => r.status === 'completed') ??
    rows.find((r) => r.status === 'processing') ??
    rows.find((r) => r.status === 'queued') ??
    rows.find((r) => r.status === 'failed') ??
    rows[0]
  );
}

async function defaultLoadSession(sessionId: string): Promise<{ doctorId: string } | null> {
  const session = await findSessionById(sessionId);
  if (!session) return null;
  return { doctorId: session.doctorId };
}

async function defaultLoadTranscripts(sessionId: string): Promise<TranscriptRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  const { data, error } = await admin
    .from('consultation_transcripts')
    .select('id, status, transcript_text, transcript_json')
    .eq('consultation_session_id', sessionId);

  if (error) {
    logger.warn({ sessionId, err: error.message }, 'visit_narrative_extract: transcript lookup failed');
    throw new InternalError('Transcript lookup failed');
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    status: row.status as TranscriptStatus,
    transcriptText: typeof row.transcript_text === 'string' ? row.transcript_text : '',
    transcriptJson: row.transcript_json,
  }));
}

async function defaultRunLlm(args: ExtractRunLlmArgs): Promise<ExtractRunLlmResult | null> {
  const client = getOpenAIClient();
  const config = getOpenAIComplaintParseConfig('default');
  if (!client) {
    logger.warn({ correlationId: args.correlationId }, 'visit_narrative_extract: no OpenAI client');
    return null;
  }
  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: EXTRACT_MAX_TOKENS,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
    });
    const choice = completion.choices[0];
    const content = choice?.message?.content ?? null;
    const finishReason = choice?.finish_reason ?? null;
    const tokens = completion.usage?.total_tokens;
    const ok = Boolean(content) && finishReason !== 'length';

    await logAIClassification({
      correlationId: args.correlationId,
      model: config.model,
      redactionApplied: true,
      status: ok ? 'success' : 'failure',
      tokens,
      ...(ok
        ? {}
        : {
            errorMessage:
              finishReason === 'length'
                ? 'visit_narrative_extract_truncated'
                : 'visit_narrative_extract_empty_completion',
          }),
    });

    return { content, model: config.model, tokens, finishReason };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_openai_error';
    logger.warn({ correlationId: args.correlationId, err: message }, 'visit_narrative_extract: openai call failed');
    await logAIClassification({
      correlationId: args.correlationId,
      model: config.model,
      redactionApplied: true,
      status: 'failure',
      errorMessage: 'visit_narrative_extract_openai_error',
    });
    throw new ServiceUnavailableError('Transcript extraction is unavailable. Please try again.');
  }
}

export async function extractVisitNarrative(
  input: { consultationSessionId: string; doctorId: string; correlationId: string; actorRole?: unknown },
  deps: ExtractVisitNarrativeDeps = {},
): Promise<TranscriptExtractResult> {
  assertVisitNarrativeActorIsDoctor(input.actorRole);

  const loadSession = deps.loadSession ?? defaultLoadSession;
  const loadTranscripts = deps.loadTranscripts ?? defaultLoadTranscripts;
  const run = deps.runLlm ?? defaultRunLlm;

  const session = await loadSession(input.consultationSessionId);
  if (!session || session.doctorId !== input.doctorId) {
    throw new NotFoundError('Consultation not found');
  }

  const rows = await loadTranscripts(input.consultationSessionId);
  const transcript = pickTranscript(rows);
  if (!transcript) {
    return emptyResult('missing');
  }
  if (transcript.status !== 'completed') {
    return emptyResult(transcript.status, {
      transcriptId: transcript.id,
      transcriptChars: transcript.transcriptText.length,
    });
  }

  const text = transcript.transcriptText;
  const segments = locateSegments(text, transcript.transcriptJson);
  const chunks = packChunks(segments, MAX_CHUNK_CHARS);

  if (chunks.length > MAX_CHUNKS) {
    logger.info(
      {
        correlationId: input.correlationId,
        transcriptId: transcript.id,
        chunkCount: chunks.length,
        transcriptChars: text.length,
      },
      'visit_narrative_extract: over window',
    );
    return emptyResult('over_window', {
      transcriptId: transcript.id,
      transcriptChars: text.length,
      overWindow: true,
      chunksUsed: 0,
      transcriptText: text,
    });
  }

  const systemPrompt = buildSystemPrompt();
  const allLines: TranscriptExtractLine[] = [];
  let droppedCount = 0;
  let redactionApplied = false;

  for (const chunk of chunks) {
    const chunkText = text.slice(chunk.start, chunk.end);
    const redacted = redactPhiForAI(chunkText);
    redactionApplied = true;
    const userPrompt = [
      `Full transcript length: ${text.length}`,
      `This chunk is characters [${chunk.start}, ${chunk.end}) of the full transcript.`,
      'Spans MUST index the full transcript, not this chunk.',
      '',
      redacted,
    ].join('\n');

    const result = await run({ systemPrompt, userPrompt, correlationId: input.correlationId });
    if (!result) {
      throw new ServiceUnavailableError('Transcript extraction is unavailable.');
    }
    if (!result.content || result.finishReason === 'length') {
      continue;
    }
    const raw = safeParseJson(result.content, input.correlationId);
    if (raw === null) continue;
    const verified = verifyExtractLines(raw, text, input.correlationId);
    allLines.push(...verified.lines);
    droppedCount += verified.droppedCount;
  }

  const capped = allLines.slice(0, MAX_LINES);
  return {
    status: 'ready',
    transcriptId: transcript.id,
    transcriptChars: text.length,
    lines: capped,
    droppedCount,
    overWindow: false,
    chunksUsed: chunks.length,
    redactionApplied,
    transcriptText: text,
  };
}
