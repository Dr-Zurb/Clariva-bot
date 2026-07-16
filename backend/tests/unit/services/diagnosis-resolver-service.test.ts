/**
 * AI ICD-11 diagnosis resolver service — unit tests (assessment-tab · asmt-07).
 *
 * Both the OpenAI call (`runLlm`) and the catalog search (`searchCatalog`) are
 * injected, so these exercise the CATALOG-CONSTRAINT safety spine + fail-soft
 * logic deterministically (no network, no DB):
 *  - a surfaced `{code, title}` always comes from the catalog;
 *  - an off-catalog code the model proposes never leaks;
 *  - empty / truncated / malformed model output degrades to no suggestions;
 *  - an unconfigured client (runner → null) throws ServiceUnavailableError;
 *  - PHI is redacted before the prompt.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getOpenAIClient = jest.fn();
const getOpenAIDiagnosisResolveConfig = jest.fn(() => ({
  model: 'gpt-4o-mini',
  maxTokens: 400,
  tier: 'default' as const,
}));

jest.mock('../../../src/config/openai', () => ({
  getOpenAIClient: () => getOpenAIClient(),
  getOpenAIDiagnosisResolveConfig: () => getOpenAIDiagnosisResolveConfig(),
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

// Keep the default catalog-search import DB-free (we always inject searchCatalog).
jest.mock('../../../src/services/diagnosis-catalog-service', () => ({
  searchDiagnosisCatalog: jest.fn(async () => []),
}));

import {
  resolveDiagnosisWithAI,
  type DiagnosisResolveRunLlm,
  type DiagnosisCatalogSearchFn,
} from '../../../src/services/diagnosis-resolver-service';
import type { DiagnosisCatalogSearchResult } from '../../../src/types/diagnosis-catalog';
import { ServiceUnavailableError } from '../../../src/utils/errors';

const htnRow: DiagnosisCatalogSearchResult = {
  id: '1',
  code: 'BA00',
  title: 'Essential hypertension',
  synonyms: ['BP high'],
  chapter: null,
  created_at: '',
  updated_at: '',
};

const dmRow: DiagnosisCatalogSearchResult = {
  id: '2',
  code: '5A11',
  title: 'Type 2 diabetes mellitus',
  synonyms: ['sugar'],
  chapter: null,
  created_at: '',
  updated_at: '',
};

function runnerReturning(payload: unknown, finishReason = 'stop'): DiagnosisResolveRunLlm {
  return jest.fn(async () => ({
    content: typeof payload === 'string' ? payload : JSON.stringify(payload),
    model: 'gpt-4o-mini',
    finishReason,
  })) as DiagnosisResolveRunLlm;
}

/**
 * Catalog stub keyed by the (lowercased) query the resolver issues. Returns a
 * fresh copy per call (the real `searchDiagnosisCatalog` does too), so the
 * resolver's in-place re-ranking never mutates the fixture.
 */
function catalogStub(
  map: Record<string, DiagnosisCatalogSearchResult[]>,
): DiagnosisCatalogSearchFn {
  return jest.fn(async (query: string) => (map[query.trim().toLowerCase()] ?? []).slice()) as
    DiagnosisCatalogSearchFn;
}

beforeEach(() => {
  getOpenAIClient.mockReset();
  getOpenAIDiagnosisResolveConfig.mockClear();
});

