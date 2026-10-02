/**
 * Instagram replies the way people actually write them.
 * The model intent stays ask_question unless a case says otherwise, so a
 * greeting or a number is not rescued by a booking label.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://example.com/d/clinic'),
}));

jest.mock('../../../../src/services/automated-messaging-opt-out', () => {
  const actual = jest.requireActual<typeof import('../../../../src/services/automated-messaging-opt-out')>(
    '../../../../src/services/automated-messaging-opt-out'
  );
  return {
    ...actual,
    persistAutomatedMessagingOptOut: jest.fn(async () => true),
    persistAutomatedMessagingOptIn: jest.fn(async () => true),
  };
});

jest.mock('../../../../src/services/visit-page-link-service', () => ({
  mintVisitPageLink: jest.fn(
    async (input: { purpose?: string }) =>
      input.purpose === 'times' || input.purpose === 'change'
        ? `https://example.com/d/clinic?for=${input.purpose}`
        : 'https://example.com/d/clinic'
  ),
}));

jest.mock('../../../../src/utils/booking-page-url', () => ({
  buildBookingPageUrl: jest.fn(
    (_conversationId: string, _doctorId: string, _slug?: string | null, purpose?: string) =>
      purpose === 'times' || purpose === 'change'
        ? `https://example.com/d/clinic?for=${purpose}`
        : 'https://example.com/d/clinic'
  ),
  buildPublicClinicPageUrl: jest.fn(() => 'https://example.com/d/clinic'),
}));

import { isPricingInquiryMessage } from '../../../../src/utils/consultation-fees';
import type { IntentDetectionResult } from '../../../../src/types/ai';
import type { Conversation } from '../../../../src/types/database';
import type { Message } from '../../../../src/types/database';
import type { ConversationState } from '../../../../src/types/conversation';
import type { DoctorSettingsRow } from '../../../../src/types/doctor-settings';
import { executeDmTurn } from '../../../../src/workers/dm/handle-turn';
import { handleInstagramVisitTurn } from '../../../../src/workers/dm/stages/instagram-visit-turn';
import type { DmTurnContext } from '../../../../src/workers/dm/stage-router';
import { renderInstagramVisitReply } from '../../../../src/utils/instagram-visit-replies';

const LINK = 'https://example.com/d/clinic';

const singleFee = {
  timezone: 'Asia/Kolkata',
  instagram_receptionist_paused: false,
  catalog_mode: 'single_fee',
  appointment_fee_minor: 50000,
  appointment_fee_currency: 'INR',
  public_slug: 'city-clinic',
  address_summary: '12 Market Road',
  share_address_on_instagram: true,
} as DoctorSettingsRow;

const manyFees = {
  ...singleFee,
  catalog_mode: 'multi_service',
} as DoctorSettingsRow;

const hiddenAddress = {
  ...singleFee,
  share_address_on_instagram: false,
} as DoctorSettingsRow;

function bubble(sender: 'patient' | 'system', content: string): Message {
  return {
    id: 'm',
    conversation_id: 'conv-1',
    platform_message_id: 'p',
    sender_type: sender,
    content,
    created_at: new Date(),
  };
}

function turn(
  text: string,
  recent: Message[],
  settings: DoctorSettingsRow,
  intent: IntentDetectionResult['intent'] = 'ask_question'
): DmTurnContext {
  const state: ConversationState = {
    step: 'responded',
    collectedFields: [],
    updatedAt: new Date().toISOString(),
  };
  const intentResult: IntentDetectionResult = { intent, confidence: 0.4 };
  return {
    state,
    conversation: {
      id: 'conv-1',
      patient_id: 'patient-1',
      doctor_id: 'doctor-1',
      platform: 'instagram',
      platform_conversation_id: 'sender-1',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    } as Conversation,
    doctorId: 'doctor-1',
    correlationId: 'corr-1',
    text,
    turnLanguage: 'en',
    recentMessages: recent,
    intentResult,
    doctorSettings: settings,
    doctorContext: { practice_name: 'City Clinic' },
    gateCtx: {
      state,
      recentMessages: recent,
      intentResult,
      doctorSettings: settings,
      text,
      turnLanguage: 'en',
      inCollection: false,
      conversationId: 'conv-1',
      patientId: 'patient-1',
      correlationId: 'corr-1',
      platform: 'instagram',
      doctorId: 'doctor-1',
    },
    inCollection: false,
    isBookIntent: intent === 'book_appointment',
    justStartingCollection: false,
    signalsFeePricing: isPricingInquiryMessage(text),
    feeIdleRoutedByAnaphora: false,
    feeComposerOpts: { language: 'en' },
    bookingFeeComposerOpts: { language: 'en' },
    teleconsultCatalogRowCount: 0,
    channelReplyPick: null,
    lastBotAskedForDetails: false,
    recentDmForClinical: [],
    timing: { dmGenerateMs: 0 },
    runGenerateResponse: jest.fn(async () => 'AI reply'),
    runGenerateResponseWithActions: jest.fn(async () => ({ reply: 'AI reply' })),
    buildAiContextForResponse: jest.fn(async () => ({}) as never),
    fallbackReply: 'fallback',
  };
}

function expectMenu(reply: string, greet: boolean): void {
  if (greet) {
    expect(reply.startsWith('Hi, please choose from the following:')).toBe(true);
    expect(reply).toContain('Reply STOP to stop these messages.');
  } else {
    expect(reply.startsWith('Please choose from the following:')).toBe(true);
    expect(reply).not.toContain('Hi,');
    expect(reply).not.toContain('STOP');
  }
  expect(reply).toContain('1. New visit / revisit / follow-up');
  expect(reply).toContain('2. Change or cancel a visit');
  expect(reply).toContain('3. Check availability');
  expect(reply).not.toContain(LINK);
  expect(reply).not.toMatch(/automated|consultation|appointment|booking|slot|token|queue/i);
}

function expectLink(reply: string, label: string, purpose?: 'times' | 'change'): void {
  const href = purpose ? `${LINK}?for=${purpose}` : LINK;
  expect(reply).toBe(`${label} ${href}`);
  expect(reply).not.toContain('Hi,');
  expect(reply).not.toContain('STOP');
  expect(reply).not.toMatch(/automated|consultation/i);
}

describe('instagram replies people actually send', () => {
  const prior = [bubble('system', 'Hi, please choose from the following:')];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('greets a first hi, then repeats the list without hi', async () => {
    for (const text of ['hi', 'hii', 'hiii', 'hello', 'helo', 'hey', 'namaste', 'gm', 'good morning', 'hi sir', 'hello doctor']) {
      const first = await handleInstagramVisitTurn(turn(text, [], singleFee, 'book_appointment'));
      expectMenu(first.reply, true);
      expect(first.reply).not.toMatch(/\?/);
    }

    for (const text of ['hello', 'hii', 'what', '???', 'yes', 'kuch bhi', '3pm']) {
      const later = await handleInstagramVisitTurn(turn(text, prior, singleFee));
      expectMenu(later.reply, false);
    }
  });

  it('sends one link for a number or the words people use', async () => {
    const visits = [
      '1',
      '1.',
      '1)',
      '1 please',
      'option 1',
      'no. 1',
      '1st',
      'new visit',
      'revisit',
      'follow up',
      'follow-up',
      'followup',
      'I want to book an appointment',
      'token chahiye',
      'queue',
      'naya visit',
      'new visit / revisit / follow-up',
    ];
    for (const text of visits) {
      const result = await handleInstagramVisitTurn(turn(text, prior, singleFee));
      expectLink(result.reply, 'New visit / revisit / follow-up:');
    }

    for (const text of ['2', '2nd', 'option 2', 'change', 'reschedule', 'change my visit', 'pls cancel', 'cancel appointment', 'change or cancel']) {
      const result = await handleInstagramVisitTurn(turn(text, prior, singleFee));
      expectLink(result.reply, 'Change or cancel a visit:', 'change');
    }
    const viewed = await handleInstagramVisitTurn(turn('my visit', prior, singleFee));
    expectLink(viewed.reply, 'View visits:', 'change');

    for (const text of ['3', '3rd', '3.', 'availability', 'check availability', 'timings', 'any slots today?', 'are you available today?', 'what time do you open', 'time kya hai', 'time batao']) {
      const result = await handleInstagramVisitTurn(turn(text, prior, singleFee));
      expectLink(result.reply, 'Availability:', 'times');
    }
  });

  it('states a visit fee only when asked, and only in single-fee mode', async () => {
    for (const text of ['fee?', 'fees', 'how much', 'how much is the consultation fee', 'kitna hai', 'kitni fees', 'charges']) {
      const single = await handleInstagramVisitTurn(turn(text, prior, singleFee));
      expect(single.reply).toBe('Visit fee: ₹500.');
      expect(single.reply).not.toMatch(/consultation|appointment|automated/i);
      expect(single.reply).not.toContain(LINK);

      const many = await handleInstagramVisitTurn(turn(text, prior, manyFees));
      expect(many.reply).toBe(`Fees: ${LINK}`);
    }

    const greeting = await handleInstagramVisitTurn(turn('hi', [], singleFee));
    expect(greeting.reply).not.toContain('Visit fee');
    expect(greeting.reply).not.toContain('₹');
  });

  it('stays quiet for thanks, ok, and emoji', async () => {
    for (const text of ['thanks', 'thank you', 'thankyou', 'ok', 'okay', 'okk', 'ok thanks', 'thanks 🙏', '👍', 'theek hai', 'shukriya']) {
      const result = await handleInstagramVisitTurn(turn(text, prior, singleFee));
      expect(result.reply).toBe('');
    }
    const mixed = await handleInstagramVisitTurn(turn('ok I want a visit', prior, singleFee));
    expectLink(mixed.reply, 'New visit / revisit / follow-up:');
  });

  it('does not answer a health question or share a hidden address', async () => {
    for (const text of ['I have fever what should I take', 'mere sir dard hai', 'pet dard', 'bukhar hai', 'khansi', 'ulti']) {
      const health = await handleInstagramVisitTurn(turn(text, prior, singleFee));
      expect(health.reply).toContain('Health questions are not answered here.');
      expect(health.reply).toContain('Please choose from the following:');
      expect(health.reply).not.toContain(LINK);
      expect(health.reply.startsWith('Hi,')).toBe(false);
      expect(health.reply.toLowerCase()).not.toContain(text.toLowerCase());
    }

    const firstHealth = await executeDmTurn(turn('i have chest pain', [], singleFee));
    expect(firstHealth.branch).toBe('emergency_safety');
    expect(firstHealth.reply).toContain('Health questions are not answered');
    expect(firstHealth.reply).toContain('Reply STOP to stop these messages.');
    expect(firstHealth.reply).not.toContain(LINK);
    expect(firstHealth.reply.toLowerCase()).not.toContain('112');

    const shared = await handleInstagramVisitTurn(turn('what is the address', prior, singleFee));
    expect(shared.reply).toBe('Address: 12 Market Road');
    const kahan = await handleInstagramVisitTurn(turn('kahan hai clinic', prior, singleFee));
    expect(kahan.reply).toBe('Address: 12 Market Road');

    const hidden = await handleInstagramVisitTurn(turn('where is the clinic', prior, hiddenAddress));
    expect(hidden.reply).toContain('Address is not shared in this chat.');
    expect(hidden.reply).not.toContain('12 Market Road');
    expect(hidden.reply).not.toContain(LINK);
  });

  it('turns messages off and on without saying automated', async () => {
    const stopped = await executeDmTurn(turn('STOP', prior, singleFee));
    expect(stopped.reply).toBe('Messages are off. Reply START to turn them back on.');
    expect(stopped.reply).not.toMatch(/automated/i);

    const optedOut = turn('hi', prior, singleFee);
    optedOut.gateCtx.automatedMessagingOptedOutAt = '2026-10-02T00:00:00.000Z';
    const quiet = await executeDmTurn(optedOut);
    expect(quiet.reply).toBe('');

    const start = turn('START', prior, singleFee);
    start.gateCtx.automatedMessagingOptedOutAt = '2026-10-02T00:00:00.000Z';
    const resumed = await executeDmTurn(start);
    expect(resumed.reply.startsWith('Messages are on.')).toBe(true);
    expect(resumed.reply).toContain('1. New visit / revisit / follow-up');
    expect(resumed.reply).not.toMatch(/automated/i);
  });

  it('does not send the menu when the clinic has paused replies', async () => {
    const paused = { ...singleFee, instagram_receptionist_paused: true } as DoctorSettingsRow;
    const result = await executeDmTurn(turn('I want to book an appointment', [], paused));
    expect(result.branch).toBe('receptionist_paused');
    expect(result.reply).toBe('Messages are paused here.');
    expect(result.reply).not.toContain(LINK);
  });

  it('keeps the same menu shape in Hindi and Punjabi', () => {
    expect(renderInstagramVisitReply({ kind: 'menu', language: 'hi', greet: true })).toContain(
      'नमस्ते, इनमें से चुनें:'
    );
    expect(renderInstagramVisitReply({ kind: 'menu', language: 'hi-Latn' })).toContain(
      'Inme se chunein:'
    );
    expect(renderInstagramVisitReply({ kind: 'menu', language: 'pa', greet: true })).toContain(
      'ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਇਹਨਾਂ ਵਿੱਚੋਂ ਚੁਣੋ:'
    );
    expect(renderInstagramVisitReply({ kind: 'fee', language: 'hi', feeAmount: '₹500' })).toBe(
      'Visit fee: ₹500.'
    );
    expect(renderInstagramVisitReply({ kind: 'health', language: 'hi-Latn' })).toContain(
      'Yahan health questions ka jawab nahi diya jata.'
    );
    expect(renderInstagramVisitReply({ kind: 'health', language: 'hi-Latn' })).toContain(
      'Inme se chunein:'
    );
  });
});
