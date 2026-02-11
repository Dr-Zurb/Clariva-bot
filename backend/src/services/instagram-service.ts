/**
 * Instagram Service Functions
 *
 * Service functions for sending messages via Instagram Graph API.
 * Handles API calls to Meta's Instagram Messaging API, including sending text messages,
 * handling rate limits, retries, and error handling.
 *
 * IMPORTANT:
 * - Message content may contain PHI - NEVER log message content
 * - Only log metadata (recipient_id, message_length, status)
 * - All functions use try-catch (not asyncHandler - that's for controllers)
 * - All functions throw AppError (never return {error} objects)
 * - Service is stateless (no internal state)
 *
 * Reference: [EXTERNAL_SERVICES.md](../../docs/Reference/EXTERNAL_SERVICES.md) - Meta platform integration patterns
 */

import axios, { AxiosError } from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { logAuditEvent, logSecurityEvent } from '../utils/audit-logger';
import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  InternalError,
  ServiceUnavailableError,
} from '../utils/errors';
import type {
  InstagramSendMessageRequest,
  InstagramSendMessageResponse,
  InstagramApiError,
} from '../types/instagram';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Instagram API base URL (graph.instagram.com for Instagram Login tokens).
 * Instagram API with Instagram Login uses graph.instagram.com + Bearer auth;
 * graph.facebook.com expects Page tokens and causes "Cannot parse access token" (190).
 */
const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com/v18.0';

/**
 * Retry configuration
 * Following EXTERNAL_SERVICES.md defaults
 */
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 4000; // 4 seconds

// ============================================================================
// Core Service Functions
// ============================================================================

/**
 * Send message to Instagram user
 *
 * Sends a text message to an Instagram user via Instagram Graph API.
 * Handles retries, rate limits, and error mapping.
 *
 * @param recipientId - Instagram user ID (from webhook payload)
 * @param message - Text message to send (may contain PHI)
 * @param correlationId - Request correlation ID (for logging)
 * @returns Message ID and recipient ID
 *
 * @throws UnauthorizedError if access token is invalid (401)
 * @throws ForbiddenError if permissions are insufficient (403)
 * @throws NotFoundError if recipient or page is invalid (404)
 * @throws TooManyRequestsError if rate limit is exceeded (429)
 * @throws InternalError if Instagram API returns server error (5xx)
 * @throws ServiceUnavailableError if network error or timeout occurs
 *
 * @example
 * ```typescript
 * const response = await sendInstagramMessage(
 *   'instagram_user_id',
 *   'Hello, this is a message',
 *   'correlation-123',
 *   optionalDoctorToken
 * );
 * ```
 *
 * @param accessToken - Optional. When provided (e.g. from doctor_instagram), used for the API call. When omitted, uses env.INSTAGRAM_ACCESS_TOKEN (e-task-14).
 *
 * Reference: [EXTERNAL_SERVICES.md](../../docs/Reference/EXTERNAL_SERVICES.md) - Meta platform patterns
 */
export async function sendInstagramMessage(
  recipientId: string,
  message: string,
  correlationId: string,
  accessToken?: string
): Promise<InstagramSendMessageResponse> {
  // Validate input
  if (!recipientId || typeof recipientId !== 'string') {
    throw new AppError('Recipient ID is required', 400);
  }

  if (!message || typeof message !== 'string') {
    throw new AppError('Message is required', 400);
  }

  // Validate message length (Instagram has limits)
  if (message.length > 2000) {
    throw new AppError('Message too long (max 2000 characters)', 400);
  }

  const token = accessToken ?? env.INSTAGRAM_ACCESS_TOKEN ?? null;
  if (!token) {
    throw new InternalError('Instagram access token not configured (no token passed and INSTAGRAM_ACCESS_TOKEN unset)');
  }

  return sendWithRetry(recipientId, message, correlationId, token);
}

/**
 * Fetch sender ID for a message by its ID (Graph API).
 * Used when the webhook sends message_edit without sender/recipient; we can fetch
 * the message details to get the sender (from.id).
 *
 * @param messageId - Message ID (mid from webhook)
 * @param accessToken - Page/Instagram access token
 * @param correlationId - For logging only
 * @returns Sender ID (Instagram-scoped) or null if not found
 */
