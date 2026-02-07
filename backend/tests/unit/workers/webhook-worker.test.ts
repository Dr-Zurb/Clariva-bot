/**
 * Webhook Worker Unit Tests (Task 7)
 *
 * Tests worker lifecycle when REDIS_URL is not set (no-op), stop when not started,
 * and job processing / error handling (3.3): invalid payload, Instagram API error,
 * retry then dead letter, handleWebhookJobFailed. Section 4: retry logic (transient error,
 * success after retry, max retries → dead letter, error and audit logging).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Job } from 'bullmq';
import type { WebhookJobData } from '../../../src/types/queue';
import type { InstagramWebhookPayload } from '../../../src/types/webhook';
import {
  startWebhookWorker,
  stopWebhookWorker,
  getWebhookWorker,
  processWebhookJob,
  handleWebhookJobFailed,
} from '../../../src/workers/webhook-worker';
import * as idempotencyService from '../../../src/services/webhook-idempotency-service';
import * as auditLogger from '../../../src/utils/audit-logger';
import * as instagramService from '../../../src/services/instagram-service';
import * as instagramConnectService from '../../../src/services/instagram-connect-service';
import * as deadLetterService from '../../../src/services/dead-letter-service';
import * as patientService from '../../../src/services/patient-service';
import * as conversationService from '../../../src/services/conversation-service';
import * as messageService from '../../../src/services/message-service';
import * as aiService from '../../../src/services/ai-service';

jest.mock('../../../src/config/env', () => ({
  env: {
    REDIS_URL: '',
    WEBHOOK_WORKER_CONCURRENCY: 5,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  },
}));
jest.mock('../../../src/config/queue', () => ({
  isQueueEnabled: jest.fn().mockReturnValue(false),
  WEBHOOK_QUEUE_NAME: 'webhook-processing',
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
}));
jest.mock('../../../src/services/instagram-connect-service', () => ({
  getDoctorIdByPageId: jest.fn(),
}));
jest.mock('../../../src/services/patient-service', () => ({
  findOrCreatePlaceholderPatient: jest.fn(),
  findPatientByIdWithAdmin: jest.fn(),
}));
jest.mock('../../../src/services/availability-service', () => ({
  getAvailableSlots: jest.fn(),
}));
jest.mock('../../../src/services/appointment-service', () => ({
  bookAppointment: jest.fn(),
}));
jest.mock('../../../src/services/conversation-service', () => ({
  findConversationByPlatformId: jest.fn(),
  createConversation: jest.fn(),
  getConversationState: jest.fn(),
  updateConversationState: jest.fn(),
}));
jest.mock('../../../src/services/message-service', () => ({
  createMessage: jest.fn(),
  getRecentMessages: jest.fn(),
}));
jest.mock('../../../src/services/ai-service', () => ({
  classifyIntent: jest.fn(),
  generateResponse: jest.fn(),
}));
jest.mock('../../../src/services/collection-service', () => ({
  getNextCollectionField: jest.fn(),
  validateAndApply: jest.fn(),
  getInitialCollectionStep: jest.fn(),
  hasAllRequiredFields: jest.fn(),
}));
jest.mock('../../../src/services/consent-service', () => ({
  parseConsentReply: jest.fn(),
  persistPatientAfterConsent: jest.fn(),
  handleConsentDenied: jest.fn(),
  handleRevocation: jest.fn(),
}));

const mockMarkProcessed = idempotencyService.markWebhookProcessed as jest.Mock;
const mockMarkFailed = idempotencyService.markWebhookFailed as jest.Mock;
const mockLogAudit = auditLogger.logAuditEvent as jest.Mock;
const mockSendMessage = instagramService.sendInstagramMessage as jest.Mock;
const mockStoreDeadLetter = deadLetterService.storeDeadLetterWebhook as jest.Mock;

function fakeJob(data: WebhookJobData, attemptsMade = 0, maxAttempts = 3): Job<WebhookJobData> {
  return {
    id: 'job-1',
    data,
    attemptsMade,
    opts: { attempts: maxAttempts },
  } as unknown as Job<WebhookJobData>;
}

const TEST_DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_PATIENT_ID = 'patient-test-id';
const TEST_CONV_ID = 'conv-test-id';

describe('Webhook Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(instagramConnectService.getDoctorIdByPageId)
      .mockResolvedValue(TEST_DOCTOR_ID);
    jest.mocked(patientService.findOrCreatePlaceholderPatient).mockResolvedValue({
      id: TEST_PATIENT_ID,
    } as never);
    jest.mocked(conversationService.findConversationByPlatformId).mockResolvedValue(null as never);
    jest.mocked(conversationService.createConversation).mockResolvedValue({
      id: TEST_CONV_ID,
      patient_id: TEST_PATIENT_ID,
      doctor_id: TEST_DOCTOR_ID,
      platform: 'instagram',
      platform_conversation_id: '987654321',
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
    jest.mocked(aiService.classifyIntent).mockResolvedValue({ intent: 'other' } as never);
    jest.mocked(aiService.generateResponse).mockResolvedValue('Reply text' as never);
  });

  describe('5.1.3 Worker lifecycle when REDIS_URL unset', () => {
    it('startWebhookWorker returns null when queue is disabled', () => {
      const result = startWebhookWorker();
      expect(result).toBeNull();
    });

    it('getWebhookWorker returns null when worker not started', () => {
      expect(getWebhookWorker()).toBeNull();
    });

    it('stopWebhookWorker does not throw when worker was never started', async () => {
      await expect(stopWebhookWorker()).resolves.not.toThrow();
    });
  });

  describe('3.3 Worker processing errors', () => {
    const validPayload: InstagramWebhookPayload = {
      object: 'instagram',
      entry: [
        {
          id: 'evt_3_3',
          time: Math.floor(Date.now() / 1000),
          messaging: [
            {
              sender: { id: '987654321' },
              recipient: { id: '123456789' },
              timestamp: Math.floor(Date.now() / 1000),
              message: { mid: 'mid.test.1', text: 'PATIENT_TEST' },
            },
          ],
        },
      ],
    };

    it('3.3.1 invalid payload (no message): marks processed, no sendInstagramMessage, does not throw', async () => {
      const payloadNoMessage = { object: 'instagram' as const, entry: [] };
      const job = fakeJob({
        eventId: 'evt_no_msg',
        provider: 'instagram',
        payload: payloadNoMessage as WebhookJobData['payload'],
        correlationId: 'corr-3-3-1',
      });
      mockMarkProcessed.mockResolvedValue(undefined as never);
      mockLogAudit.mockResolvedValue(undefined as never);

      await processWebhookJob(job);

      expect(mockMarkProcessed).toHaveBeenCalledWith('evt_no_msg', 'instagram');
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook_processed',
          resourceId: 'evt_no_msg',
          status: 'success',
          metadata: expect.objectContaining({ status: 'no_message' }),
        })
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockMarkFailed).not.toHaveBeenCalled();
    });

    it('3.3.2 / 4.1.1 Instagram API error (429, 5xx): markWebhookFailed, logAuditEvent failure, throws for BullMQ retry', async () => {
      const job = fakeJob({
        eventId: 'evt_api_err',
        provider: 'instagram',
        payload: validPayload,
        correlationId: 'corr-3-3-2',
      });
      mockSendMessage.mockRejectedValue(new Error('Instagram API 429') as never);
      mockMarkFailed.mockResolvedValue(undefined as never);
      mockLogAudit.mockResolvedValue(undefined as never);

      await expect(processWebhookJob(job)).rejects.toThrow('Instagram API 429');

      expect(mockMarkFailed).toHaveBeenCalledWith('evt_api_err', 'instagram', 'Instagram API 429');
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook_processed',
          resourceId: 'evt_api_err',
          status: 'failure',
          errorMessage: 'Instagram API 429',
        })
      );
      expect(mockMarkProcessed).not.toHaveBeenCalled();
    });

    it('3.3.4 / 4.2.1 / 4.2.2 handleWebhookJobFailed: dead letter storage when attempts >= maxAttempts (persistent error)', async () => {
      const job = fakeJob(
        {
          eventId: 'evt_dlq',
          provider: 'instagram',
          payload: validPayload,
          correlationId: 'corr-3-3-4',
        },
        3,
        3
      );
      mockStoreDeadLetter.mockResolvedValue('dlq-id' as never);

      await handleWebhookJobFailed(job, new Error('Max retries exceeded'));

      expect(mockStoreDeadLetter).toHaveBeenCalledWith(
        'evt_dlq',
        'instagram',
        validPayload,
        'Max retries exceeded',
        3,
        'corr-3-3-4'
      );
    });

    it('3.3.4 handleWebhookJobFailed: does not store when attempts < maxAttempts', async () => {
      const job = fakeJob(
        {
          eventId: 'evt_retry',
          provider: 'instagram',
          payload: validPayload,
          correlationId: 'corr-3-3-4b',
        },
        1,
        3
      );

      await handleWebhookJobFailed(job, new Error('Transient error'));

      expect(mockStoreDeadLetter).not.toHaveBeenCalled();
    });

    it('valid payload and sendInstagramMessage resolves: markWebhookProcessed and audit success', async () => {
      const job = fakeJob({
        eventId: 'evt_ok',
        provider: 'instagram',
        payload: validPayload,
        correlationId: 'corr-ok',
      });
      mockSendMessage.mockResolvedValue(undefined as never);
      mockMarkProcessed.mockResolvedValue(undefined as never);
      mockLogAudit.mockResolvedValue(undefined as never);

      await processWebhookJob(job);

      expect(mockSendMessage).toHaveBeenCalledWith('987654321', expect.any(String), 'corr-ok');
      expect(mockMarkProcessed).toHaveBeenCalledWith('evt_ok', 'instagram');
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook_processed',
          resourceId: 'evt_ok',
          status: 'success',
        })
      );
    });

    it('unknown page (no doctor linked): markWebhookFailed, audit failure, optional fallback reply, no conversation', async () => {
      jest.mocked(instagramConnectService.getDoctorIdByPageId).mockResolvedValue(null);
      const job = fakeJob({
        eventId: 'evt_unknown_page',
        provider: 'instagram',
        payload: validPayload,
        correlationId: 'corr-unknown',
      });
      mockSendMessage.mockResolvedValue(undefined as never);
      mockMarkFailed.mockResolvedValue(undefined as never);
      mockLogAudit.mockResolvedValue(undefined as never);

      await processWebhookJob(job);

      expect(mockMarkFailed).toHaveBeenCalledWith(
        'evt_unknown_page',
        'instagram',
        'No doctor linked for page'
      );
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook_processed',
          resourceType: 'webhook',
          resourceId: 'evt_unknown_page',
          status: 'failure',
          errorMessage: 'No doctor linked for page',
          metadata: expect.objectContaining({
            event_id: 'evt_unknown_page',
            provider: 'instagram',
            page_id: 'evt_3_3',
          }),
        })
      );
      expect(mockMarkProcessed).not.toHaveBeenCalled();
      expect(patientService.findOrCreatePlaceholderPatient).not.toHaveBeenCalled();
    });
  });

  describe('4. Retry logic testing', () => {
    const validPayload: InstagramWebhookPayload = {
      object: 'instagram',
      entry: [
        {
          id: 'evt_4',
          time: Math.floor(Date.now() / 1000),
          messaging: [
            {
              sender: { id: '987654321' },
              recipient: { id: '123456789' },
              timestamp: Math.floor(Date.now() / 1000),
              message: { mid: 'mid.test.4', text: 'PATIENT_TEST' },
            },
          ],
        },
      ],
    };

    it('4.1.4 success after retry: first attempt throws, second attempt succeeds', async () => {
      const job = fakeJob({
        eventId: 'evt_retry_ok',
        provider: 'instagram',
        payload: validPayload,
        correlationId: 'corr-4-1-4',
      });
      mockSendMessage
        .mockRejectedValueOnce(new Error('429 Too Many Requests') as never)
        .mockResolvedValueOnce(undefined as never);
      mockMarkFailed.mockResolvedValue(undefined as never);
      mockMarkProcessed.mockResolvedValue(undefined as never);
      mockLogAudit.mockResolvedValue(undefined as never);

      await expect(processWebhookJob(job)).rejects.toThrow('429 Too Many Requests');
      expect(mockMarkFailed).toHaveBeenCalledWith('evt_retry_ok', 'instagram', '429 Too Many Requests');

      await processWebhookJob(job);

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(mockMarkProcessed).toHaveBeenCalledWith('evt_retry_ok', 'instagram');
      expect(mockLogAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'webhook_processed',
          resourceId: 'evt_retry_ok',
          status: 'success',
        })
      );
    });

    it('4.2.3 / 4.2.4 error logging and audit log (webhook failed) when sendInstagramMessage throws', async () => {
      const job = fakeJob({
        eventId: 'evt_fail_audit',
        provider: 'instagram',
        payload: validPayload,
        correlationId: 'corr-4-2-3',
      });
      mockSendMessage.mockRejectedValue(new Error('Instagram API 500') as never);
      mockMarkFailed.mockResolvedValue(undefined as never);
      mockLogAudit.mockResolvedValue(undefined as never);

      await expect(processWebhookJob(job)).rejects.toThrow('Instagram API 500');

      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook_processed',
          resourceId: 'evt_fail_audit',
          resourceType: 'webhook',
          status: 'failure',
          errorMessage: 'Instagram API 500',
        })
      );
    });
  });

  describe('6. Worker throughput (concurrent processing)', () => {
    const basePayload: InstagramWebhookPayload = {
      object: 'instagram',
      entry: [
        {
          id: 'evt_6',
          time: Math.floor(Date.now() / 1000),
          messaging: [
            {
              sender: { id: '987654321' },
              recipient: { id: '123456789' },
              timestamp: Math.floor(Date.now() / 1000),
              message: { mid: 'mid.test.6', text: 'PATIENT_TEST' },
            },
          ],
        },
      ],
    };

    it('6.2.1 / 6.2.2 handles multiple jobs concurrently', async () => {
      const concurrency = 5;
      const jobs = Array.from({ length: concurrency }, (_, i) =>
        fakeJob({
          eventId: `evt_concurrent_${i}`,
          provider: 'instagram',
          payload: basePayload,
          correlationId: `corr-6-${i}`,
        })
      );
      mockSendMessage.mockResolvedValue(undefined as never);
      mockMarkProcessed.mockResolvedValue(undefined as never);
      mockLogAudit.mockResolvedValue(undefined as never);

      await Promise.all(jobs.map((job) => processWebhookJob(job)));

      expect(mockMarkProcessed).toHaveBeenCalledTimes(concurrency);
      expect(mockSendMessage).toHaveBeenCalledTimes(concurrency);
      for (let i = 0; i < concurrency; i++) {
        expect(mockMarkProcessed).toHaveBeenCalledWith(`evt_concurrent_${i}`, 'instagram');
      }
    });

    it('6.2.3 no race conditions: each job gets correct eventId and audit', async () => {
      const jobs = [
        fakeJob({
          eventId: 'evt_race_a',
          provider: 'instagram',
          payload: basePayload,
          correlationId: 'corr-race-a',
        }),
        fakeJob({
          eventId: 'evt_race_b',
          provider: 'instagram',
          payload: basePayload,
          correlationId: 'corr-race-b',
        }),
      ];
      mockSendMessage.mockResolvedValue(undefined as never);
      mockMarkProcessed.mockResolvedValue(undefined as never);
      mockLogAudit.mockResolvedValue(undefined as never);

      await Promise.all(jobs.map((job) => processWebhookJob(job)));

      expect(mockMarkProcessed).toHaveBeenCalledWith('evt_race_a', 'instagram');
      expect(mockMarkProcessed).toHaveBeenCalledWith('evt_race_b', 'instagram');
      const auditCalls = mockLogAudit.mock.calls as unknown[];
      const resourceIds = auditCalls
        .map((c: unknown) => (c as [Record<string, unknown>])[0]?.resourceId as string | undefined)
        .filter(Boolean);
      expect(resourceIds).toContain('evt_race_a');
      expect(resourceIds).toContain('evt_race_b');
    });
  });
});
