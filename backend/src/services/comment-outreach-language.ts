/**
 * Resolve sticky language for proactive comment DMs (lang-23 / LANG5-D6).
 *
 * Never detect from comment text — a public comment can come from someone other
 * than the patient, and letting it set thread language would allow a stranger to
 * re-language a patient's conversation.
 */

import type { ConversationLanguage } from '../utils/conversation-language';
import {
  findConversationByPlatformId,
  getConversationLanguage,
} from './conversation-service';

export async function resolveCommentOutreachLanguage(
  doctorId: string,
  platform: 'instagram' | 'facebook',
  commenterPlatformId: string,
  correlationId: string
): Promise<ConversationLanguage> {
  try {
    const linked = await findConversationByPlatformId(
      doctorId,
      platform,
      commenterPlatformId,
      correlationId
    );
    if (!linked) return 'en';
    return getConversationLanguage(linked.id, correlationId);
  } catch {
    return 'en';
  }
}
