/**
 * lat-02: Intent classification uses the mini model tier, not the flagship.
 * Deterministic fixtures (pre-LLM rules) must keep routing-critical labels.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fixtures from '../../fixtures/intent-classification-labels.json';
import { getOpenAIIntentClassifyConfig } from '../../../src/config/openai';

const createMock = jest.fn();

jest.mock('../../../src/config/openai', () => {
  const actual = jest.requireActual('../../../src/config/openai') as typeof import('../../../src/config/openai');
  return {
    ...actual,
    getOpenAIClient: () => ({
      chat: {
        completions: {
          create: (...args: unknown[]) => createMock(...args),
        },
      },
    }),
  };
});

jest.mock('../../../src/utils/audit-logger', () => ({
  logAIClassification: jest.fn(async () => undefined),
  logAuditEvent: jest.fn(async () => undefined),
  logSecurityEvent: jest.fn(async () => undefined),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import after mocks
import { classifyIntent } from '../../../src/services/ai-service';

describe('intent classify model tier (lat-02)', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('getOpenAIIntentClassifyConfig defaults to gpt-4o-mini', () => {
    expect(getOpenAIIntentClassifyConfig().model).toBe('gpt-4o-mini');
  });

  it('classifyIntent LLM path calls OpenAI with the intent-classify model', async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'book_appointment',
              confidence: 0.9,
            }),
          },
        },
      ],
      usage: { total_tokens: 40 },
    } as never);

    // Phrase that is not caught by deterministic pre-rules.
    const result = await classifyIntent(
      'I would like to schedule a teleconsult tomorrow afternoon please',
      'cid-lat-02'
    );

    expect(result.intent).toBe('book_appointment');
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0]?.[0] as { model?: string };
    expect(arg.model).toBe(getOpenAIIntentClassifyConfig().model);
  });

  describe('deterministic fixtures (LAT1-D2 routing-critical)', () => {
    const cases = fixtures.cases.filter((c) => c.source === 'deterministic');

    it('has at least one safety-critical emergency fixture', () => {
      expect(cases.some((c) => c.safetyCritical && c.intent === 'emergency')).toBe(true);
    });

    it.each(cases.map((c) => [c.id, c.text, c.intent] as const))(
      '%s → %s',
      async (_id, text, expectedIntent) => {
        const result = await classifyIntent(text, `cid-${_id}`);
        expect(result.intent).toBe(expectedIntent);
        // Deterministic path must not call the model.
        expect(createMock).not.toHaveBeenCalled();
      }
    );
  });
});
