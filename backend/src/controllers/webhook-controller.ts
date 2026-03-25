import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../config/logger';
import { successResponse } from '../utils/response';
import {
  verifyInstagramSignature,
  isWebhookSecretConfigured,
  getWebhookSecretLength,
} from '../utils/webhook-verification';
import { verifyRazorpaySignature } from '../utils/razorpay-verification';
import {
  extractInstagramEventId,
  extractInstagramCommentEventId,
  extractInstagramMessageForDedup,
  generateFallbackEventId,
  getInstagramPayloadStructure,
  isInstagramCommentPayload,
  isNonActionableInstagramEvent,
  isInstagramMessageEcho,
  isShortFlowWord,
} from '../utils/webhook-event-id';
import {
  isWebhookProcessed,
  markWebhookProcessing,
} from '../services/webhook-idempotency-service';
import { webhookQueue, tryAcquireInstagramDedupLock } from '../config/queue';
import { WEBHOOK_JOB_NAME } from '../types/queue';
import { logAuditEvent, logSecurityEvent } from '../utils/audit-logger';
import { storeDeadLetterWebhook } from '../services/dead-letter-service';
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { paypalAdapter } from '../adapters/paypal-adapter';

/**
 * Instagram Webhook Controller
 *
 * Handles Instagram webhook verification and event processing
 * Following Facebook's webhook verification protocol
 *
 * GET /webhooks/instagram - Webhook verification (Facebook sends GET request)
 * POST /webhooks/instagram - Webhook event processing (Facebook sends POST request)
 *
 * MUST: Use asyncHandler (not manual try/catch) - see STANDARDS.md
 */

/**
 * Verify Instagram webhook
 * GET /webhooks/instagram
 *
 * Facebook/Instagram sends a GET request to verify the webhook endpoint
 * Query parameters:
 * - hub.mode: Must be 'subscribe'
 * - hub.verify_token: Must match INSTAGRAM_WEBHOOK_VERIFY_TOKEN
 * - hub.challenge: Random string to echo back
 *
 * Response:
 * - 200 OK: Returns hub.challenge if verification succeeds
 * - 403 Forbidden: If verify_token doesn't match
 *
 * Reference: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export const verifyInstagramWebhook = asyncHandler(
  async (req: Request, res: Response) => {
    // Debug logging to see what we're receiving
    logger.info(
      {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
          'ngrok-skip-browser-warning': req.headers['ngrok-skip-browser-warning'],
        },
        rawUrl: req.url,
      },
      'Instagram webhook verification request received'
    );

    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    logger.info(
      {
        mode,
        tokenLength: token?.length,
        challengeLength: challenge?.length,
        hasConfiguredToken: !!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
      },
      'Webhook verification parameters'
    );

    // Check if mode is 'subscribe'
    if (mode !== 'subscribe') {
      logger.warn({ mode }, 'Invalid hub.mode received');
      throw new UnauthorizedError('Invalid hub.mode');
    }

    // Check if verify token matches
    if (!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
      logger.error('Instagram webhook verify token not configured in environment');
      throw new UnauthorizedError('Instagram webhook verify token not configured');
    }

    if (token !== env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
      logger.warn(
        {
          receivedTokenLength: token?.length,
          expectedTokenLength: env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN.length,
          tokensMatch: false,
        },
        'Verify token mismatch'
      );
      throw new UnauthorizedError('Invalid verify token');
    }

    logger.info('Webhook verification successful, returning challenge');
    // Return challenge to complete verification
    res.status(200).send(challenge);
  }
);

/**
 * Handle Instagram webhook events
 * POST /webhooks/instagram
 *
 * Processes Instagram webhook events following RECIPES.md R-WEBHOOK-001 pattern:
 * 1. Verify signature FIRST (before any processing)
 * 2. Extract event ID (platform-specific or fallback hash)
 * 3. Check idempotency (prevent duplicates)
 * 4. Mark as processing (prevent race conditions)
 * 5. Queue for async processing (don't block)
 * 6. Return 200 OK immediately (< 20 seconds)
 *
 * IMPORTANT:
 * - NEVER log req.body (contains PII/PHI)
 * - Only log metadata (event_id, provider, correlation_id)
 * - Signature verification is MANDATORY (security requirement)
 * - Idempotency prevents duplicate processing (reliability)
 * - Fast response prevents platform retries (reliability)
 *
 * Response:
 * - 200 OK: Webhook queued for processing (idempotent if already processed)
 * - 401 Unauthorized: Invalid webhook signature
 *
 * @see RECIPES.md - R-WEBHOOK-001 pattern
 * @see WEBHOOKS.md - Webhook processing rules
 * @see COMPLIANCE.md - Webhook security requirements (section H)
 * @see docs/Reference/WEBHOOK_SECURITY.md - Instagram signature-failure branches, threat model (RBH-08)
 */
