/**
 * lang-03: resolve once per turn, thread turnLanguage, persist when changed.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Conversation } from '../../../../src/types/database';
import type { DmTurnContext } from '../../../../src/workers/dm/stage-router';
import type { InboundMessage } from '../../../../src/workers/channels/types';

type AnyFn = (...args: never[]) => unknown;

const mockUpdateConversationState = jest.fn<AnyFn>();
const mockExecuteDmTurn = jest.fn<AnyFn>();
const mockGetConversationState = jest.fn<AnyFn>();
const mockFindConversation = jest.fn<AnyFn>();
const mockCreateConversation = jest.fn<AnyFn>();
const mockGetRecentMessages = jest.fn<AnyFn>();
const mockCreateMessage = jest.fn<AnyFn>();
const mockClassifyIntent = jest.fn<AnyFn>();
const mockGetDoctorSettings = jest.fn<AnyFn>();
const mockResolvePatient = jest.fn<AnyFn>();
const mockMaybeLink = jest.fn<AnyFn>();
const mockLoadReturning = jest.fn<AnyFn>();
const mockResolveTurnLanguage = jest.fn<AnyFn>();

/** When true, normalize returns a new object so the early persist path (:393) runs. */
let forceNormalizePersist = false;

jest.mock('../../../../src/utils/conversation-language', () => {
  const actual = jest.requireActual(
    '../../../../src/utils/conversation-language'
  ) as typeof import('../../../../src/utils/conversation-language');
  return {
    ...actual,
    resolveTurnLanguage: (...args: never[]) => mockResolveTurnLanguage(...args),
  };
});

jest.mock('../../../../src/services/conversation-service', () => ({
  findConversationByPlatformId: (...args: never[]) => mockFindConversation(...args),
  createConversation: (...args: never[]) => mockCreateConversation(...args),
  getConversationState: (...args: never[]) => mockGetConversationState(...args),
  updateConversationState: (...args: never[]) => mockUpdateConversationState(...args),
  normalizeLegacySlotConversationSteps: (s: Record<string, unknown>) =>
    forceNormalizePersist ? { ...s, _normalized: true } : s,
}));

jest.mock('../../../../src/workers/dm/handle-turn', () => ({
  executeDmTurn: (...args: never[]) => mockExecuteDmTurn(...args),
}));

jest.mock('../../../../src/services/message-service', () => ({
  createMessage: (...args: never[]) => mockCreateMessage(...args),
  getRecentMessages: (...args: never[]) => mockGetRecentMessages(...args),
}));

jest.mock('../../../../src/services/ai-service', () => ({
  AI_RECENT_MESSAGES_LIMIT: 10,
  classifyIntent: (...args: never[]) => mockClassifyIntent(...args),
  applyIntentPostClassificationPolicy: (r: unknown) => r,
  applyEmergencyIntentPostPolicy: (r: unknown) => r,
  buildClassifyIntentContext: () => undefined,
  generateResponse: jest.fn(),
  generateResponseWithActions: jest.fn(),
  intentSignalsFeeOrPricing: () => false,
  classifierSignalsFeeThreadContinuation: () => false,
  redactPhiForAI: (t: string) => t,
}));

jest.mock('../../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: (...args: never[]) => mockGetDoctorSettings(...args),
}));

jest.mock('../../../../src/services/patient-identity-service', () => ({
  resolvePatientForChannelSender: (...args: never[]) => mockResolvePatient(...args),
}));

jest.mock('../../../../src/services/comment-lead-service', () => ({
  maybeLinkCommentLeadAfterDm: (...args: never[]) => mockMaybeLink(...args),
}));

jest.mock('../../../../src/workers/dm/returning-patient', () => ({
  loadReturningPatientProfile: (...args: never[]) => mockLoadReturning(...args),
  shouldUseReturningPatientMemory: () => false,
  buildReturningPatientSummary: () => null,
}));

