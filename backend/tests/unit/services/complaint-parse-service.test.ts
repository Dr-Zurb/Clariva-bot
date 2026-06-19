/**
 * AI complaint parse service — unit tests (subjective-tab · subj-14).
 *
 * The OpenAI call is bypassed via an injected `runLlm`, so these exercise the
 * schema-bounding, negation pass-through, multi-complaint, and fail-soft logic
 * deterministically (no network). One test uses the default runner with an
 * unconfigured client to assert the ServiceUnavailableError path.
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

jest.mock('../../../src/config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logAIClassification: jest.fn(async () => undefined),
}));

// Mock redaction at the unit boundary (real redaction is tested in ai-service).
jest.mock('../../../src/services/ai-service', () => ({
  redactPhiForAI: jest.fn((t: string) => `REDACTED:${t}`),
}));

import {
  parseComplaintWithAI,
  boundComplaintList,
  type ComplaintParseRunLlm,
} from '../../../src/services/complaint-parse-service';
import type { ComplaintParseFieldSpec } from '../../../src/types/complaint-master';

const FIELD_SPEC: ComplaintParseFieldSpec[] = [
  { key: 'duration', label: 'Duration', type: 'duration' },
  { key: 'severity', label: 'Severity', type: 'severity' },
  { key: 'character', label: 'Character', type: 'chips', chips: ['burning', 'dull', 'sharp'] },
  { key: 'laterality', label: 'Side', type: 'chips', chips: ['Left', 'Right', 'Both sides'] },
];

function runnerReturning(payload: unknown): ComplaintParseRunLlm {
  return jest.fn(async () => ({
    content: typeof payload === 'string' ? payload : JSON.stringify(payload),
    model: 'gpt-4o-mini',
    finishReason: 'stop',
  })) as ComplaintParseRunLlm;
}

beforeEach(() => {
  getOpenAIClient.mockReset();
  getOpenAIComplaintParseConfig.mockClear();
});

describe('parseComplaintWithAI — schema-bounding', () => {
  it('keeps schema chips (canonical casing), drops off-vocab + off-schema keys', async () => {
    const runLlm = runnerReturning({
      complaints: [
        {
          name: 'Chest pain',
          patch: {
            character: 'BURNING', // case-insensitive → canonical "burning"
            laterality: 'middle', // not a chip → dropped
            duration: '3 days',
            color: 'red', // off-schema key → dropped
          },
          associated: [],
        },
      ],
    });

    const res = await parseComplaintWithAI(
      { text: 'burning chest pain 3 days', fieldSpec: FIELD_SPEC },
      'corr-1',
      { runLlm },
    );

    expect(res.complaints).toHaveLength(1);
    expect(res.complaints[0]).toEqual({
      name: 'Chest pain',
      patch: { character: 'burning', duration: '3 days' },
      associated: [],
    });
  });

  it('accepts severity word and clamps numeric severity to 0-10', async () => {
    const word = await parseComplaintWithAI(
      { text: 'severe headache', fieldSpec: FIELD_SPEC },
      'c',
      { runLlm: runnerReturning({ complaints: [{ name: 'Headache', patch: { severity: 'Severe' }, associated: [] }] }) },
    );
    expect(word.complaints[0]?.patch.severity).toBe('severe');

    const num = await parseComplaintWithAI(
      { text: 'pain 12/10', fieldSpec: FIELD_SPEC },
      'c',
      { runLlm: runnerReturning({ complaints: [{ name: 'Pain', patch: { severity: 12 }, associated: [] }] }) },
    );
    expect(num.complaints[0]?.patch.severity).toBe(10);
  });

  it('canonicalises a multiword chip typed with a hyphen', async () => {
    const res = await parseComplaintWithAI(
      { text: 'pain both-sides', fieldSpec: FIELD_SPEC },
      'c',
      { runLlm: runnerReturning({ complaints: [{ name: 'Pain', patch: { laterality: 'both-sides' }, associated: [] }] }) },
    );
    expect(res.complaints[0]?.patch.laterality).toBe('Both sides');
  });
});

describe('parseComplaintWithAI — multi-complaint, associated, negation', () => {
  it('returns one entry per detected complaint', async () => {
    const res = await parseComplaintWithAI(
      { text: 'fever cough loose motions 3 days', fieldSpec: FIELD_SPEC },
      'c',
      {
        runLlm: runnerReturning({
          complaints: [
            { name: 'Fever', patch: { duration: '3 days' }, associated: [] },
            { name: 'Cough', patch: { duration: '3 days' }, associated: [] },
            { name: 'Loose motions', patch: { duration: '3 days' }, associated: [] },
          ],
        }),
      },
    );
    expect(res.complaints.map((c) => c.name)).toEqual(['Fever', 'Cough', 'Loose motions']);
  });

  it('passes through negation-respecting output (no fever)', async () => {
    const res = await parseComplaintWithAI(
      { text: 'no fever but cough', fieldSpec: FIELD_SPEC },
      'c',
      { runLlm: runnerReturning({ complaints: [{ name: 'Cough', patch: {}, associated: [] }] }) },
    );
    expect(res.complaints.map((c) => c.name)).toEqual(['Cough']);
  });

  it('dedupes associated, drops entries equal to the name', async () => {
    const res = await parseComplaintWithAI(
      { text: 'abdominal pain with nausea', fieldSpec: FIELD_SPEC },
      'c',
      {
        runLlm: runnerReturning({
          complaints: [
            {
              name: 'Abdominal pain',
              patch: {},
              associated: ['Nausea', 'nausea', 'Abdominal pain', 'Vomiting'],
            },
          ],
        }),
      },
    );
    expect(res.complaints[0]?.associated).toEqual(['Nausea', 'Vomiting']);
  });

  it('drops complaints without a name', async () => {
    const res = await parseComplaintWithAI(
      { text: 'x', fieldSpec: FIELD_SPEC },
      'c',
      { runLlm: runnerReturning({ complaints: [{ patch: { duration: '1 day' }, associated: [] }, { name: 'Cough', patch: {}, associated: [] }] }) },
    );
    expect(res.complaints.map((c) => c.name)).toEqual(['Cough']);
  });

  it('strips siblings cross-listed as each other\'s associated symptoms', async () => {
    // The model tends to put every co-equal complaint into the others'
    // `associated` on a flat list — which would double-list them as both main
    // cards and nested mini-cards. Top-level wins; associated copies are dropped.
    const res = await parseComplaintWithAI(
      { text: 'fever cough loose motions body ache weakness', fieldSpec: FIELD_SPEC },
      'c',
      {
        runLlm: runnerReturning({
          complaints: [
            { name: 'Fever', patch: {}, associated: ['Cough', 'Loose motions', 'Body ache', 'Weakness'] },
            { name: 'Cough', patch: {}, associated: ['Fever', 'Loose motions', 'Body ache', 'Weakness'] },
            { name: 'Loose motions', patch: {}, associated: ['Fever', 'Cough', 'Body ache', 'Weakness'] },
            { name: 'Body ache', patch: {}, associated: ['Fever', 'Cough', 'Loose motions', 'Weakness'] },
            { name: 'Weakness', patch: {}, associated: ['Fever', 'Cough', 'Loose motions', 'Body ache'] },
          ],
        }),
      },
    );
    expect(res.complaints.map((c) => c.name)).toEqual([
      'Fever',
      'Cough',
      'Loose motions',
      'Body ache',
      'Weakness',
    ]);
    // Every sibling was cross-listed → all associated arrays must be empty.
    for (const complaint of res.complaints) {
      expect(complaint.associated).toEqual([]);
    }
  });

  it('keeps a genuine associated symptom that is NOT also a top-level complaint', async () => {
    const res = await parseComplaintWithAI(
      { text: 'headache with nausea and fever', fieldSpec: FIELD_SPEC },
      'c',
      {
        runLlm: runnerReturning({
          complaints: [
            { name: 'Headache', patch: {}, associated: ['Nausea', 'Fever'] },
            { name: 'Fever', patch: {}, associated: [] },
          ],
        }),
      },
    );
    // Fever is also a top-level complaint → dropped from Headache's associated;
    // Nausea is only an associated symptom → survives.
    expect(res.complaints[0]?.associated).toEqual(['Nausea']);
    expect(res.complaints.map((c) => c.name)).toEqual(['Headache', 'Fever']);
  });
});

describe('parseComplaintWithAI — fail soft', () => {
  it('returns empty list on malformed JSON (never throws)', async () => {
    const res = await parseComplaintWithAI(
      { text: 'x', fieldSpec: FIELD_SPEC },
      'c',
      { runLlm: runnerReturning('{not valid json') },
    );
    expect(res.complaints).toEqual([]);
  });

  it('returns empty list on empty completion', async () => {
    const runLlm = jest.fn(async () => ({ content: null, model: 'gpt-4o-mini', finishReason: 'stop' })) as ComplaintParseRunLlm;
    const res = await parseComplaintWithAI({ text: 'x', fieldSpec: FIELD_SPEC }, 'c', { runLlm });
    expect(res.complaints).toEqual([]);
  });

  it('returns empty list when the response was truncated (finish_reason length)', async () => {
    const runLlm = jest.fn(async () => ({
      content: '{"complaints":[{"name":"Chest',
      model: 'gpt-4o-mini',
      finishReason: 'length',
    })) as ComplaintParseRunLlm;
    const res = await parseComplaintWithAI({ text: 'x', fieldSpec: FIELD_SPEC }, 'c', { runLlm });
    expect(res.complaints).toEqual([]);
  });

  it('throws ServiceUnavailableError when the OpenAI client is unconfigured', async () => {
    getOpenAIClient.mockReturnValue(null); // default runner path
    await expect(
      parseComplaintWithAI({ text: 'x', fieldSpec: FIELD_SPEC }, 'c'),
    ).rejects.toThrow('Complaint parsing is unavailable');
  });
});

describe('parseComplaintWithAI — PHI redaction wiring', () => {
  it('sends the redacted text (not the raw text) to the model', async () => {
    const runLlm = jest.fn(async () => ({
      content: JSON.stringify({ complaints: [] }),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
    })) as jest.MockedFunction<ComplaintParseRunLlm>;

    await parseComplaintWithAI(
      { text: 'call me 9876543210', fieldSpec: FIELD_SPEC },
      'c',
      { runLlm },
    );

    const call = runLlm.mock.calls[0]?.[0];
    expect(call?.userPrompt).toBe('REDACTED:call me 9876543210');
  });
});

describe('boundComplaintList', () => {
  it('tolerates a single-object response shaped like one complaint', () => {
    const out = boundComplaintList(
      { name: 'Cough', patch: { duration: '2 days' }, associated: [] },
      FIELD_SPEC,
    );
    expect(out).toEqual([{ name: 'Cough', patch: { duration: '2 days' }, associated: [] }]);
  });

  it('tolerates a bare array response', () => {
    const out = boundComplaintList([{ name: 'Fever', patch: {}, associated: [] }], FIELD_SPEC);
    expect(out.map((c) => c.name)).toEqual(['Fever']);
  });

  it('returns [] for junk', () => {
    expect(boundComplaintList(42, FIELD_SPEC)).toEqual([]);
    expect(boundComplaintList(null, FIELD_SPEC)).toEqual([]);
    expect(boundComplaintList({ foo: 'bar' }, FIELD_SPEC)).toEqual([]);
  });

  it('caps the number of complaints at 6', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `C${i}`, patch: {}, associated: [] }));
    expect(boundComplaintList({ complaints: many }, FIELD_SPEC)).toHaveLength(6);
  });
});