export const handleInstagramWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';

    // Log immediately so Render shows every POST to this endpoint (even if signature fails later)
    logger.info(
      { correlationId, path: req.path, method: req.method },
      'Instagram webhook POST received (verifying signature)'
    );

    // ⚠️ CRITICAL: NEVER log req.body for webhooks
    // Platform payloads may contain patient identifiers (PII/PHI)
    // Only log metadata: correlationId, eventId, provider, status

    // Step 1: Verify signature FIRST (MANDATORY - before any processing)
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    // CRITICAL: Must use raw body - JSON.stringify(req.body) produces DIFFERENT bytes than Meta sent (key order, whitespace)
    // and will ALWAYS fail verification. If rawBody is missing, verification cannot succeed.
    const rawBody = req.rawBody;

    // Diagnostic logging (no PII) - helps debug signature failures and messages vs message_edit vs comments
    const payloadBody = req.body as {
      object?: string;
      entry?: Array<{
        id?: string;
        messaging?: Array<{ message?: unknown; message_edit?: unknown }>;
        changes?: Array<{ field?: string }>;
      }>;
    } | undefined;
    const entry0 = payloadBody?.entry?.[0];
    const firstMsg = entry0?.messaging?.[0];
    const firstChange = entry0?.changes?.[0];
    const payloadType = firstMsg?.message
      ? 'message'
      : firstMsg?.message_edit
        ? 'message_edit'
        : firstChange?.field === 'comments' || firstChange?.field === 'live_comments'
          ? `comment:${firstChange.field}`
          : 'unknown';
    logger.info(
      {
        correlationId,
        hasRawBody: !!rawBody,
        rawBodyLength: rawBody?.length ?? 0,
        payloadType,
        object: payloadBody?.object,
        entry0Keys: entry0 ? Object.keys(entry0) : [],
        firstChangeField: firstChange?.field,
        hasSignature: !!signature,
        secretConfigured: isWebhookSecretConfigured(),
        secretLength: getWebhookSecretLength(),
        contentType: req.headers['content-type'],
      },
      'Webhook signature verification diagnostics'
    );

    if (!rawBody) {
      logger.error(
        { correlationId, contentType: req.headers['content-type'] },
        'Raw body not captured - express.json verify callback may not run for this request. ' +
          'Check middleware order and Content-Type. Signature verification cannot succeed without raw body.'
      );
      await logSecurityEvent(correlationId, undefined, 'webhook_raw_body_missing', 'high', req.ip);
      throw new UnauthorizedError('Invalid webhook signature');
    }

    if (!verifyInstagramSignature(signature, rawBody, correlationId)) {
      const len = rawBody?.length ?? 0;
      // 304-byte read/delivery receipts: Meta may sign differently; these are non-actionable.
      // Return 200 to stop retries; no processing needed. Security: attacker could send fake
      // read payload → we return 200 (harmless, no PHI, no processing).
      if (len >= 300 && len <= 320 && isNonActionableInstagramEvent(req.body)) {
        logger.info(
          {
            correlationId,
            rawBodyLength: len,
            payloadStructure: getInstagramPayloadStructure(req.body),
          },
          'Instagram webhook: read/delivery with failed signature; returning 200 (non-actionable)'
        );
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
      // message_edit: Meta may sign differently; edit notifications are non-critical.
      // Return 200 to stop retry storm; we already have the original message.
      if (payloadType === 'message_edit') {
        logger.info(
          { correlationId, rawBodyLength: len, payloadType },
          'Instagram webhook: message_edit with failed signature; returning 200 (non-critical)'
        );
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
      // comment: Instagram API product may sign differently than Messenger. Bypass verification
      // and process so comment replies work. Risk: low (attacker would need valid comment IDs for API to succeed).
      if (payloadType.startsWith('comment:')) {
        logger.info(
          { correlationId, rawBodyLength: len, payloadType },
          'Instagram webhook: comment with failed signature; bypassing verification to process'
        );
        // Fall through to comment processing below (skip the throw)
      } else if (payloadType === 'message') {
        // message: Instagram DM webhooks may sign differently than Messenger. Bypass so two-way DM
        // conversations work (e.g. user replies "yes" to schedule). Risk: low (API calls need valid IDs).
        logger.info(
          { correlationId, rawBodyLength: len, payloadType },
          'Instagram webhook: message with failed signature; bypassing verification to process'
        );
        // Fall through to message processing below (skip the throw)
      } else if (payloadType === 'unknown' && payloadBody?.object === 'instagram' && entry0) {
        const entry0Any = entry0 as { messaging?: unknown[] };
        if (Array.isArray(entry0Any?.messaging) && entry0Any.messaging.length > 0) {
          logger.info(
            { correlationId, rawBodyLength: len, payloadType },
            'Instagram webhook: unknown messaging payload with failed signature; returning 200 (non-actionable)'
          );
          res.status(200).json(successResponse({ message: 'OK' }, req));
          return;
        }
      } else {
        if (len >= 300 && len <= 320) {
          const structure = getInstagramPayloadStructure(req.body);
          logger.warn(
            {
              correlationId,
              rawBodyLength: len,
              payloadStructure: structure,
              contentEncoding: req.headers['content-encoding'],
              contentLengthHeader: req.headers['content-length'],
            },
            'Webhook signature failed for ~304-byte payload; structure logged for debugging (no PHI)'
          );
        }
        await logSecurityEvent(
          correlationId,
          undefined,
          'webhook_signature_failed',
          'high',
          req.ip
        );
        throw new UnauthorizedError('Invalid webhook signature');
      }
    }

    // Early branch: comment webhooks use entry[].changes[] with field "comments"
    // (different from DM entry[].messaging[]). Skip messaging-specific checks.
    if (isInstagramCommentPayload(req.body)) {
      const eventId =
        extractInstagramCommentEventId(req.body) ?? generateFallbackEventId(req.body);
      try {
        const existing = await isWebhookProcessed(eventId, 'instagram');
        if (existing && (existing.status === 'processed' || existing.status === 'pending')) {
          logger.info(
            { eventId, correlationId, provider: 'instagram', status: existing.status },
            'Comment webhook already processed (idempotent)'
          );
          res.status(200).json(successResponse({ message: 'OK' }, req));
          return;
        }
      } catch (error) {
        logger.error(
          { error, eventId, correlationId, provider: 'instagram' },
          'Comment idempotency check failed (allowing through)'
        );
      }
      try {
        await markWebhookProcessing(eventId, 'instagram', correlationId);
      } catch (error) {
        logger.error(
          { error, eventId, correlationId, provider: 'instagram' },
          'Comment mark processing failed (allowing through)'
        );
      }
      let payloadForQueue: unknown = req.body;
      const rawBodyBuf = (req as { rawBody?: Buffer }).rawBody;
      if (rawBodyBuf && Buffer.isBuffer(rawBodyBuf)) {
        try {
          payloadForQueue = JSON.parse(rawBodyBuf.toString('utf8'));
        } catch {
          // Fallback to parsed body
        }
      }
      try {
        await webhookQueue.add(WEBHOOK_JOB_NAME, {
          eventId,
          provider: 'instagram',
          payload: payloadForQueue as any,
          correlationId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(
          { error, eventId, correlationId, provider: 'instagram' },
          'Comment queue error (storing in dead letter queue)'
        );
        try {
          await storeDeadLetterWebhook(
            eventId,
            'instagram',
            payloadForQueue,
            `Queue error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            0,
            correlationId
          );
        } catch (dlqError) {
          logger.error(
            { error: dlqError, eventId, provider: 'instagram', correlationId },
            'Failed to store comment in dead letter queue'
          );
        }
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
      logger.info(
        { correlationId, eventId, provider: 'instagram' },
        'Instagram comment webhook queued for processing'
      );
      await logAuditEvent({
        correlationId,
        userId: undefined,
        action: 'webhook_received',
        resourceType: 'webhook',
        status: 'success',
        metadata: {
          event_id: eventId,
          provider: 'instagram',
          type: 'comment',
          received_at: new Date().toISOString(),
        },
      });
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    // Early return for known non-actionable events (read receipts, delivery) - no processing needed
    if (isNonActionableInstagramEvent(req.body)) {
      logger.info(
        { correlationId, payloadStructure: getInstagramPayloadStructure(req.body) },
        'Instagram webhook: non-actionable event (read/delivery), returning 200'
      );
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    // Skip queueing message_edit: Meta sends both message + message_edit for the same user message.
    // Queueing both causes a race: one creates the message, the other hits ConflictError and exits
    // without sending. If message_edit runs first, we can end up with zero replies. Only process
    // "message" events so we reliably get one create + one send per user message.
    if (payloadType === 'message_edit') {
      logger.info(
        { correlationId, payloadType },
        'Instagram webhook: message_edit only - returning 200 without queueing (message event will be processed)'
      );
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    // Skip message echo: Meta sends our own sent messages back as "message" webhooks. Processing them causes reply loops.
    if (isInstagramMessageEcho(req.body)) {
      logger.info(
        { correlationId },
        'Instagram webhook: message echo (our sent message) - returning 200 without queueing'
      );
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    // Step 2: Extract event ID (platform-specific or fallback hash) — needed before dedup for short flow words
    let eventId = extractInstagramEventId(req.body) ?? generateFallbackEventId(req.body);

    // Content-based dedup: Meta sends multiple "message" webhooks with different mids for same user message.
    // For short flow words (yes, no, ok), use eventId so we always queue—users send "yes" twice (confirm then consent).
    const dedup = extractInstagramMessageForDedup(req.body);
    if (dedup) {
      const dedupEventId = isShortFlowWord(dedup.text) ? eventId : undefined;
      const contentAcquired = await tryAcquireInstagramDedupLock(
        dedup.pageId,
        dedup.senderId,
        dedup.textHash,
        dedupEventId
      );
      if (!contentAcquired) {
        logger.info(
          { correlationId, provider: 'instagram', pageId: dedup.pageId },
          'Instagram webhook: content-based duplicate (same message in window); returning 200'
        );
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
    }

    // Debug: when idempotency uses entry id (page ID), log payload shape to troubleshoot missing mid
    const body = req.body as { object?: string; entry?: unknown[] };
    const entry0Body = body?.entry?.[0] as Record<string, unknown> | undefined;
    const entryId = entry0Body?.id != null ? String(entry0Body.id) : null;
    if (entryId && eventId === entryId) {
      const messaging = entry0Body?.messaging;
      const hasMessaging = Array.isArray(messaging) && messaging.length > 0;
      const firstItemKeys = hasMessaging && typeof messaging[0] === 'object' && messaging[0] !== null
        ? Object.keys(messaging[0] as object)
        : [];
      logger.debug(
        { correlationId, entryId, hasMessaging, messagingLength: hasMessaging ? (messaging as unknown[]).length : 0, firstMessagingKeys: firstItemKeys },
        'Instagram webhook: eventId is entry id (no mid found); payload shape logged for debugging'
      );
    }

    // Step 3: Check idempotency (prevent duplicates)
    try {
      const existing = await isWebhookProcessed(eventId, 'instagram');

      if (existing && (existing.status === 'processed' || existing.status === 'pending')) {
        // Already processed or in-flight - return 200 OK (idempotent). Skipping 'pending'
        // prevents multiple jobs for same message when Meta retries before we finish.
        logger.info(
          {
            eventId,
            correlationId,
            provider: 'instagram',
            status: existing.status,
          },
          'Webhook already processed or in-flight (idempotent response)'
        );
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
    } catch (error) {
      // Fail-open: Log error but allow webhook through
      // Prevents blocking legitimate webhooks due to database issues
      logger.error(
        {
          error,
          eventId,
          correlationId,
          provider: 'instagram',
        },
        'Idempotency check failed (allowing webhook through)'
      );
      // Continue with processing (don't block webhook)
    }

    // Step 4: Mark as processing (prevent race conditions)
    try {
      await markWebhookProcessing(eventId, 'instagram', correlationId);
    } catch (error) {
      // Fail-open: Log error but allow webhook through
      logger.error(
        {
          error,
          eventId,
          correlationId,
          provider: 'instagram',
        },
        'Failed to mark webhook as processing (allowing webhook through)'
      );
      // Continue with processing (don't block webhook)
    }

    // Step 5: Queue for async processing (don't block)
    // Use raw body as payload when available so worker gets exact JSON from Meta (avoids any
    // sanitization or body-parser changes that might drop fields like sender/recipient).
    let payloadForQueue: unknown = req.body;
    const rawBodyBuf = (req as { rawBody?: Buffer }).rawBody;
    if (rawBodyBuf && Buffer.isBuffer(rawBodyBuf)) {
      try {
        payloadForQueue = JSON.parse(rawBodyBuf.toString('utf8'));
      } catch {
        // Fallback to parsed body if raw parse fails
      }
    }
    try {
      await webhookQueue.add(WEBHOOK_JOB_NAME, {
        eventId,
        provider: 'instagram',
        payload: payloadForQueue as any,
        correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Fallback: Store in dead letter queue immediately if queue fails
      logger.error(
        {
          error,
          eventId,
          correlationId,
          provider: 'instagram',
        },
        'Queue error (storing in dead letter queue)'
      );

      try {
        await storeDeadLetterWebhook(
          eventId,
          'instagram',
          payloadForQueue,
          `Queue error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          0, // No retries (failed immediately)
          correlationId
        );
      } catch (dlqError) {
        // If dead letter queue also fails, log but still return 200 OK
        // Platform expects 200 OK - we'll handle the failure internally
        logger.error(
          {
            error: dlqError,
            eventId,
            correlationId,
            provider: 'instagram',
          },
          'Failed to store in dead letter queue (webhook lost)'
        );
      }

      // Still return 200 OK (webhook was received, even if queuing failed)
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    // Log so Render/runtime logs show webhook receipt (search for "Instagram webhook queued")
    logger.info(
      { correlationId, eventId, provider: 'instagram' },
      'Instagram webhook queued for processing'
    );
    // Audit log (metadata only - NEVER log req.body)
    // resourceId omitted: eventId is Instagram entry ID (numeric string), audit_logs.resource_id is UUID
    await logAuditEvent({
      correlationId,
      userId: undefined, // System operation
      action: 'webhook_received',
      resourceType: 'webhook',
      status: 'success',
      metadata: {
        event_id: eventId,
        provider: 'instagram',
        received_at: new Date().toISOString(),
      },
    });

    // Step 6: Return 200 OK immediately (< 20 seconds for Meta)
    res.status(200).json(successResponse({ message: 'OK' }, req));
    return;
  }
);

// ============================================================================
// Payment Webhooks (e-task-4)
// ============================================================================

/**
 * Handle Razorpay webhook
 * POST /webhooks/razorpay
 *
 * Same pattern as Instagram: verify signature -> idempotency -> queue -> 200 OK
 */
export const handleRazorpayWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    if (!verifyRazorpaySignature(signature, rawBody, correlationId)) {
      await logSecurityEvent(
        correlationId,
        undefined,
        'webhook_signature_failed',
        'high',
        req.ip
      );
      throw new UnauthorizedError('Invalid Razorpay webhook signature');
    }

    const eventId =
      (req.headers['x-razorpay-event-id'] as string) ||
      razorpayAdapter.extractEventId(req.body, req.headers as Record<string, string | undefined>);

    try {
      const existing = await isWebhookProcessed(eventId, 'razorpay');
      if (existing?.status === 'processed') {
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
    } catch {
      // Fail-open
    }

    try {
      await markWebhookProcessing(eventId, 'razorpay', correlationId);
    } catch {
      // Fail-open
    }

    try {
      await webhookQueue.add(WEBHOOK_JOB_NAME, {
        eventId,
        provider: 'razorpay',
        payload: req.body,
        correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      try {
        await storeDeadLetterWebhook(
          eventId,
          'razorpay',
          req.body,
          error instanceof Error ? error.message : 'Unknown error',
          0,
          correlationId
        );
      } catch {
        // Ignore
      }
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    res.status(200).json(successResponse({ message: 'OK' }, req));
  }
);

/**
 * Handle PayPal webhook
 * POST /webhooks/paypal
 *
 * PayPal verification is async (API call). Same pattern otherwise.
 */
export const handlePayPalWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    const headers: Record<string, string | undefined> = {
      'paypal-auth-algo': req.headers['paypal-auth-algo'] as string,
      'paypal-cert-url': req.headers['paypal-cert-url'] as string,
      'paypal-transmission-id': req.headers['paypal-transmission-id'] as string,
      'paypal-transmission-sig': req.headers['paypal-transmission-sig'] as string,
      'paypal-transmission-time': req.headers['paypal-transmission-time'] as string,
    };

    const isValid = await paypalAdapter.verifyWebhook(
      req.headers['paypal-transmission-sig'] as string,
      rawBody,
      headers
    );

    if (!isValid) {
      await logSecurityEvent(
        correlationId,
        undefined,
        'webhook_signature_failed',
        'high',
        req.ip
      );
      throw new UnauthorizedError('Invalid PayPal webhook signature');
    }

    const eventId =
      (req.headers['paypal-transmission-id'] as string) ||
      paypalAdapter.extractEventId(req.body, req.headers as Record<string, string | undefined>);

    try {
      const existing = await isWebhookProcessed(eventId, 'paypal');
      if (existing?.status === 'processed') {
        res.status(200).json(successResponse({ message: 'OK' }, req));
        return;
      }
    } catch {
      // Fail-open
    }

    try {
      await markWebhookProcessing(eventId, 'paypal', correlationId);
    } catch {
      // Fail-open
    }

    try {
      await webhookQueue.add(WEBHOOK_JOB_NAME, {
        eventId,
        provider: 'paypal',
        payload: req.body,
        correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      try {
        await storeDeadLetterWebhook(
          eventId,
          'paypal',
          req.body,
          error instanceof Error ? error.message : 'Unknown error',
          0,
          correlationId
        );
      } catch {
        // Ignore
      }
      res.status(200).json(successResponse({ message: 'OK' }, req));
      return;
    }

    res.status(200).json(successResponse({ message: 'OK' }, req));
  }
);
