/**
 * rcp-03: Stage router scaffold — resolveStage + STAGE_ROUTER wiring.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  resolveStage,
  STAGE_ROUTER,
  type DmTurnContext,
} from '../../../src/workers/dm/stage-router';
import { CONTROL_GATES } from '../../../src/workers/dm/control-gates';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  resolveRoutingBranchForFixture,
  type DmRoutingFixtureWhen,
} from '../../../src/utils/dm-routing-fixture-resolve';
import type { Conversation } from '../../../src/types/database';

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
    intentResult: { intent: 'greeting', confidence: 1 },
    doctorSettings: { timezone: 'Asia/Kolkata', instagram_receptionist_paused: false } as never,
    doctorContext: undefined,
    gateCtx: {
      state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
      recentMessages: [],
      intentResult: { intent: 'greeting', confidence: 1 },
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

const IDLE_FEE_TRIAGE_BRANCHES = new Set([
  'medical_safety',
  'fee_deterministic_idle',
  'fee_deterministic_mid_collection',
  'greeting_template',
  'fee_book_misclassified_idle',
]);

const BOOKING_FUNNEL_BRANCHES = new Set([
  'booking_collection',
  'confirm_details',
  'confirm_details_complaint_clarify',
  'consent_flow',
  'consent_correction_back',
  'recording_consent_flow',
  'recording_consent_injected',
  'slot_selection',
  'learning_policy_autobook',
]);

const BOOKING_ENTRY_BRANCHES = new Set([
  'consultation_channel_pick',
  'consultation_channel_pick_reason_first',
  'book_for_someone_else',
  'booking_start_ai',
  'booking_start_returning_reason',
  'booking_start_returning_ready',
  'booking_continue_ai',
  'booking_start_reason_first',
  'book_responded',
  'book_responded_reason_first',
  'reason_first_triage_ask_more',
  'fee_ambiguous_visit_type_staff',
]);

function expectedStageForFixtureBranch(branch: string): string {
  if (IDLE_FEE_TRIAGE_BRANCHES.has(branch)) return 'idle_fee_triage';
  if (BOOKING_FUNNEL_BRANCHES.has(branch)) return 'booking_funnel';
  if (BOOKING_ENTRY_BRANCHES.has(branch)) return 'booking_entry';
  return 'ai_open_response';
}

describe('STAGE_ROUTER scaffold (rcp-03 / rcp-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolveStage routes idle/fee/medical/greeting fixtures to idle_fee_triage (rcp-05)', () => {
    const fixtureDir = join(__dirname, '../../fixtures/dm-transcripts');
    const files = readdirSync(fixtureDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, file), 'utf-8')) as {
        expectedBranch: string;
        when: DmRoutingFixtureWhen;
      };
      if (fixture.when.treat_as_emergency) {
        continue;
      }
      const ctx = minimalTurnCtx({
        intentResult: {
          intent: fixture.when.intent ?? 'unknown',
          confidence: 1,
        },
        inCollection: fixture.when.in_collection ?? false,
        signalsFeePricing:
          fixture.when.signals_fee_pricing ??
          (fixture.when.book_misclassified_pricing_only ? true : false),
        isBookIntent: fixture.when.intent === 'book_appointment',
        justStartingCollection: fixture.when.book_misclassified_pricing_only ?? false,
      });
      expect(resolveStage(ctx)).toBe(expectedStageForFixtureBranch(fixture.expectedBranch));
    }
  });

  it('CONTROL_GATES order remains revoke → paused → emergency (rcp-02 intact)', () => {
    expect(CONTROL_GATES.map((g) => g.name)).toEqual([
      'revoke_consent',
      'receptionist_paused',
      'emergency_safety',
    ]);
  });

  it('STAGE_ROUTER exposes all rcp-04..08 stages (no legacy)', () => {
    expect(Object.keys(STAGE_ROUTER).sort()).toEqual([
      'ai_open_response',
      'booking_entry',
      'booking_funnel',
      'cancel_reschedule_status',
      'idle_fee_triage',
      'service_match',
    ]);
    expect(STAGE_ROUTER.ai_open_response.stage).toBe('ai_open_response');
    expect(STAGE_ROUTER.booking_entry.stage).toBe('booking_entry');
  });

  it('resolveStage + fixture partial resolver stay aligned on branch labels', () => {
    const fixtureDir = join(__dirname, '../../fixtures/dm-transcripts');
    for (const file of readdirSync(fixtureDir).filter((f) => f.endsWith('.json'))) {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, file), 'utf-8')) as {
        expectedBranch: string;
        when: DmRoutingFixtureWhen;
      };
      const got = resolveRoutingBranchForFixture(fixture.when);
      expect(got).toBe(fixture.expectedBranch);
    }
  });

  it('resolveStage default is ai_open_response (rcp-08)', () => {
    const ctx = minimalTurnCtx({
      intentResult: { intent: 'unknown', confidence: 1 },
      text: 'random question',
    });
    expect(resolveStage(ctx)).toBe('ai_open_response');
    expect(STAGE_ROUTER.ai_open_response).toBeDefined();
    expect(typeof STAGE_ROUTER.ai_open_response.handle).toBe('function');
  });
});
