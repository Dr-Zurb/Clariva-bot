/**
 * Lab-photo vision extract service (rpt-05.6).
 *
 * Covers the two things that matter most: the PHI-egress gate is closed by
 * default, and model output is bounded rather than trusted. The OpenAI call
 * itself is behind the injectable `runLlm` seam, so nothing here needs a key
 * or a network.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ServiceUnavailableError } from '../../../src/utils/errors';
import {
  boundLabVisionRows,
  buildLabVisionSystemPrompt,
  extractLabRowsFromImage,
  type LabVisionRunLlmArgs,
} from '../../../src/services/lab-vision-extract-service';

const isEnabled = jest.fn<() => boolean>();

jest.mock('../../../src/config/openai', () => ({
  getOpenAIClient: () => null,
  getOpenAILabVisionConfig: () => ({ model: 'test-vision-model', maxTokens: 4000 }),
  isLabVisionExtractEnabled: () => isEnabled(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logAIClassification: jest.fn(async () => undefined),
}));

const args = { correlationId: 'corr-1' };
const bytes = Buffer.from('jpeg-bytes');

function runLlmReturning(content: string | null, finishReason: string | null = 'stop') {
  return jest.fn(async (_a: LabVisionRunLlmArgs) => ({
    content,
    model: 'test-vision-model',
    finishReason,
  }));
}

beforeEach(() => {
  isEnabled.mockReset();
  isEnabled.mockReturnValue(true);
});

describe('extractLabRowsFromImage — egress gate', () => {
  it('refuses to call out when photo extraction is not enabled', async () => {
    isEnabled.mockReturnValue(false);
    const runLlm = runLlmReturning('{"rows":[]}');

    await expect(
      extractLabRowsFromImage(bytes, 'image/jpeg', args, { runLlm })
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
    // The gate must short-circuit BEFORE the image is prepared or sent.
    expect(runLlm).not.toHaveBeenCalled();
  });

  it('surfaces an unconfigured client as unavailable rather than empty rows', async () => {
    const runLlm = jest.fn(async (_a: LabVisionRunLlmArgs) => null);
    await expect(
      extractLabRowsFromImage(bytes, 'image/jpeg', args, { runLlm })
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('inlines the image as a data URL instead of a signed storage URL', async () => {
    const runLlm = runLlmReturning('{"rows":[]}');
    await extractLabRowsFromImage(bytes, 'image/png', args, { runLlm });

    const sent = runLlm.mock.calls[0]![0];
    expect(sent.imageDataUrl).toBe(`data:image/png;base64,${bytes.toString('base64')}`);
    expect(sent.imageDataUrl).not.toMatch(/^https?:/);
  });
});

describe('extractLabRowsFromImage — fail soft', () => {
  it('returns zero rows for malformed JSON', async () => {
    const runLlm = runLlmReturning('not json at all');
    await expect(extractLabRowsFromImage(bytes, 'image/jpeg', args, { runLlm })).resolves.toEqual({
      rows: [],
    });
  });

  it('returns zero rows when the response was truncated', async () => {
    const runLlm = runLlmReturning('{"rows":[{"rawName":"Hb"', 'length');
    await expect(extractLabRowsFromImage(bytes, 'image/jpeg', args, { runLlm })).resolves.toEqual({
      rows: [],
    });
  });

  it('returns zero rows when the model reports nothing legible', async () => {
    const runLlm = runLlmReturning('{"rows":[]}');
    await expect(extractLabRowsFromImage(bytes, 'image/jpeg', args, { runLlm })).resolves.toEqual({
      rows: [],
    });
  });

  it('passes bounded rows through in the shared row shape', async () => {
    const runLlm = runLlmReturning(
      JSON.stringify({
        rows: [
          {
            rawName: 'HAEMOGLOBIN',
            rawValue: '11.8',
            rawUnit: 'g/dL',
            rawRange: '12.0 - 15.0',
            rawMethod: 'Photometry',
          },
        ],
      })
    );
    const result = await extractLabRowsFromImage(bytes, 'image/jpeg', args, { runLlm });
    expect(result.rows).toEqual([
      {
        rawName: 'HAEMOGLOBIN',
        rawValue: '11.8',
        rawUnit: 'g/dL',
        rawRange: '12.0 - 15.0',
        rawMethod: 'Photometry',
        pageIndex: 0,
        lineText: 'HAEMOGLOBIN 11.8 g/dL 12.0 - 15.0 Photometry',
      },
    ]);
  });
});

describe('boundLabVisionRows', () => {
  it('drops rows without a usable test name', () => {
    expect(
      boundLabVisionRows({
        rows: [{ rawValue: '11.8' }, { rawName: '   ' }, { rawName: null }, 'nonsense', null],
      })
    ).toEqual([]);
  });

  it('drops off-schema keys instead of passing them through', () => {
    const rows = boundLabVisionRows({
      rows: [{ rawName: 'Hb', rawValue: '11.8', interpretation: 'low', refLow: 12 }],
    });
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'lineText',
      'pageIndex',
      'rawMethod',
      'rawName',
      'rawRange',
      'rawUnit',
      'rawValue',
    ]);
  });

  it('accepts a numeric value but rejects structured junk', () => {
    const rows = boundLabVisionRows({
      rows: [{ rawName: 'Hb', rawValue: 11.8, rawUnit: { bad: true }, rawRange: ['12', '15'] }],
    });
    expect(rows[0]!.rawValue).toBe('11.8');
    expect(rows[0]!.rawUnit).toBeNull();
    expect(rows[0]!.rawRange).toBeNull();
  });

  it('caps field lengths and row count', () => {
    const rows = boundLabVisionRows({
      rows: Array.from({ length: 250 }, () => ({
        rawName: 'H'.repeat(200),
        rawValue: '1'.repeat(80),
        rawRange: 'r'.repeat(200),
      })),
    });
    expect(rows).toHaveLength(200);
    expect(rows[0]!.rawName).toHaveLength(120);
    expect(rows[0]!.rawValue).toHaveLength(40);
    expect(rows[0]!.rawRange).toHaveLength(80);
    expect(rows[0]!.lineText.length).toBeLessThanOrEqual(240);
  });

  it('tolerates a bare array and a missing rows key', () => {
    expect(boundLabVisionRows([{ rawName: 'Hb' }])).toHaveLength(1);
    expect(boundLabVisionRows({ results: [{ rawName: 'Hb' }] })).toEqual([]);
  });
});

describe('buildLabVisionSystemPrompt', () => {
  it('instructs the model to transcribe and to omit anything uncertain', () => {
    const prompt = buildLabVisionSystemPrompt();
    // The prompt is the only place the fail-closed intent is expressed, so
    // these instructions must not be silently dropped in an edit.
    expect(prompt).toMatch(/EXACTLY as printed/);
    expect(prompt).toMatch(/OMIT any row where you cannot read the value confidently/);
    expect(prompt).toMatch(/Do NOT convert units/);
    expect(prompt).toMatch(/Never invent a test/);
  });
});
