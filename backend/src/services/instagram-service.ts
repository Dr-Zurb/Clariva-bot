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
 * Reference: [EXTERNAL_SERVICES.md](../../docs/Reference/engineering/operations/EXTERNAL_SERVICES.md) - Meta platform integration patterns
 */

import axios, { AxiosError } from 'axios';
import { createHash } from 'crypto';
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
  MessageWindowExpiredError,
} from '../utils/errors';
import type {
  InstagramSendMessageRequest,
  InstagramSendMessageResponse,
  InstagramApiError,
} from '../types/instagram';
import { DM_COPY_ENGLISH_ONLY_EXCEPTIONS } from '../utils/dm-copy';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Instagram API base URL (graph.instagram.com for Instagram Login tokens).
 * Instagram API with Instagram Login uses graph.instagram.com + Bearer auth;
 * graph.facebook.com expects Page tokens and causes "Cannot parse access token" (190).
 */
const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com/v18.0';
const FACEBOOK_GRAPH_BASE = 'https://graph.facebook.com/v18.0';

/**
 * lat-03: Preferred Graph host per token (memoized). This app connects doctors via
 * Instagram Login, so the default first hop is graph.instagram.com — not
 * graph.facebook.com (which always 190s for IG Login tokens).
 * Fallback to the other host on 190 remains; a successful fallback updates the memo.
 */
type GraphHostKind = 'instagram' | 'facebook';

const graphHostByTokenKey = new Map<string, GraphHostKind>();

function tokenHostKey(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

function graphBaseForHost(host: GraphHostKind): string {
  return host === 'instagram' ? INSTAGRAM_GRAPH_BASE : FACEBOOK_GRAPH_BASE;
}

function otherHost(host: GraphHostKind): GraphHostKind {
  return host === 'instagram' ? 'facebook' : 'instagram';
}

/** @internal Exported for unit tests (lat-03). */
export function clearGraphHostMemoForTests(): void {
  graphHostByTokenKey.clear();
}

/** Preferred host for this token; defaults to Instagram Login host. */
function preferredGraphHost(token: string): GraphHostKind {
  return graphHostByTokenKey.get(tokenHostKey(token)) ?? 'instagram';
}

function rememberGraphHost(token: string, host: GraphHostKind): void {
  graphHostByTokenKey.set(tokenHostKey(token), host);
}

/**
 * Retry configuration
 * Following EXTERNAL_SERVICES.md defaults
 */
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 4000; // 4 seconds

/**
 * Incident kill switch. Call before any outbound Meta send or public reply.
 * Inbound webhook processing must keep running when this throws.
 */
export function assertOutboundMessagingEnabled(correlationId: string, kind: string): void {
  if (!env.OUTBOUND_MESSAGING_DISABLED) return;
  logger.info({ correlationId, kind }, 'outbound_disabled_skip');
  throw new ServiceUnavailableError('Outbound messaging is disabled');
}

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
 * Reference: [EXTERNAL_SERVICES.md](../../docs/Reference/engineering/operations/EXTERNAL_SERVICES.md) - Meta platform patterns
 */
export async function sendInstagramMessage(
  recipientId: string,
  message: string,
  correlationId: string,
  accessToken?: string,
  doctorId?: string
): Promise<InstagramSendMessageResponse> {
  assertOutboundMessagingEnabled(correlationId, 'instagram_dm');
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
    throw new InternalError(
      'Instagram access token not configured (no token passed and INSTAGRAM_ACCESS_TOKEN unset)'
    );
  }

  return sendWithRetry({ id: recipientId }, message, correlationId, token, doctorId);
}

/**
 * Private reply to an Instagram or Facebook comment via Send API.
 * POST /me/messages with recipient.comment_id — Meta's sanctioned path
 * when the person has not opened a messaging window.
 * One private reply per comment, within 7 days (enforced by Meta).
 *
 * Do not use sendInstagramMessage(commenterUserId) for this: that is a
 * user-id RESPONSE send with no inbound DM, which is the unsolicited-DM shape.
 */