export async function getInstagramMessageSender(
  messageId: string,
  accessToken: string,
  correlationId: string
): Promise<string | null> {
  if (!messageId || !accessToken) return null;
  const url = `${INSTAGRAM_GRAPH_BASE}/${encodeURIComponent(messageId)}`;
  const token = accessToken.trim();
  try {
    // Conversations API uses access_token query param; Bearer can cause 500 on some endpoints
    const res = await axios.get<{ from?: { id?: string } }>(url, {
      params: { fields: 'from', access_token: token },
      timeout: 8000,
    });
    const fromId = res.data?.from?.id;
    return fromId && String(fromId).length > 0 ? String(fromId) : null;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const errorBody = err.response?.data as { error?: { message?: string; code?: number; type?: string } } | undefined;
      const metaError = errorBody?.error?.message ?? err.message;
      if (status === 404) {
        logger.debug({ correlationId, messageId }, 'Instagram message not found (may be too old)');
        return null;
      }
      // Log 400 with Meta's error so we can debug message ID format issues
      logger.warn(
        {
          correlationId,
          messageId,
          messageIdLength: messageId?.length,
          status,
          metaError,
          metaCode: errorBody?.error?.code,
        },
        'Could not fetch Instagram message sender'
      );
    } else {
      logger.debug(
        { correlationId, messageId, message: err instanceof Error ? err.message : 'Request failed' },
        'Could not fetch Instagram message sender'
      );
    }
    return null;
  }
}

/**
 * Send message with retry logic
 *
 * Implements exponential backoff for retryable errors (429, 5xx).
 * Does not retry on client errors (4xx except 429).
 *
 * @param token - Access token for the Instagram account (never logged)
 */
async function sendWithRetry(
  recipientId: string,
  message: string,
  correlationId: string,
  token: string
): Promise<InstagramSendMessageResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await sendMessageAPI(recipientId, message, correlationId, token);

      // Log success (metadata only - NEVER log message content)
      await logAuditEvent({
        correlationId,
        userId: undefined, // System operation
        action: 'send_message',
        resourceType: 'instagram_message',
        resourceId: response.message_id,
        status: 'success',
        metadata: {
          recipient_id: recipientId,
          message_length: message.length,
          message_id: response.message_id,
        },
      });

      return response;
    } catch (error) {
      lastError = error as Error;

      // Map error (if already AppError, use it; otherwise map from AxiosError)
      const appError = error instanceof AppError
        ? error
        : mapInstagramError(error, correlationId);

      // Don't retry on client errors (except 429)
      if (
        appError instanceof UnauthorizedError ||
        appError instanceof ForbiddenError ||
        appError instanceof NotFoundError
      ) {
        // Log failure (sanitized error message)
        await logAuditEvent({
          correlationId,
          userId: undefined,
          action: 'send_message',
          resourceType: 'instagram_message',
          status: 'failure',
          errorMessage: appError.message,
          metadata: {
            recipient_id: recipientId,
            message_length: message.length,
            error_type: appError.constructor.name,
          },
        });

        throw appError;
      }

      // Handle rate limit
      if (appError instanceof TooManyRequestsError) {
        // Log rate limit violation
        await logSecurityEvent(
          correlationId,
          undefined,
          'rate_limit_exceeded',
          'medium',
          undefined,
          'Instagram API rate limit exceeded'
        );

        // Extract Retry-After header if available
        const retryAfter = (error as AxiosError)?.response?.headers['retry-after'];
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);

        if (attempt >= MAX_RETRIES) {
          // Log final failure
          await logAuditEvent({
            correlationId,
            userId: undefined,
            action: 'send_message',
            resourceType: 'instagram_message',
            status: 'failure',
            errorMessage: appError.message,
            metadata: {
              recipient_id: recipientId,
              message_length: message.length,
              error_type: 'TooManyRequestsError',
              retry_attempts: attempt + 1,
            },
          });

          throw appError;
        }

        logger.warn(
          {
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
            delay,
            correlationId,
            recipient_id: recipientId,
            message_length: message.length,
          },
          'Instagram API rate limit exceeded, retrying after delay'
        );

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue; // Retry
      }

      // Don't retry on last attempt
      if (attempt >= MAX_RETRIES) {
        break;
      }

      // Calculate backoff delay for server errors
      const delay = Math.min(
        INITIAL_RETRY_DELAY * Math.pow(2, attempt),
        MAX_RETRY_DELAY
      );

      logger.warn(
        {
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delay,
          correlationId,
          recipient_id: recipientId,
          message_length: message.length,
          error_type: appError.constructor.name,
        },
        'Retrying Instagram API call after error'
      );

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted - log failure
  const finalError = lastError || new InternalError('Failed to send message after retries');
  // If error is already an AppError, use it; otherwise map it
  const appError = finalError instanceof AppError 
    ? finalError 
    : mapInstagramError(finalError, correlationId);

  await logAuditEvent({
    correlationId,
    userId: undefined,
    action: 'send_message',
    resourceType: 'instagram_message',
    status: 'failure',
    errorMessage: appError.message,
    metadata: {
      recipient_id: recipientId,
      message_length: message.length,
      error_type: appError.constructor.name,
      retry_attempts: MAX_RETRIES + 1,
    },
  });

  throw appError;
}

