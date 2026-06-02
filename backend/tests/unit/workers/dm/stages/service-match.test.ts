/**
 * rcp-06: Service-match / staff-review / clarification stage — isolated unit tests.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://example.com/book'),
}));

jest.mock('../../../../../src/services/patient-service', () => ({
  createPatientForBooking: jest.fn(async () => ({ id: 'new-patient', medical_record_number: null })),
}));

jest.mock('../../../../../src/utils/staff-service-review-dm', () => ({
  formatStaffServiceReviewStillPendingDm: jest.fn(() => 'Staff review pending copy'),
  formatAwaitingStaffServiceConfirmationDm: jest.fn(() => 'Awaiting staff confirmation'),
}));

jest.mock('../../../../../src/services/service-catalog-matcher', () => ({
  matchServiceCatalogOffering: jest.fn(async () => null),
}));

jest.mock('../../../../../src/services/collection-service', () => ({
  getCollectedData: jest.fn(async () => ({
    name: 'Priya Sharma',
    phone: '+919876543210',
    reason_for_visit: 'headache',
  })),
  clearCollectedData: jest.fn(async () => undefined),
  tryRecoverAndSetFromMessages: jest.fn(async () => false),
}));

jest.mock('../../../../../src/config/env', () => ({
  env: {
    RETURNING_PATIENT_MEMORY_ENABLED: false,
    LOG_LEVEL: 'info',
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
  },
}));

import { readConversationState } from '../../../../../src/types/conversation-state-io';
import { serviceMatchStage } from '../../../../../src/workers/dm/stages/service-match';
import { isServiceMatchTurn } from '../../../../../src/workers/dm/stages/service-match-predicate';
import { resolveStage } from '../../../../../src/workers/dm/stage-router';
import type { DmTurnContext } from '../../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../../src/types/database';
import { formatStaffServiceReviewStillPendingDm } from '../../../../../src/utils/staff-service-review-dm';
import { deterministicServiceIdForLegacyOffering } from '../../../../../src/utils/service-catalog-schema';
import { matchServiceCatalogOffering } from '../../../../../src/services/service-catalog-matcher';

const catalogFixture = {
  version: 1 as const,
  services: [
    {
      service_id: deterministicServiceIdForLegacyOffering('doctor-1', 'follow_up'),
      service_key: 'follow_up',
      label: 'Follow-up Consultation',
      modalities: { video: { enabled: true, price_minor: 50_000 } },
    },
  ],
};

function minimalTurnCtx(overrides: Partial<DmTurnContext> = {}): DmTurnContext {
  return {
    state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
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
    text: 'hello',
    recentMessages: [],
    intentResult: { intent: 'unknown', confidence: 1 },
    doctorSettings: { timezone: 'Asia/Kolkata', instagram_receptionist_paused: false } as never,
    doctorContext: undefined,
    gateCtx: {
      state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
      recentMessages: [],
      intentResult: { intent: 'unknown', confidence: 1 },
      doctorSettings: null,
      text: 'hello',
      inCollection: false,
      conversationId: 'conv-1',
      patientId: 'patient-1',
      correlationId: 'corr-1',
    },
    inCollection: false,
    isBookIntent: false,
    justStartingCollection: false,
    signalsFeePricing: false,
    feeIdleRoutedByAnaphora: false,
    feeComposerOpts: {},
    bookingFeeComposerOpts: {},
    teleconsultCatalogRowCount: 1,
    channelReplyPick: null,
    lastBotAskedForDetails: false,
    recentDmForClinical: [],
    timing: { dmGenerateMs: 0 },
    runGenerateResponse: jest.fn(async () => 'AI reply'),
    runGenerateResponseWithActions: jest.fn(async () => ({ reply: 'AI reply' })),
    buildAiContextForResponse: jest.fn(async () => ({})),
    fallbackReply: 'fallback',
    ...overrides,
  };
}

describe('serviceMatchStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('awaiting_staff_service_confirmation → staff_service_review_pending', async () => {
    const ctx = minimalTurnCtx({
      state: {
        step: 'awaiting_staff_service_confirmation',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      },
    });

    const result = await serviceMatchStage.handle(ctx);
    expect(result.branch).toBe('staff_service_review_pending');
    expect(formatStaffServiceReviewStillPendingDm).toHaveBeenCalled();
    expect(result.reply).toBe('Staff review pending copy');
  });

  it('awaiting_match_confirmation + yes → patient_match_confirmation', async () => {
    const ctx = minimalTurnCtx({
      state: readConversationState({
        step: 'awaiting_match_confirmation',
        pendingMatchPatientIds: ['p-1'],
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      }),
      text: 'yes',
    });

    const result = await serviceMatchStage.handle(ctx);
    expect(result.branch).toBe('patient_match_confirmation');
    expect(result.nextState.step).toBe('awaiting_slot_selection');
    expect(result.nextState.bookingForOther?.bookingForPatientId).toBe('p-1');
  });

  it('resolveStage routes step-gated turns here; bare yes without pending matches stays legacy', () => {
    expect(
      resolveStage(
        minimalTurnCtx({
          state: {
            step: 'awaiting_staff_service_confirmation',
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          },
        })
      )
    ).toBe('service_match');

    expect(
      resolveStage(
        minimalTurnCtx({
          state: {
            step: 'awaiting_complaint_clarification',
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          },
          text: 'headache only',
        })
      )
    ).toBe('service_match');

    expect(
      resolveStage(
        minimalTurnCtx({
          text: 'yes',
          recentMessages: [
            {
              sender_type: 'system',
              content: 'Is this the same patient as before?',
            } as never,
          ],
        })
      )
    ).toBe('ai_open_response');

    expect(
      isServiceMatchTurn(
        minimalTurnCtx({
          state: readConversationState({
            step: 'awaiting_match_confirmation',
            pendingMatchPatientIds: ['p-1'],
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          }),
        })
      )
    ).toBe(true);
  });

  it('awaiting_followup_service_confirmation + yes → returning_followup_confirm_accept (rcp-23)', async () => {
    const ctx = minimalTurnCtx({
      text: 'yes',
      doctorSettings: {
        timezone: 'Asia/Kolkata',
        doctor_id: 'doctor-1',
        service_offerings_json: catalogFixture,
      } as never,
      state: {
        step: 'awaiting_followup_service_confirmation',
        collectedFields: ['name', 'phone', 'reason_for_visit'],
        serviceMatch: {
          matcherProposedCatalogServiceKey: 'follow_up',
          matcherProposedCatalogServiceId: catalogFixture.services[0].service_id,
        },
        updatedAt: new Date().toISOString(),
      },
    });

    const result = await serviceMatchStage.handle(ctx);
    expect(result.branch).toBe('returning_followup_confirm_accept');
    expect(result.nextState.step).toBe('consent');
    expect(result.nextState.serviceMatch?.catalogServiceKey).toBe('follow_up');
    expect(result.nextState.serviceMatch?.serviceSelectionFinalized).toBe(true);
  });

  it('awaiting_followup_service_confirmation + no → returning_followup_confirm_decline runs matcher (rcp-23)', async () => {
    jest.mocked(matchServiceCatalogOffering).mockResolvedValue({
      catalogServiceKey: 'follow_up',
      catalogServiceId: catalogFixture.services[0].service_id,
      confidence: 'high',
      source: 'test',
      reasonCodes: ['catalog_allowlist_match'],
      autoFinalize: true,
      pendingStaffReview: false,
    } as never);

    const ctx = minimalTurnCtx({
      text: 'no',
      doctorSettings: {
        timezone: 'Asia/Kolkata',
        doctor_id: 'doctor-1',
        service_offerings_json: catalogFixture,
      } as never,
      state: {
        step: 'awaiting_followup_service_confirmation',
        booking: { reasonForVisit: 'new headache' },
        serviceMatch: {
          matcherProposedCatalogServiceKey: 'follow_up',
        },
        updatedAt: new Date().toISOString(),
      },
    });

    const result = await serviceMatchStage.handle(ctx);
    expect(result.branch).toBe('returning_followup_confirm_decline');
    expect(matchServiceCatalogOffering).toHaveBeenCalled();
    expect(result.nextState.step).toBe('consent');
  });
});
