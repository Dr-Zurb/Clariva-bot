/**
 * Unit tests for OpenAI config helpers (subj-14 complaint-parse tiering).
 */

import { getOpenAIComplaintParseConfig, getOpenAIConfig } from '../../../src/config/openai';

jest.mock('../../../src/config/env', () => ({
  env: {
    OPENAI_MODEL: undefined,
    OPENAI_MAX_TOKENS: undefined,
    OPENAI_COMPLAINT_PARSE_MODEL: undefined,
    OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL: undefined,
    OPENAI_COMPLAINT_PARSE_MAX_TOKENS: undefined,
  },
}));

const { env } = jest.requireMock('../../../src/config/env') as {
  env: {
    OPENAI_MODEL?: string;
    OPENAI_MAX_TOKENS?: number;
    OPENAI_COMPLAINT_PARSE_MODEL?: string;
    OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL?: string;
    OPENAI_COMPLAINT_PARSE_MAX_TOKENS?: number;
  };
};

describe('getOpenAIConfig', () => {
  it('defaults to flagship gpt-5.2 and 256 max tokens', () => {
    expect(getOpenAIConfig()).toEqual({ model: 'gpt-5.2', maxTokens: 256 });
  });
});

describe('getOpenAIComplaintParseConfig', () => {
  beforeEach(() => {
    env.OPENAI_MODEL = undefined;
    env.OPENAI_COMPLAINT_PARSE_MODEL = undefined;
    env.OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL = undefined;
    env.OPENAI_COMPLAINT_PARSE_MAX_TOKENS = undefined;
  });

  it('Tier 1 defaults to gpt-4o-mini with 500 max tokens (not flagship)', () => {
    expect(getOpenAIComplaintParseConfig('default')).toEqual({
      model: 'gpt-4o-mini',
      maxTokens: 500,
      tier: 'default',
    });
  });

  it('Tier 2 defaults to flagship when escalation model unset', () => {
    expect(getOpenAIComplaintParseConfig('escalation')).toEqual({
      model: 'gpt-5.2',
      maxTokens: 500,
      tier: 'escalation',
    });
  });

  it('respects per-tier env overrides', () => {
    env.OPENAI_COMPLAINT_PARSE_MODEL = 'gpt-4.1-mini';
    env.OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL = 'gpt-4o';
    env.OPENAI_COMPLAINT_PARSE_MAX_TOKENS = 600;

    expect(getOpenAIComplaintParseConfig('default').model).toBe('gpt-4.1-mini');
    expect(getOpenAIComplaintParseConfig('escalation').model).toBe('gpt-4o');
    expect(getOpenAIComplaintParseConfig('default').maxTokens).toBe(600);
  });

  it('Tier 2 falls back to OPENAI_MODEL when escalation model unset', () => {
    env.OPENAI_MODEL = 'gpt-4o';
    expect(getOpenAIComplaintParseConfig('escalation').model).toBe('gpt-4o');
  });
});
