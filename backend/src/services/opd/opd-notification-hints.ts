/**
 * In-app notification hints for patient OPD snapshot (OPD-09).
 * Clients poll GET /bookings/session/snapshot; use hints for banners / a11y live regions.
 * For queue_position_changed semantics, compare tokenNumber/aheadCount between polls (MVP).
 */

import type { OpdMode } from '../../types/doctor-settings';
import type { OpdInAppNotificationHint } from '../../types/opd-session';

export type { OpdInAppNotificationHint, OpdInAppNotificationType } from '../../types/opd-session';

export function buildInAppNotificationHints(input: {
  opdMode: OpdMode;
  delayMinutes?: number | null;
  earlyInviteAvailable?: boolean;
  aheadCount?: number;
}): OpdInAppNotificationHint[] {
  const out: OpdInAppNotificationHint[] = [];

  if (input.delayMinutes != null && input.delayMinutes > 0) {
    out.push({ type: 'delay_broadcast' });
  }

  if (input.earlyInviteAvailable) {
    out.push({ type: 'early_invite' });
  }

  if (
    input.opdMode === 'queue' &&
    input.aheadCount != null &&
    input.aheadCount <= 2
  ) {
    out.push({ type: 'your_turn_soon' });
  }

  return out;
}
