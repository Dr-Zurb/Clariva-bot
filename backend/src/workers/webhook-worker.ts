/**
 * Webhook Processing Worker
 *
 * BullMQ worker: routes jobs to payment adapter, Instagram comment handler, or DM handler (RBH-05).
 * @see WEBHOOKS.md - Retry, dead letter
 * @see COMPLIANCE.md - Audit, no PHI in logs
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { isQueueEnabled, WEBHOOK_QUEUE_NAME } from '../config/queue';
import { logger } from '../config/logger';
import { markWebhookProcessed } from '../services/webhook-idempotency-service';
import { storeDeadLetterWebhook } from '../services/dead-letter-service';
import { getAppointmentByIdForWorker } from '../services/appointment-service';
import { processPaymentSuccess } from '../services/payment-service';
import {
  sendNewAppointmentToDoctor,
  sendPaymentConfirmationToPatient,
  sendPaymentReceivedToDoctor,
} from '../services/notification-service';
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { paypalAdapter } from '../adapters/paypal-adapter';
import { isInstagramCommentPayload } from '../utils/webhook-event-id';
import {
  logWebhookJobDeadLetter,
  logWebhookJobDequeued,
  logWebhookJobWorkerFailure,
  logWebhookJobWorkerSuccess,
  logWebhookPaymentJobCompleted,
} from '../services/webhook-metrics';
import type { WebhookJobData } from '../types/queue';
import { processInstagramCommentWebhook } from './instagram-comment-webhook-handler';
import { processInstagramDmWebhook } from './instagram-dm-webhook-handler';

let workerConnection: IORedis | null = null;
let workerInstance: Worker<WebhookJobData> | null = null;

function createWorkerConnection(): IORedis {
  const url = env.REDIS_URL?.trim();
  if (!url) {
    throw new Error('REDIS_URL is required for webhook worker');
  }
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
  });
}

/**
 * Process a single webhook job.
 * Throws on error so BullMQ can retry.
 */
export async function processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
  const { eventId, provider, payload, correlationId } = job.data;

  if (provider === 'razorpay' || provider === 'paypal') {
    const adapter = provider === 'razorpay' ? razorpayAdapter : paypalAdapter;
    const parsed = adapter.parseSuccessPayload(payload);
    let paymentAppointmentId: string | undefined;
    if (parsed) {
      const result = await processPaymentSuccess(
        provider,
        parsed.gatewayOrderId,
        parsed.gatewayPaymentId,
        parsed.amountMinor,
        parsed.currency,
        correlationId
      );
      paymentAppointmentId = result?.appointmentId;
      if (result?.appointmentId) {
        getAppointmentByIdForWorker(result.appointmentId, correlationId)
          .then((appointment) => {
            if (!appointment) return;
            const dateIso =
              typeof appointment.appointment_date === 'string'
                ? appointment.appointment_date
                : (appointment.appointment_date as Date).toISOString();
            return Promise.all([
              sendPaymentConfirmationToPatient(result.appointmentId, dateIso, correlationId),
              sendPaymentReceivedToDoctor(
                appointment.doctor_id,
                result.appointmentId,
                dateIso,
                correlationId
              ),
              sendNewAppointmentToDoctor(
                appointment.doctor_id,
                result.appointmentId,
                dateIso,
                correlationId
              ),
            ]);
          })
          .catch((err) => {
            logger.warn(
              {
                correlationId,
                appointmentId: result.appointmentId,
                error: err instanceof Error ? err.message : String(err),
              },
              'Notification after payment failed (non-blocking)'
            );
          });
      }
    }
    logWebhookPaymentJobCompleted({
      correlationId,
      eventId,
      provider,
      parsed: !!parsed,
      appointmentNotified: !!paymentAppointmentId,
    });
    await markWebhookProcessed(eventId, provider);
    return;
  }

  if (provider !== 'instagram') {
    logger.info(
      { eventId, provider, correlationId },
      'Webhook skipped (provider not yet implemented)'
    );
    await markWebhookProcessed(eventId, provider);
    return;
  }

  if (isInstagramCommentPayload(payload)) {
    await processInstagramCommentWebhook({ eventId, correlationId, provider, payload });
    return;
  }

  await processInstagramDmWebhook({ eventId, correlationId, provider, payload });
}

