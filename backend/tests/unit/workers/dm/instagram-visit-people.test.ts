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

jest.mock('../../../../src/services/instagram-connect-service', () => ({
  getConnectedInstagramDisplayName: jest.fn(async () => 'Halo Aid Test'),
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

function bubble(sender: 'patient' | 'system', content: string, ageMs = 0): Message {
  return {
    id: 'm',
    conversation_id: 'conv-1',
    platform_message_id: 'p',
    sender_type: sender,
    content,
    created_at: new Date(Date.now() - ageMs),
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

const FIRST = [
  'Hello.',
  "Please continue on Halo Aid Test's page:",
  LINK,
  'Reply STOP to stop these automated replies.',
].join('\n');

const LATER = ['Hello.', "Please continue on Halo Aid Test's page:", LINK].join('\n');

function expectContinue(reply: string, first: boolean): void {
  expect(reply).toBe(first ? FIRST : LATER);
  const spoken = reply.replace(LINK, '');
  expect(spoken.toLowerCase()).not.toMatch(/health|clinic|medical|appointment|booking|slot|token|queue/);
}

describe('instagram replies people actually send', () => {
  const recent = [bubble('system', FIRST)];
  const stale = [bubble('system', FIRST, 2 * 60 * 60 * 1000)];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends one named link, with STOP only the first time', async () => {
    for (const text of ['hi', '1', 'fee?', 'where is the clinic', 'I have fever', 'book']) {
      const first = await handleInstagramVisitTurn(turn(text, [], singleFee));
      expectContinue(first.reply, true);
    }
    const again = await handleInstagramVisitTurn(turn('hello', stale, manyFees));
    expectContinue(again.reply, false);
    const hidden = await handleInstagramVisitTurn(turn('address', stale, hiddenAddress));
    expectContinue(hidden.reply, false);
    expect(hidden.reply).not.toContain('12 Market Road');
  });

  it('stays quiet for an hour, and for thanks, ok, and emoji', async () => {
    const withinHour = await handleInstagramVisitTurn(turn('hi again', recent, singleFee));
    expect(withinHour.reply).toBe('');
    for (const text of ['thanks', 'ok', '👍', 'theek hai']) {
      const quiet = await handleInstagramVisitTurn(turn(text, stale, singleFee));
      expect(quiet.reply).toBe('');
    }
    const mixed = await handleInstagramVisitTurn(turn('ok I want a visit', stale, singleFee));
    expectContinue(mixed.reply, false);
  });

  it('sends the same link for a symptom, with no health wording', async () => {
    const result = await executeDmTurn(turn('i have chest pain', [], singleFee));
    expect(result.branch).toBe('greeting_template');
    expectContinue(result.reply, true);
    expect(result.reply.toLowerCase()).not.toContain('112');
    expect(result.reply.toLowerCase()).not.toContain('chest');
  });

  it('turns messages off and on', async () => {
    const stopped = await executeDmTurn(turn('STOP', recent, singleFee));
    expect(stopped.reply).toBe('Messages are off. Reply START to turn them back on.');

    const optedOut = turn('hi', recent, singleFee);
    optedOut.gateCtx.automatedMessagingOptedOutAt = '2026-10-02T00:00:00.000Z';
    const quiet = await executeDmTurn(optedOut);
    expect(quiet.reply).toBe('');

    const start = turn('START', recent, singleFee);
    start.gateCtx.automatedMessagingOptedOutAt = '2026-10-02T00:00:00.000Z';
    const resumed = await executeDmTurn(start);
    expect(resumed.reply.startsWith('Messages are on.')).toBe(true);
    expect(resumed.reply).toContain('Please continue on this page:');
    expect(resumed.reply).toContain(LINK);
    expect(resumed.reply).not.toContain('STOP');
  });

  it('does not send the link when the clinic has paused replies', async () => {
    const paused = { ...singleFee, instagram_receptionist_paused: true } as DoctorSettingsRow;
    const result = await executeDmTurn(turn('I want a visit', [], paused));
    expect(result.branch).toBe('receptionist_paused');
    expect(result.reply).toBe('Messages are paused here.');
    expect(result.reply).not.toContain(LINK);
  });
});
