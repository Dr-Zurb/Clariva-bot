/**
 * dm-copy · consultation-ready & prescription-ready ping builders
 * (Plan 01 · Task 16, extended by Plan 04 · Task 21 with the text branch,
 *  and by Plan 05 · Task 26 with the voice branch — Principle 8 LOCKED.)
 *
 * Task 16 shipped the `video` branch; `text` and `voice` threw. Plan 04 ·
 * Task 21 lit the `text` branch. Plan 05 · Task 26 lights the `voice`
 * branch with its Principle-8 disambiguation paragraph. The
 * "voice renders with the audio-only disambiguation" assertion below is
 * load-bearing — it proves Task 26 actually unblocked voice (and didn't
 * regress video / text). The richer voice-specific snapshots live in the
 * dedicated `dm-copy-voice-variant.test.ts` file.
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildConsultationReadyDm,
  buildPrescriptionReadyPingDm,
} from '../../../src/utils/dm-copy';

describe('buildConsultationReadyDm (Task 16)', () => {
  it('renders the video-modality body with bare URL on its own line', () => {
    const out = buildConsultationReadyDm({
      modality:     'video',
      practiceName: 'Acme Clinic',
      joinUrl:      'https://app.clariva.test/consult/join?token=abc',
    });
    expect(out).toMatchInlineSnapshot(`
      "Your video consult with **Acme Clinic** is starting.

      Join here:
      https://app.clariva.test/consult/join?token=abc

      Reply in this thread if anything looks wrong."
    `);
  });

  it('falls back to "your doctor" when practiceName is empty', () => {
    const out = buildConsultationReadyDm({
      modality:     'video',
      practiceName: '   ',
      joinUrl:      'https://x.test/?token=z',
    });
    expect(out.startsWith('Your video consult with **your doctor** is starting.')).toBe(true);
  });

  it('renders voice modality with Principle 8 audio-only disambiguation (Task 26)', () => {
    const out = buildConsultationReadyDm({
      modality:     'voice',
      practiceName: 'Acme Clinic',
      joinUrl:      'https://x.test/?token=z',
    });
    expect(out).toContain('Your voice consult with **Acme Clinic** is starting.');
    expect(out).toContain('audio only');
    expect(out).toContain('NOT a phone call');
    expect(out).toContain('https://x.test/?token=z');
  });

  it('throws on empty joinUrl', () => {
    expect(() =>
      buildConsultationReadyDm({ modality: 'video', joinUrl: '   ' })
    ).toThrow(/joinUrl is required/);
  });
});

describe('buildPrescriptionReadyPingDm (Task 16)', () => {
  it('renders with view URL on its own line when present', () => {
    const out = buildPrescriptionReadyPingDm({
      practiceName: 'Acme Clinic',
      viewUrl:      'https://app.clariva.test/rx/abc-123',
    });
    expect(out).toMatchInlineSnapshot(`
      "Your prescription from **Acme Clinic** is ready.

      View it here:
      https://app.clariva.test/rx/abc-123"
    `);
  });

  it('renders URL-less single-line ping when viewUrl is omitted', () => {
    const out = buildPrescriptionReadyPingDm({ practiceName: 'Acme Clinic' });
    expect(out).toBe(
      'Your prescription from **Acme Clinic** is ready — check your messages above.'
    );
  });
});
