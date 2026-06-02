/**
 * RBH-20: Single structured info log per DM turn (after branch decision, before/alongside persist).
 */

import { logger } from '../config/logger';
import type { InstagramDmRoutingLogFields } from '../types/dm-instrumentation';

const LOG_MESSAGE = 'instagram_dm_routing' as const;

export function logInstagramDmRouting(fields: InstagramDmRoutingLogFields): void {
  logger.info(
    {
      ...fields,
      intent_topics: fields.intent_topics ?? [],
      is_fee_question: fields.is_fee_question ?? false,
    },
    LOG_MESSAGE
  );
}