describe('resolveDiagnosisWithAI — catalog constraint', () => {
  it('resolves a model clinical term to the catalog code + canonical title', async () => {
    const runLlm = runnerReturning({
      candidates: [{ term: 'high blood sugar', code: null, confidence: 0.8 }],
    });
    const searchCatalog = catalogStub({ 'high blood sugar': [dmRow] });

    const res = await resolveDiagnosisWithAI({ text: 'sugar' }, 'cid', {
      runLlm,
      searchCatalog,
    });

    expect(res.suggestions).toEqual([
      { code: '5A11', title: 'Type 2 diabetes mellitus', confidence: 0.8 },
    ]);
  });

  it('never surfaces an off-catalog code — it repairs to the term’s real catalog row', async () => {
    // The model guesses a bogus code but a real clinical term.
    const runLlm = runnerReturning({
      candidates: [{ term: 'Essential hypertension', code: 'ZZ99.9', confidence: 0.7 }],
    });
    // Code lookup finds nothing; the term resolves to the real row.
    const searchCatalog = catalogStub({
      'zz99.9': [],
      'essential hypertension': [htnRow],
    });

    const res = await resolveDiagnosisWithAI({ text: 'BP high' }, 'cid', {
      runLlm,
      searchCatalog,
    });

    // The bogus ZZ99.9 is gone; the canonical BA00 is surfaced.
    expect(res.suggestions).toEqual([
      { code: 'BA00', title: 'Essential hypertension', confidence: 0.7 },
    ]);
  });

  it('drops a candidate entirely when neither the code nor the term is in the catalog', async () => {
    const runLlm = runnerReturning({
      candidates: [{ term: 'Totally made up disease', code: 'ZZ99', confidence: 0.9 }],
    });
    const searchCatalog = catalogStub({}); // everything misses

    const res = await resolveDiagnosisWithAI({ text: 'xyzzy' }, 'cid', {
      runLlm,
      searchCatalog,
    });

    expect(res.suggestions).toEqual([]);
  });

  it('never surfaces a valid-but-clinically-wrong code the model hallucinates (headache → NOT chronic pain)', async () => {
    // Regression: the model named the condition correctly ("Headache") but
    // guessed the wrong ICD code (MG30 "Chronic pain"). The term resolves to a
    // real headache row; MG30 must never appear because the term didn't find it.
    const headacheRow: DiagnosisCatalogSearchResult = {
      id: '9',
      code: '8A8Z',
      title: 'Headache disorders, unspecified',
      synonyms: [],
      chapter: 'Nervous system',
      created_at: '',
      updated_at: '',
    };
    const runLlm = runnerReturning({
      candidates: [{ term: 'Headache', code: 'MG30', confidence: 0.9 }],
    });
    // The catalog for "headache" does NOT include the bogus MG30.
    const searchCatalog = catalogStub({ headache: [headacheRow] });

    const res = await resolveDiagnosisWithAI({ text: 'head ache' }, 'cid', {
      runLlm,
      searchCatalog,
    });

    expect(res.suggestions).toEqual([
      { code: '8A8Z', title: 'Headache disorders, unspecified', confidence: 0.9 },
    ]);
    expect(res.suggestions.some((s) => s.code === 'MG30')).toBe(false);
  });

  it('floats the model code to the top only when it agrees with the term’s catalog matches', async () => {
    const dm1: DiagnosisCatalogSearchResult = {
      id: '3',
      code: '5A10',
      title: 'Type 1 diabetes mellitus',
      synonyms: [],
      chapter: null,
      created_at: '',
      updated_at: '',
    };
    const runLlm = runnerReturning({
      candidates: [{ term: 'diabetes', code: '5A11', confidence: 0.9 }],
    });
    // Term search ranks 5A10 first; the agreeing model code 5A11 floats up.
    const searchCatalog = catalogStub({ diabetes: [dm1, dmRow] });

    const res = await resolveDiagnosisWithAI({ text: 'diabetes' }, 'cid', {
      runLlm,
      searchCatalog,
    });

    expect(res.suggestions.map((s) => s.code)).toEqual(['5A11', '5A10']);
  });

  it('dedupes suggestions that resolve to the same catalog code (first wins)', async () => {
    const runLlm = runnerReturning({
      candidates: [
        { term: 'sugar disease', code: null, confidence: 0.8 },
        { term: 'diabetes', code: null, confidence: 0.6 },
      ],
    });
    const searchCatalog = catalogStub({
      'sugar disease': [dmRow],
      diabetes: [dmRow],
    });

    const res = await resolveDiagnosisWithAI({ text: 'sugar' }, 'cid', {
      runLlm,
      searchCatalog,
    });

    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0]).toEqual({
      code: '5A11',
      title: 'Type 2 diabetes mellitus',
      confidence: 0.8,
    });
  });
});

describe('resolveDiagnosisWithAI — fail soft + PHI', () => {
  it('returns no suggestions on a truncated completion', async () => {
    const res = await resolveDiagnosisWithAI({ text: 'sugar' }, 'cid', {
      runLlm: runnerReturning({ candidates: [{ term: 'diabetes' }] }, 'length'),
      searchCatalog: catalogStub({ diabetes: [dmRow] }),
    });
    expect(res.suggestions).toEqual([]);
  });

  it('returns no suggestions on malformed JSON', async () => {
    const res = await resolveDiagnosisWithAI({ text: 'sugar' }, 'cid', {
      runLlm: runnerReturning('not json{', 'stop'),
      searchCatalog: catalogStub({}),
    });
    expect(res.suggestions).toEqual([]);
  });

  it('returns no suggestions when the model returns an empty candidate list', async () => {
    const res = await resolveDiagnosisWithAI({ text: 'sugar' }, 'cid', {
      runLlm: runnerReturning({ candidates: [] }),
      searchCatalog: catalogStub({}),
    });
    expect(res.suggestions).toEqual([]);
  });

  it('throws ServiceUnavailableError when the OpenAI client is unconfigured', async () => {
    await expect(
      resolveDiagnosisWithAI({ text: 'sugar' }, 'cid', {
        runLlm: (async () => null) as DiagnosisResolveRunLlm,
        searchCatalog: catalogStub({}),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('redacts PHI before the prompt and forwards the requested tier', async () => {
    let capturedPrompt: string | undefined;
    let capturedTier: string | undefined;
    const runLlm: DiagnosisResolveRunLlm = async (args) => {
      capturedPrompt = args.userPrompt;
      capturedTier = args.tier;
      return { content: JSON.stringify({ candidates: [] }), model: 'm', finishReason: 'stop' };
    };

    await resolveDiagnosisWithAI({ text: 'patient chest pain', tier: 'escalation' }, 'cid', {
      runLlm,
      searchCatalog: catalogStub({}),
    });

    expect(capturedPrompt).toBe('REDACTED:patient chest pain');
    expect(capturedTier).toBe('escalation');
  });
});
