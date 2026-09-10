/**
 * Visit-narrative extraction (vnt-02) — unit tests.
 *
 * OpenAI is injected. Span verification, chunking, fail-soft, and authz
 * run without a network call.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getOpenAIClient = jest.fn();
const getOpenAIComplaintParseConfig = jest.fn(() => ({
  model: 'gpt-4o-mini',
  maxTokens: 500,
  tier: 'default' as const,
}));

jest.mock('../../../src/config/openai', () => ({
  getOpenAIClient: () => getOpenAIClient(),
  getOpenAIComplaintParseConfig: () => getOpenAIComplaintParseConfig(),
}));

const logger = {
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/config/logger', () => ({ logger }));

jest.mock('../../../src/utils/audit-logger', () => ({
  logAIClassification: jest.fn(async () => undefined),
}));

const redactPhiForAI = jest.fn((t: string) => `REDACTED:${t}`);
jest.mock('../../../src/services/ai-service', () => ({
  redactPhiForAI: (t: string) => redactPhiForAI(t),
}));

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
}));

import {
  assertVisitNarrativeActorIsDoctor,
  extractVisitNarrative,
  locateSegments,
  packChunks,
  verifyExtractLines,
  MAX_CHUNK_CHARS,
  MAX_CHUNKS,
  type ExtractRunLlm,
} from '../../../src/services/visit-narrative-extraction-service';
import { ForbiddenError, NotFoundError, ServiceUnavailableError } from '../../../src/utils/errors';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const DOCTOR_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_DOCTOR = '33333333-3333-3333-3333-333333333333';
const TRANSCRIPT_ID = '44444444-4444-4444-4444-444444444444';

const SOURCE =
  'I have had fever for three days. My oxygen is ninety eight. The doctor said viral fever.';

function runnerReturning(payload: unknown, finishReason: string | null = 'stop'): ExtractRunLlm {
  return jest.fn(async () => ({
    content: typeof payload === 'string' ? payload : JSON.stringify(payload),
    model: 'gpt-4o-mini',
    finishReason,
  })) as ExtractRunLlm;
}

function completedRow(text = SOURCE) {
  return {
    id: TRANSCRIPT_ID,
    status: 'completed' as const,
    transcriptText: text,
    transcriptJson: {},
  };
}

beforeEach(() => {
  getOpenAIClient.mockReset();
  getOpenAIComplaintParseConfig.mockClear();
  logger.warn.mockClear();
  logger.info.mockClear();
  redactPhiForAI.mockClear();
});

describe('assertVisitNarrativeActorIsDoctor', () => {
  it('rejects clinic staff', () => {
    expect(() => assertVisitNarrativeActorIsDoctor('receptionist')).toThrow(ForbiddenError);
  });

  it('allows a doctor (no staff role)', () => {
    expect(() => assertVisitNarrativeActorIsDoctor(undefined)).not.toThrow();
  });
});

describe('verifyExtractLines — anti-hallucination', () => {
  it('drops a well-formed line whose span does not resolve (fabrication test)', () => {
    const feverAt = SOURCE.indexOf('fever');
    const raw = {
      lines: [
        { text: 'c/o fever three days', spanStart: feverAt, spanEnd: feverAt + 5 },
        { text: 'impression: dengue', spanStart: 900, spanEnd: 920 },
      ],
    };
    const { lines, droppedCount } = verifyExtractLines(raw, SOURCE, 'c');
    expect(droppedCount).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('c/o fever three days');
    expect(SOURCE.slice(lines[0].spanStart, lines[0].spanEnd)).toContain('fever');
  });

  it('drops inverted, missing, and non-overlapping spans', () => {
    const raw = {
      lines: [
        { text: 'c/o fever', spanStart: 10, spanEnd: 4 },
        { text: 'c/o fever' },
        { text: 'impression: dengue', spanStart: 0, spanEnd: 4 },
      ],
    };
    const { lines, droppedCount } = verifyExtractLines(raw, SOURCE, 'c');
    expect(lines).toHaveLength(0);
    expect(droppedCount).toBe(3);
  });

  it('never puts a quote field on kept lines', () => {
    const feverAt = SOURCE.indexOf('fever');
    const { lines } = verifyExtractLines(
      { lines: [{ text: 'c/o fever', spanStart: feverAt, spanEnd: feverAt + 5, quote: 'I said fever' }] },
      SOURCE,
      'c',
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      text: 'c/o fever',
      spanStart: feverAt,
      spanEnd: feverAt + 5,
    });
    expect(lines[0]).not.toHaveProperty('quote');
  });
});

describe('chunking', () => {
  it('preserves spans into the full transcript, not the chunk', () => {
    const text = 'AAA. BBB. CCC.';
    const json = { segments: [{ text: 'AAA. ' }, { text: 'BBB. ' }, { text: 'CCC.' }] };
    const segs = locateSegments(text, json);
    expect(segs[0]).toEqual({ start: 0, end: 5 });
    expect(text.slice(segs[1].start, segs[1].end)).toBe('BBB. ');
    const packed = packChunks(segs, 6);
    expect(packed.length).toBeGreaterThan(1);
    expect(packed.every((c) => c.start >= 0 && c.end <= text.length)).toBe(true);
  });
});

describe('extractVisitNarrative', () => {
  it('returns ready lines after span verification', async () => {
    const feverAt = SOURCE.indexOf('fever');
    const runLlm = runnerReturning({
      lines: [{ text: 'c/o fever three days', spanStart: feverAt, spanEnd: feverAt + 5 }],
    });

    const result = await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c1' },
      {
        runLlm,
        loadSession: async () => ({ doctorId: DOCTOR_ID }),
        loadTranscripts: async () => [completedRow()],
      },
    );

    expect(result.status).toBe('ready');
    expect(result.transcriptText).toBe(SOURCE);
    expect(result.lines).toHaveLength(1);
    expect(result.redactionApplied).toBe(true);
    expect(redactPhiForAI).toHaveBeenCalled();
    expect(result.overWindow).toBe(false);
    expect(SOURCE.slice(result.lines[0].spanStart, result.lines[0].spanEnd)).toContain('fever');
  });

  it('drops fabricated lines from the model response', async () => {
    const feverAt = SOURCE.indexOf('fever');
    const runLlm = runnerReturning({
      lines: [
        { text: 'c/o fever', spanStart: feverAt, spanEnd: feverAt + 5 },
        { text: 'plan: azithromycin', spanStart: 0, spanEnd: 1 },
      ],
    });

    const result = await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c2' },
      {
        runLlm,
        loadSession: async () => ({ doctorId: DOCTOR_ID }),
        loadTranscripts: async () => [completedRow()],
      },
    );

    expect(result.lines).toHaveLength(1);
    expect(result.droppedCount).toBe(1);
  });

  it('surfaces over_window and does not call the model', async () => {
    const huge = 'x'.repeat(MAX_CHUNK_CHARS * (MAX_CHUNKS + 1) + 10);
    const segs: Array<{ text: string }> = [];
    for (let i = 0; i < MAX_CHUNKS + 1; i += 1) {
      segs.push({ text: huge.slice(i * MAX_CHUNK_CHARS, (i + 1) * MAX_CHUNK_CHARS) });
    }
    const runLlm = runnerReturning({ lines: [] });

    const result = await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c3' },
      {
        runLlm,
        loadSession: async () => ({ doctorId: DOCTOR_ID }),
        loadTranscripts: async () => [
          {
            id: TRANSCRIPT_ID,
            status: 'completed',
            transcriptText: huge,
            transcriptJson: { segments: segs },
          },
        ],
      },
    );

    expect(result.status).toBe('over_window');
    expect(result.overWindow).toBe(true);
    expect(result.lines).toEqual([]);
    expect(result.chunksUsed).toBe(0);
    expect(runLlm).not.toHaveBeenCalled();
  });

  it('fail-soft: empty content, length finish, malformed JSON → empty draft', async () => {
    const loaders = {
      loadSession: async () => ({ doctorId: DOCTOR_ID }),
      loadTranscripts: async () => [completedRow()],
    };

    const empty = await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c4' },
      { ...loaders, runLlm: runnerReturning('', 'stop') },
    );
    expect(empty.status).toBe('ready');
    expect(empty.lines).toEqual([]);

    const truncated = await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c5' },
      { ...loaders, runLlm: runnerReturning({ lines: [] }, 'length') },
    );
    expect(truncated.lines).toEqual([]);

    const malformed = await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c6' },
      { ...loaders, runLlm: runnerReturning('not-json') },
    );
    expect(malformed.lines).toEqual([]);
  });

  it('unconfigured client → ServiceUnavailableError', async () => {
    await expect(
      extractVisitNarrative(
        { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c7' },
        {
          runLlm: async () => null,
          loadSession: async () => ({ doctorId: DOCTOR_ID }),
          loadTranscripts: async () => [completedRow()],
        },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('another doctor cannot reach the transcript', async () => {
    await expect(
      extractVisitNarrative(
        { consultationSessionId: SESSION_ID, doctorId: OTHER_DOCTOR, correlationId: 'c8' },
        {
          runLlm: runnerReturning({ lines: [] }),
          loadSession: async () => ({ doctorId: DOCTOR_ID }),
          loadTranscripts: async () => [completedRow()],
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('non-completed transcripts return their status and do not call the model', async () => {
    const runLlm = runnerReturning({ lines: [] });
    const processing = await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c9' },
      {
        runLlm,
        loadSession: async () => ({ doctorId: DOCTOR_ID }),
        loadTranscripts: async () => [
          { id: TRANSCRIPT_ID, status: 'processing', transcriptText: '', transcriptJson: {} },
        ],
      },
    );
    expect(processing.status).toBe('processing');
    expect(runLlm).not.toHaveBeenCalled();
  });

  it('missing transcript is distinct from failed', async () => {
    const missing = await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c10' },
      {
        runLlm: runnerReturning({ lines: [] }),
        loadSession: async () => ({ doctorId: DOCTOR_ID }),
        loadTranscripts: async () => [],
      },
    );
    expect(missing.status).toBe('missing');

    const failed = await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c11' },
      {
        runLlm: runnerReturning({ lines: [] }),
        loadSession: async () => ({ doctorId: DOCTOR_ID }),
        loadTranscripts: async () => [
          { id: TRANSCRIPT_ID, status: 'failed', transcriptText: '', transcriptJson: {} },
        ],
      },
    );
    expect(failed.status).toBe('failed');
  });

  it('logs counts only — no transcript text, line text, or span contents', async () => {
    const feverAt = SOURCE.indexOf('fever');
    await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c12' },
      {
        runLlm: runnerReturning({
          lines: [
            { text: 'c/o fever', spanStart: feverAt, spanEnd: feverAt + 5 },
            { text: 'impression: invented', spanStart: 0, spanEnd: 1 },
          ],
        }),
        loadSession: async () => ({ doctorId: DOCTOR_ID }),
        loadTranscripts: async () => [completedRow()],
      },
    );

    const dumped = JSON.stringify({ info: logger.info.mock.calls, warn: logger.warn.mock.calls });
    expect(dumped).not.toContain(SOURCE);
    expect(dumped).not.toContain('c/o fever');
    expect(dumped).not.toContain('invented');
  });

  it('redacts before the prompt', async () => {
    const feverAt = SOURCE.indexOf('fever');
    const runLlm = runnerReturning({
      lines: [{ text: 'c/o fever', spanStart: feverAt, spanEnd: feverAt + 5 }],
    });
    await extractVisitNarrative(
      { consultationSessionId: SESSION_ID, doctorId: DOCTOR_ID, correlationId: 'c13' },
      {
        runLlm,
        loadSession: async () => ({ doctorId: DOCTOR_ID }),
        loadTranscripts: async () => [completedRow()],
      },
    );
    expect(redactPhiForAI).toHaveBeenCalledWith(SOURCE);
    const prompt = (runLlm as jest.Mock).mock.calls[0][0] as { userPrompt: string };
    expect(prompt.userPrompt).toContain('REDACTED:');
  });
});
