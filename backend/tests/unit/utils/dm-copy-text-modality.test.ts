/**
 * dm-copy · text-modality consult ping & inline prescription delivery
 * (Plan 04 · Task 21)
 *
 * Two builders covered here:
 *
 *   1. `buildConsultationReadyDm({ modality: 'text', … })` — newly lit-up
 *      branch. Verifies the rendered body, practice-name fallback, and
 *      shared `joinUrl` empty-throw behavior. The "voice still throws"
 *      assertion lives in `dm-copy-consultation-ready.test.ts` (Task 16
 *      file) so the Task 16 contract test stays intact.
 *
 *   2. `buildPrescriptionReadyDm` — new inline-in-chat builder. Distinct
 *      from `buildPrescriptionReadyPingDm` (the urgent SMS-shaped fan-out
 *      ping); this one lands inside the active `<TextConsultRoom>` chat
 *      at consult-end and can afford richer copy (reference ID + next
 *      steps).
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildConsultationReadyDm,
  buildPrescriptionReadyDm,
} from '../../../src/utils/dm-copy';

describe('buildConsultationReadyDm — text modality (Task 21)', () => {
  it('renders the text-modality body with bare URL on its own line', () => {
    const out = buildConsultationReadyDm({
      modality:     'text',
      practiceName: 'Acme Clinic',
      joinUrl:      'https://app.clariva.test/c/text/abc?token=xyz',
    });

    expect(out).toMatchInlineSnapshot(`
      "Your text consult with **Acme Clinic** is starting.

      Open the chat:
      https://app.clariva.test/c/text/abc?token=xyz

      Reply in this thread if anything looks wrong."
    `);
  });

  it('falls back to "your doctor" when practiceName is empty / whitespace', () => {
    const out = buildConsultationReadyDm({
      modality:     'text',
      practiceName: '   ',
      joinUrl:      'https://x.test/?token=z',
    });
    expect(out.startsWith('Your text consult with **your doctor** is starting.')).toBe(true);
  });

  it('falls back to "your doctor" when practiceName is undefined', () => {
    const out = buildConsultationReadyDm({
      modality: 'text',
      joinUrl:  'https://x.test/?token=z',
    });
    expect(out.startsWith('Your text consult with **your doctor** is starting.')).toBe(true);
  });

  it('throws on empty joinUrl (regression-guards the shared upstream check)', () => {
    expect(() =>
      buildConsultationReadyDm({ modality: 'text', joinUrl: '   ' })
    ).toThrow(/joinUrl is required/);
  });

  it('uses the literal string "Open the chat:" (not "Join here:") for the text branch', () => {
    // Load-bearing distinction: video says "Join here:" because the patient
    // is leaving for the Twilio room. Text says "Open the chat:" because
    // the chat IS the consult — there's nothing to "join".
    const out = buildConsultationReadyDm({
      modality:     'text',
      practiceName: 'X',
      joinUrl:      'https://x.test/?t=1',
    });
    expect(out).toContain('Open the chat:');
    expect(out).not.toContain('Join here:');
  });
});

describe('buildPrescriptionReadyDm — inline in-chat (Task 21)', () => {
  it('renders the rich body with PDF URL, reference ID, and next-steps bullets', () => {
    const out = buildPrescriptionReadyDm({
      doctorName:     'Dr. Sharma',
      prescriptionId: 'rx_2026_0419_abc123',
      pdfUrl:         'https://storage.clariva.test/rx/abc123.pdf?signed=true',
    });

    expect(out).toMatchInlineSnapshot(`
      "Prescription from **Dr. Sharma**

      Your prescription is ready. View or download the PDF here:
      https://storage.clariva.test/rx/abc123.pdf?signed=true

      Reference ID: rx_2026_0419_abc123

      Next steps:
      • Save the PDF for your pharmacy.
      • Reply here in the chat if you have any questions about your prescription."
    `);
  });

  it('falls back to "your doctor" when doctorName is empty / whitespace', () => {
    const out = buildPrescriptionReadyDm({
      doctorName:     '   ',
      prescriptionId: 'rx_1',
      pdfUrl:         'https://x.test/rx.pdf',
    });
    expect(out.startsWith('Prescription from **your doctor**')).toBe(true);
  });

  it('falls back to "your doctor" when doctorName is undefined', () => {
    const out = buildPrescriptionReadyDm({
      prescriptionId: 'rx_1',
      pdfUrl:         'https://x.test/rx.pdf',
    });
    expect(out.startsWith('Prescription from **your doctor**')).toBe(true);
  });

  it('throws on empty pdfUrl', () => {
    expect(() =>
      buildPrescriptionReadyDm({
        doctorName:     'Dr. X',
        prescriptionId: 'rx_1',
        pdfUrl:         '   ',
      })
    ).toThrow(/pdfUrl is required/);
  });

  it('throws on missing pdfUrl (undefined-cast as well-typed caller bug)', () => {
    expect(() =>
      buildPrescriptionReadyDm({
        doctorName:     'Dr. X',
        prescriptionId: 'rx_1',
        // Force the runtime guard by casting — TS would block this at
        // compile time, but defensive guards exist for upstream wiring
        // bugs that route around the type system (raw DB rows, etc).
        pdfUrl:         undefined as unknown as string,
      })
    ).toThrow(/pdfUrl is required/);
  });

  it('throws on empty prescriptionId', () => {
    expect(() =>
      buildPrescriptionReadyDm({
        doctorName:     'Dr. X',
        prescriptionId: '   ',
        pdfUrl:         'https://x.test/rx.pdf',
      })
    ).toThrow(/prescriptionId is required/);
  });

  it('quotes the prescription ID verbatim (no truncation, no masking)', () => {
    // The reference ID is the patient's escape hatch for support queries;
    // truncation or masking would break that contract. Pin the exact
    // substring in the rendered body.
    const longId = 'rx_2026_0419_550e8400-e29b-41d4-a716-446655440000';
    const out = buildPrescriptionReadyDm({
      doctorName:     'Dr. X',
      prescriptionId: longId,
      pdfUrl:         'https://x.test/rx.pdf',
    });
    expect(out).toContain(`Reference ID: ${longId}`);
  });
});
