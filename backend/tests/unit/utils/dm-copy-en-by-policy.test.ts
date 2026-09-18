/**
 * lang-28: every enByPolicy family renders English on a Hindi thread.
 */

import { describe, expect, it } from '@jest/globals';
import {
  appointmentConsultationTypeToLabel,
  buildAccountDeletionExplainerDm,
  buildConsultationReadyDm,
  buildPostConsultChatLinkDm,
  buildPrescriptionReadyDm,
  buildPrescriptionReadyPingDm,
  buildRecordingAudioDisclosureMessage,
  buildRecordingReplayedNotificationDm,
  buildStaffReviewResolvedBookingMessage,
  buildTranscriptDownloadedNotificationDm,
  DM_COPY_ENGLISH_ONLY_EXCEPTIONS,
  FALLBACK_REPLY_EN,
} from '../../../src/utils/dm-copy';
import { LOCALE_ARM_MANIFEST } from '../../../src/utils/locale-arm-manifest';

describe('lang-28 enByPolicy English-on-hi assertions', () => {
  it('manifest lists exactly the enByPolicy families covered below', () => {
    const ids = LOCALE_ARM_MANIFEST.filter((e) => e.status === 'enByPolicy').map(
      (e) => e.familyId
    );
    expect(ids.sort()).toEqual(
      [
        'account-deletion-explainer',
        'appointment-consultation-type-labels',
        'comment-public-reply',
        'consultation-ready-default-practice',
        'fallback-reply-no-doctor',
        'post-consult-chat-default-practice',
        'prescription-ready-default-practice',
        'prescription-ready-dm-default-doctor',
        'recording-audio-disclosure',
        'recording-replayed-default-practice',
        'staff-review-default-label',
        'staff-review-default-practice',
        'transcript-downloaded-default-practice',
      ].sort()
    );
  });

  it('default practice/doctor tokens stay English on hi', () => {
    const url = 'https://example.test/x';
    expect(
      buildConsultationReadyDm({ language: 'hi', modality: 'video', joinUrl: url })
    ).toContain('your doctor');
    expect(buildPrescriptionReadyPingDm({ language: 'hi' })).toContain('your doctor');
    expect(
      buildPrescriptionReadyDm({
        language: 'hi',
        prescriptionId: 'rx-1',
        pdfUrl: url,
      })
    ).toContain('your doctor');
    expect(
      buildStaffReviewResolvedBookingMessage({
        language: 'hi',
        bookingUrl: url,
        kind: 'confirmed',
      })
    ).toMatch(/the clinic/);
    expect(
      buildStaffReviewResolvedBookingMessage({
        language: 'hi',
        bookingUrl: url,
        kind: 'confirmed',
      })
    ).toMatch(/your visit/);
    expect(
      buildRecordingReplayedNotificationDm({
        language: 'hi',
        consultDateLabel: '19 Apr 2026',
        artifactType: 'audio',
      })
    ).toContain("your doctor's clinic");
    expect(
      buildTranscriptDownloadedNotificationDm({
        language: 'hi',
        consultDateLabel: '19 Apr 2026',
      })
    ).toContain("your doctor's clinic");
    expect(
      buildPostConsultChatLinkDm({
        language: 'hi',
        joinUrl: url,
        consultDateLabel: '19 Apr 2026',
      })
    ).toContain("your doctor's practice");
  });

  it('modality labels stay English on hi (LANG6-D6)', () => {
    expect(appointmentConsultationTypeToLabel('video', 'hi')).toBe('Video consult');
    expect(appointmentConsultationTypeToLabel('in_clinic', 'pa')).toBe('In-person');
  });

  it('legal / public exceptions stay English on hi (LANG6-D4)', () => {
    const disclosure = buildRecordingAudioDisclosureMessage();
    expect(disclosure).toContain('audio-recorded as part of the medical record');
    expect(disclosure).not.toMatch(/\b(yes|no|agree|consent)\b/i);
    const deletion = buildAccountDeletionExplainerDm({
      language: 'hi',
      citation: 'DPDP Act 2023 §9',
      finalizedAt: new Date('2026-08-03T00:00:00.000Z'),
    });
    expect(deletion).toContain('Your account is closed.');
    expect(FALLBACK_REPLY_EN).toBe(
      DM_COPY_ENGLISH_ONLY_EXCEPTIONS.FALLBACK_REPLY_NO_DOCTOR.text
    );
    expect(DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.text).toBe(
      'Check your DM for more information.'
    );
  });
});