export async function sendInstagramPrivateReply(
  commentId: string,
  message: string,
  correlationId: string,
  accessToken: string,
  doctorId?: string
): Promise<InstagramSendMessageResponse> {
  assertOutboundMessagingEnabled(correlationId, 'comment_private_reply');
  if (!commentId || typeof commentId !== 'string') {
    throw new AppError('Comment ID is required', 400);
  }

  if (!message || typeof message !== 'string') {
    throw new AppError('Message is required', 400);
  }

  if (message.length > 2000) {
    throw new AppError('Message too long (max 2000 characters)', 400);
  }

  const token = accessToken.trim();
  if (!token) {
    throw new InternalError('Instagram access token not configured');
  }

  return sendWithRetry({ comment_id: commentId }, message, correlationId, token, doctorId);
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
  const token = accessToken.trim();
  const fetchMessage = async (base: string) => {
    const url = `${base}/${encodeURIComponent(messageId)}`;
    const res = await axios.get<{ from?: { id?: string } }>(url, {
      params: { fields: 'from', access_token: token },
      timeout: 8000,
    });
    const fromId = res.data?.from?.id;
    return fromId && String(fromId).length > 0 ? String(fromId) : null;
  };
  try {
    const fromId = await fetchMessage(FACEBOOK_GRAPH_BASE);
    if (fromId) return fromId;
  } catch {
    // Fall through to try Instagram
  }
  try {
    return await fetchMessage(INSTAGRAM_GRAPH_BASE);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const errorBody = err.response?.data as
        | { error?: { message?: string; code?: number; type?: string } }
        | undefined;
      const metaError = errorBody?.error?.message ?? err.message;
      if (status === 404) {
        logger.debug({ correlationId, messageId }, 'Instagram message not found (may be too old)');
        return null;
      }
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
        {
          correlationId,
          messageId,
          message: err instanceof Error ? err.message : 'Request failed',
        },
        'Could not fetch Instagram message sender'
      );
    }
    return null;
  }
}

/**
 * Fallback: get sender from the most recent conversation when message lookup fails.
 * Used when message_edit has no sender in payload. For single-conversation setups,
 * the most recent conversation is from the person who just messaged.
 *
 * @param accessToken - Instagram User access token
 * @param correlationId - For logging only
 * @param igId - Optional. Use this ID for /conversations when provided (from webhook entry.id).
 *               Webhook entry.id is the IG account that received the message; using it
 *               can fix empty /me/conversations when IDs differ.
 * @returns Sender ID (IGSID) from the most recent customer message, or null
 */
export async function getSenderFromMostRecentConversation(
  accessToken: string,
  correlationId: string,
  igId?: string
): Promise<string | null> {
  const token = accessToken.trim();
  if (!token) return null;
  const params = { access_token: token, platform: 'instagram' as const };

  const tryFetch = async (base: string, target: string): Promise<Array<{ id?: string }>> => {
    const res = await axios.get<{ data?: Array<{ id?: string }> }>(
      `${base}/${target}/conversations`,
      { params: { ...params }, timeout: 8000 }
    );
    return res.data?.data ?? [];
  };

  const tryGetMessages = async (
    base: string,
    convId: string,
    ourId: string
  ): Promise<string | null> => {
    const msgRes = await axios.get<{
      data?: Array<{ from?: { id?: string }; id?: string }>;
    }>(`${base}/${convId}/messages`, {
      params: { fields: 'from,id', access_token: token },
      timeout: 8000,
    });
    const messages = msgRes.data?.data ?? [];
    for (const m of messages) {
      const fromId = m.from?.id;
      if (fromId && String(fromId) !== String(ourId)) {
        return String(fromId);
      }
    }
    return null;
  };

  try {
    // Page tokens work with graph.facebook.com; Instagram user tokens with graph.instagram.com.
    // Try Facebook Graph first (doctor connects via Page OAuth → Page token).
    const targets = igId ? [igId, 'me'] : ['me'];
    for (const base of [FACEBOOK_GRAPH_BASE, INSTAGRAM_GRAPH_BASE]) {
      for (const target of targets) {
        try {
          const convList = await tryFetch(base, target);
          const convId = convList[0]?.id;
          if (!convId) continue;

          const meRes = await axios.get<{ data?: Array<{ id?: string }>; id?: string }>(
            `${base}/me`,
            {
              params: { fields: 'id', access_token: token },
              timeout: 8000,
            }
          );
          const ourId = meRes.data?.data?.[0]?.id ?? meRes.data?.id;
          if (!ourId) continue;

          const senderId = await tryGetMessages(base, convId, ourId);
          if (senderId) {
            logger.info(
              { correlationId, base: base.includes('facebook') ? 'fb' : 'ig' },
              'Conversation fallback: resolved sender'
            );
            return senderId;
          }
        } catch (err) {
          const status = axios.isAxiosError(err) ? err.response?.status : undefined;
          if (status === 400 || status === 500) continue;
          throw err;
        }
      }
    }
    logger.info({ correlationId }, 'Conversation fallback: no conversations or sender found');
    return null;
  } catch (err) {
    const msg = axios.isAxiosError(err) ? err.message : 'Request failed';
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    logger.warn(
      { correlationId, message: msg, status },
      'Could not get sender from most recent conversation'
    );
    return null;
  }
}