jest.mock('../../../../src/workers/dm/returning-patient-audit', () => ({
  auditReturningPatientRecognized: jest.fn(),
}));

jest.mock('../../../../src/services/collection-service', () => ({
  getCollectedData: jest.fn(async () => null),
}));

jest.mock('../../../../src/services/patient-service', () => ({
  findPatientByIdWithAdmin: jest.fn(async () => null),
  setPatientPlatformUsernameIfEmpty: jest.fn(),
}));

jest.mock('../../../../src/services/instagram-service', () => ({
  fetchMessengerUserProfile: jest.fn(),
}));

jest.mock('../../../../src/services/instagram-connect-service', () => ({
  getInstagramAccessTokenForDoctor: jest.fn(async () => null),
}));

jest.mock('../../../../src/services/facebook-connect-service', () => ({
  getFacebookPageAccessTokenForDoctor: jest.fn(async () => null),
}));

jest.mock('../../../../src/services/platform-avatar-cache', () => ({
  setCachedPlatformAvatar: jest.fn(),
}));

jest.mock('../../../../src/services/service-staff-review-service', () => ({
  upsertPendingStaffServiceReviewRequest: jest.fn(),
}));

jest.mock('../../../../src/utils/log-instagram-dm-routing', () => ({
  logInstagramDmRouting: jest.fn(),
}));

import { runConversationTurn } from '../../../../src/workers/dm/run-conversation-turn';

