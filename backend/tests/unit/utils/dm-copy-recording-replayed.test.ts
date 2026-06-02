/**
 * Unit tests for `buildRecordingReplayedNotificationDm`
 * (Plan 07 · Task 30 — Mutual replay notifications).
 *
 * Pins:
 *   - Decision 4 / Principle 8 NON-ALARMING framing: every variant
 *     contains the load-bearing "normal part of care" sentence and the
 *     "every access is audited" assurance. Drift on either line is a
 *     trust-policy violation, not a copy preference.
 *   - The DM names the artifact type ("audio" vs "transcript") so the
 *     patient knows what was reviewed.
 *   - The consult date label is rendered verbatim — caller owns
 *     timezone math.
 *   - The practice name is honored when present and falls back to a
 *     neutral phrase when missing/blank.
 *   - Empty `consultDateLabel` throws (caller-bug surfacing — see the
 *     builder comment).
 */

import { describe, it, expect } from '@jest/globals';
import { buildRecordingReplayedNotificationDm } from '../../../src/utils/dm-copy';

describe('buildRecordingReplayedNotificationDm', () => {
  it('renders the audio variant with practice name + date', () => {
    const dm = buildRecordingReplayedNotificationDm({
      practiceName:     'Sunrise Clinic',
      consultDateLabel: '15 Apr 2026',
      artifactType:     'audio',
    });
    expect(dm).toContain('Sunrise Clinic');
    expect(dm).toContain('audio');
    expect(dm).toContain('15 Apr 2026');
    // Decision 4 / Principle 8 — non-alarming framing.
    expect(dm).toContain('normal part of care');
    expect(dm).toContain('audited');
  });

  it('renders the transcript variant', () => {
    const dm = buildRecordingReplayedNotificationDm({
      practiceName:     'Sunrise Clinic',
      consultDateLabel: '15 Apr 2026',
      artifactType:     'transcript',
    });
    expect(dm).toContain('transcript');
    expect(dm).not.toMatch(/\baudio\b/);
  });

  it("falls back to 'your doctor's clinic' when practice name is blank", () => {
    const dm = buildRecordingReplayedNotificationDm({
      practiceName:     '   ',
      consultDateLabel: '15 Apr 2026',
      artifactType:     'audio',
    });
    expect(dm).toContain("your doctor's clinic");
  });

  it("falls back to 'your doctor's clinic' when practice name is omitted", () => {
    const dm = buildRecordingReplayedNotificationDm({
      consultDateLabel: '15 Apr 2026',
      artifactType:     'audio',
    });
    expect(dm).toContain("your doctor's clinic");
  });

  it('throws when consultDateLabel is empty (caller-bug surface)', () => {
    expect(() =>
      buildRecordingReplayedNotificationDm({
        practiceName:     'Sunrise Clinic',
        consultDateLabel: '   ',
        artifactType:     'audio',
      }),
    ).toThrow(/consultDateLabel is required/i);
  });

  it('produces a stable golden string (drift guard)', () => {
    const dm = buildRecordingReplayedNotificationDm({
      practiceName:     'Sunrise Clinic',
      consultDateLabel: '15 Apr 2026',
      artifactType:     'audio',
    });
    expect(dm).toMatchInlineSnapshot(`
      "Your doctor at Sunrise Clinic reviewed the audio of your consult on 15 Apr 2026.

      This is a normal part of care (doctors often revisit consults to refine their plan).
      Every access is audited, and you can ask support for the access log anytime."
    `);
  });
});