/** Public reply text for comment outreach — English forever (lang-23 exception list). */
export const COMMENT_PUBLIC_REPLY_TEXT = DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.text;

/**
 * Resolve public username / display name for a comment author (Inbox identity).
 * Prefers IG Comment `from.username` / `username`; falls back across Graph hosts.
 * Never throws — returns null on failure (outreach must not block).
 */
export async function fetchCommentAuthorUsername(
  commentId: string,
  accessToken: string,
  correlationId: string
): Promise<string | null> {
  if (!commentId?.trim() || !accessToken?.trim()) return null;
  const token = accessToken.trim();
  const path = `/${encodeURIComponent(commentId.trim())}`;
  const params = {
    fields: 'from{username,name,id},username',
    access_token: token,
  };

  const tryGet = async (base: string): Promise<string | null> => {
    const res = await axios.get<{
      username?: string;
      from?: { username?: string; name?: string };
    }>(`${base}${path}`, { params, timeout: 10000 });
    const fromUser = res.data?.from?.username?.trim();
    if (fromUser) return fromUser;
    const top = res.data?.username?.trim();
    if (top) return top;
    const name = res.data?.from?.name?.trim();
    return name || null;
  };

  try {
    try {
      return await tryGet(FACEBOOK_GRAPH_BASE);
    } catch (fbErr) {
      const status = axios.isAxiosError(fbErr) ? fbErr.response?.status : undefined;
      const metaCode = axios.isAxiosError(fbErr)
        ? (fbErr.response?.data as { error?: { code?: number } } | undefined)?.error?.code
        : undefined;
      if (status !== 400 && status !== 401 && metaCode !== 190) {
        logger.debug(
          { correlationId, commentId, status, metaCode },
          'Comment author username: graph.facebook.com failed'
        );
        return null;
      }
      return await tryGet(INSTAGRAM_GRAPH_BASE);
    }
  } catch (err) {
    logger.debug(
      {
        correlationId,
        commentId,
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
      },
      'Comment author username lookup failed'
    );
    return null;
  }
}

export type MessengerUserProfile = {
  /** @handle when available; otherwise display name (may contain spaces — not linkable). */
  username: string | null;
  /** Temporary CDN URL from Meta (expires in a few days). */
  profilePic: string | null;
};

/**
 * Instagram / Messenger user profile for an IGSID/PSID (Inbox identity + avatar).
 * Best-effort; fields null when unavailable.
 */
export async function fetchMessengerUserProfile(
  igsid: string,
  accessToken: string,
  correlationId: string
): Promise<MessengerUserProfile> {
  const empty: MessengerUserProfile = { username: null, profilePic: null };
  if (!igsid?.trim() || !accessToken?.trim()) return empty;
  const token = accessToken.trim();
  const path = `/${encodeURIComponent(igsid.trim())}`;
  const tryGet = async (base: string): Promise<MessengerUserProfile> => {
    const res = await axios.get<{
      username?: string;
      name?: string;
      profile_pic?: string;
    }>(`${base}${path}`, {
      params: { fields: 'username,name,profile_pic', access_token: token },
      timeout: 10000,
    });
    const username = res.data?.username?.trim() || res.data?.name?.trim() || null;
    const profilePic = res.data?.profile_pic?.trim() || null;
    return { username, profilePic };
  };
  try {
    try {
      return await tryGet(FACEBOOK_GRAPH_BASE);
    } catch {
      return await tryGet(INSTAGRAM_GRAPH_BASE);
    }
  } catch (err) {
    logger.debug(
      {
        correlationId,
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
      },
      'Messenger user profile lookup failed'
    );
    return empty;
  }
}

