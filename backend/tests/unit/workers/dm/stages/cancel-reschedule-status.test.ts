/**
 * rcp-04: Cancel / reschedule / status stage — isolated unit tests.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { readConversationState } from '../../../../../src/types/conversation-state-io';
import { cancelRescheduleStatusStage } from '../../../../../src/workers/dm/stages/cancel-reschedule-status';
import { isCancelRescheduleStatusTurn } from '../../../../../src/workers/dm/stages/cancel-reschedule-status-predicate';
import { resolveStage } from '../../../../../src/workers/dm/stage-router';
import type { DmTurnContext } from '../../../../../src/workers/dm/stage-router';
import type { Conversation } from '../../../../../src/types/database';

jest.mock('../../../../../src/services/appointment-service', () => ({
  getAppointmentByIdForWorker: jest.fn(),
}));

jest.mock('../../../../../src/services/webhook-appointment-helpers', () => ({
  buildRelatedPatientIdsForWebhook: jest.fn(() => ['patient-1']),
  getMergedUpcomingAppointmentsForRelatedPatients: jest.fn(),
}));

jest.mock('../../../../../src/services/payment-service', () => ({
  hasCapturedPaymentForAppointment: jest.fn(async () => false),
}));

jest.mock('../../../../../src/services/action-executor-service', () => ({
  executeAction: jest.fn(async () => ({ success: true, replyOverride: 'Cancelled.', stateUpdate: { step: 'responded' } })),
  parseToolCallToAction: jest.fn(),
}));

jest.mock('../../../../../src/services/slot-selection-service', () => ({
  buildReschedulePageUrl: jest.fn(() => 'https://example.com/reschedule'),
}));

import { getAppointmentByIdForWorker } from '../../../../../src/services/appointment-service';
import { getMergedUpcomingAppointmentsForRelatedPatients } from '../../../../../src/services/webhook-appointment-helpers';
import { executeAction } from '../../../../../src/services/action-executor-service';

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

describe('cancelRescheduleStatusStage', () => {
  const future = new Date(Date.now() + 86400000 * 3).toISOString();
  const appt1 = '11111111-1111-1111-1111-111111111111';
  const appt2 = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('awaiting_cancel_choice + "2" → picks 2nd appt, transitions to awaiting_cancel_confirmation', async () => {
    jest.mocked(getAppointmentByIdForWorker).mockResolvedValue({
      id: appt2,
      doctor_id: 'doctor-1',
      appointment_date: future,
      status: 'confirmed',
    } as never);

    const ctx = minimalTurnCtx({
      state: readConversationState({
        step: 'awaiting_cancel_choice',
        pendingCancelAppointmentIds: [appt1, appt2],
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      }),
      text: '2',
    });

    const result = await cancelRescheduleStatusStage.handle(ctx);
    expect(result.branch).toBe('cancel_flow_numeric');
    expect(getAppointmentByIdForWorker).toHaveBeenCalledWith(appt2, 'corr-1');
    expect(result.nextState.step).toBe('awaiting_cancel_confirmation');
    expect(result.nextState.cancel?.appointmentId).toBe(appt2);
    expect(result.reply).toMatch(/cancel/i);
  });

  it('awaiting_cancel_confirmation + "yes" → confirm_cancel tool → cancels, branch cancel_flow_confirm', async () => {
    const ctx = minimalTurnCtx({
      state: readConversationState({
        step: 'awaiting_cancel_confirmation',
        cancelAppointmentId: appt1,
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      }),
      text: 'yes',
    });

    const result = await cancelRescheduleStatusStage.handle(ctx);
    expect(result.branch).toBe('cancel_flow_confirm');
    expect(executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'confirm_cancel', confirm: true }),
      expect.any(Object)
    );
    expect(result.reply).toBe('Cancelled.');
  });

  it('intent cancel_appointment with one upcoming → lists / confirms', async () => {
    jest.mocked(getMergedUpcomingAppointmentsForRelatedPatients).mockResolvedValue([
      {
        id: appt1,
        patient_id: 'patient-1',
        appointment_date: future,
        consultation_type: 'in_clinic',
      },
    ] as never);

    const ctx = minimalTurnCtx({
      intentResult: { intent: 'cancel_appointment', confidence: 1 },
      text: 'cancel my appointment',
    });

    const result = await cancelRescheduleStatusStage.handle(ctx);
    expect(result.branch).toBe('cancel_appointment_intent');
    expect(result.nextState.step).toBe('awaiting_cancel_confirmation');
    expect(result.nextState.cancel?.appointmentId).toBe(appt1);
    expect(result.reply).toMatch(/cancel/i);
  });

  it('intent reschedule_appointment → reschedule link/choice', async () => {
    jest.mocked(getMergedUpcomingAppointmentsForRelatedPatients).mockResolvedValue([
      {
        id: appt1,
        patient_id: 'patient-1',
        appointment_date: future,
        consultation_type: 'in_clinic',
      },
    ] as never);

    const ctx = minimalTurnCtx({
      intentResult: { intent: 'reschedule_appointment', confidence: 1 },
      text: 'reschedule please',
    });

    const result = await cancelRescheduleStatusStage.handle(ctx);
    expect(result.branch).toBe('reschedule_appointment_intent');
    expect(result.nextState.step).toBe('awaiting_reschedule_slot');
    expect(result.reply).toMatch(/reschedule|example\.com/i);
  });

  it('check_appointment_status → merged upcoming summary', async () => {
    jest.mocked(getMergedUpcomingAppointmentsForRelatedPatients).mockResolvedValue([
      {
        id: appt1,
        patient_id: 'patient-1',
        patient_name: 'Alex',
        appointment_date: future,
        status: 'confirmed',
      },
    ] as never);

    const ctx = minimalTurnCtx({
      intentResult: { intent: 'check_appointment_status', confidence: 1 },
      text: 'when is my appointment',
    });

    const result = await cancelRescheduleStatusStage.handle(ctx);
    expect(result.branch).toBe('check_appointment_status');
    expect(result.reply).toMatch(/next appointment/i);
    expect(result.nextState.step).toBe('responded');
  });

  it('post-redirect "thanks" → post_booking_ack', async () => {
    const ctx = minimalTurnCtx({
      state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
      intentResult: { intent: 'unknown', confidence: 1 },
      text: 'thanks',
      recentMessages: [
        { sender_type: 'patient', content: 'booked' } as never,
        {
          sender_type: 'system',
          content: 'Your appointment is confirmed. Please pay here: https://pay.example.com',
        } as never,
      ],
    });

    const result = await cancelRescheduleStatusStage.handle(ctx);
    expect(result.branch).toBe('post_booking_ack');
    expect(result.reply).toMatch(/all set/i);
  });

  it('resolveStage routes ONLY cancel/reschedule/status triggers here; idle fee/greeting turn idle_fee_triage', () => {
    expect(
      resolveStage(
        minimalTurnCtx({
          intentResult: { intent: 'book_appointment', confidence: 1 },
          isBookIntent: true,
          justStartingCollection: true,
          text: 'book appointment',
        })
      )
    ).toBe('booking_entry');

    expect(
      resolveStage(
        minimalTurnCtx({
          intentResult: { intent: 'greeting', confidence: 1 },
          text: 'hello',
        })
      )
    ).toBe('idle_fee_triage');

    expect(
      resolveStage(
        minimalTurnCtx({
          signalsFeePricing: true,
          text: 'how much is the consultation',
        })
      )
    ).toBe('idle_fee_triage');

    expect(
      resolveStage(
        minimalTurnCtx({
          state: readConversationState({
            step: 'awaiting_cancel_choice',
            pendingCancelAppointmentIds: [appt1],
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          }),
          text: '1',
        })
      )
    ).toBe('cancel_reschedule_status');

    expect(
      isCancelRescheduleStatusTurn(
        minimalTurnCtx({ intentResult: { intent: 'cancel_appointment', confidence: 1 } })
      )
    ).toBe(true);
  });
});
