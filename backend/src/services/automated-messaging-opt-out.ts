/**
 * Automated Meta-messaging opt-out (mca-06…08).
 *
 * Distinct from consent revoke (data deletion). This flag only suppresses
 * automated Instagram/Facebook sends. Doctor dashboard / native inbox
 * replies are not gated here.
 */

import { logger } from '../config/logger';
import {
  findConversationByPlatformId,
  readAutomatedMessagingOptedOutAt,
  setAutomatedMessagingOptedOutAt,
} from './conversation-service';

export function isAutomatedMessagingOptedOutStamp(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

const STOP_EXACT =
  /^\s*(please\s+)?(stop|unsubscribe|opt[-\s]?out)(\s+messaging(\s+me)?)?\s*[.!]*\s*$/i;
const STOP_PHRASE =
  /\b(stop messaging( me)?|don'?t (message|text|dm) me|do not (message|text|dm) me|unsubscribe|opt[-\s]?out|message mat bhejo|msg mat bhejo|messages?\s+band(\s+karo)?|band karo messages?)\b/i;

const START_EXACT =
  /^\s*(please\s+)?(start|resume|opt[-\s]?in)(\s+(again|messaging(\s+me)?))?\s*[.!]*\s*$/i;
const START_PHRASE =
  /\b(start messaging|message me again|resume messaging|opt[-\s]?in|shuru karo)\b/i;

export function isStopMessagingText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return STOP_EXACT.test(trimmed) || STOP_PHRASE.test(trimmed);
}

export function isStartMessagingText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return START_EXACT.test(trimmed) || START_PHRASE.test(trimmed);
}

export type AutomatedMetaSkipReason = 'opted_out' | 'flag_unreadable' | 'conversation_missing';

export async function shouldSkipAutomatedMetaSend(params: {
  conversationId: string | null | undefined;
  correlationId: string;
  /** When conversation id is absent. Appointment fan-out: skip. New commenter: allow. */
  ifMissing: 'skip' | 'allow';
}): Promise<{ skip: boolean; reason?: AutomatedMetaSkipReason }> {
  const { conversationId, correlationId, ifMissing } = params;
  if (!conversationId) {
    if (ifMissing === 'allow') return { skip: false };
    logger.info({ correlationId, reason: 'conversation_missing' }, 'Automated Meta send skipped');
    return { skip: true, reason: 'conversation_missing' };
  }

  const read = await readAutomatedMessagingOptedOutAt(conversationId, correlationId);
  if (!read.ok) {
    logger.info(
      { correlationId, conversationId, reason: 'flag_unreadable' },
      'Automated Meta send skipped'
    );
    return { skip: true, reason: 'flag_unreadable' };
  }
  if (isAutomatedMessagingOptedOutStamp(read.optedOutAt)) {
    logger.info(
      { correlationId, conversationId, reason: 'opted_out' },
      'Automated Meta send skipped'
    );
    return { skip: true, reason: 'opted_out' };
  }
  return { skip: false };
}

export async function persistAutomatedMessagingOptOut(
  conversationId: string,
  correlationId: string
): Promise<boolean> {
  return setAutomatedMessagingOptedOutAt(conversationId, new Date().toISOString(), correlationId);
}

export async function persistAutomatedMessagingOptIn(
  conversationId: string,
  correlationId: string
): Promise<boolean> {
  return setAutomatedMessagingOptedOutAt(conversationId, null, correlationId);
}

/** Comment private-reply: unknown commenter is allowed; known opted-out thread is not. */
export async function shouldSkipCommentPrivateReply(params: {
  doctorId: string;
  platform: 'instagram' | 'facebook';
  commenterPlatformId: string;
  correlationId: string;
}): Promise<boolean> {
  try {
    const linked = await findConversationByPlatformId(
      params.doctorId,
      params.platform,
      params.commenterPlatformId,
      params.correlationId
    );
    if (!linked) return false;
    if (isAutomatedMessagingOptedOutStamp(linked.automated_messaging_opted_out_at)) {
      logger.info(
        {
          correlationId: params.correlationId,
          conversationId: linked.id,
          reason: 'opted_out',
        },
        'Automated Meta send skipped'
      );
      return true;
    }
    return false;
  } catch {
    logger.info(
      { correlationId: params.correlationId, reason: 'flag_unreadable' },
      'Automated Meta send skipped'
    );
    return true;
  }
}
