/**
 * AI investigation order resolver service — unit tests
 * (plan-investigations-library · inv-lib-04).
 *
 * The OpenAI call (`runLlm`) is injected, so these exercise the bounds + dedupe
 * + fail-soft logic deterministically (no network):
 *  - the model output is bounded (term length, count) and deduped by term;
 *  - empty / truncated / malformed model output degrades to no candidates;
 *  - an unconfigured client (runner → null) throws ServiceUnavailableError;
 *  - PHI is redacted before the prompt and the requested tier is forwarded.
 *
 * The catalog constraint itself lives on the FRONTEND (the order catalog is a
 * static library), so it is unit-tested in
 * `frontend/lib/cockpit/__tests__/investigation-order-catalog.test.ts`.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getOpenAIClient = jest.fn();
const getOpenAIInvestigationResolveConfig = jest.fn(() => ({
  model: 'gpt-4o-mini',
  maxTokens: 400,
  tier: 'default' as const,
}));

jest.mock('../../../src/config/openai', () => ({
  getOpenAIClient: () => getOpenAIClient(),
  getOpenAIInvestigationResolveConfig: () => getOpenAIInvestigationResolveConfig(),
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
  resolveInvestigationWithAI,
  boundModelCandidates,
  type InvestigationResolveRunLlm,
} from '../../../src/services/investigation-resolver-service';
import { ServiceUnavailableError } from '../../../src/utils/errors';

function runnerReturning(
  payload: unknown,
  finishReason = 'stop',
): InvestigationResolveRunLlm {
  return jest.fn(async () => ({
    content: typeof payload === 'string' ? payload : JSON.stringify(payload),
    model: 'gpt-4o-mini',
    finishReason,
  })) as InvestigationResolveRunLlm;
}

beforeEach(() => {
  getOpenAIClient.mockReset();
  getOpenAIInvestigationResolveConfig.mockClear();
});

describe('resolveInvestigationWithAI — normalized candidates', () => {
  it('returns the model term candidates with confidence', async () => {
    const res = await resolveInvestigationWithAI({ text: 'liver ka test' }, 'cid', {
      runLlm: runnerReturning({
        candidates: [{ term: 'Liver function test', confidence: 0.9 }],
      }),
    });

    expect(res.candidates).toEqual([
      { term: 'Liver function test', confidence: 0.9 },
    ]);
  });

  it('accepts the `orders` array shape and a bare term object', async () => {
    const viaOrders = await resolveInvestigationWithAI({ text: 'sugar' }, 'cid', {
      runLlm: runnerReturning({ orders: [{ term: 'Blood glucose' }] }),
    });
    expect(viaOrders.candidates).toEqual([{ term: 'Blood glucose' }]);

    const viaBare = await resolveInvestigationWithAI({ text: 'cbc' }, 'cid', {
      runLlm: runnerReturning({ term: 'Complete blood count', confidence: 0.8 }),
    });
    expect(viaBare.candidates).toEqual([
      { term: 'Complete blood count', confidence: 0.8 },
    ]);
  });

  it('dedupes candidates by case-insensitive term (first wins)', async () => {
    const res = await resolveInvestigationWithAI({ text: 'lft' }, 'cid', {
      runLlm: runnerReturning({
        candidates: [
          { term: 'Liver function test', confidence: 0.9 },
          { term: 'liver function test', confidence: 0.4 },
        ],
      }),
    });
    expect(res.candidates).toEqual([
      { term: 'Liver function test', confidence: 0.9 },
    ]);
  });

  it('drops out-of-range confidence and blank terms', () => {
    const bounded = boundModelCandidates([
      { term: '  ', confidence: 0.5 },
      { term: 'Chest X-ray', confidence: 5 },
      { term: 'Ultrasound abdomen', confidence: -2 },
      { notATerm: true },
    ]);
    expect(bounded).toEqual([
      { term: 'Chest X-ray', confidence: 1 },
      { term: 'Ultrasound abdomen', confidence: 0 },
    ]);
  });

  it('caps the candidate list at five', () => {
    const bounded = boundModelCandidates(
      Array.from({ length: 8 }, (_, i) => ({ term: `Test ${i}` })),
    );
    expect(bounded).toHaveLength(5);
  });
});

describe('resolveInvestigationWithAI — fail soft + PHI', () => {
  it('returns no candidates on a truncated completion', async () => {
    const res = await resolveInvestigationWithAI({ text: 'lft' }, 'cid', {
      runLlm: runnerReturning({ candidates: [{ term: 'Liver function test' }] }, 'length'),
    });
    expect(res.candidates).toEqual([]);
  });

  it('returns no candidates on malformed JSON', async () => {
    const res = await resolveInvestigationWithAI({ text: 'lft' }, 'cid', {
      runLlm: runnerReturning('not json{', 'stop'),
    });
    expect(res.candidates).toEqual([]);
  });

  it('returns no candidates when the model returns an empty list', async () => {
    const res = await resolveInvestigationWithAI({ text: 'xyzzy' }, 'cid', {
      runLlm: runnerReturning({ candidates: [] }),
    });
    expect(res.candidates).toEqual([]);
  });

  it('throws ServiceUnavailableError when the OpenAI client is unconfigured', async () => {
    await expect(
      resolveInvestigationWithAI({ text: 'lft' }, 'cid', {
        runLlm: (async () => null) as InvestigationResolveRunLlm,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('redacts PHI before the prompt and forwards the requested tier', async () => {
    let capturedPrompt: string | undefined;
    let capturedTier: string | undefined;
    const runLlm: InvestigationResolveRunLlm = async (args) => {
      capturedPrompt = args.userPrompt;
      capturedTier = args.tier;
      return { content: JSON.stringify({ candidates: [] }), model: 'm', finishReason: 'stop' };
    };

    await resolveInvestigationWithAI(
      { text: 'John Doe cbc', tier: 'escalation' },
      'cid',
      { runLlm },
    );

    expect(capturedPrompt).toBe('REDACTED:John Doe cbc');
    expect(capturedTier).toBe('escalation');
  });
});
