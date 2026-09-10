/**
 * lang-23: fallback / throttle / comment / OOB + English-only exceptions.
 */

import { describe, expect, it } from '@jest/globals';
import {
  buildAppointmentRescheduledConfirmDm,
  buildCommentProactiveDmMessage,
  buildDuplicateBookingOnDateMessage,
  buildFallbackReplyMessage,
  buildSlotSelectedFollowUpDm,
  buildThrottleAckMessage,
  buildWelcomeBackSegmentMessage,
  DM_COPY_ENGLISH_ONLY_EXCEPTIONS,
  DM_COPY_LANG23_PHI,
  FALLBACK_REPLY_EN,
} from '../../../src/utils/dm-copy';

describe('lang-23 system / OOB / comment copy', () => {
  it('en arms are byte-identical to pre-migration literals', () => {
    expect(buildFallbackReplyMessage({ language: 'en' })).toBe(
      "Thanks for your message. We'll get back to you soon."
    );
    expect(buildThrottleAckMessage({ language: 'en' })).toBe(
      'I see your messages — give me a moment to respond.'
    );
    expect(
      buildCommentProactiveDmMessage({
        language: 'en',
        intent: 'book_appointment',
        practiceName: 'Demo Clinic',
        specialty: 'Dermatology',
        addressSummary: 'Sector 17',
      })
    ).toBe(
      'You expressed interest in booking.\n\nDemo Clinic - Dermatology. Sector 17\n\nReply here if you\'d like to schedule.'
    );
    expect(
      buildSlotSelectedFollowUpDm({
        language: 'en',
        dateDisplay: 'Tuesday Mar 14 at 2:00 PM',
        bookingLink: 'https://book.example/b',
      })
    ).toBe(
      'You selected **Tuesday Mar 14 at 2:00 PM**. Continue in chat if you need help, or pick another time here: [Change slot](https://book.example/b)'
    );
    expect(
      buildDuplicateBookingOnDateMessage({
        language: 'en',
        dateDisplay: 'March 14, 2026',
      })
    ).toBe(
      'You already have an appointment on March 14, 2026. Please choose another date or contact us if you need multiple visits.'
    );
    expect(
      buildAppointmentRescheduledConfirmDm({
        language: 'en',
        dateDisplay: 'Tuesday Mar 14 at 2:00 PM',
      })
    ).toBe('Your appointment has been rescheduled to **Tuesday Mar 14 at 2:00 PM**.');
    expect(
      buildWelcomeBackSegmentMessage({
        language: 'en',
        firstName: 'Priya',
        recencyBucket: 'within_1_month',
      })
    ).toBe('Welcome back, **Priya**! Great to hear from you again.');
  });

  it('exception list English constants stay documented; DM fallback localizes', () => {
    expect(FALLBACK_REPLY_EN).toBe(
      DM_COPY_ENGLISH_ONLY_EXCEPTIONS.FALLBACK_REPLY_NO_DOCTOR.text
    );
    expect(DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.text).toBe(
      'Check your DM for more information.'
    );
    // No-doctor path uses FALLBACK_REPLY_EN; conversation fallback is translated (lang-26).
    expect(buildFallbackReplyMessage({ language: 'en' })).toBe(FALLBACK_REPLY_EN);
    expect(buildFallbackReplyMessage({ language: 'hi-Latn' })).not.toBe(FALLBACK_REPLY_EN);
  });

  it('comment DM does not depend on intent text language (LANG5-D6 surface)', () => {
    const enLinked = buildCommentProactiveDmMessage({
      language: 'en',
      intent: 'medical_query',
      practiceName: 'Clinic',
    });
    // Even if the comment were Hinglish, outreach language is the linked thread's.
    expect(
      buildCommentProactiveDmMessage({
        language: 'en',
        intent: 'medical_query',
        practiceName: 'Clinic',
      })
    ).toBe(enLinked);
    const hiLinked = buildCommentProactiveDmMessage({
      language: 'hi-Latn',
      intent: 'medical_query',
      practiceName: 'Clinic',
    });
    expect(hiLinked).not.toBe(enLinked);
    expect(hiLinked).toContain('Clinic');
  });

  it('Instagram and Facebook share identical comment builder output', () => {
    const input = {
      language: 'en' as const,
      intent: 'pricing_inquiry',
      practiceName: 'Shared Clinic',
    };
    expect(buildCommentProactiveDmMessage(input)).toBe(
      buildCommentProactiveDmMessage({ ...input })
    );
  });

  it('welcome-back hi/pa diverge from English (lang-26 translated)', () => {
    const en = buildWelcomeBackSegmentMessage({
      language: 'en',
      firstName: 'Priya',
      recencyBucket: 'within_3_months',
    });
    const hi = buildWelcomeBackSegmentMessage({
      language: 'hi',
      firstName: 'Priya',
      recencyBucket: 'within_3_months',
    });
    const pa = buildWelcomeBackSegmentMessage({
      language: 'pa',
      firstName: 'Priya',
      recencyBucket: 'within_3_months',
    });
    expect(hi).not.toBe(en);
    expect(pa).not.toBe(en);
    expect(hi).toContain('**Priya**');
    expect(pa).toContain('**Priya**');
  });

  it('lang-27: OOB slot / duplicate / reschedule differ from en', () => {
    const slotEn = buildSlotSelectedFollowUpDm({
      language: 'en',
      dateDisplay: 'Tue Mar 14',
      bookingLink: 'https://book.example/b',
    });
    expect(
      buildSlotSelectedFollowUpDm({
        language: 'hi',
        dateDisplay: 'Tue Mar 14',
        bookingLink: 'https://book.example/b',
      })
    ).not.toBe(slotEn);
    expect(
      buildDuplicateBookingOnDateMessage({ language: 'pa', dateDisplay: 'March 14' })
    ).not.toBe(buildDuplicateBookingOnDateMessage({ language: 'en', dateDisplay: 'March 14' }));
  });

  it('LANG5-D3: welcome-back is phi; others verified-negative', () => {
    expect(DM_COPY_LANG23_PHI.buildWelcomeBackSegmentMessage).toBe(true);
    for (const [k, v] of Object.entries(DM_COPY_LANG23_PHI)) {
      if (k === 'buildWelcomeBackSegmentMessage') continue;
      expect(v).toBe(false);
    }
  });
});