/**
 * Instagram Messaging user profile username (IGSID) for Inbox identity.
 * Best-effort; null when unavailable.
 */
export async function fetchMessengerUserUsername(
  igsid: string,
  accessToken: string,
  correlationId: string
): Promise<string | null> {
  const profile = await fetchMessengerUserProfile(igsid, accessToken, correlationId);
  return profile.username;
}

/**
 * Reply to an Instagram comment (public reply).
 * POST /{ig-comment-id}/replies per Instagram Graph API.
 *
 * lat-03: Same host preference + fallback as DM send (Instagram Login first).
 *
 * @param commentId - Instagram comment ID (from webhook value.id)
 * @param message - Reply text (use COMMENT_PUBLIC_REPLY_TEXT for outreach)
 * @param accessToken - Doctor's Instagram access token (from doctor_instagram)
 * @param correlationId - For logging (no PHI)
 * @returns Reply comment ID or null on non-retryable failure
 */
export async function replyToInstagramComment(
  commentId: string,
  message: string,
  accessToken: string,
  correlationId: string
): Promise<{ replyId: string } | null> {
  assertOutboundMessagingEnabled(correlationId, 'instagram_comment_reply');
  if (!commentId || !message?.trim() || !accessToken) {
    return null;
  }

  const token = accessToken.trim();
  const trimmedMessage = message.trim();
  const path = `/${encodeURIComponent(commentId)}/replies`;

  const postReply = (base: string) =>
    axios.post<{ id?: string }>(`${base}${path}`, null, {
      params: { message: trimmedMessage, access_token: token },
      timeout: 15000,
    });

  const metaErrorFrom = (
    err: unknown
  ): { status?: number; metaCode?: number; metaMessage?: string } => {
    if (!axios.isAxiosError(err)) return {};
    const data = err.response?.data as { error?: { code?: number; message?: string } } | undefined;
    return {
      status: err.response?.status,
      metaCode: data?.error?.code,
      metaMessage: data?.error?.message,
    };
  };

  try {
    let res: Awaited<ReturnType<typeof postReply>>;
    const primary = preferredGraphHost(token);
    const secondary = otherHost(primary);
    try {
      res = await postReply(graphBaseForHost(primary));
      rememberGraphHost(token, primary);
    } catch (primaryErr) {
      const { status, metaCode } = metaErrorFrom(primaryErr);
      // Wrong-host tokens fail with 400/401/190; retry the other Graph host.
      const tryAlternate = status === 400 || status === 401 || metaCode === 190;
      if (!tryAlternate) {
        throw primaryErr;
      }
      logger.debug(
        {
          correlationId,
          commentId,
          status,
          metaCode,
          primaryHost: primary,
          fallbackHost: secondary,
        },
        'Comment reply: preferred Graph host failed; trying alternate'
      );
      res = await postReply(graphBaseForHost(secondary));
      rememberGraphHost(token, secondary);
    }

    const replyId = res.data?.id;
    if (replyId) {
      await logAuditEvent({
        correlationId,
        userId: undefined,
        action: 'comment_reply',
        resourceType: 'instagram_comment',
        status: 'success',
        metadata: { comment_id: commentId, reply_id: replyId },
      });
      return { replyId };
    }
    return null;
  } catch (err) {
    const { status, metaCode, metaMessage } = metaErrorFrom(err);

    if (status === 403 || status === 404 || metaCode === 100) {
      logger.warn(
        { correlationId, commentId, status, metaCode, metaMessage },
        'Comment reply failed (user blocked, comment deleted, or permission denied)'
      );
      return null;
    }

    if (status === 429) {
      logger.warn({ correlationId, commentId }, 'Comment reply: Instagram API rate limit (429)');
      throw new TooManyRequestsError('Instagram API rate limit exceeded');
    }

    logger.warn(
      {
        correlationId,
        commentId,
        status,
        metaCode,
        metaMessage,
        message: err instanceof Error ? err.message : String(err),
      },
      'Comment reply failed'
    );
    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'comment_reply',
      resourceType: 'instagram_comment',
      status: 'failure',
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
      metadata: { comment_id: commentId },
    });
    return null;
  }
}

