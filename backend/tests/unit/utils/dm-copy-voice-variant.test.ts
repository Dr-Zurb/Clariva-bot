/**
 * dm-copy · voice-modality consult ping & booking-confirmation
 * (Plan 05 · Task 26 — Principle 8 LOCKED disambiguation copy)
 *
 * Two builders covered here:
 *
 *   1. `buildConsultationReadyDm({ modality: 'voice', … })` — newly lit-up
 *      branch. Mirrors the text variant's test file structure. Load-bearing
 *      substring assertions pin `"audio only"` and `"NOT a phone call"` —
 *      the Principle 8 keywords. A future copy-tweak that drops either
 *      fails these assertions loudly (separate from the snapshot).
 *
 *   2. `buildPaymentConfirmationMessage({ modality: 'voice', … })` — newly
 *      gated disambiguation paragraph. The paragraph is inserted BEFORE the
 *      existing closing reminder line; positional assertions pin the
 *      placement. Non-voice modalities (including `undefined`) render
 *      byte-identically to today's output — verified by a parameterized
 *      regression block that re-runs the existing fixture inputs through
 *      the new helper.
 *
 * The generic "video / text branches still render byte-identically"
 * assertion continues to live in `dm-copy.snap.test.ts` and
 * `dm-copy-text-modality.test.ts` — those files will catch any accidental
 * cross-branch leak introduced by this task.
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildConsultationReadyDm,
  buildPaymentConfirmationMessage,
  type PaymentConfirmationModality,
} from '../../../src/utils/dm-copy';

// ---------------------------------------------------------------------------
// buildConsultationReadyDm — voice branch (5-min-before-slot urgent ping)
// ---------------------------------------------------------------------------

describe('buildConsultationReadyDm — voice modality (Task 26 / Principle 8)', () => {
  it('renders the voice-modality body with the audio-only disambiguation paragraph', () => {
    const out = buildConsultationReadyDm({
      modality:     'voice',
      practiceName: 'Acme Clinic',
      joinUrl:      'https://app.clariva.test/c/voice/abc?token=xyz',
    });

    expect(out).toMatchInlineSnapshot(`
      "Your voice consult with **Acme Clinic** is starting.

      👉 This is an internet voice call (audio only) — NOT a phone call. Tap the link below to join from this device.

      https://app.clariva.test/c/voice/abc?token=xyz

      Reply in this thread if anything looks wrong."
    `);
  });

  it('falls back to "your doctor" when practiceName is whitespace-only', () => {
    const out = buildConsultationReadyDm({
      modality:     'voice',
      practiceName: '   ',
      joinUrl:      'https://x.test/?token=z',
    });
    expect(out.startsWith('Your voice consult with **your doctor** is starting.')).toBe(true);
  });

  it('falls back to "your doctor" when practiceName is undefined', () => {
    const out = buildConsultationReadyDm({
      modality: 'voice',
      joinUrl:  'https://x.test/?token=z',
    });
    expect(out.startsWith('Your voice consult with **your doctor** is starting.')).toBe(true);
  });

  it('throws on empty joinUrl (parity with video + text branches)', () => {
    expect(() =>
      buildConsultationReadyDm({ modality: 'voice', joinUrl: '   ' })
    ).toThrow(/joinUrl is required/);
  });

  // --- Load-bearing substrings (survive copy nits that don't touch keywords)
  it('contains the load-bearing "audio only" substring', () => {
    const out = buildConsultationReadyDm({
      modality:     'voice',
      practiceName: 'X',
      joinUrl:      'https://x.test/?t=1',
    });
    expect(out).toContain('audio only');
  });

  it('contains the load-bearing "NOT a phone call" substring (CAPS preserved)', () => {
    // CAPS on the three-word noun phrase is deliberate — banking SMS /
    // government-alert pattern that reads as emphasis, not shouting.
    // Pinning the exact casing catches any "helpful" lowercasing.
    const out = buildConsultationReadyDm({
      modality:     'voice',
      practiceName: 'X',
      joinUrl:      'https://x.test/?t=1',
    });
    expect(out).toContain('NOT a phone call');
    expect(out).not.toContain('not a phone call');
  });

  it('renders the join URL on its own line (bare, no markdown wrapping)', () => {
    const url = 'https://app.clariva.test/c/voice/abc?token=xyz';
    const out = buildConsultationReadyDm({
      modality:     'voice',
      practiceName: 'X',
      joinUrl:      url,
    });
    expect(out.split('\n')).toContain(url);
  });
});

// ---------------------------------------------------------------------------
// buildPaymentConfirmationMessage — voice modality disambiguation
// ---------------------------------------------------------------------------

describe('buildPaymentConfirmationMessage — voice modality (Task 26 / Principle 8)', () => {
  it('renders the happy-path voice body with disambiguation paragraph', () => {
    const out = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      patientMrn: 'CLR-00123',
      modality: 'voice',
    });

    expect(out).toMatchInlineSnapshot(`
      "✅ **Payment received.**

      Your appointment is confirmed for **Tue, Apr 29 · 4:30 PM**.

      🆔 **Patient ID:** CLR-00123
      _Save this for future bookings._

      Note: voice consults happen via a web link from your browser — audio only, no phone call. We'll text + IG-DM the join link 5 min before.

      We'll send a reminder before your visit. Reply here anytime if you need to reschedule or have questions."
    `);
  });

  it('contains the load-bearing "audio only" substring', () => {
    const out = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      modality: 'voice',
    });
    expect(out).toContain('audio only');
  });

  it('contains the load-bearing "no phone call" substring', () => {
    const out = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      modality: 'voice',
    });
    expect(out).toContain('no phone call');
  });

  it('inserts the disambiguation paragraph BEFORE the closing reminder line (no MRN)', () => {
    const out = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      modality: 'voice',
    });
    const paragraphs = out.split('\n\n');

    // Expected shape without MRN:
    //   [0] ✅ Payment received.
    //   [1] Your appointment is confirmed …
    //   [2] Note: voice consults … (disambiguation)
    //   [3] We'll send a reminder … (closing)
    expect(paragraphs).toHaveLength(4);
    expect(paragraphs[2]).toContain('audio only');
    expect(paragraphs[2]).toContain('no phone call');
    expect(paragraphs[3]).toBe(
      "We'll send a reminder before your visit. Reply here anytime if you need to reschedule or have questions.",
    );
  });

  it('inserts the disambiguation paragraph BETWEEN the MRN block and the closing line', () => {
    const out = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      patientMrn: 'CLR-00123',
      modality: 'voice',
    });
    const paragraphs = out.split('\n\n');

    // Expected shape with MRN:
    //   [0] ✅ Payment received.
    //   [1] Your appointment is confirmed …
    //   [2] 🆔 Patient ID + _Save …_  (multi-line)
    //   [3] Note: voice consults …    (disambiguation)
    //   [4] We'll send a reminder …   (closing)
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[2]).toContain('🆔 **Patient ID:** CLR-00123');
    expect(paragraphs[3]).toContain('audio only');
    expect(paragraphs[4]).toBe(
      "We'll send a reminder before your visit. Reply here anytime if you need to reschedule or have questions.",
    );
  });
});

// ---------------------------------------------------------------------------
// Regression — non-voice modalities render byte-identically to today's output
// ---------------------------------------------------------------------------

describe('buildPaymentConfirmationMessage — non-voice modalities are byte-identical to the pre-Plan-05 output', () => {
  // Reference = no `modality` passed (i.e. pre-Plan-05 call shape).
  const referenceWithMrn = buildPaymentConfirmationMessage({
    appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
    patientMrn: 'CLR-00123',
  });
  const referenceWithoutMrn = buildPaymentConfirmationMessage({
    appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
  });

  const nonVoiceModalities: readonly PaymentConfirmationModality[] = [
    'text',
    'video',
    'in_clinic',
  ];

  for (const modality of nonVoiceModalities) {
    it(`modality=${modality} with MRN renders byte-identical to no-modality baseline`, () => {
      const out = buildPaymentConfirmationMessage({
        appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
        patientMrn: 'CLR-00123',
        modality,
      });
      expect(out).toBe(referenceWithMrn);
      expect(out).not.toContain('audio only');
      expect(out).not.toContain('phone call');
    });

    it(`modality=${modality} without MRN renders byte-identical to no-modality baseline`, () => {
      const out = buildPaymentConfirmationMessage({
        appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
        modality,
      });
      expect(out).toBe(referenceWithoutMrn);
    });
  }

  it('explicitly passing `modality: undefined` matches the no-modality baseline', () => {
    const out = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      patientMrn: 'CLR-00123',
      modality: undefined,
    });
    expect(out).toBe(referenceWithMrn);
  });
});
