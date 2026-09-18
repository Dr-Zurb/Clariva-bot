/**
 * Unit tests for OpenAI config helpers (subj-14 complaint-parse tiering + lat-02 intent tier).
 */

import {
  cachedSystemTextPart,
  getOpenAIComplaintParseConfig,
  getOpenAIConfig,
  getOpenAIIntentClassifyConfig,
  isGpt56Family,
  replyPromptCacheParams,
} from '../../../src/config/openai';

jest.mock('../../../src/config/env', () => ({
  env: {
    OPENAI_MODEL: undefined,
    OPENAI_MAX_TOKENS: undefined,
    OPENAI_INTENT_CLASSIFY_MODEL: undefined,
    OPENAI_INTENT_CLASSIFY_MAX_TOKENS: undefined,
    OPENAI_COMPLAINT_PARSE_MODEL: undefined,
    OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL: undefined,
    OPENAI_COMPLAINT_PARSE_MAX_TOKENS: undefined,
  },
}));

const { env } = jest.requireMock('../../../src/config/env') as {
  env: {
    OPENAI_MODEL?: string;
    OPENAI_MAX_TOKENS?: number;
    OPENAI_INTENT_CLASSIFY_MODEL?: string;
    OPENAI_INTENT_CLASSIFY_MAX_TOKENS?: number;
    OPENAI_COMPLAINT_PARSE_MODEL?: string;
    OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL?: string;
    OPENAI_COMPLAINT_PARSE_MAX_TOKENS?: number;
  };
};

describe('getOpenAIConfig', () => {
  it('defaults to gpt-5.6-luna and 256 max tokens', () => {
    expect(getOpenAIConfig()).toEqual({ model: 'gpt-5.6-luna', maxTokens: 256 });
  });
});

describe('explicit prompt cache helpers', () => {
  it('isGpt56Family matches only the 5.6 line', () => {
    expect(isGpt56Family('gpt-5.6-luna')).toBe(true);
    expect(isGpt56Family('gpt-5.6-sol')).toBe(true);
    expect(isGpt56Family('gpt-5.2')).toBe(false);
    expect(isGpt56Family('gpt-4o-mini')).toBe(false);
  });

  it('replyPromptCacheParams is explicit 30m', () => {
    expect(replyPromptCacheParams('dm-reply:v1:Halo Aid:en:full')).toEqual({
      prompt_cache_key: 'dm-reply:v1:Halo Aid:en:full',
      prompt_cache_options: { mode: 'explicit', ttl: '30m' },
    });
  });

  it('cachedSystemTextPart marks the breakpoint on the text block', () => {
    expect(cachedSystemTextPart('stable')).toEqual({
      type: 'text',
      text: 'stable',
      prompt_cache_breakpoint: { mode: 'explicit' },
    });
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
      model: 'gpt-5.6-luna',
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

describe('getOpenAIIntentClassifyConfig (lat-02)', () => {
  beforeEach(() => {
    env.OPENAI_MODEL = 'gpt-5.6-luna';
    env.OPENAI_INTENT_CLASSIFY_MODEL = undefined;
    env.OPENAI_INTENT_CLASSIFY_MAX_TOKENS = undefined;
  });

  it('defaults to gpt-4o-mini and never inherits the flagship OPENAI_MODEL', () => {
    expect(getOpenAIIntentClassifyConfig()).toEqual({
      model: 'gpt-4o-mini',
      maxTokens: 160,
    });
    expect(getOpenAIIntentClassifyConfig().model).not.toBe(getOpenAIConfig().model);
  });

  it('respects OPENAI_INTENT_CLASSIFY_MODEL / MAX_TOKENS overrides', () => {
    env.OPENAI_INTENT_CLASSIFY_MODEL = 'gpt-4.1-mini';
    env.OPENAI_INTENT_CLASSIFY_MAX_TOKENS = 200;
    expect(getOpenAIIntentClassifyConfig()).toEqual({
      model: 'gpt-4.1-mini',
      maxTokens: 200,
    });
  });
});
