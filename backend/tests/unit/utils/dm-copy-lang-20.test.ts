/**
 * lang-20: cancel/reschedule/status builders — byte-identical English + LANG5-D7.
 */

import { describe, expect, it } from '@jest/globals';
import {
  buildAppointmentCancelledMessage,
  buildAppointmentNotFoundShortMessage,
  buildAppointmentPickNotFoundMessage,
  buildCancelConfirmFallbackMessage,
  buildCancelConfirmPromptMessage,
  buildCancelDeclinedMessage,
  buildNumericPickInvalidMessage,
  buildPostBookingAckMessage,
  buildRescheduleChoiceListMessage,
  buildStatusAppointmentLineForPatient,
  buildStatusSelfOnlyOtherPatientMessage,
  buildStatusSingleNextAppointmentMessage,
  buildStatusUpcomingListMessage,
  DM_COPY_PHI_BUILDERS,
} from '../../../src/utils/dm-copy';
import { resolveNoUpcomingAppointmentsMessage } from '../../../src/utils/dm-appointment-status';
import { formatRescheduleChoiceLinkDm } from '../../../src/utils/booking-link-copy';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';

describe('lang-20 cancel/reschedule/status copy', () => {
  it('en arms are byte-identical to pre-migration literals', () => {
    expect(
      buildAppointmentPickNotFoundMessage({ language: 'en', flow: 'cancel' })
    ).toBe(
      "That appointment wasn't found. Please try again or say 'cancel appointment' to start over."
    );
    expect(
      buildAppointmentPickNotFoundMessage({ language: 'en', flow: 'reschedule' })
    ).toBe(
      "That appointment wasn't found. Please try again or say 'reschedule appointment' to start over."
    );
    expect(
      buildCancelConfirmPromptMessage({
        language: 'en',
        dateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      })
    ).toBe(
      'Cancel appointment on Tue, Apr 29, 2026, 4:30 PM? Reply **Yes** or **No**.'
    );
    expect(buildNumericPickInvalidMessage({ language: 'en', count: 3 })).toBe(
      'Please reply 1, 2, or 3.'
    );
    expect(buildCancelConfirmFallbackMessage({ language: 'en' })).toBe(
      'Please reply **Yes** to cancel or **No** to keep your appointment.'
    );
    expect(buildAppointmentNotFoundShortMessage({ language: 'en' })).toBe(
      "That appointment wasn't found."
    );
    expect(
      buildAppointmentCancelledMessage({
        language: 'en',
        dateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      })
    ).toBe('Your appointment on Tue, Apr 29, 2026, 4:30 PM has been cancelled.');
    expect(buildCancelDeclinedMessage({ language: 'en' })).toBe(
      'No problem. Your appointment is still scheduled.'
    );
    expect(
      buildStatusSelfOnlyOtherPatientMessage({
        language: 'en',
        appointmentLine: 'Tue Apr 29 · confirmed',
        otherPatientName: 'Ravi',
      })
    ).toBe(
      "You don't have an appointment for yourself yet. The appointment on Tue Apr 29 · confirmed is for **Ravi**. Would you like to book one for yourself?"
    );
    expect(
      buildStatusSingleNextAppointmentMessage({
        language: 'en',
        appointmentDetail: 'Tue Apr 29 · confirmed',
      })
    ).toBe('Your next appointment is on Tue Apr 29 · confirmed.');
    expect(
      buildStatusUpcomingListMessage({
        language: 'en',
        totalCount: 2,
        statusLines: ['1. a', '2. b'],
        showingFirst10: false,
      })
    ).toBe('You have 2 upcoming appointments:\n\n1. a\n2. b');
    expect(
      buildStatusUpcomingListMessage({
        language: 'en',
        totalCount: 12,
        statusLines: ['1. a'],
        showingFirst10: true,
      })
    ).toBe('You have 12 upcoming appointments:\n\n1. a\n\n(showing first 10)');
    expect(
      buildRescheduleChoiceListMessage({
        language: 'en',
        lines: ['1) Tue', '2) Wed'],
        count: 2,
      })
    ).toBe(
      'Which appointment would you like to reschedule?\n\n1) Tue\n2) Wed\n\nReply 1, 2, or 2.'
    );
    expect(buildPostBookingAckMessage({ language: 'en' })).toBe(
      "Great - you're all set. Let us know if you need anything else."
    );
    expect(
      buildStatusAppointmentLineForPatient({
        language: 'en',
        statusLine: 'Tue · confirmed',
        isForSelf: false,
        patientName: 'Anita',
      })
    ).toBe('For **Anita**: Tue · confirmed');
    expect(
      buildStatusAppointmentLineForPatient({
        language: 'en',
        statusLine: 'Tue · confirmed',
        isForSelf: true,
      })
    ).toBe('Tue · confirmed');
  });

  it('LANG5-D7: shared cancel confirm / pick-not-found are one builder each', () => {
    const confirm = buildCancelConfirmPromptMessage({
      language: 'en',
      dateDisplay: 'Mon',
    });
    // Same function both emitters must call — identity of string + builder name.
    expect(confirm).toBe('Cancel appointment on Mon? Reply **Yes** or **No**.');
    const enPick = buildAppointmentPickNotFoundMessage({ language: 'en', flow: 'cancel' });
    expect(
      buildAppointmentPickNotFoundMessage({ language: 'hi-Latn', flow: 'cancel' })
    ).not.toBe(enPick);
  });

  it('empty cancel/reschedule uses resolveNoUpcomingAppointmentsMessage (dedup)', () => {
    expect(resolveNoUpcomingAppointmentsMessage('en')).toBe(
      "You don't have any upcoming appointments."
    );
  });

  it('PHI registry lists status builders that interpolate names', () => {
    expect(DM_COPY_PHI_BUILDERS.buildStatusSelfOnlyOtherPatientMessage).toBe(
      true
    );
    expect(DM_COPY_PHI_BUILDERS.buildStatusAppointmentLineForPatient).toBe(true);
  });

  it('§3.4 queue-mode reschedule choice link (documented English change)', () => {
    const url = 'https://book.example/r?t=1';
    const queueSettings = {
      opd_mode: 'queue',
    } as DoctorSettingsRow;
    const slotSettings = {
      opd_mode: 'slot',
    } as DoctorSettingsRow;
    expect(
      formatRescheduleChoiceLinkDm({ language: 'en', url, doctorSettings: queueSettings })
    ).toBe(`Pick a new day for your visit: [Choose new day](${url})`);
    expect(
      formatRescheduleChoiceLinkDm({ language: 'en', url, doctorSettings: slotSettings })
    ).toBe(`Pick a new date and time: [Choose new slot](${url})`);
  });

  it('hi/pa arms diverge from English (lang-26 translated)', () => {
    const en = buildPostBookingAckMessage({ language: 'en' });
    expect(buildPostBookingAckMessage({ language: 'hi' })).not.toBe(en);
    expect(buildPostBookingAckMessage({ language: 'pa' })).not.toBe(en);
  });
});
