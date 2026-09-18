/**
 * lang-22: booking links, staff review, funnel clarifiers — byte-identical en + invariants.
 */

import { describe, expect, it } from '@jest/globals';
import {
  formatBookingAwaitingFollowUpDm,
  formatBookingLinkDm,
  formatRescheduleChoiceLinkDm,
  formatRescheduleLinkDm,
} from '../../../src/utils/booking-link-copy';
import {
  buildBookForOtherDualIntroMessage,
  buildBookForOtherJustRelationIntroMessage,
  buildBookForOtherNextIntroMessage,
  buildBookForOtherSelfNudgeMessage,
  buildBookForRelationNudgeMessage,
  buildBookForThemIntroMessage,
  buildConsentBookForOtherRetryIntroMessage,
  buildConsentPersistFailureRetryMessage,
  buildFollowUpServiceConfirmUnclearMessage,
  buildIntakeRequestMessage,
  buildPatientMatchConfirmMessage,
  buildPatientMatchConfirmUnclearMessage,
  buildPhoneDisplayFallbackLabel,
  buildReturningFollowUpConfirmMessage,
  buildStillNeedDetailsIntroMessage,
  buildTeleconsultChannelPickMessage,
  DM_COPY_LANG22_PHI,
} from '../../../src/utils/dm-copy';
import {
  formatAwaitingStaffServiceConfirmationDm,
  formatStaffServiceReviewSlaTimeoutDm,
  formatStaffServiceReviewStillPendingDm,
} from '../../../src/utils/staff-service-review-dm';
import { readConversationState } from '../../../src/types/conversation-state-io';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const QUEUE = { opd_mode: 'queue' } as DoctorSettingsRow;
const SLOT = { opd_mode: 'slot' } as DoctorSettingsRow;
const URL = 'https://book.example/b?t=1';

