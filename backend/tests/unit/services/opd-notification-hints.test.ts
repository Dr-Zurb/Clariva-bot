/**
 * OPD in-app notification hints (OPD-09)
 */

import { describe, it, expect } from '@jest/globals';
import { buildInAppNotificationHints } from '../../../src/services/opd/opd-notification-hints';

describe('buildInAppNotificationHints', () => {
  it('emits delay_broadcast when delay positive', () => {
    const h = buildInAppNotificationHints({
      opdMode: 'slot',
      delayMinutes: 5,
      earlyInviteAvailable: false,
    });
    expect(h.map((x) => x.type)).toContain('delay_broadcast');
  });

  it('emits early_invite when offered', () => {
    const h = buildInAppNotificationHints({
      opdMode: 'slot',
      delayMinutes: null,
      earlyInviteAvailable: true,
    });
    expect(h.map((x) => x.type)).toContain('early_invite');
  });

  it('emits your_turn_soon in queue when aheadCount <= 2', () => {
    const h = buildInAppNotificationHints({
      opdMode: 'queue',
      delayMinutes: null,
      aheadCount: 1,
    });
    expect(h.map((x) => x.type)).toContain('your_turn_soon');
  });
});
