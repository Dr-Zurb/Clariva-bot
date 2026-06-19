/**
 * AI medicine parse service — unit tests (medical-history med redesign).
 *
 * The OpenAI call is bypassed via an injected `runLlm`, so these exercise the
 * schema-bounding (enum vocabularies, dose-schedule shape), multi-drug split,
 * de-dupe, and fail-soft logic deterministically (no network). One test uses the
 * default runner with an unconfigured client to assert the ServiceUnavailableError.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getOpenAIClient = jest.fn();
const getOpenAIMedicineParseConfig = jest.fn(() => ({
  model: 'gpt-4o-mini',
  maxTokens: 700,
  tier: 'default' as const,
}));

jest.mock('../../../src/config/openai', () => ({
  getOpenAIClient: () => getOpenAIClient(),
  getOpenAIMedicineParseConfig: () => getOpenAIMedicineParseConfig(),
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
  parseMedicineWithAI,
  boundMedicineList,
  type MedicineParseRunLlm,
} from '../../../src/services/medicine-parse-service';

function runnerReturning(payload: unknown, finishReason = 'stop'): MedicineParseRunLlm {
  return jest.fn(async () => ({
    content: typeof payload === 'string' ? payload : JSON.stringify(payload),
    model: 'gpt-4o-mini',
    finishReason,
  })) as MedicineParseRunLlm;
}

beforeEach(() => {
  getOpenAIClient.mockReset();
  getOpenAIMedicineParseConfig.mockClear();
});

describe('boundMedicineList — schema-bounding', () => {
  it('keeps valid enum fields and canonicalises casing', () => {
    const out = boundMedicineList({
      medicines: [
        {
          name: 'Amlodipine',
          strengthValue: 5,
          strengthUnit: 'MG',
          doseQty: 1,
          doseUnit: 'TAB',
          frequencyCode: 'od',
          doseSchedule: '1-0-0',
          intakePattern: 'Regular',
          source: 'Self',
          instructions: 'avoid grapefruit',
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: 'Amlodipine',
      strengthValue: 5,
      strengthUnit: 'mg',
      doseQty: 1,
      doseUnit: 'tab',
      frequencyCode: 'OD',
      doseSchedule: '1-0-0',
      intakePattern: 'regular',
      source: 'self',
      instructions: 'avoid grapefruit',
    });
  });

  it('drops off-vocab enums and bad numbers, mapping % -> pct', () => {
    const out = boundMedicineList({
      medicines: [
        {
          name: 'Mystery cream',
          strengthValue: -3,
          strengthUnit: '%',
          doseQty: 0,
          doseUnit: 'blob',
          frequencyCode: 'EVERY_OTHER_DAY',
          doseSchedule: 'twice',
          intakePattern: 'whenever',
          source: 'pharmacy',
        },
      ],
    });
    expect(out[0]).toMatchObject({
      name: 'Mystery cream',
      strengthValue: null,
      strengthUnit: 'pct',
      doseQty: null,
      doseUnit: null,
      frequencyCode: null,
      doseSchedule: null,
      intakePattern: null,
      source: null,
    });
  });

  it('splits and de-dupes multiple drugs', () => {
    const out = boundMedicineList({
      medicines: [
        { name: 'Metformin', frequencyCode: 'BID' },
        { name: 'Amlodipine', frequencyCode: 'OD' },
        { name: 'metformin', frequencyCode: 'TID' },
      ],
    });
    expect(out.map((m) => m.name)).toEqual(['Metformin', 'Amlodipine']);
  });

  it('drops entries without a name', () => {
    const out = boundMedicineList({ medicines: [{ frequencyCode: 'OD' }, { name: '  ' }] });
    expect(out).toHaveLength(0);
  });

  it('maps interval and weekly frequency codes', () => {
    const out = boundMedicineList({
      medicines: [
        { name: 'Drug A', frequencyCode: 'q8h' },
        { name: 'Drug B', frequencyCode: 'QW' },
      ],
    });
    expect(out[0].frequencyCode).toBe('Q8H');
    expect(out[1].frequencyCode).toBe('QW');
  });

  it('bounds a fixed-dose combination, nulling the scalar and sharing the unit', () => {
    const out = boundMedicineList({
      medicines: [
        {
          name: 'Rcinex',
          strengthValue: 600,
          strengthUnit: 'mg',
          strengthComponents: [{ value: 600 }, { value: 300, unit: 'MG' }],
        },
      ],
    });
    expect(out[0].strengthComponents).toEqual([
      { value: 600, unit: 'mg' },
      { value: 300, unit: 'mg' },
    ]);
    // Combo wins — the single scalar cannot hold "600/300".
    expect(out[0].strengthValue).toBeNull();
    expect(out[0].strengthUnit).toBeNull();
  });

  it('ignores a single-element / malformed components array', () => {
    const out = boundMedicineList({
      medicines: [
        { name: 'Solo', strengthValue: 5, strengthUnit: 'mg', strengthComponents: [{ value: 5 }] },
        { name: 'Bad', strengthComponents: 'nope' },
      ],
    });
    expect(out[0].strengthComponents).toBeNull();
    expect(out[0].strengthValue).toBe(5);
    expect(out[1].strengthComponents).toBeNull();
  });

  it('drops an AI-inferred source when the line has no origin cue', () => {
    const out = boundMedicineList(
      { medicines: [{ name: 'Amlodipine', source: 'prescribed', intakePattern: 'regular' }] },
      'amlodipine for 5 years taking regularly',
    );
    expect(out[0].source).toBeNull();
    // Other inferences (intake pattern) are untouched by the source guard.
    expect(out[0].intakePattern).toBe('regular');
  });

  it('overrides AI irregular to regular when line states taken regularly but missed occasionally', () => {
    const line = 'amlodipine 5 years was taken regularly but missed occasionally';
    const out = boundMedicineList(
      { medicines: [{ name: 'amlodipine', intakePattern: 'irregular' }] },
      line,
    );
    expect(out[0].intakePattern).toBe('regular');
  });

  it('keeps AI irregular when line has no regular phrasing', () => {
    const out = boundMedicineList(
      { medicines: [{ name: 'metformin', intakePattern: 'irregular' }] },
      'metformin taken irregularly',
    );
    expect(out[0].intakePattern).toBe('irregular');
  });

  it('drops an AI-inferred intakePattern when the line has no adherence cue', () => {
    const out = boundMedicineList(
      { medicines: [{ name: 'amlodipine', intakePattern: 'regular' }] },
      'amlodipine 5mg for 10 years',
    );
    expect(out[0].intakePattern).toBeNull();
  });

  it('keeps prn intake even without an explicit adherence cue (SOS dosing)', () => {
    const out = boundMedicineList(
      { medicines: [{ name: 'pantoprazole', intakePattern: 'prn' }] },
      'pantoprazole 40 mg for 2 years',
    );
    expect(out[0].intakePattern).toBe('prn');
  });

  it('preserves intakePattern when no rawText is supplied (schema-bound only)', () => {
    expect(
      boundMedicineList({ medicines: [{ name: 'amlodipine', intakePattern: 'regular' }] })[0]
        .intakePattern,
    ).toBe('regular');
  });

  it('keeps source when the line states an origin cue', () => {
    expect(
      boundMedicineList(
        { medicines: [{ name: 'Amlodipine', source: 'prescribed' }] },
        'amlodipine 5 od prescribed by doctor',
      )[0].source,
    ).toBe('prescribed');
    expect(
      boundMedicineList(
        { medicines: [{ name: 'Vitamin C', source: 'self' }] },
        'vitamin c self-started OTC',
      )[0].source,
    ).toBe('self');
  });

  it('preserves source when no rawText is supplied (schema-bound only)', () => {
    expect(
      boundMedicineList({ medicines: [{ name: 'Amlodipine', source: 'prescribed' }] })[0].source,
    ).toBe('prescribed');
  });

  it('forces an AI-inferred past status back to active without a stop cue', () => {
    const out = boundMedicineList(
      {
        medicines: [
          {
            name: 'amlodipine',
            status: 'past',
            stoppedAgoValue: 2,
            stoppedAgoUnit: 'months',
            stopReason: 'side_effects',
          },
        ],
      },
      'amlodipine 5mg for 10 years',
    );
    expect(out[0].status).toBe('active');
    expect(out[0].stoppedAgoValue).toBeNull();
    expect(out[0].stoppedAgoUnit).toBeNull();
    expect(out[0].stopReason).toBeNull();
  });

  it('keeps past status + stop fields when the line has a discontinuation cue', () => {
    const out = boundMedicineList(
      {
        medicines: [
          {
            name: 'amlodipine',
            status: 'past',
            stoppedAgoValue: 2,
            stoppedAgoUnit: 'months',
            stopReason: 'side_effects',
          },
        ],
      },
      'amlodipine stopped 2 months ago due to side effects',
    );
    expect(out[0].status).toBe('past');
    expect(out[0].stoppedAgoValue).toBe(2);
    expect(out[0].stoppedAgoUnit).toBe('months');
    expect(out[0].stopReason).toBe('side_effects');
  });

  it('recognises "used to take" / "no longer on" as discontinuation cues', () => {
    expect(
      boundMedicineList(
        { medicines: [{ name: 'ramipril', status: 'past' }] },
        'used to take ramipril',
      )[0].status,
    ).toBe('past');
    expect(
      boundMedicineList(
        { medicines: [{ name: 'losartan', status: 'past' }] },
        'no longer on losartan',
      )[0].status,
    ).toBe('past');
  });

  it('recognises past-tense "took" / "had been" as discontinuation cues', () => {
    expect(
      boundMedicineList(
        { medicines: [{ name: 'amlodipine', status: 'past', stoppedAgoValue: 6, stoppedAgoUnit: 'months' }] },
        'took amlodipine 6 months ago',
      )[0].status,
    ).toBe('past');
    expect(
      boundMedicineList(
        { medicines: [{ name: 'ramipril', status: 'past' }] },
        'had been on ramipril',
      )[0].status,
    ).toBe('past');
  });

  it('drops stop fields when status resolves to active even with a cue mismatch', () => {
    const out = boundMedicineList(
      { medicines: [{ name: 'metformin', status: 'active', stoppedAgoValue: 3 }] },
      'metformin stopped 3 weeks ago',
    );
    expect(out[0].status).toBe('active');
    expect(out[0].stoppedAgoValue).toBeNull();
  });

  it('preserves past status when no rawText is supplied (schema-bound only)', () => {
    const out = boundMedicineList({
      medicines: [{ name: 'amlodipine', status: 'past', stoppedAgoValue: 1, stoppedAgoUnit: 'years' }],
    });
    expect(out[0].status).toBe('past');
    expect(out[0].stoppedAgoValue).toBe(1);
  });
});

describe('parseMedicineWithAI — fail-soft', () => {
  it('returns empty on truncated (finishReason length) output', async () => {
    const runLlm = runnerReturning({ medicines: [{ name: 'X' }] }, 'length');
    const res = await parseMedicineWithAI({ text: 'x' }, 'corr-1', { runLlm });
    expect(res.medicines).toEqual([]);
  });

  it('returns empty on malformed JSON', async () => {
    const runLlm = runnerReturning('{not json');
    const res = await parseMedicineWithAI({ text: 'x' }, 'corr-2', { runLlm });
    expect(res.medicines).toEqual([]);
  });

  it('parses a clean multi-drug response', async () => {
    const runLlm = runnerReturning({
      medicines: [
        { name: 'Metformin', strengthValue: 500, strengthUnit: 'mg', frequencyCode: 'BID' },
        { name: 'Amlodipine', strengthValue: 5, strengthUnit: 'mg', frequencyCode: 'OD' },
      ],
    });
    const res = await parseMedicineWithAI({ text: 'metformin 500 bd, amlodipine 5 od' }, 'c', {
      runLlm,
    });
    expect(res.medicines).toHaveLength(2);
    expect(res.medicines[0].name).toBe('Metformin');
  });

  it('throws ServiceUnavailableError when the OpenAI client is unconfigured', async () => {
    getOpenAIClient.mockReturnValue(null);
    await expect(parseMedicineWithAI({ text: 'metformin' }, 'c')).rejects.toThrow(
      /unavailable/i,
    );
  });
});