function baseConversation(language: Conversation['language']): Conversation {
  return {
    id: 'conv-1',
    doctor_id: 'doc-1',
    patient_id: 'pat-1',
    platform: 'instagram',
    platform_conversation_id: 'sender-1',
    status: 'active',
    language,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function inbound(text: string): InboundMessage {
  return {
    channel: 'instagram',
    surface: 'dm',
    provider: 'instagram',
    senderId: 'sender-1',
    text,
    platformMessageId: 'mid-1',
    providerEventId: 'evt-1',
    correlationId: 'corr-1',
    tenant: {
      doctorId: 'doc-1',
      doctorToken: 'token',
      pageIds: ['page-1'],
      doctorPageId: 'page-1',
    },
    pageIds: ['page-1'],
    webhookEntryId: 'page-1',
    raw: {},
  };
}

function languagePersistCalls(): unknown[][] {
  return mockUpdateConversationState.mock.calls.filter((c) => {
    const opts = c[3];
    return opts != null && typeof opts === 'object' && 'language' in opts;
  });
}

describe('runConversationTurn language (lang-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forceNormalizePersist = false;
    const actual = jest.requireActual(
      '../../../../src/utils/conversation-language'
    ) as typeof import('../../../../src/utils/conversation-language');
    mockResolveTurnLanguage.mockImplementation(
      ((...args: Parameters<typeof actual.resolveTurnLanguage>) =>
        actual.resolveTurnLanguage(...args)) as AnyFn
    );
    mockResolvePatient.mockReturnValue(Promise.resolve({ id: 'pat-1' }));
    mockMaybeLink.mockReturnValue(Promise.resolve(undefined));
    mockLoadReturning.mockReturnValue(Promise.resolve(undefined));
    mockGetConversationState.mockReturnValue(
      Promise.resolve({
        step: 'responded',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      })
    );
    mockGetRecentMessages.mockReturnValue(Promise.resolve([]));
    mockCreateMessage.mockReturnValue(Promise.resolve({}));
    mockClassifyIntent.mockReturnValue(
      Promise.resolve({ intent: 'greeting', confidence: 1 })
    );
    mockGetDoctorSettings.mockReturnValue(
      Promise.resolve({
        timezone: 'Asia/Kolkata',
        instagram_receptionist_paused: false,
      })
    );
    mockUpdateConversationState.mockReturnValue(Promise.resolve({}));
    mockExecuteDmTurn.mockImplementation((ctx: unknown) => {
      const c = ctx as DmTurnContext;
      return Promise.resolve({
        branch: 'greeting_template',
        reply: 'Hello!',
        nextState: c.state,
      });
    });
  });

  // LANG4-D1: defaulted English renders but is not persisted
  it('5.1 fresh conversation + hey hallo → turnLanguage en, no language persist', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));

    await runConversationTurn(inbound('hey hallo'));

    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('en');
    expect(languagePersistCalls()).toHaveLength(0);
  });

  it('5.2 stored hi-Latn + English → keeps hi-Latn, no language write', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation('hi-Latn')));

    await runConversationTurn(inbound('ok sounds good'));

    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('hi-Latn');
    expect(languagePersistCalls()).toHaveLength(0);
  });

  it('5.3 stored en + strong Hinglish → hi-Latn persisted', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation('en')));

    await runConversationTurn(inbound('mujhe kal appointment chahiye'));

    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('hi-Latn');
    const withLang = languagePersistCalls();
    expect(withLang.length).toBeGreaterThanOrEqual(1);
    expect(withLang[0][3]).toEqual({ language: 'hi-Latn' });
  });

  it('5.4 turnLanguage is populated before executeDmTurn (gates see it)', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));
    let languageAtExecute: string | undefined;
    mockExecuteDmTurn.mockImplementation((ctx: unknown) => {
      const c = ctx as DmTurnContext;
      languageAtExecute = c.turnLanguage;
      return Promise.resolve({
        branch: 'emergency_safety',
        reply: 'Call 112',
        nextState: c.state,
      });
    });

    await runConversationTurn(inbound('chest pain cannot breathe'));

    expect(languageAtExecute).toBe('en');
    expect(mockExecuteDmTurn).toHaveBeenCalled();
  });

  it('5.5 empty text inbound → keeps stored language, no language write', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation('hi-Latn')));

    await runConversationTurn(inbound(''));

    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('hi-Latn');
    expect(languagePersistCalls()).toHaveLength(0);
  });

  // LANG4-D1: early normalize persist must not write language on defaulted en
  it('5.6 early normalize persist path does not write language on defaulted en', async () => {
    forceNormalizePersist = true;
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));

    await runConversationTurn(inbound('hey hallo'));

    expect(languagePersistCalls()).toHaveLength(0);
    // State still persists (normalize path), just without a language option.
    expect(mockUpdateConversationState).toHaveBeenCalled();
    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('en');
  });

  it('5.7 fresh → hey hallo (no write) → strong Hinglish persists hi-Latn', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));

    await runConversationTurn(inbound('hey hallo'));
    expect(languagePersistCalls()).toHaveLength(0);
    expect((mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext).turnLanguage).toBe('en');

    // Still undecided (NULL) — next strong Hinglish message can establish language.
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));
    await runConversationTurn(inbound('mujhe kal appointment chahiye'));

    const ctx = mockExecuteDmTurn.mock.calls[1][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('hi-Latn');
    const withLang = languagePersistCalls();
    expect(withLang.length).toBeGreaterThanOrEqual(1);
    expect(withLang[0][3]).toEqual({ language: 'hi-Latn' });
  });

  it('5.8 fresh empty/non-text → turnLanguage en, no language write', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));

    await runConversationTurn(inbound(''));

    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('en');
    expect(languagePersistCalls()).toHaveLength(0);
  });

  it('5.9 three plain-English turns on fresh thread → zero language writes', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));

    await runConversationTurn(inbound('hey hallo'));
    await runConversationTurn(inbound('is the doctor available tomorrow?'));
    await runConversationTurn(inbound('ok thanks'));

    expect(languagePersistCalls()).toHaveLength(0);
    for (const call of mockExecuteDmTurn.mock.calls) {
      expect((call[0] as DmTurnContext).turnLanguage).toBe('en');
    }
  });

  // lang-16 — caller wires patient-only history, last 3, oldest-first
  it('5.10 passes patient-only last-3 oldest-first into resolveTurnLanguage', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));
    mockGetRecentMessages.mockReturnValue(
      Promise.resolve([
        { sender_type: 'patient', content: 'turn-a' },
        { sender_type: 'assistant', content: 'Kripaya 112 call karein' },
        { sender_type: 'patient', content: 'turn-b' },
        { sender_type: 'patient', content: 'turn-c' },
        { sender_type: 'patient', content: 'turn-d' },
        { sender_type: 'assistant', content: 'mujhe chahiye appointment' },
      ])
    );

    await runConversationTurn(inbound('kitna?'));

    expect(mockResolveTurnLanguage).toHaveBeenCalled();
    const args = mockResolveTurnLanguage.mock.calls[0] as unknown[];
    expect(args[0]).toBeNull();
    expect(args[1]).toBe('kitna?');
    // Assistant turns dropped; window is last 3 patient texts, oldest-first.
    expect(args[2]).toEqual(['turn-b', 'turn-c', 'turn-d']);
  });

  it('5.11 assistant Hindi copy cannot flip language via accumulation', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));
    // If assistant copy were included, mujhe+chahiye would make current kitna accumulate to strong.
    mockGetRecentMessages.mockReturnValue(
      Promise.resolve([
        {
          sender_type: 'assistant',
          content: 'mujhe chahiye appointment — batao',
        },
      ])
    );

    await runConversationTurn(inbound('kitna?'));

    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('en');
    expect(languagePersistCalls()).toHaveLength(0);
    const prior = mockResolveTurnLanguage.mock.calls[0][2] as string[];
    expect(prior).toEqual([]);
  });

  it('5.12 sparse Hinglish history accumulates to hi-Latn and persists', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));
    mockGetRecentMessages.mockReturnValue(
      Promise.resolve([
        { sender_type: 'patient', content: 'kitna?' },
        { sender_type: 'assistant', content: 'The fee is ₹500.' },
        { sender_type: 'patient', content: 'dard' },
      ])
    );

    await runConversationTurn(inbound('mujhe'));

    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('hi-Latn');
    const withLang = languagePersistCalls();
    expect(withLang.length).toBeGreaterThanOrEqual(1);
    expect(withLang[0][3]).toEqual({ language: 'hi-Latn' });
  });

  // lang-17 — classifier ratchet at the turn boundary
  it('5.13 undecided + ambiguous text + classifier hi-Latn → persist hi-Latn', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));
    mockClassifyIntent.mockReturnValue(
      Promise.resolve({
        intent: 'ask_question',
        confidence: 0.9,
        language: 'hi-Latn',
      })
    );

    await runConversationTurn(inbound('hey hallo'));

    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('hi-Latn');
    const withLang = languagePersistCalls();
    expect(withLang.length).toBeGreaterThanOrEqual(1);
    expect(withLang[0][3]).toEqual({ language: 'hi-Latn' });
  });

  it('5.14 classifier en on hey hallo stays undecided (original p1 bug)', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));
    mockClassifyIntent.mockReturnValue(
      Promise.resolve({ intent: 'greeting', confidence: 1, language: 'en' })
    );

    await runConversationTurn(inbound('hey hallo'));

    const ctx = mockExecuteDmTurn.mock.calls[0][0] as DmTurnContext;
    expect(ctx.turnLanguage).toBe('en');
    expect(languagePersistCalls()).toHaveLength(0);
  });

  it('5.15 acute emergency option is passed for regex emergency text', async () => {
    mockFindConversation.mockReturnValue(Promise.resolve(baseConversation(null)));

    await runConversationTurn(inbound('papa behosh ho gye'));

    expect(mockResolveTurnLanguage).toHaveBeenCalled();
    const args = mockResolveTurnLanguage.mock.calls[0] as unknown[];
    expect(args[1]).toBe('papa behosh ho gye');
    expect(args[3]).toEqual({ acuteEmergency: true });
  });
});
