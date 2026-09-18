/**
 * rec-09 — DM audio-recording disclosure (replaces the retired consent ask).
 *
 * Pins shape + semantics of `buildRecordingAudioDisclosureMessage`.
 * Golden bytes live in `dm-copy.snap.test.ts`.
 */

import { describe, expect, it } from '@jest/globals';
import {
  BOOKING_AUDIO_RECORDING_DISCLOSURE,
  buildRecordingAudioDisclosureMessage,
} from '../../../src/utils/dm-copy';

describe('buildRecordingAudioDisclosureMessage', () => {
  it('is the booking disclosure constant (single source)', () => {
    expect(buildRecordingAudioDisclosureMessage()).toBe(BOOKING_AUDIO_RECORDING_DISCLOSURE);
  });

  it('states audio is part of the medical record and does not ask', () => {
    const msg = buildRecordingAudioDisclosureMessage();
    expect(msg).toContain('audio-recorded as part of the medical record');
    expect(msg).not.toMatch(/\b(yes|no|agree|allow|consent|reply)\b/i);
    expect(msg).not.toMatch(/video/i);
    expect(msg).not.toMatch(/download/i);
  });

  it('leads with patient access and replay notification (clauses 3 and 4)', () => {
    const msg = buildRecordingAudioDisclosureMessage();
    expect(msg).toContain('self-serve for 90 days');
    expect(msg).toContain('logged and you are notified');
  });

  it('LANG6-D4 / REC2-D7: English-only, no language param', () => {
    const msg = buildRecordingAudioDisclosureMessage();
    expect(msg).not.toMatch(/reply karein|reply karo/i);
  });
});
