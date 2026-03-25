/**
 * RBH-02: Webhook worker characterization tests — pin DM / comment branches before refactors.
 * All external I/O mocked; no Meta/OpenAI in CI.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Job } from 'bullmq';
import type { WebhookJobData } from '../../../src/types/queue';
import type { InstagramWebhookPayload } from '../../../src/types/webhook';
import { processWebhookJob } from '../../../src/workers/webhook-worker';
import * as idempotencyService from '../../../src/services/webhook-idempotency-service';
import * as auditLogger from '../../../src/utils/audit-logger';
import * as instagramService from '../../../src/services/instagram-service';
import * as instagramConnectService from '../../../src/services/instagram-connect-service';
import * as patientService from '../../../src/services/patient-service';
import * as conversationService from '../../../src/services/conversation-service';
import * as messageService from '../../../src/services/message-service';
import * as aiService from '../../../src/services/ai-service';
import * as appointmentService from '../../../src/services/appointment-service';
import * as paymentService from '../../../src/services/payment-service';
import * as doctorSettingsService from '../../../src/services/doctor-settings-service';
import * as consentService from '../../../src/services/consent-service';
import * as collectionService from '../../../src/services/collection-service';
import * as slotSelectionService from '../../../src/services/slot-selection-service';
import * as notificationService from '../../../src/services/notification-service';
import * as commentMediaService from '../../../src/services/comment-media-service';
import * as commentLeadService from '../../../src/services/comment-lead-service';
import * as patientMatchingService from '../../../src/services/patient-matching-service';
import * as queueConfig from '../../../src/config/queue';

jest.mock('../../../src/config/env', () => ({
  env: {
    REDIS_URL: '',
    WEBHOOK_WORKER_CONCURRENCY: 5,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-sr',
    INSTAGRAM_ACCESS_TOKEN: '',
  },
}));
jest.mock('../../../src/config/queue', () => ({
  isQueueEnabled: jest.fn().mockReturnValue(false),
  WEBHOOK_QUEUE_NAME: 'webhook-processing',
  tryAcquireConversationLock: jest.fn(async () => true),
  releaseConversationLock: jest.fn(async () => undefined),
  tryAcquireInstagramSendLock: jest.fn(async () => true),
  tryAcquireReplyThrottle: jest.fn(async () => true),
  tryAcquireInstagramDedupLock: jest.fn(async () => true),
}));
jest.mock('../../../src/services/webhook-metrics', () => ({
  classifyInstagramDmFailureReason: jest.fn().mockReturnValue('unknown'),
  logWebhookCommentPipeline: jest.fn(),
  logWebhookConflictRecovery: jest.fn(),
  logWebhookDmThrottleSkip: jest.fn(),
  logWebhookInstagramDmDelivery: jest.fn(),
  logWebhookJobDeadLetter: jest.fn(),
  logWebhookJobDequeued: jest.fn(),
  logWebhookJobWorkerFailure: jest.fn(),
  logWebhookJobWorkerSuccess: jest.fn(),
  logWebhookPaymentJobCompleted: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn(),
}));
jest.mock('../../../src/services/webhook-idempotency-service', () => ({
  markWebhookProcessed: jest.fn(),
  markWebhookFailed: jest.fn(),
}));
jest.mock('../../../src/services/dead-letter-service', () => ({
  storeDeadLetterWebhook: jest.fn(),
}));
jest.mock('../../../src/services/instagram-service', () => ({
  sendInstagramMessage: jest.fn(),
  getInstagramMessageSender: jest.fn(),
  getSenderFromMostRecentConversation: jest.fn(),
  replyToInstagramComment: jest.fn(),
  COMMENT_PUBLIC_REPLY_TEXT: 'Check your DM for more information.',
}));
jest.mock('../../../src/services/instagram-connect-service', () => ({
  getDoctorIdByPageId: jest.fn(),
  getDoctorIdByPageIds: jest.fn(),
  getInstagramAccessTokenForDoctor: jest.fn(),
  getStoredInstagramPageIdForDoctor: jest.fn(),
}));
jest.mock('../../../src/services/patient-service', () => ({
  findOrCreatePlaceholderPatient: jest.fn(),
  findPatientByIdWithAdmin: jest.fn(),
  createPatientForBooking: jest.fn(),
}));
jest.mock('../../../src/services/patient-matching-service', () => ({
  findPossiblePatientMatches: jest.fn(),
}));
jest.mock('../../../src/services/appointment-service', () => ({
  bookAppointment: jest.fn(),
  getAppointmentByIdForWorker: jest.fn(),
  listAppointmentsForPatient: jest.fn(),
}));
jest.mock('../../../src/services/conversation-service', () => ({
  findConversationByPlatformId: jest.fn(),
  createConversation: jest.fn(),
  getConversationState: jest.fn(),
  updateConversationState: jest.fn(),
  getOnlyInstagramConversationSenderId: jest.fn(),
  normalizeLegacySlotConversationSteps: jest.requireActual<
    typeof import('../../../src/services/conversation-service')
  >('../../../src/services/conversation-service').normalizeLegacySlotConversationSteps,
}));
jest.mock('../../../src/services/message-service', () => ({
  createMessage: jest.fn(),
  getRecentMessages: jest.fn(),
  getSenderIdByPlatformMessageId: jest.fn(),
}));
jest.mock('../../../src/services/ai-service', () => ({
  classifyIntent: jest.fn(),
  classifyCommentIntent: jest.fn(),
  isPossiblyMedicalComment: jest.fn(),
  generateResponse: jest.fn(),
  generateResponseWithActions: jest.fn(),
  redactPhiForAI: jest.fn((s: string) => s),
  parseMultiPersonBooking: jest.fn().mockReturnValue(null),
  AI_RECENT_MESSAGES_LIMIT: 30,
  MEDICAL_QUERY_RESPONSE: 'Please consult in person.',
  EMERGENCY_RESPONSE: 'Emergency.',
}));
jest.mock('../../../src/services/action-executor-service', () => ({
  executeAction: jest.fn(),
  parseToolCallToAction: jest.fn(),
}));
jest.mock('../../../src/services/collection-service', () => ({
  getInitialCollectionStep: jest.fn(),
  getCollectedData: jest.fn(),
  clearCollectedData: jest.fn(),
  validateAndApplyExtracted: jest.fn(),
  buildConfirmDetailsMessage: jest.fn(),
  tryRecoverAndSetFromMessages: jest.fn(),
}));
jest.mock('../../../src/services/consent-service', () => ({
  parseConsentReply: jest.fn(),
  persistPatientAfterConsent: jest.fn(),
  handleConsentDenied: jest.fn(),
  handleRevocation: jest.fn(),
}));
jest.mock('../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(),
  buildReschedulePageUrl: jest.fn(),
}));
jest.mock('../../../src/services/payment-service', () => ({
  processPaymentSuccess: jest.fn(),
  hasCapturedPaymentForAppointment: jest.fn(),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(),
}));
jest.mock('../../../src/services/notification-service', () => ({
  sendNewAppointmentToDoctor: jest.fn(),
  sendPaymentConfirmationToPatient: jest.fn(),
  sendPaymentReceivedToDoctor: jest.fn(),
  sendCommentLeadToDoctor: jest.fn(),
}));
jest.mock('../../../src/adapters/razorpay-adapter', () => ({
  razorpayAdapter: { parseSuccessPayload: jest.fn() },
}));
jest.mock('../../../src/adapters/paypal-adapter', () => ({
  paypalAdapter: { parseSuccessPayload: jest.fn() },
}));
jest.mock('../../../src/services/comment-media-service', () => ({
  resolveDoctorIdFromComment: jest.fn(),
}));
jest.mock('../../../src/services/comment-lead-service', () => ({
  createCommentLead: jest.fn(),
}));

const mockMarkProcessed = idempotencyService.markWebhookProcessed as jest.Mock;
const mockLogAudit = auditLogger.logAuditEvent as jest.Mock;
const mockSendMessage = instagramService.sendInstagramMessage as jest.Mock;
const mockReplyComment = instagramService.replyToInstagramComment as jest.Mock;

const TEST_DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_PATIENT_ID = 'patient-test-id';
const TEST_CONV_ID = 'conv-test-id';

function fakeJob(data: WebhookJobData): Job<WebhookJobData> {
  return {
    id: 'job-rbh',
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as unknown as Job<WebhookJobData>;
}

const dmPayload = (text: string, mid = 'mid.ch.test'): InstagramWebhookPayload => ({
  object: 'instagram',
  entry: [
    {
      id: 'page-entry-1',
      time: Math.floor(Date.now() / 1000),
      messaging: [
        {
          sender: { id: '987654321012345' },
          recipient: { id: '123456789012345' },
          timestamp: Math.floor(Date.now() / 1000),
          message: { mid, text },
        },
      ],
    },
  ],
});

describe('RBH-02 webhook worker characterization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(instagramConnectService.getDoctorIdByPageIds).mockResolvedValue(TEST_DOCTOR_ID);
    jest
      .mocked(instagramConnectService.getInstagramAccessTokenForDoctor)
      .mockResolvedValue('doctor-token');
    jest.mocked(instagramConnectService.getStoredInstagramPageIdForDoctor).mockResolvedValue('999888777666111');
    jest.mocked(patientService.findOrCreatePlaceholderPatient).mockResolvedValue({
      id: TEST_PATIENT_ID,
    } as never);
    jest.mocked(conversationService.findConversationByPlatformId).mockResolvedValue({
      id: TEST_CONV_ID,
      patient_id: TEST_PATIENT_ID,
      doctor_id: TEST_DOCTOR_ID,
      platform: 'instagram',
      platform_conversation_id: '987654321012345',
      status: 'active',
    } as never);
    jest.mocked(conversationService.createConversation).mockResolvedValue({
      id: TEST_CONV_ID,
      patient_id: TEST_PATIENT_ID,
      doctor_id: TEST_DOCTOR_ID,
      platform: 'instagram',
      platform_conversation_id: '987654321012345',
      status: 'active',
    } as never);
    jest.mocked(conversationService.getConversationState).mockResolvedValue({
      step: 'responded',
      lastIntent: undefined,
      collectedFields: [],
      updatedAt: new Date().toISOString(),
    } as never);
    jest.mocked(conversationService.updateConversationState).mockResolvedValue(undefined as never);
    jest.mocked(messageService.getRecentMessages).mockResolvedValue([] as never);
    jest.mocked(messageService.createMessage).mockResolvedValue(undefined as never);
    jest.mocked(aiService.classifyIntent).mockResolvedValue({ intent: 'other', confidence: 0.5 } as never);
    jest.mocked(aiService.generateResponse).mockResolvedValue('Default bot reply.' as never);
    jest.mocked(aiService.classifyCommentIntent).mockResolvedValue({
      intent: 'general_inquiry',
      confidence: 0.8,
    } as never);
    jest.mocked(aiService.isPossiblyMedicalComment).mockResolvedValue(false as never);
    jest.mocked(doctorSettingsService.getDoctorSettings).mockResolvedValue({
      timezone: 'UTC',
      practice_name: 'Test Clinic',
    } as never);
    jest.mocked(slotSelectionService.buildBookingPageUrl).mockReturnValue('https://book.test/link');
    jest.mocked(slotSelectionService.buildReschedulePageUrl).mockReturnValue('https://resched.test/link');
    jest.mocked(patientMatchingService.findPossiblePatientMatches).mockResolvedValue([] as never);
    jest.mocked(paymentService.hasCapturedPaymentForAppointment).mockResolvedValue(false as never);
    jest.mocked(appointmentService.listAppointmentsForPatient).mockResolvedValue([] as never);
    jest.mocked(collectionService.clearCollectedData).mockResolvedValue(undefined as never);
    jest.mocked(collectionService.getCollectedData).mockResolvedValue(null as never);
    jest.mocked(collectionService.tryRecoverAndSetFromMessages).mockResolvedValue(false as never);
    jest.mocked(commentLeadService.createCommentLead).mockResolvedValue({ id: 'lead-1' } as never);
    jest.mocked(commentMediaService.resolveDoctorIdFromComment).mockResolvedValue(TEST_DOCTOR_ID);
    jest.mocked(notificationService.sendCommentLeadToDoctor).mockResolvedValue(undefined as never);
    mockSendMessage.mockResolvedValue(undefined as never);
    mockReplyComment.mockResolvedValue({ replyId: 'reply-ig-1' } as never);
    mockMarkProcessed.mockResolvedValue(undefined as never);
    mockLogAudit.mockResolvedValue(undefined as never);
    jest.mocked(queueConfig.tryAcquireInstagramSendLock).mockResolvedValue(true as never);
    jest.mocked(queueConfig.tryAcquireReplyThrottle).mockResolvedValue(true as never);
  });

  describe('DM: receptionist paused (RBH-09)', () => {
    it('sends handoff message only; skips generateResponse', async () => {
      jest.mocked(doctorSettingsService.getDoctorSettings).mockResolvedValue({
        timezone: 'UTC',
        practice_name: 'Test Clinic',
        instagram_receptionist_paused: true,
      } as never);
      jest.mocked(aiService.classifyIntent).mockResolvedValue({
        intent: 'book_appointment',
        confidence: 1,
      } as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-pause-1',
          provider: 'instagram',
          payload: dmPayload('I want to book an appointment'),
          correlationId: 'corr-pause',
        })
      );

      expect(aiService.generateResponse).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        '987654321012345',
        expect.stringContaining('Automated scheduling is paused'),
        'corr-pause',
        'doctor-token'
      );
      expect(conversationService.updateConversationState).toHaveBeenCalledWith(
        TEST_CONV_ID,
        expect.objectContaining({ step: 'responded' }),
        'corr-pause'
      );
      expect(mockMarkProcessed).toHaveBeenCalledWith('evt-pause-1', 'instagram');
    });
  });

  describe('DM: consent granted → slot link (self booking)', () => {
    it('persists patient and moves to awaiting_slot_selection; outbound DM contains booking URL', async () => {
      jest.mocked(conversationService.getConversationState).mockResolvedValue({
        step: 'consent',
        bookingForSomeoneElse: false,
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      } as never);
      jest.mocked(messageService.getRecentMessages).mockResolvedValue([
        {
          sender_type: 'system',
          content: 'Do I have your consent to use these details? Reply yes to continue. Anything else to add?',
        },
      ] as never);
      jest.mocked(consentService.parseConsentReply).mockReturnValue('granted' as never);
      jest.mocked(collectionService.getCollectedData).mockResolvedValue({
        name: 'Test Patient',
        phone: '5550001234',
        reason_for_visit: 'annual check',
      } as never);
      jest.mocked(consentService.persistPatientAfterConsent).mockResolvedValue({ success: true } as never);
      jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue({
        medical_record_number: 'MRN-CH',
      } as never);
      jest.mocked(aiService.classifyIntent).mockResolvedValue({ intent: 'greeting', confidence: 1 } as never);

      const job = fakeJob({
        eventId: 'evt-consent-1',
        provider: 'instagram',
        payload: dmPayload('yes'),
        correlationId: 'corr-consent',
      });

      await processWebhookJob(job);

      expect(consentService.persistPatientAfterConsent).toHaveBeenCalled();
      expect(slotSelectionService.buildBookingPageUrl).toHaveBeenCalledWith(TEST_CONV_ID, TEST_DOCTOR_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(
        '987654321012345',
        expect.stringContaining('https://book.test/link'),
        'corr-consent',
        'doctor-token'
      );
      expect(conversationService.updateConversationState).toHaveBeenCalledWith(
        TEST_CONV_ID,
        expect.objectContaining({ step: 'awaiting_slot_selection' }),
        'corr-consent'
      );
      expect(mockMarkProcessed).toHaveBeenCalledWith('evt-consent-1', 'instagram');
    });
  });

  describe('DM: awaiting_match_confirmation', () => {
    it('yes uses first pending match and sends slot link', async () => {
      const matchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const matchB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      jest.mocked(conversationService.getConversationState).mockResolvedValue({
        step: 'awaiting_match_confirmation',
        pendingMatchPatientIds: [matchA, matchB],
        pendingSelfBooking: false,
        updatedAt: new Date().toISOString(),
      } as never);
      jest.mocked(aiService.classifyIntent).mockResolvedValue({ intent: 'unknown', confidence: 0 } as never);
      jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue({
        medical_record_number: 'MRN-A',
      } as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-match-yes',
          provider: 'instagram',
          payload: dmPayload('yes'),
          correlationId: 'corr-match',
        })
      );

      expect(collectionService.clearCollectedData).toHaveBeenCalledWith(TEST_CONV_ID);
      expect(slotSelectionService.buildBookingPageUrl).toHaveBeenCalledWith(TEST_CONV_ID, TEST_DOCTOR_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(
        '987654321012345',
        expect.stringContaining('https://book.test/link'),
        'corr-match',
        'doctor-token'
      );
      expect(conversationService.updateConversationState).toHaveBeenCalledWith(
        TEST_CONV_ID,
        expect.objectContaining({
          step: 'awaiting_slot_selection',
          bookingForPatientId: matchA,
        }),
        'corr-match'
      );
    });

    it('reply 2 uses second match id when two pending', async () => {
      const matchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const matchB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      jest.mocked(conversationService.getConversationState).mockResolvedValue({
        step: 'awaiting_match_confirmation',
        pendingMatchPatientIds: [matchA, matchB],
        updatedAt: new Date().toISOString(),
      } as never);
      jest.mocked(aiService.classifyIntent).mockResolvedValue({ intent: 'other', confidence: 0 } as never);
      jest.mocked(patientService.findPatientByIdWithAdmin).mockResolvedValue({
        medical_record_number: 'MRN-B',
      } as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-match-2',
          provider: 'instagram',
          payload: dmPayload('2'),
          correlationId: 'corr-match-2',
        })
      );

      expect(conversationService.updateConversationState).toHaveBeenCalledWith(
        TEST_CONV_ID,
        expect.objectContaining({
          bookingForPatientId: matchB,
          step: 'awaiting_slot_selection',
        }),
        'corr-match-2'
      );
    });
  });

  describe('DM: cancel / reschedule multi-appointment', () => {
    const future = new Date(Date.now() + 86400000 * 3).toISOString();
    const appt1 = '11111111-1111-1111-1111-111111111111';
    const appt2 = '22222222-2222-2222-2222-222222222222';

    it('awaiting_cancel_choice: user picks 1 → confirmation prompt with cancelAppointmentId', async () => {
      jest.mocked(conversationService.getConversationState).mockResolvedValue({
        step: 'awaiting_cancel_choice',
        pendingCancelAppointmentIds: [appt1, appt2],
        updatedAt: new Date().toISOString(),
      } as never);
      jest.mocked(appointmentService.getAppointmentByIdForWorker).mockResolvedValue({
        id: appt1,
        doctor_id: TEST_DOCTOR_ID,
        appointment_date: future,
        status: 'confirmed',
        patient_id: TEST_PATIENT_ID,
      } as never);
      jest.mocked(aiService.classifyIntent).mockResolvedValue({ intent: 'other', confidence: 0 } as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-cancel-pick',
          provider: 'instagram',
          payload: dmPayload('1'),
          correlationId: 'corr-cancel',
        })
      );

      expect(appointmentService.getAppointmentByIdForWorker).toHaveBeenCalledWith(appt1, 'corr-cancel');
      expect(mockSendMessage).toHaveBeenCalledWith(
        '987654321012345',
        expect.stringMatching(/cancel/i),
        'corr-cancel',
        'doctor-token'
      );
      expect(conversationService.updateConversationState).toHaveBeenCalledWith(
        TEST_CONV_ID,
        expect.objectContaining({
          step: 'awaiting_cancel_confirmation',
          cancelAppointmentId: appt1,
        }),
        'corr-cancel'
      );
    });

    it('awaiting_reschedule_choice: user picks 2 → awaiting_reschedule_slot with chosen id', async () => {
      jest.mocked(conversationService.getConversationState).mockResolvedValue({
        step: 'awaiting_reschedule_choice',
        pendingRescheduleAppointmentIds: [appt1, appt2],
        updatedAt: new Date().toISOString(),
      } as never);
      jest.mocked(appointmentService.getAppointmentByIdForWorker).mockResolvedValue({
        id: appt2,
        doctor_id: TEST_DOCTOR_ID,
        appointment_date: future,
        status: 'confirmed',
        patient_id: TEST_PATIENT_ID,
      } as never);
      jest.mocked(aiService.classifyIntent).mockResolvedValue({ intent: 'other', confidence: 0 } as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-resched-pick',
          provider: 'instagram',
          payload: dmPayload('2'),
          correlationId: 'corr-resched',
        })
      );

      expect(appointmentService.getAppointmentByIdForWorker).toHaveBeenCalledWith(appt2, 'corr-resched');
      expect(slotSelectionService.buildReschedulePageUrl).toHaveBeenCalledWith(
        TEST_CONV_ID,
        TEST_DOCTOR_ID,
        appt2
      );
      expect(conversationService.updateConversationState).toHaveBeenCalledWith(
        TEST_CONV_ID,
        expect.objectContaining({
          step: 'awaiting_reschedule_slot',
          rescheduleAppointmentId: appt2,
        }),
        'corr-resched'
      );
    });
  });

  describe('DM: send lock / reply throttle skip', () => {
    it('skips send when tryAcquireInstagramSendLock returns false; marks processed', async () => {
      jest.mocked(queueConfig.tryAcquireInstagramSendLock).mockResolvedValueOnce(false as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-throttle-send',
          provider: 'instagram',
          payload: dmPayload('hello'),
          correlationId: 'corr-throttle',
        })
      );

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockMarkProcessed).toHaveBeenCalledWith('evt-throttle-send', 'instagram');
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            skipped_send_throttle: true,
            event_id: 'evt-throttle-send',
          }),
        })
      );
    });

    it('skips send when tryAcquireReplyThrottle returns false', async () => {
      jest.mocked(queueConfig.tryAcquireReplyThrottle).mockResolvedValueOnce(false as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-throttle-reply',
          provider: 'instagram',
          payload: dmPayload('hi again'),
          correlationId: 'corr-throttle2',
        })
      );

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockMarkProcessed).toHaveBeenCalledWith('evt-throttle-reply', 'instagram');
    });
  });

  describe('Instagram comment webhook', () => {
    const commentPayload: WebhookJobData['payload'] = {
      object: 'instagram',
      entry: [
        {
          id: 'page-entry-comment',
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field: 'comments',
              value: {
                id: 'comment-id-99',
                text: 'Need to schedule visit',
                from: { id: '777666555444333' },
                media: { id: 'media-m1' },
              },
            },
          ],
        },
      ],
    };

    it('high-intent comment sends DM and public reply', async () => {
      jest
        .mocked(aiService.classifyCommentIntent)
        .mockResolvedValue({ intent: 'book_appointment', confidence: 0.95 } as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-comment-high',
          provider: 'instagram',
          payload: commentPayload,
          correlationId: 'corr-comment',
        })
      );

      expect(mockSendMessage).toHaveBeenCalledWith(
        '777666555444333',
        expect.any(String),
        'corr-comment',
        'doctor-token'
      );
      expect(mockReplyComment).toHaveBeenCalledWith(
        'comment-id-99',
        'Check your DM for more information.',
        'doctor-token',
        'corr-comment'
      );
      expect(mockMarkProcessed).toHaveBeenCalledWith('evt-comment-high', 'instagram');
    });

    it('vulgar intent skips outreach (no send, no public reply)', async () => {
      jest
        .mocked(aiService.classifyCommentIntent)
        .mockResolvedValue({ intent: 'vulgar', confidence: 0.99 } as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-comment-vulgar',
          provider: 'instagram',
          payload: commentPayload,
          correlationId: 'corr-vulgar',
        })
      );

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockReplyComment).not.toHaveBeenCalled();
      expect(mockMarkProcessed).toHaveBeenCalled();
    });

    it('spam overridden by second-stage medical check still outreaches', async () => {
      jest
        .mocked(aiService.classifyCommentIntent)
        .mockResolvedValue({ intent: 'spam', confidence: 0.8 } as never);
      jest.mocked(aiService.isPossiblyMedicalComment).mockResolvedValue(true as never);

      await processWebhookJob(
        fakeJob({
          eventId: 'evt-comment-med',
          provider: 'instagram',
          payload: commentPayload,
          correlationId: 'corr-med',
        })
      );

      expect(aiService.isPossiblyMedicalComment).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalled();
      expect(mockReplyComment).toHaveBeenCalled();
    });
  });
});