/**
 * Send image to Instagram user via URL.
 * Meta fetches the URL when sending; URL must be HTTPS and accessible.
 *
 * @param recipientId - Instagram user ID
 * @param imageUrl - HTTPS URL to image (JPEG, PNG; max 8MB)
 * @param correlationId - For logging (no PHI)
 * @param accessToken - Optional doctor token; else env token
 */
export async function sendInstagramImage(
  recipientId: string,
  imageUrl: string,
  correlationId: string,
  accessToken?: string
): Promise<InstagramSendMessageResponse> {
  assertOutboundMessagingEnabled(correlationId, 'instagram_image');
  if (!recipientId || !imageUrl?.startsWith('https://')) {
    throw new AppError('Invalid recipient or image URL', 400);
  }
  const token = accessToken ?? env.INSTAGRAM_ACCESS_TOKEN ?? null;
  if (!token) {
    throw new InternalError('Instagram access token not configured');
  }
  const payload = {
    recipient: { id: recipientId },
    messaging_type: 'RESPONSE' as const,
    message: {
      attachment: { type: 'image' as const, payload: { url: imageUrl } },
    },
  };
  try {
    const res = await axios.post<InstagramSendMessageResponse>(
      `${FACEBOOK_GRAPH_BASE}/me/messages`,
      payload,
      { headers: { Authorization: `Bearer ${token.trim()}` }, timeout: 15000 }
    );
    if (res.data) {
      await logAuditEvent({
        correlationId,
        userId: undefined,
        action: 'send_message',
        resourceType: 'instagram_message',
        status: 'success',
        metadata: { recipient_id: recipientId, type: 'image', message_id: res.data.message_id },
      });
      return res.data;
    }
  } catch (error) {
    const err = mapInstagramError(error, correlationId);
    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'send_message',
      resourceType: 'instagram_message',
      status: 'failure',
      errorMessage: err.message,
      metadata: { recipient_id: recipientId, type: 'image' },
    });
    throw err;
  }
  throw new InternalError('Failed to send Instagram image');
}

/**
 * Send a file (PDF) attachment via Instagram DM (T3.17).
 *
 * Uses Meta's `attachment.payload.url` flow with `type='file'`. Meta
 * fetches the URL server-side at send time, so the URL must be HTTPS
 * and reachable within ~15s. We pass a fresh signed Supabase Storage
 * URL with a 24h TTL — comfortably within Meta's fetch window.
 *
 * Sibling of `sendInstagramImage`. Kept as a separate function (not a
 * type discriminator) because the audit metadata + size constraints
 * differ slightly: PDFs allow up to 25MB per Meta's docs (vs 8MB
 * for images), and the audit `metadata.type` is the discriminator
 * downstream observers grep for.
 */
export async function sendInstagramFile(
  recipientId: string,
  fileUrl: string,
  correlationId: string,
  accessToken?: string
): Promise<InstagramSendMessageResponse> {
  assertOutboundMessagingEnabled(correlationId, 'instagram_file');
  if (!recipientId || !fileUrl?.startsWith('https://')) {
    throw new AppError('Invalid recipient or file URL', 400);
  }
  const token = accessToken ?? env.INSTAGRAM_ACCESS_TOKEN ?? null;
  if (!token) {
    throw new InternalError('Instagram access token not configured');
  }
  const payload = {
    recipient: { id: recipientId },
    messaging_type: 'RESPONSE' as const,
    message: {
      attachment: { type: 'file' as const, payload: { url: fileUrl } },
    },
  };
  try {
    const res = await axios.post<InstagramSendMessageResponse>(
      `${FACEBOOK_GRAPH_BASE}/me/messages`,
      payload,
      { headers: { Authorization: `Bearer ${token.trim()}` }, timeout: 15000 }
    );
    if (res.data) {
      await logAuditEvent({
        correlationId,
        userId: undefined,
        action: 'send_message',
        resourceType: 'instagram_message',
        status: 'success',
        metadata: {
          recipient_id: recipientId,
          type: 'file',
          message_id: res.data.message_id,
        },
      });
      return res.data;
    }
  } catch (error) {
    const err = mapInstagramError(error, correlationId);
    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'send_message',
      resourceType: 'instagram_message',
      status: 'failure',
      errorMessage: err.message,
      metadata: { recipient_id: recipientId, type: 'file' },
    });
    throw err;
  }
  throw new InternalError('Failed to send Instagram file');
}