/**
 * Make Instagram API call
 *
 * Performs the actual HTTP request to Instagram Graph API.
 *
 * @param token - Access token (never logged)
 */
async function sendMessageAPI(
  recipientId: string,
  message: string,
  correlationId: string,
  token: string
): Promise<InstagramSendMessageResponse> {
  const url = `${INSTAGRAM_GRAPH_BASE}/me/messages`;
  const payload: InstagramSendMessageRequest = {
    recipient: { id: recipientId },
    message: { text: message },
  };

  try {
    const response = await axios.post<InstagramSendMessageResponse>(
      url,
      payload,
      {
        headers: { Authorization: `Bearer ${token.trim()}` },
        timeout: 10000, // 10 second timeout (from SAFE_DEFAULTS.md)
      }
    );

    // Instagram API returns snake_case, return as-is
    return response.data;
  } catch (error) {
    throw mapInstagramError(error, correlationId);
  }
}

/**
 * Map Instagram API errors to AppError
 *
 * Converts Instagram Graph API errors and network errors to appropriate AppError subclasses.
 *
 * @param error - Error from axios or Instagram API
 * @param correlationId - Request correlation ID (for logging)
 * @returns AppError instance
 */
/** Exported for unit testing error mapping. */
export function mapInstagramError(error: unknown, correlationId: string): AppError {
  // If already an AppError, return as-is
  if (error instanceof AppError) {
    return error;
  }
  // Handle axios errors
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data?.error as InstagramApiError['error'] | undefined;

    // Map by HTTP status code
    switch (statusCode) {
      case 401:
        return new UnauthorizedError(
          errorData?.message || 'Instagram API authentication failed'
        );
      case 403:
        return new ForbiddenError(
          errorData?.message || 'Instagram API permission denied'
        );
      case 404:
        return new NotFoundError(
          errorData?.message || 'Instagram recipient not found'
        );
      case 429:
        return new TooManyRequestsError(
          errorData?.message || 'Instagram API rate limit exceeded'
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new InternalError(
          errorData?.message || 'Instagram API server error'
        );
    }

    // Network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ServiceUnavailableError('Instagram API request timeout');
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new ServiceUnavailableError('Instagram API connection failed');
    }
  }

  // Handle Instagram-specific error codes
  if (axios.isAxiosError(error)) {
    const instagramError = error.response?.data?.error as InstagramApiError['error'] | undefined;

    if (instagramError) {
      // OAuthException (invalid token)
      if (instagramError.code === 190) {
        return new UnauthorizedError('Instagram access token invalid or expired');
      }

      // Rate limit
      if (instagramError.code === 4) {
        return new TooManyRequestsError('Instagram API rate limit exceeded');
      }

      // Invalid recipient
      if (instagramError.error_subcode === 463) {
        return new NotFoundError('Instagram recipient not found');
      }
    }
  }

  // Unknown error
  logger.error(
    {
      error,
      correlationId,
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    },
    'Unknown Instagram API error'
  );
  return new InternalError('Failed to send Instagram message');
}