describe('lang-22 booking / staff / funnel copy', () => {
  it('booking-link families: en byte-identical + queue/slot preserved', () => {
    expect(formatBookingLinkDm({ language: 'en', slotLink: URL, doctorSettings: QUEUE })).toBe(
      `Join the queue for your visit here: ${URL}\n\nChoose a day, then confirm - you'll get a token number. Wait times are approximate.`
    );
    expect(formatBookingLinkDm({ language: 'en', slotLink: URL, doctorSettings: SLOT })).toBe(
      `Open this link to get an appointment: ${URL}\n\nYou'll be redirected back to this chat when done.`
    );
    expect(formatRescheduleLinkDm({ language: 'en', url: URL, doctorSettings: QUEUE })).toBe(
      `Pick a new day for your visit: [Reschedule](${URL})`
    );
    expect(formatRescheduleLinkDm({ language: 'en', url: URL, doctorSettings: SLOT })).toBe(
      `Pick a new date and time: [Reschedule](${URL})`
    );
    expect(formatRescheduleChoiceLinkDm({ language: 'en', url: URL, doctorSettings: QUEUE })).toBe(
      `Pick a new day for your visit: [Choose new day](${URL})`
    );
    expect(formatRescheduleChoiceLinkDm({ language: 'en', url: URL, doctorSettings: SLOT })).toBe(
      `Pick a new date and time: [Choose new slot](${URL})`
    );
    expect(formatBookingAwaitingFollowUpDm({ language: 'en', doctorSettings: QUEUE })).toBe(
      "Join the queue using the link above, or say 'change' to get a new link."
    );
    expect(formatBookingAwaitingFollowUpDm({ language: 'en', doctorSettings: SLOT })).toBe(
      "Open the link above to get an appointment, or say 'change' to get a new link."
    );
    expect(formatBookingLinkDm({ language: 'en', slotLink: URL, doctorSettings: SLOT })).not.toMatch(
      /payment/i
    );
    expect(formatBookingLinkDm({ language: 'hi', slotLink: URL, doctorSettings: SLOT })).not.toMatch(
      /payment/i
    );
    expect(formatBookingLinkDm({ language: 'pa', slotLink: URL, doctorSettings: SLOT })).not.toMatch(
      /payment/i
    );
  });

  it('URL and practice-name invariance across locales', () => {
    const practiceSettings = {
      doctor_id: 'doc',
      practice_name: 'Demo Clinic',
      opd_mode: 'slot',
    } as DoctorSettingsRow;
    for (const language of ['en', 'hi', 'pa', 'hi-Latn'] as const) {
      const link = formatBookingLinkDm({ language, slotLink: URL, doctorSettings: practiceSettings });
      expect(link).toContain(URL);
      const pending = formatStaffServiceReviewStillPendingDm(language, practiceSettings);
      expect(pending).toContain('Demo Clinic');
    }
  });

  it('staff awaiting / still-pending / sla-timeout en arms', () => {
    const sid = (k: string) => deterministicServiceIdForLegacyOffering('doc', k);
    const catalog: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: sid('skin'),
          service_key: 'skin',
          label: 'Dermatology consult',
          modalities: { video: { enabled: true, price_minor: 100_00 } },
        },
      ],
    };
    const settings = {
      doctor_id: 'doc',
      practice_name: 'Demo Clinic',
      service_offerings_json: catalog,
    } as DoctorSettingsRow;
    expect(
      formatAwaitingStaffServiceConfirmationDm(
        'en',
        settings,
        readConversationState({ matcherProposedCatalogServiceKey: 'skin' })
      )
    ).toBe(
      "Thanks — **Demo Clinic** will confirm your visit type before we open scheduling. We've noted your request as **Dermatology consult**. " +
        'Our team will reply here **soon**. ' +
        "You do **not** need to pay yet. We'll message you when you can pick a time."
    );
    expect(formatStaffServiceReviewStillPendingDm('en', settings)).toBe(
      "We're still confirming with **Demo Clinic**. You'll get a message here when you can choose a time. " +
        'Thanks for your patience.'
    );
    expect(formatStaffServiceReviewSlaTimeoutDm('en')).toBe(
      "Our team hasn't responded to your booking review yet — we're following up now. You can also try again later or ask to book."
    );
  });

  it('funnel clarifier en arms are byte-identical', () => {
    expect(buildBookForOtherSelfNudgeMessage({ language: 'en' })).toBe(
      'Would you like to book one for yourself now?'
    );
    expect(buildBookForRelationNudgeMessage({ language: 'en', relation: 'mother' })).toBe(
      'Would you like to book for your mother now?'
    );
    expect(buildConsentBookForOtherRetryIntroMessage({ language: 'en' })).toBe(
      "I didn't catch the details for the person you're booking for — could you resend them?"
    );
    expect(buildConsentPersistFailureRetryMessage({ language: 'en' })).toBe(
      "I had trouble saving your details — please reply **Yes** again to retry, or say 'book appointment' to re-share them."
    );
    expect(
      buildBookForOtherJustRelationIntroMessage({ language: 'en', relation: 'father' })
    ).toBe('Got it, just your **father** then. Please share their details:');
    expect(buildStillNeedDetailsIntroMessage({ language: 'en' })).toBe('Still need these details:');
    expect(buildBookForOtherNextIntroMessage({ language: 'en', relation: 'wife' })).toBe(
      "Got it. I'll help you book for your **wife** next. Please share their details:"
    );
    expect(
      buildPatientMatchConfirmMessage({
        language: 'en',
        kind: 'other_number',
        patientName: 'Riya',
      })
    ).toBe('We found a record for **Riya** with this number. Same person? Reply Yes or No.');
    expect(
      buildPatientMatchConfirmMessage({
        language: 'en',
        kind: 'self_details',
        patientName: 'Riya',
      })
    ).toBe(
      'We found an existing record matching your details (**Riya**). Is this you? Reply Yes or No.'
    );
    expect(
      buildPatientMatchConfirmMessage({
        language: 'en',
        kind: 'multi',
        multiCount: 2,
        multiLines: ['1. Riya (30)', '2. Amit (28)'],
      })
    ).toBe(
      'We found 2 records: 1. Riya (30), 2. Amit (28). Which one? Reply 1 or 2, or No for new patient.'
    );
    expect(buildFollowUpServiceConfirmUnclearMessage({ language: 'en' })).toBe(
      'Please reply **Yes** or **No** — is this visit a follow-up for the same service?'
    );
    expect(buildPatientMatchConfirmUnclearMessage({ language: 'en' })).toBe(
      'Please reply Yes to use the existing record, or No to create a new patient. Reply 1 or 2 if we found multiple matches.'
    );
    expect(buildTeleconsultChannelPickMessage({ language: 'en' })).toBe(
      'Right now we offer **teleconsult** only (text, voice, or video) — which works best for you?'
    );
    expect(buildBookForOtherDualIntroMessage({ language: 'en', relation: 'son' })).toBe(
      "I'll help you book for you and your **son**. Let's take them one at a time — your **son** first, then you. Please share their details:"
    );
    expect(buildBookForThemIntroMessage({ language: 'en' })).toBe(
      "I'll help you book for **them**. Please share their details:"
    );
    expect(
      buildReturningFollowUpConfirmMessage({ language: 'en', serviceLabel: 'Skin consult' })
    ).toBe('Is this a **follow-up** for **Skin consult**? Reply **Yes** or **No**.');
    expect(buildPhoneDisplayFallbackLabel({ language: 'en' })).toBe('your number');
  });

  it('composed intro override stays single-language with intake body', () => {
    const intro = buildBookForOtherNextIntroMessage({ language: 'hi', relation: 'mother' });
    const out = buildIntakeRequestMessage({
      language: 'hi',
      variant: 'initial',
      forRelation: 'mother',
      missing: ['name', 'age', 'phone', 'reason_for_visit'],
      intro,
    });
    expect(out.startsWith(intro)).toBe(true);
    expect(out).toContain('**mother**');
  });

  it('LANG5-D3: patient match confirm is phi; others verified-negative', () => {
    expect(DM_COPY_LANG22_PHI.buildPatientMatchConfirmMessage).toBe(true);
    for (const [k, v] of Object.entries(DM_COPY_LANG22_PHI)) {
      if (k === 'buildPatientMatchConfirmMessage') continue;
      expect(v).toBe(false);
    }
  });

  it('lang-26: translated booking / funnel families differ from en', () => {
    const en = buildBookForOtherSelfNudgeMessage({ language: 'en' });
    expect(buildBookForOtherSelfNudgeMessage({ language: 'hi' })).not.toBe(en);
    expect(buildBookForOtherSelfNudgeMessage({ language: 'pa' })).not.toBe(en);
    const linkEn = formatBookingLinkDm({ language: 'en', slotLink: URL, doctorSettings: SLOT });
    expect(formatBookingLinkDm({ language: 'hi', slotLink: URL, doctorSettings: SLOT })).not.toBe(
      linkEn
    );
    expect(buildTeleconsultChannelPickMessage({ language: 'hi' })).not.toBe(
      buildTeleconsultChannelPickMessage({ language: 'en' })
    );
  });

  it('lang-27: remaining funnel clarifiers differ from en', () => {
    expect(buildBookForRelationNudgeMessage({ language: 'hi', relation: 'mother' })).not.toBe(
      buildBookForRelationNudgeMessage({ language: 'en', relation: 'mother' })
    );
    expect(buildPatientMatchConfirmMessage({ language: 'pa', kind: 'other_number', patientName: 'Riya' })).not.toBe(
      buildPatientMatchConfirmMessage({ language: 'en', kind: 'other_number', patientName: 'Riya' })
    );
    expect(buildPhoneDisplayFallbackLabel({ language: 'hi' })).not.toBe(
      buildPhoneDisplayFallbackLabel({ language: 'en' })
    );
  });
});
