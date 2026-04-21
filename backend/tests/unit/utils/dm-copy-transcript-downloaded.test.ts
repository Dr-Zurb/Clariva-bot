/**
 * Unit tests for `buildTranscriptDownloadedNotificationDm`
 * (Plan 07 · Task 32 — transcript PDF export).
 *
 * Pins:
 *   - Decision 4 LOCKED principle 8: non-alarming "this is a normal part
 *     of care" framing for every artifact-access DM.
 *   - "downloaded the written transcript" wording (distinct from the
 *     replay DM's "reviewed the audio/transcript" wording — reviewed ≠
 *     downloaded; the distinction matters because a download is
 *     higher-sensitivity than a review).
 *   - Practice name fallback to a neutral phrase.
 *   - Empty `consultDateLabel` throws (caller-bug surfacing).
 */

import { describe, it, expect } from '@jest/globals';
import { buildTranscriptDownloadedNotificationDm } from '../../../src/utils/dm-copy';

describe('buildTranscriptDownloadedNotificationDm', () => {
  it('renders all load-bearing pieces with practice + date + framing', () => {
    const dm = buildTranscriptDownloadedNotificationDm({
      practiceName:     "Dr. Sharma's Clinic",
      consultDateLabel: '19 Apr 2026',
    });
    expect(dm).toContain("Dr. Sharma's Clinic");
    expect(dm).toContain('19 Apr 2026');
    expect(dm).toContain('downloaded the written transcript');
    expect(dm).toContain('normal part of care');
    expect(dm).toContain('Every access is audited');
    expect(dm).toContain('ask support for the access log');
  });

  it("falls back to 'your doctor's clinic' when practice name is blank", () => {
    const dm = buildTranscriptDownloadedNotificationDm({
      practiceName:     '   ',
      consultDateLabel: '19 Apr 2026',
    });
    expect(dm).toContain("your doctor's clinic");
  });

  it("falls back to 'your doctor's clinic' when practice name is omitted", () => {
    const dm = buildTranscriptDownloadedNotificationDm({
      consultDateLabel: '19 Apr 2026',
    });
    expect(dm).toContain("your doctor's clinic");
  });

  it('throws when consultDateLabel is empty (caller-bug surface)', () => {
    expect(() =>
      buildTranscriptDownloadedNotificationDm({
        practiceName:     "Dr. Sharma's Clinic",
        consultDateLabel: '   ',
      }),
    ).toThrow(/consultDateLabel is required/i);
  });

  it('produces a stable golden string (drift guard)', () => {
    const dm = buildTranscriptDownloadedNotificationDm({
      practiceName:     "Dr. Sharma's Clinic",
      consultDateLabel: '19 Apr 2026',
    });
    expect(dm).toMatchInlineSnapshot(`
      "Your doctor at Dr. Sharma's Clinic downloaded the written transcript of your consult on 19 Apr 2026.

      This is a normal part of care (doctors often review transcripts to confirm the plan).
      Every access is audited, and you can ask support for the access log anytime."
    `);
  });

  it('is distinct from buildRecordingReplayedNotificationDm (downloaded ≠ reviewed)', async () => {
    const { buildRecordingReplayedNotificationDm } = await import(
      '../../../src/utils/dm-copy'
    );
    const downloaded = buildTranscriptDownloadedNotificationDm({
      practiceName:     "Dr. Sharma's Clinic",
      consultDateLabel: '19 Apr 2026',
    });
    const reviewed = buildRecordingReplayedNotificationDm({
      practiceName:     "Dr. Sharma's Clinic",
      consultDateLabel: '19 Apr 2026',
      artifactType:     'transcript',
    });
    // The two builders share the clinic + date + audit-framing vocabulary
    // but differ on the verb: "downloaded" vs "reviewed". Keeping them as
    // two builders lets a future product change edit one without the
    // other leaking.
    expect(downloaded).toContain('downloaded');
    expect(reviewed).toContain('reviewed');
    expect(downloaded).not.toEqual(reviewed);
  });
});