/** After max retries: dead letter queue. Exported for unit tests. */
export async function handleWebhookJobFailed(
  job: Job<WebhookJobData> | undefined,
  err: Error
): Promise<void> {
  if (!job) return;
  const { eventId, provider, payload, correlationId } = job.data;
  const attempts = job.attemptsMade;
  const maxAttempts = job.opts.attempts ?? 3;
  if (attempts >= maxAttempts) {
    try {
      await storeDeadLetterWebhook(
        eventId,
        provider,
        payload,
        err.message,
        attempts,
        correlationId
      );
      logger.warn(
        { eventId, provider, correlationId, attempts },
        'Webhook moved to dead letter queue after max retries'
      );
      logWebhookJobDeadLetter({
        correlationId,
        eventId,
        provider,
        attempts,
        errorClass: err.name || 'Error',
      });
    } catch (dlqError) {
      logger.error(
        {
          error: dlqError instanceof Error ? dlqError.message : String(dlqError),
          eventId,
          provider,
          correlationId,
        },
        'Failed to store webhook in dead letter queue'
      );
    }
  }
}

/** Start the webhook worker. No-op if REDIS_URL is not set. */
export function startWebhookWorker(): Worker<WebhookJobData> | null {
  if (!isQueueEnabled()) {
    logger.info('Webhook worker skipped (REDIS_URL not set)');
    return null;
  }

  if (workerInstance) {
    return workerInstance;
  }

  try {
    workerConnection = createWorkerConnection();
    const concurrency = Math.max(1, Math.min(env.WEBHOOK_WORKER_CONCURRENCY, 20));

    workerInstance = new Worker<WebhookJobData>(
      WEBHOOK_QUEUE_NAME,
      async (job: Job<WebhookJobData>) => {
        const jobStarted = Date.now();
        const { correlationId, eventId, provider } = job.data;
        logWebhookJobDequeued({
          correlationId,
          eventId,
          provider,
          jobId: job.id ? String(job.id) : undefined,
        });
        try {
          await processWebhookJob(job);
          logWebhookJobWorkerSuccess({
            correlationId,
            eventId,
            provider,
            durationMs: Date.now() - jobStarted,
            jobId: job.id ? String(job.id) : undefined,
          });
        } catch (error) {
          logWebhookJobWorkerFailure({
            correlationId,
            eventId,
            provider,
            durationMs: Date.now() - jobStarted,
            jobId: job.id ? String(job.id) : undefined,
            attempt: job.attemptsMade + 1,
          });
          logger.warn(
            {
              jobId: job.id,
              eventId: job.data.eventId,
              provider: job.data.provider,
              correlationId: job.data.correlationId,
              attempt: job.attemptsMade + 1,
              error: error instanceof Error ? error.message : String(error),
            },
            'Webhook job failed (will retry or dead-letter)'
          );
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency,
      }
    );

    workerInstance.on('failed', (job: Job<WebhookJobData> | undefined, err: Error) => {
      handleWebhookJobFailed(job, err);
    });

    workerInstance.on('error', (err: Error) => {
      logger.error({ error: err.message }, 'Webhook worker connection error');
    });

    logger.info({ queueName: WEBHOOK_QUEUE_NAME, concurrency }, 'Webhook worker started');
    return workerInstance;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to start webhook worker'
    );
    return null;
  }
}

export function getWebhookWorker(): Worker<WebhookJobData> | null {
  return workerInstance;
}

export async function stopWebhookWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
  if (workerConnection) {
    await workerConnection.quit();
    workerConnection = null;
  }
  logger.info('Webhook worker stopped');
}