/**
 * Send message with retry logic
 *
 * Implements exponential backoff for retryable errors (429, 5xx).
 * Does not retry on client errors (4xx except 429).
 *
 * @param token - Access token for the Instagram account (never logged)
 */
type MessageRecipient = { id: string } | { comment_id: string };

function recipientAuditMeta(recipient: MessageRecipient): Record<string, string> {
  return 'comment_id' in recipient
    ? { recipient_kind: 'comment_id', comment_id: recipient.comment_id }
    : { recipient_kind: 'user_id', recipient_id: recipient.id };
}

function sendAuditMetadata(
  recipientMeta: Record<string, string>,
  extra: Record<string, unknown>,
  doctorId?: string
): Record<string, unknown> {
  return {
    ...recipientMeta,
    ...extra,
    ...(doctorId ? { doctor_id: doctorId } : {}),
  };
}

async function sendWithRetry(
  recipient: MessageRecipient,
  message: string,
  correlationId: string,
  token: string,
  doctorId?: string
): Promise<InstagramSendMessageResponse> {
  let lastError: Error | null = null;
  const recipientMeta = recipientAuditMeta(recipient);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await sendMessageAPI(recipient, message, correlationId, token);

      // Log success (metadata only - NEVER log message content)
      // resourceId omitted: Instagram message_id is not UUID, audit_logs.resource_id expects UUID
      await logAuditEvent({
        correlationId,
        userId: undefined, // System operation
        action: 'send_message',
        resourceType: 'instagram_message',
        status: 'success',
        metadata: sendAuditMetadata(
          recipientMeta,
          { message_length: message.length, message_id: response.message_id },
          doctorId
        ),
      });

      return response;
    } catch (error) {
      lastError = error as Error;

      // Map error (if already AppError, use it; otherwise map from AxiosError)
      const appError = error instanceof AppError ? error : mapInstagramError(error, correlationId);

      // Don't retry on client errors (except 429)
      if (
        appError instanceof UnauthorizedError ||
        appError instanceof ForbiddenError ||
        appError instanceof NotFoundError ||
        appError instanceof MessageWindowExpiredError
      ) {
        // Log failure (sanitized error message)
        await logAuditEvent({
          correlationId,
          userId: undefined,
          action: 'send_message',
          resourceType: 'instagram_message',
          status: 'failure',
          errorMessage: appError.message,
          metadata: sendAuditMetadata(
            recipientMeta,
            { message_length: message.length, error_type: appError.constructor.name },
            doctorId
          ),
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
            metadata: sendAuditMetadata(
              recipientMeta,
              {
                message_length: message.length,
                error_type: 'TooManyRequestsError',
                retry_attempts: attempt + 1,
              },
              doctorId
            ),
          });

          throw appError;
        }

        logger.warn(
          {
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
            delay,
            correlationId,
            ...recipientMeta,
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
      const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);

      logger.warn(
        {
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delay,
          correlationId,
          ...recipientMeta,
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
  const appError =
    finalError instanceof AppError ? finalError : mapInstagramError(finalError, correlationId);

  await logAuditEvent({
    correlationId,
    userId: undefined,
    action: 'send_message',
    resourceType: 'instagram_message',
    status: 'failure',
    errorMessage: appError.message,
    metadata: sendAuditMetadata(
      recipientMeta,
      {
        message_length: message.length,
        error_type: appError.constructor.name,
        retry_attempts: MAX_RETRIES + 1,
      },
      doctorId
    ),
  });

  throw appError;
}

/**
 * Make Instagram API call
 *
 * Performs the actual HTTP request to Instagram Graph API.
 * lat-03: Prefer the last-known-good host for this token (default:
 * graph.instagram.com for Instagram Login). On code 190, try the other host
 * and remember which one succeeded — so we never pay a guaranteed-fail hop
 * on every subsequent send.
 *
 * @param token - Access token (never logged)
 */
async function sendMessageAPI(
  recipient: MessageRecipient,
  message: string,
  correlationId: string,
  token: string
): Promise<InstagramSendMessageResponse> {
  const payload: InstagramSendMessageRequest =
    'comment_id' in recipient
      ? {
          recipient: { comment_id: recipient.comment_id },
          message: { text: message },
        }
      : {
          recipient: { id: recipient.id },
          messaging_type: 'RESPONSE',
          message: { text: message },
        };
  const trimmed = token.trim();
  const opts = {
    headers: { Authorization: `Bearer ${trimmed}` },
    timeout: 10000,
  };

  const primary = preferredGraphHost(trimmed);
  const secondary = otherHost(primary);

  try {
    const response = await axios.post<InstagramSendMessageResponse>(
      `${graphBaseForHost(primary)}/me/messages`,
      payload,
      opts
    );
    rememberGraphHost(trimmed, primary);
    return response.data;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const errData = axios.isAxiosError(error) ? error.response?.data : undefined;
    const code = (errData as { error?: { code?: number } })?.error?.code;
    // Match comment-reply host fallback: wrong-host tokens often return 400/401/190.
    const tryAlternate = status === 400 || status === 401 || code === 190;
    if (tryAlternate) {
      logger.debug(
        { correlationId, primaryHost: primary, fallbackHost: secondary, status, metaCode: code },
        'Graph host rejected token; trying alternate host'
      );
      try {
        const fallback = await axios.post<InstagramSendMessageResponse>(
          `${graphBaseForHost(secondary)}/me/messages`,
          payload,
          opts
        );
        rememberGraphHost(trimmed, secondary);
        return fallback.data;
      } catch {
        throw mapInstagramError(error, correlationId);
      }
    }
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
/** Meta Graph: message sent outside the 24-hour customer window. */
const MESSAGING_WINDOW_EXPIRED_SUBCODES = new Set([2534022, 2018278, 2018065]);

function isMessagingWindowExpiredError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const ig = error.response?.data?.error as InstagramApiError['error'] | undefined;
  if (!ig) return false;
  if (
    ig.code === 10 &&
    ig.error_subcode != null &&
    MESSAGING_WINDOW_EXPIRED_SUBCODES.has(ig.error_subcode)
  ) {
    return true;
  }
  return (
    ig.code === 10 &&
    typeof ig.message === 'string' &&
    /outside of allowed window/i.test(ig.message)
  );
}

export function mapInstagramError(error: unknown, correlationId: string): AppError {
  // If already an AppError, return as-is
  if (error instanceof AppError) {
    return error;
  }
  if (isMessagingWindowExpiredError(error)) {
    return new MessageWindowExpiredError('Instagram messaging window has expired');
  }
  // Handle axios errors
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data?.error as InstagramApiError['error'] | undefined;

    // Map by HTTP status code
    switch (statusCode) {
      case 401:
        return new UnauthorizedError(errorData?.message || 'Instagram API authentication failed');
      case 403:
        return new ForbiddenError(errorData?.message || 'Instagram API permission denied');
      case 404:
        return new NotFoundError(errorData?.message || 'Instagram recipient not found');
      case 429:
        return new TooManyRequestsError(errorData?.message || 'Instagram API rate limit exceeded');
      case 500:
      case 502:
      case 503:
      case 504:
        return new InternalError(errorData?.message || 'Instagram API server error');
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

      // No matching user found (2018001) - invalid recipient or ID scope mismatch; do not retry
      if (instagramError.code === 100 && instagramError.error_subcode === 2018001) {
        return new NotFoundError(
          instagramError.message || 'Instagram recipient not found (no matching user)'
        );
      }
    }
  }

  // Unknown error - log full Meta response for 400 debugging
  if (axios.isAxiosError(error) && error.response?.status === 400) {
    const errData = error.response?.data as
      | { error?: { message?: string; code?: number; error_subcode?: number; type?: string } }
      | undefined;
    logger.error(
      {
        correlationId,
        status: 400,
        metaError: errData?.error?.message,
        metaCode: errData?.error?.code,
        metaSubcode: errData?.error?.error_subcode,
        metaType: errData?.error?.type,
        metaResponse: errData,
      },
      'Instagram API 400 - check Meta error for recipient/token/messaging_type'
    );
  } else {
    logger.error(
      {
        error,
        correlationId,
        error_name: error instanceof Error ? error.name : 'Unknown',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
      'Unknown Instagram API error'
    );
  }
  return new InternalError('Failed to send Instagram message');
}
