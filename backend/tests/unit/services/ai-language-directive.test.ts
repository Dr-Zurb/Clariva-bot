/**
 * lang-04: explicit LANGUAGE directive from turnLanguage (no model-side mirror/choice).
 */

import {
  generateResponse,
  appendOptionalDmReplyBridge,
  RESPONSE_SYSTEM_PROMPT_BASE,
} from '../../../src/services/ai-service';
import { buildLanguageReplyDirective } from '../../../src/utils/conversation-language';
import * as openai from '../../../src/config/openai';
import { env } from '../../../src/config/env';

jest.mock('../../../src/config/openai');
jest.mock('../../../src/utils/audit-logger', () => ({
  logAIClassification: jest.fn(),
  logAIResponseGeneration: jest.fn(),
  logAuditEvent: jest.fn(),
}));

const mockedOpenai = openai as jest.Mocked<typeof openai>;

type MockCompletion = {
  choices: Array<{ message: { content: string } }>;
  usage?: { total_tokens?: number };
};

describe('lang-04 language reply directive', () => {
  const correlationId = 'lang-04-corr';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildLanguageReplyDirective', () => {
    it('maps en to English', () => {
      expect(buildLanguageReplyDirective('en')).toContain('LANGUAGE: Reply in English.');
    });

    it('maps hi-Latn to Hinglish directive', () => {
      expect(buildLanguageReplyDirective('hi-Latn')).toContain(
        'LANGUAGE: Reply in Hinglish — Hindi written in Latin script'
      );
    });

    it('maps other to English (LANG-D7)', () => {
      expect(buildLanguageReplyDirective('other')).toContain('LANGUAGE: Reply in English.');
    });

    it('includes mid-reply and proper-noun constraints', () => {
      const d = buildLanguageReplyDirective('en');
      expect(d).toContain('Do not switch language mid-reply.');
      expect(d).toContain('practice name');
    });
  });

  describe('RESPONSE_SYSTEM_PROMPT_BASE', () => {
    it('no longer contains STABILITY or mirror language choice', () => {
      expect(RESPONSE_SYSTEM_PROMPT_BASE).not.toContain('STABILITY');
      expect(RESPONSE_SYSTEM_PROMPT_BASE).not.toMatch(/mirror the user's style/i);
      expect(RESPONSE_SYSTEM_PROMPT_BASE).not.toContain('kya aap available ho');
      expect(RESPONSE_SYSTEM_PROMPT_BASE).not.toContain('yar kitne paise');
      expect(RESPONSE_SYSTEM_PROMPT_BASE).not.toContain('goli bata do');
    });

    it('includes hard non-interpretation rule for vitals/symptoms', () => {
      expect(RESPONSE_SYSTEM_PROMPT_BASE).toMatch(/NON-INTERPRETATION/i);
      expect(RESPONSE_SYSTEM_PROMPT_BASE).toMatch(/NEVER characterize/i);
      expect(RESPONSE_SYSTEM_PROMPT_BASE).toMatch(/concerning/i);
    });
  });

  describe('generateResponse system prompt', () => {
    const baseInput = {
      conversationId: 'conv-lang-04',
      currentIntent: 'greeting' as const,
      state: {},
      recentMessages: [] as never[],
      currentUserMessage: 'hey hallo',
      correlationId,
    };

    async function systemPromptFor(
      turnLanguage: 'en' | 'hi-Latn' | 'other'
    ): Promise<string> {
      const mockCreate = jest
        .fn()
        .mockResolvedValue({
          choices: [{ message: { content: 'Hello! How can I help?' } }],
          usage: { total_tokens: 10 },
        } satisfies MockCompletion);
      mockedOpenai.getOpenAIClient.mockReturnValue({
        chat: { completions: { create: mockCreate } },
      } as never);
      mockedOpenai.getOpenAIConfig.mockReturnValue({
        model: 'gpt-5.2',
        maxTokens: 256,
      });

      await generateResponse({ ...baseInput, turnLanguage });

      const firstCall = (mockCreate.mock.calls as unknown as unknown[][])[0];
      const args = firstCall?.[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      return args.messages.find((m) => m.role === 'system')?.content ?? '';
    }

    it('turnLanguage en → Reply in English; no Hinglish example strings', async () => {
      const system = await systemPromptFor('en');
      expect(system).toContain('LANGUAGE: Reply in English.');
      expect(system).not.toContain('kya aap available ho');
      expect(system).not.toContain('STABILITY');
    });

    it('turnLanguage hi-Latn → Hinglish directive', async () => {
      const system = await systemPromptFor('hi-Latn');
      expect(system).toContain(
        'LANGUAGE: Reply in Hinglish — Hindi written in Latin script'
      );
    });

    it('turnLanguage other → English directive', async () => {
      const system = await systemPromptFor('other');
      expect(system).toContain('LANGUAGE: Reply in English.');
    });
  });

  describe('appendOptionalDmReplyBridge', () => {
    const prevBridge = env.AI_DM_REPLY_BRIDGE_ENABLED;

    afterEach(() => {
      env.AI_DM_REPLY_BRIDGE_ENABLED = prevBridge;
    });

    it('carries LANGUAGE directive when bridge flag is on', async () => {
      env.AI_DM_REPLY_BRIDGE_ENABLED = true;
      const mockCreate = jest
        .fn()
        .mockResolvedValue({
          choices: [{ message: { content: 'Thanks for asking.' } }],
          usage: { total_tokens: 8 },
        } satisfies MockCompletion);
      mockedOpenai.getOpenAIClient.mockReturnValue({
        chat: { completions: { create: mockCreate } },
      } as never);
      mockedOpenai.getOpenAIConfig.mockReturnValue({
        model: 'gpt-5.2',
        maxTokens: 256,
      });

      await appendOptionalDmReplyBridge({
        correlationId,
        userText: 'kitne paise lagenge',
        baseReply: 'Fee details above.',
        turnLanguage: 'hi-Latn',
      });

      const firstCall = (mockCreate.mock.calls as unknown as unknown[][])[0];
      const args = firstCall?.[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const system = args.messages.find((m) => m.role === 'system')?.content ?? '';
      expect(system).toContain(
        'LANGUAGE: Reply in Hinglish — Hindi written in Latin script'
      );
      expect(system).not.toMatch(/Match the user's language style/i);
    });
  });
});
