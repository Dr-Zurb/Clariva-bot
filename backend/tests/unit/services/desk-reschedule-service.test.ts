import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
  supabase: {},
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn(async () => undefined),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(async () => ({ timezone: 'Asia/Kolkata' })),
}));

jest.mock('../../../src/services/opd/opd-mode-service', () => ({
  resolveSessionDayMode: jest.fn(async () => ({ mode: 'queue', source: 'doctor_settings' })),
}));

const createQueueEntryAfterBooking = jest.fn<(...args: unknown[]) => Promise<number>>();
const deleteQueueEntryByAppointmentId = jest.fn<(...args: unknown[]) => Promise<void>>();
const getQueueTokenForAppointment = jest.fn<(...args: unknown[]) => Promise<number | null>>();

jest.mock('../../../src/services/opd/opd-queue-service', () => {
  const actual = jest.requireActual('../../../src/services/opd/opd-queue-service') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    createQueueEntryAfterBooking: (...args: unknown[]) => createQueueEntryAfterBooking(...args),
    deleteQueueEntryByAppointmentId: (...args: unknown[]) =>
      deleteQueueEntryByAppointmentId(...args),
    getQueueTokenForAppointment: (...args: unknown[]) => getQueueTokenForAppointment(...args),
  };
});

const findBlockingAppointmentOnSessionDate = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/appointment-service', () => ({
  ALREADY_ON_DAY_MESSAGE: 'This patient already has a visit on that day.',
  enforcesClockSlot: (mode: string, origin: string) =>
    mode === 'slot' && origin !== 'walk_in' && origin !== 'overflow',
  findBlockingAppointmentOnSessionDate: (...args: unknown[]) =>
    findBlockingAppointmentOnSessionDate(...args),
}));

jest.mock('../../../src/services/availability-service', () => ({
  getAvailableSlots: jest.fn(async () => []),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import { resolveSessionDayMode } from '../../../src/services/opd/opd-mode-service';
import { ConflictError, NotFoundError } from '../../../src/utils/errors';
import { rescheduleAppointmentForDesk } from '../../../src/services/desk-reschedule-service';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_DOCTOR = '00000000-0000-0000-0000-0000000000dd';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const APT_ID = '00000000-0000-0000-0000-0000000000ff';
const PATIENT_ID = '00000000-0000-0000-0000-0000000000ee';

const SAME_DAY = '2026-09-01T04:30:00.000Z';
const SAME_DAY_LATER = '2026-09-01T05:30:00.000Z';
const NEXT_DAY = '2026-09-02T04:30:00.000Z';

const WAITING = {
  id: APT_ID,
  status: 'confirmed',
  doctor_id: DOCTOR_ID,
  patient_id: PATIENT_ID,
  patient_checked_in_at: null,
  appointment_date: SAME_DAY,
  booking_origin: 'walk_in',
  opd_queue_entry: { token_number: 4 },
};

function fetchChain(row: Record<string, unknown> | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

function updateChain(row: Record<string, unknown>) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

function tillCount(count: number) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  };
  chain.eq.mockImplementation(() => chain);
  // second eq (doctor_id) resolves
  let eqs = 0;
  chain.eq.mockImplementation(() => {
    eqs += 1;
    if (eqs >= 2) {
      return Promise.resolve({ count, error: null });
    }
    return chain;
  });
  return chain;
}

function conflictList(ids: string[]) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    lt: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: ids.map((id) => ({ id })),
      error: null,
    }),
  };
}

function mockAdmin(opts: {
  row: Record<string, unknown> | null;
  updated?: Record<string, unknown>;
  tillCount?: number;
  conflictIds?: string[];
}) {
  let aptCalls = 0;
  (getSupabaseAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === 'visit_payments') return tillCount(opts.tillCount ?? 0);
      aptCalls += 1;
      if (aptCalls === 1) return fetchChain(opts.row);
      if (opts.conflictIds) return conflictList(opts.conflictIds);
      return updateChain(opts.updated ?? { ...opts.row, appointment_date: SAME_DAY_LATER });
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  createQueueEntryAfterBooking.mockResolvedValue(9);
  deleteQueueEntryByAppointmentId.mockResolvedValue(undefined);
  getQueueTokenForAppointment.mockResolvedValue(9);
  findBlockingAppointmentOnSessionDate.mockResolvedValue(null);
  (resolveSessionDayMode as jest.Mock).mockResolvedValue({
    mode: 'queue',
    source: 'settings',
  } as never);
});

describe('rescheduleAppointmentForDesk', () => {
  it('keeps the token on a same-day queue move', async () => {
    mockAdmin({
      row: WAITING,
      updated: { ...WAITING, appointment_date: SAME_DAY_LATER },
    });

    const result = await rescheduleAppointmentForDesk(
      APT_ID,
      DOCTOR_ID,
      ACTOR_ID,
      SAME_DAY_LATER,
      'cid'
    );
    expect(result.appointment.opd_token_number).toBe(4);
    expect(deleteQueueEntryByAppointmentId).not.toHaveBeenCalled();
    expect(createQueueEntryAfterBooking).not.toHaveBeenCalled();
  });

  it('issues a new token when the session date changes', async () => {
    mockAdmin({
      row: WAITING,
      updated: { ...WAITING, appointment_date: NEXT_DAY, opd_queue_entry: null },
    });

    const result = await rescheduleAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, NEXT_DAY, 'cid');
    expect(deleteQueueEntryByAppointmentId).toHaveBeenCalledWith(APT_ID, 'cid');
    expect(createQueueEntryAfterBooking).toHaveBeenCalled();
    expect(result.appointment.opd_token_number).toBe(9);
  });

  it('returns 409 when the clock slot is taken', async () => {
    (resolveSessionDayMode as jest.Mock).mockResolvedValue({
      mode: 'slot',
      source: 'settings',
    } as never);
    mockAdmin({
      row: { ...WAITING, booking_origin: 'booked' },
      conflictIds: ['other'],
    });

    await expect(
      rescheduleAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, SAME_DAY_LATER, 'cid')
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('returns already_on_today when the patient occupies the target day', async () => {
    findBlockingAppointmentOnSessionDate.mockResolvedValue({
      id: 'other-apt',
      token: 2,
      bucket: 'waiting',
    });
    mockAdmin({ row: WAITING });

    await expect(
      rescheduleAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, NEXT_DAY, 'cid')
    ).rejects.toMatchObject({
      details: { reason: 'already_on_today' },
    });
  });

  it('refuses checked-in visits', async () => {
    mockAdmin({
      row: { ...WAITING, patient_checked_in_at: '2026-09-01T03:00:00.000Z' },
    });
    await expect(
      rescheduleAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, SAME_DAY_LATER, 'cid')
    ).rejects.toMatchObject({ message: 'Already checked in' });
  });

  it('hides another doctor appointment', async () => {
    mockAdmin({ row: { ...WAITING, doctor_id: OTHER_DOCTOR } });
    await expect(
      rescheduleAppointmentForDesk(APT_ID, DOCTOR_ID, ACTOR_ID, SAME_DAY_LATER, 'cid')
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
