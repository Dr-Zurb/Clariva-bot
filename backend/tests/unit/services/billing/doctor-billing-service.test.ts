// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getDoctorBillingSnapshot,
  notBilledLabel,
} from '../../../../src/services/billing/doctor-billing-service';
import * as database from '../../../../src/config/database';
import * as subscriptionService from '../../../../src/services/billing/subscription-service';
import { CAP_REACHED_COPY } from '../../../../src/config/billing-levels';

jest.mock('../../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../src/services/billing/subscription-service', () => ({
  ensureSubscription: jest.fn(),
  billForSubscription: jest.requireActual('../../../../src/services/billing/subscription-service')
    .billForSubscription,
}));

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSub = subscriptionService as jest.Mocked<typeof subscriptionService>;

describe('doctor-billing-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSub.ensureSubscription.mockResolvedValue({
      doctorId: 'doc-1',
      status: 'active',
      planKind: 'standard',
      baseMinor: 99_900,
      includedConsults: 20,
      perConsultMinor: 4_900,
      capMinor: 1_249_900,
      baseWaivedUntil: null,
      levelsLockedUntil: null,
    });
  });

  it('labels voids without mentioning follow-ups', () => {
    expect(notBilledLabel('billable', null)).toBeNull();
    expect(notBilledLabel('void', 'same_encounter_continuation')).toBe(
      'Same-encounter continuation'
    );
    expect(notBilledLabel('void', 'manual')).toBe('Voided');
    expect(JSON.stringify(notBilledLabel('void', 'manual'))).not.toMatch(/follow-?up/i);
  });

  it('returns a snapshot with no patient fields and GST-inclusive totals', async () => {
    const from = jest.fn((table: string) => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        order: jest.fn(),
      };
      if (table === 'billable_consults') {
        chain.order.mockResolvedValue({
          data: [
            {
              id: 'c1',
              appointment_id: 'apt-1',
              occurred_at: '2026-08-10T10:00:00.000Z',
              modality: 'video',
              source: 'verified_overlap',
              status: 'billable',
              void_reason: null,
            },
            {
              id: 'c2',
              appointment_id: 'apt-2',
              occurred_at: '2026-08-10T10:01:00.000Z',
              modality: 'video',
              source: 'verified_overlap',
              status: 'void',
              void_reason: 'same_encounter_continuation',
            },
          ],
          error: null,
        });
      } else {
        chain.order.mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const snap = await getDoctorBillingSnapshot('doc-1', 'corr', '2026-08-01');
    expect(snap.billableCount).toBe(1);
    expect(snap.notBilledCount).toBe(1);
    expect(snap.bill.inclusiveRupees.base).toBe(1179);
    expect(snap.consults[0]).not.toHaveProperty('patientId');
    expect(snap.consults[0]).not.toHaveProperty('patient_id');
    expect(JSON.stringify(snap)).not.toMatch(/follow-?up|commission/i);
    expect(snap.capReachedCopy).toBeNull();
  });

  it('surfaces the cap sentence at 255 consults', async () => {
    const rows = Array.from({ length: 255 }, (_, i) => ({
      id: `c${i}`,
      appointment_id: `apt-${i}`,
      occurred_at: '2026-08-10T10:00:00.000Z',
      modality: 'video',
      source: 'doctor_wrapup',
      status: 'billable',
      void_reason: null,
    }));
    const from = jest.fn((table: string) => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: table === 'billable_consults' ? rows : [],
          error: null,
        }),
      };
      return chain;
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const snap = await getDoctorBillingSnapshot('doc-1', 'corr', '2026-08-01');
    expect(snap.capReached).toBe(true);
    expect(snap.capReachedCopy).toBe(CAP_REACHED_COPY);
    expect(snap.consultsUntilCap).toBe(0);
  });
});
