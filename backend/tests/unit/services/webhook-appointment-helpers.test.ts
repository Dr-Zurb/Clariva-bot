/**
 * RBH-03: Shared merge/sort/filter for upcoming appointments in webhook DM flows.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Appointment } from '../../../src/types';
import * as appointmentService from '../../../src/services/appointment-service';
import {
  buildRelatedPatientIdsForWebhook,
  getMergedUpcomingAppointmentsForRelatedPatients,
} from '../../../src/services/webhook-appointment-helpers';

jest.mock('../../../src/services/appointment-service', () => ({
  listAppointmentsForPatient: jest.fn(),
}));

function appt(
  overrides: Partial<Appointment> & Pick<Appointment, 'id' | 'appointment_date' | 'status'>
): Appointment {
  const base = {
    doctor_id: 'doc-1',
    patient_id: 'pat-1',
    patient_name: 'Test',
    patient_phone: '+10000000000',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
  return base as Appointment;
}

describe('webhook-appointment-helpers (RBH-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildRelatedPatientIdsForWebhook', () => {
    it('returns only conversation patient when no other context', () => {
      expect(
        buildRelatedPatientIdsForWebhook('p-main', {
          lastBookingPatientId: undefined,
          bookingForPatientId: undefined,
        })
      ).toEqual(['p-main']);
    });

    it('includes lastBookingPatientId and bookingForPatientId when distinct', () => {
      expect(
        buildRelatedPatientIdsForWebhook('p-main', {
          lastBookingPatientId: 'p-other',
          bookingForPatientId: 'p-book',
        })
      ).toEqual(['p-main', 'p-other', 'p-book']);
    });

    it('does not duplicate bookingForPatientId when same as conversation', () => {
      expect(
        buildRelatedPatientIdsForWebhook('p-main', {
          lastBookingPatientId: 'p-other',
          bookingForPatientId: 'p-main',
        })
      ).toEqual(['p-main', 'p-other']);
    });

    it('skips lastBookingPatientId when same as conversation', () => {
      expect(
        buildRelatedPatientIdsForWebhook('p-main', {
          lastBookingPatientId: 'p-main',
          bookingForPatientId: 'p-book',
        })
      ).toEqual(['p-main', 'p-book']);
    });
  });

  describe('getMergedUpcomingAppointmentsForRelatedPatients', () => {
    it('dedupes by appointment id, sorts by date, filters upcoming pending/confirmed', async () => {
      const future1 = new Date(Date.now() + 86400000 * 2);
      const future2 = new Date(Date.now() + 86400000 * 3);
      const past = new Date(Date.now() - 86400000);
      const dup = appt({ id: 'a-dup', appointment_date: future2, status: 'pending' });
      jest.mocked(appointmentService.listAppointmentsForPatient).mockImplementation(async (pid) => {
        if (pid === 'p1') return [dup, appt({ id: 'a-old', appointment_date: past, status: 'pending' })];
        if (pid === 'p2')
          return [
            dup,
            appt({ id: 'a-later', appointment_date: future2, status: 'cancelled' }),
            appt({ id: 'a-earlier', appointment_date: future1, status: 'confirmed' }),
          ];
        return [];
      });

      const out = await getMergedUpcomingAppointmentsForRelatedPatients(
        ['p1', 'p2'],
        'doc-1',
        'corr-1'
      );

      expect(appointmentService.listAppointmentsForPatient).toHaveBeenCalledTimes(2);
      expect(out.map((a) => a.id)).toEqual(['a-earlier', 'a-dup']);
    });
  });
});
