/**
 * Unit tests for `buildPostConsultChatLinkDm`
 * (Plan 07 · Task 31 — Post-consult chat-history surface).
 *
 * Pins:
 *   - Decision 1 sub-decision LOCKED: indefinite read access framing.
 *     The DM hands over a re-tappable link to the chat history but is
 *     honest about the 90-day URL TTL (the underlying access right is
 *     indefinite — the patient contacts support after 90d to re-mint).
 *   - All four load-bearing pieces are present:
 *       1. consult-complete anchor sentence,
 *       2. "what's behind the link" line (chat + attachments + system notes),
 *       3. the link itself (verbatim — no shortener / wrapping),
 *       4. the 90-day TTL + support recourse line.
 *   - Practice name is honored when present; falls back to a neutral
 *     phrase when missing/blank.
 *   - Empty `joinUrl` or `consultDateLabel` throws (caller-bug surfacing).
 */

import { describe, it, expect } from '@jest/globals';
import { buildPostConsultChatLinkDm } from '../../../src/utils/dm-copy';

describe('buildPostConsultChatLinkDm', () => {
  const VALID_URL = 'https://app.clariva.test/c/history/sess-123?t=hmac.abcdef';

  it('renders all load-bearing pieces with practice name + date + URL', () => {
    const dm = buildPostConsultChatLinkDm({
      practiceName:     "Dr. Sharma's practice",
      joinUrl:          VALID_URL,
      consultDateLabel: '19 Apr 2026',
    });
    expect(dm).toContain("Dr. Sharma's practice");
    expect(dm).toContain('19 Apr 2026');
    expect(dm).toContain('is complete');
    expect(dm).toContain('chat, attachments, and system notes');
    expect(dm).toContain(VALID_URL);
    // Decision 1 sub-decision honesty — 90-day TTL line.
    expect(dm).toMatch(/90 days/);
    expect(dm).toMatch(/contact support/);
  });

  it("falls back to 'your doctor's practice' when practice name is blank", () => {
    const dm = buildPostConsultChatLinkDm({
      practiceName:     '   ',
      joinUrl:          VALID_URL,
      consultDateLabel: '19 Apr 2026',
    });
    expect(dm).toContain("your doctor's practice");
  });

  it("falls back to 'your doctor's practice' when practice name is omitted", () => {
    const dm = buildPostConsultChatLinkDm({
      joinUrl:          VALID_URL,
      consultDateLabel: '19 Apr 2026',
    });
    expect(dm).toContain("your doctor's practice");
  });

  it('throws when joinUrl is empty (caller-bug surface)', () => {
    expect(() =>
      buildPostConsultChatLinkDm({
        practiceName:     "Dr. Sharma's practice",
        joinUrl:          '   ',
        consultDateLabel: '19 Apr 2026',
      }),
    ).toThrow(/joinUrl is required/i);
  });

  it('throws when consultDateLabel is empty (caller-bug surface)', () => {
    expect(() =>
      buildPostConsultChatLinkDm({
        practiceName:     "Dr. Sharma's practice",
        joinUrl:          VALID_URL,
        consultDateLabel: '   ',
      }),
    ).toThrow(/consultDateLabel is required/i);
  });

  it('produces a stable golden string (drift guard)', () => {
    const dm = buildPostConsultChatLinkDm({
      practiceName:     "Dr. Sharma's practice",
      joinUrl:          VALID_URL,
      consultDateLabel: '19 Apr 2026',
    });
    expect(dm).toMatchInlineSnapshot(`
      "Your consultation with Dr. Sharma's practice on 19 Apr 2026 is complete.

      View the full conversation (chat, attachments, and system notes) any time:
      https://app.clariva.test/c/history/sess-123?t=hmac.abcdef

      Available for 90 days. After that, contact support to re-open the link."
    `);
  });
});
