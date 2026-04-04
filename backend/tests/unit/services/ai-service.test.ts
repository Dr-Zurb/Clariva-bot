/**
 * AI Service Unit Tests
 *
 * Tests for intent detection: redaction, classification, fallback to unknown,
 * retry behavior, and audit (metadata only). All tests mock OpenAI and audit logger.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  buildClassifyIntentContext,
  classifyIntent,
  redactPhiForAI,
  generateResponse,
} from '../../../src/services/ai-service';
import type { ConversationState } from '../../../src/types/conversation';
import * as openaiConfig from '../../../src/config/openai';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/openai');
jest.mock('../../../src/utils/audit-logger');
jest.mock('../../../src/config/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockedOpenai = openaiConfig as jest.Mocked<typeof openaiConfig>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

/** Minimal shape for mocked chat completion (avoids jest.fn() inferring never). */
type MockCompletion = {
  choices: { message: { content: string | null } }[];
  usage?: { total_tokens?: number };
};

describe('AI Service', () => {
  const correlationId = 'test-correlation-id';

  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logAIClassification as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
    (mockedAudit.logAIResponseGeneration as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  describe('redactPhiForAI', () => {
    it('redacts email addresses', () => {
      expect(
        redactPhiForAI('Contact me at TEST_EMAIL@example.com please')
      ).toBe('Contact me at [REDACTED_EMAIL] please');
    });

    it('redacts US-style phone numbers', () => {
      expect(
        redactPhiForAI('Call 555-000-0000 or (555) 000-0001')
      ).toContain('[REDACTED_PHONE]');
      expect(redactPhiForAI('Call 555-000-0000 or (555) 000-0001')).not.toContain(
        '555'
      );
    });

    it('returns empty string for empty input', () => {
      expect(redactPhiForAI('')).toBe('');
    });

    it('leaves non-PHI text unchanged', () => {
      const text = 'I would like to book an appointment';
      expect(redactPhiForAI(text)).toBe(text);
    });
  });

  describe('classifyIntent', () => {
    describe('when OPENAI_API_KEY is not set', () => {
      it('returns unknown and does not call OpenAI', async () => {
        mockedOpenai.getOpenAIClient.mockReturnValue(null);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        const result = await classifyIntent('I want to book', correlationId);

        expect(result).toEqual({ intent: 'unknown', confidence: 0 });
        expect(mockedOpenai.getOpenAIClient).toHaveBeenCalled();
        expect(mockedAudit.logAIClassification).not.toHaveBeenCalled();
      });
    });

    describe('when OpenAI returns valid JSON', () => {
      it('returns intent and confidence and audits success', async () => {
        const res: MockCompletion = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'book_appointment',
                  confidence: 0.92,
                }),
              },
            },
          ],
          usage: { total_tokens: 50 },
        };
        const mockCreate = jest.fn<() => Promise<MockCompletion>>().mockResolvedValue(res);
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        const result = await classifyIntent(
          'I would like to book an appointment',
          correlationId
        );

        expect(result).toEqual({ intent: 'book_appointment', confidence: 0.92 });
        expect(mockCreate).toHaveBeenCalledTimes(1);
        const firstCallArgs = (mockCreate.mock.calls as unknown as unknown[][])[0];
        const callArg = firstCallArgs?.[0] as {
          model: string;
          max_completion_tokens: number;
          messages: { content: string }[];
        };
        expect(callArg.model).toBe('gpt-5.2');
        expect(callArg.max_completion_tokens).toBe(120);
        expect(callArg.messages[1].content).not.toContain('@');
        expect(mockedAudit.logAIClassification).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId,
            model: 'gpt-5.2',
            redactionApplied: true,
            status: 'success',
            tokens: 50,
          })
        );
      });

      it('RBH-18: parses topics and is_fee_question from model JSON', async () => {
        const res: MockCompletion = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'ask_question',
                  confidence: 0.91,
                  topics: ['pricing', 'hours'],
                  is_fee_question: true,
                }),
              },
            },
          ],
          usage: { total_tokens: 55 },
        };
        const mockCreate = jest.fn<() => Promise<MockCompletion>>().mockResolvedValue(res);
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        const result = await classifyIntent('paisa kitna lagta hai video call pe', correlationId);

        expect(result.intent).toBe('ask_question');
        expect(result.confidence).toBe(0.91);
        expect(result.is_fee_question).toBe(true);
        expect(result.topics).toEqual(['pricing', 'hours']);
        expect(mockedAudit.logAIClassification).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'success',
            intentTopics: ['pricing', 'hours'],
            isFeeQuestion: true,
          })
        );
      });

      it('RBH-14: sends multi-turn user payload when classifyContext is provided', async () => {
        const res: MockCompletion = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'ask_question',
                  confidence: 0.88,
                }),
              },
            },
          ],
          usage: { total_tokens: 60 },
        };
        const mockCreate = jest.fn<() => Promise<MockCompletion>>().mockResolvedValue(res);
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });
        const state: ConversationState = { activeFlow: 'fee_quote', step: 'responded' };
        const classifyCtx = buildClassifyIntentContext(state, [
          { sender_type: 'system', content: 'Fees: general vs video' },
        ]);
        await classifyIntent('general consultation please', correlationId, {
          classifyContext: classifyCtx,
        });
        const firstCallArgs = (mockCreate.mock.calls as unknown as unknown[][])[0];
        const callArg = (firstCallArgs?.[0] as { messages: { content: string }[] }).messages[1]
          .content;
        expect(callArg).toContain('Current user message:');
        expect(callArg).toContain('Recent conversation');
        expect(callArg).toContain('[Conversation context:');
      });
    });

    describe('when OpenAI returns invalid intent string', () => {
      it('maps to unknown via toIntent', async () => {
        const mockCreate = jest.fn<() => Promise<MockCompletion>>().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'book_apointment',
                  confidence: 0.8,
                }),
              },
            },
          ],
          usage: {},
        });
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        const result = await classifyIntent('Book please', correlationId);

        expect(result.intent).toBe('unknown');
        expect(result.confidence).toBe(0.8);
      });
    });

    describe('PHI redaction: text sent to OpenAI', () => {
      it('sends redacted text to OpenAI (no email/phone)', async () => {
        const mockCreate = jest.fn<() => Promise<MockCompletion>>().mockResolvedValue({
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
          usage: {},
        });
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        await classifyIntent(
          'Hi I am PATIENT_TEST, email TEST_EMAIL@example.com, call 555-000-0000',
          correlationId
        );

        const firstCallArgs = (mockCreate.mock.calls as unknown as unknown[][])[0];
        const userContent = (firstCallArgs?.[0] as { messages: { content: string }[] }).messages[1].content;
        expect(userContent).not.toContain('TEST_EMAIL@example.com');
        expect(userContent).not.toContain('555-000-0000');
        expect(userContent).toContain('[REDACTED_EMAIL]');
        expect(userContent).toContain('[REDACTED_PHONE]');
      });
    });

    describe('fallback on failure', () => {
      it('returns unknown and audits failure when create throws', async () => {
        const mockCreate = jest.fn<() => Promise<MockCompletion>>().mockRejectedValue(new Error('API error'));
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        const result = await classifyIntent(
          'I have a complicated question about scheduling and paperwork for next month',
          correlationId
        );

        expect(result).toEqual({ intent: 'unknown', confidence: 0 });
        expect(mockedAudit.logAIClassification).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId,
            model: 'gpt-5.2',
            redactionApplied: true,
            status: 'failure',
            errorMessage: 'classification_failed_after_retries',
          })
        );
      });
    });

    describe('retry behavior', () => {
      it('succeeds on second attempt after first fails', async () => {
        const mockCreate = jest
          .fn<() => Promise<MockCompletion>>()
          .mockRejectedValueOnce(new Error('rate limit'))
          .mockResolvedValueOnce({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: 'greeting',
                    confidence: 0.95,
                  }),
                },
              },
            ],
            usage: { total_tokens: 30 },
          });
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        const result = await classifyIntent('Hi there', correlationId);

        expect(result).toEqual({ intent: 'greeting', confidence: 0.95 });
        expect(mockCreate).toHaveBeenCalledTimes(2);
        expect(mockedAudit.logAIClassification).toHaveBeenCalledTimes(1);
        expect(mockedAudit.logAIClassification).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'success' })
        );
      });
    });

    describe('response caching (identical redacted input)', () => {
      it('returns cached result on second call with same redacted text (no second OpenAI call)', async () => {
        const res: MockCompletion = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'ask_question',
                  confidence: 0.88,
                }),
              },
            },
          ],
          usage: { total_tokens: 40 },
        };
        const mockCreate = jest.fn<() => Promise<MockCompletion>>().mockResolvedValue(res);
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        const text = 'What are your opening hours?';
        const result1 = await classifyIntent(text, correlationId);
        const result2 = await classifyIntent(text, correlationId);

        expect(result1).toEqual({ intent: 'ask_question', confidence: 0.88 });
        expect(result2).toEqual(result1);
        expect(mockCreate).toHaveBeenCalledTimes(1);
      });
    });

    describe('empty or invalid completion content', () => {
      it('returns unknown when content is empty', async () => {
        const mockCreate = jest.fn<() => Promise<MockCompletion>>().mockResolvedValue({
          choices: [{ message: { content: null } }],
          usage: {},
        });
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        const result = await classifyIntent('Book', correlationId);

        expect(result).toEqual({ intent: 'unknown', confidence: 0 });
        expect(mockedAudit.logAIClassification).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'failure',
            errorMessage: 'empty_completion',
          })
        );
      });

      it('returns unknown when content is not valid JSON', async () => {
        const mockCreate = jest.fn<() => Promise<MockCompletion>>().mockResolvedValue({
          choices: [
            { message: { content: 'not json at all' } },
          ],
          usage: {},
        });
        mockedOpenai.getOpenAIClient.mockReturnValue({
          chat: { completions: { create: mockCreate } },
        } as any);
        mockedOpenai.getOpenAIConfig.mockReturnValue({
          model: 'gpt-5.2',
          maxTokens: 256,
        });

        const result = await classifyIntent('Book', correlationId);

        expect(result).toEqual({ intent: 'unknown', confidence: 0 });
        expect(mockedAudit.logAIClassification).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'failure',
            errorMessage: 'invalid_json',
          })
        );
      });
    });
  });

  describe('generateResponse (e-task-3)', () => {
    const conversationId = 'conv-1';
    const correlationId = 'test-correlation-id';
    const defaultInput = {
      conversationId,
      currentIntent: 'greeting' as const,
      state: {},
      recentMessages: [] as { id: string; conversation_id: string; platform_message_id: string; sender_type: 'patient' | 'doctor' | 'system'; content: string; intent?: string; created_at: Date }[],
      currentUserMessage: 'Hi there',
      correlationId,
    };

    it('returns fallback when OPENAI_API_KEY is not set and audits failure', async () => {
      mockedOpenai.getOpenAIClient.mockReturnValue(null);
      mockedOpenai.getOpenAIConfig.mockReturnValue({
        model: 'gpt-5.2',
        maxTokens: 256,
      });

      const result = await generateResponse(defaultInput);

      expect(result).toContain("I didn't quite get that");
      expect(mockedAudit.logAIResponseGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId,
          model: 'gpt-5.2',
          redactionApplied: true,
          status: 'failure',
          resourceId: conversationId,
          errorMessage: 'openai_client_not_available',
        })
      );
    });

    it('includes idleDialogueHint in system prompt when context provides it', async () => {
      const mockCreate = jest.fn<() => Promise<{ choices: { message: { content: string } }[]; usage?: { total_tokens?: number } }>>().mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
        usage: { total_tokens: 10 },
      });
      mockedOpenai.getOpenAIClient.mockReturnValue({
        chat: { completions: { create: mockCreate } },
      } as any);
      mockedOpenai.getOpenAIConfig.mockReturnValue({
        model: 'gpt-5.2',
        maxTokens: 256,
      });

      await generateResponse({
        ...defaultInput,
        context: { idleDialogueHint: 'Thread note: user was in fee discussion.' },
      });

      const firstCall = (mockCreate.mock.calls as unknown as unknown[][])[0];
      const systemContent = (firstCall?.[0] as { messages: { role: string; content: string }[] }).messages[0]
        .content;
      expect(systemContent).toContain('Thread note: user was in fee discussion.');
    });

    it('returns generated text and audits success when OpenAI returns content', async () => {
      const mockCreate = jest.fn<() => Promise<{ choices: { message: { content: string } }[]; usage?: { total_tokens?: number } }>>().mockResolvedValue({
        choices: [{ message: { content: 'Hello! How can I help you today?' } }],
        usage: { total_tokens: 20 },
      });
      mockedOpenai.getOpenAIClient.mockReturnValue({
        chat: { completions: { create: mockCreate } },
      } as any);
      mockedOpenai.getOpenAIConfig.mockReturnValue({
        model: 'gpt-5.2',
        maxTokens: 256,
      });

      const result = await generateResponse(defaultInput);

      expect(result).toBe('Hello! How can I help you today?');
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockedAudit.logAIResponseGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId,
          model: 'gpt-5.2',
          redactionApplied: true,
          status: 'success',
          resourceId: conversationId,
          tokens: 20,
        })
      );
    });

    it('returns fallback when OpenAI returns empty content and audits failure', async () => {
      const mockCreate = jest.fn<() => Promise<{ choices: { message: { content: string | null } }[] }>>().mockResolvedValue({
        choices: [{ message: { content: null } }],
      });
      mockedOpenai.getOpenAIClient.mockReturnValue({
        chat: { completions: { create: mockCreate } },
      } as any);
      mockedOpenai.getOpenAIConfig.mockReturnValue({
        model: 'gpt-5.2',
        maxTokens: 256,
      });

      const result = await generateResponse(defaultInput);

      expect(result).toContain("I didn't quite get that");
      expect(mockedAudit.logAIResponseGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failure',
          errorMessage: 'empty_completion',
        })
      );
    });

    it('returns fallback and audits failure when OpenAI throws after retries', async () => {
      const mockCreate = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('API error'));
      mockedOpenai.getOpenAIClient.mockReturnValue({
        chat: { completions: { create: mockCreate } },
      } as any);
      mockedOpenai.getOpenAIConfig.mockReturnValue({
        model: 'gpt-5.2',
        maxTokens: 256,
      });

      const result = await generateResponse(defaultInput);

      expect(result).toContain("I didn't quite get that");
      expect(mockCreate).toHaveBeenCalledTimes(3);
      expect(mockedAudit.logAIResponseGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failure',
          errorMessage: 'response_generation_failed_after_retries',
        })
      );
    });
  });
});
