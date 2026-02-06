/**
 * Availability Service Unit Tests (e-task-1)
 *
 * Tests for getAvailableSlots: slot calculation, exclusion of blocked times and booked appointments.
 * Uses mocked Supabase client.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getAvailableSlots } from '../../../src/services/availability-service';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

function createMockClient(responses: { data: unknown[]; error: null }[]) {
  let callIndex = 0;
  const terminal = () => {
    const resp = responses[callIndex++] ?? { data: [], error: null };
    return Promise.resolve(resp);
  };

  const chainOrder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockImplementation(terminal),
  };

  const chainGte = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockImplementation(terminal),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
  };

  const chainLte = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockImplementation(terminal),
    order: jest.fn().mockReturnThis(),
  };

  const from = jest.fn().mockImplementation((table: unknown) => {
    if (table === 'availability') return chainOrder;
    if (table === 'blocked_times') return chainGte;
    if (table === 'appointments') return chainLte;
    return chainOrder;
  });

  return { from };
}

describe('Availability Service - getAvailableSlots', () => {
  const doctorId = '11111111-1111-1111-1111-111111111111';
  const date = '2026-02-02'; // Monday
  const correlationId = 'corr-123';

  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logAuditEvent as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  it('returns [] when no availability for date', async () => {
    const mockClient = createMockClient([
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockClient as any);

    const slots = await getAvailableSlots(doctorId, date, correlationId);

    expect(slots).toEqual([]);
    expect(mockedAudit.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'get_available_slots',
        status: 'success',
        metadata: expect.objectContaining({ doctorId, date, slotCount: 0 }),
      })
    );
  });

  it('returns slots within availability window excluding booked appointment', async () => {
    // Availability: 09:00-12:00 (3 hours = 6 slots of 30 min)
    const availability = [
      {
        id: 'av1',
        doctor_id: doctorId,
        day_of_week: 1,
        start_time: '09:00:00',
        end_time: '12:00:00',
        is_available: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
    // Blocked: none
    const blocked: unknown[] = [];
    // Appointment at 10:00 (blocks 10:00-10:30 slot)
    const appointments = [
      {
        id: 'apt1',
        appointment_date: '2026-02-02T10:00:00.000Z',
      },
    ];

    const mockClient = createMockClient([
      { data: availability, error: null },
      { data: blocked, error: null },
      { data: appointments, error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockClient as any);

    const slots = await getAvailableSlots(doctorId, date, correlationId);

    expect(slots.length).toBe(5);
    const starts = slots.map((s) => s.start);
    expect(starts).toContain('2026-02-02T09:00:00.000Z');
    expect(starts).toContain('2026-02-02T09:30:00.000Z');
    expect(starts).not.toContain('2026-02-02T10:00:00.000Z');
    expect(starts).toContain('2026-02-02T10:30:00.000Z');
    expect(starts).toContain('2026-02-02T11:00:00.000Z');
    expect(starts).toContain('2026-02-02T11:30:00.000Z');
  });

  it('returns slots within multiple availability windows', async () => {
    const availability = [
      {
        id: 'av1',
        doctor_id: doctorId,
        day_of_week: 1,
        start_time: '09:00:00',
        end_time: '10:00:00',
        is_available: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'av2',
        doctor_id: doctorId,
        day_of_week: 1,
        start_time: '14:00:00',
        end_time: '16:00:00',
        is_available: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
    const mockClient = createMockClient([
      { data: availability, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockClient as any);

    const slots = await getAvailableSlots(doctorId, date, correlationId);

    expect(slots.length).toBe(6);
    const starts = slots.map((s) => s.start);
    expect(starts).toContain('2026-02-02T09:00:00.000Z');
    expect(starts).toContain('2026-02-02T09:30:00.000Z');
    expect(starts).toContain('2026-02-02T14:00:00.000Z');
    expect(starts).toContain('2026-02-02T14:30:00.000Z');
    expect(starts).toContain('2026-02-02T15:00:00.000Z');
    expect(starts).toContain('2026-02-02T15:30:00.000Z');
  });

  it('excludes slots overlapping blocked_times', async () => {
    const availability = [
      {
        id: 'av1',
        doctor_id: doctorId,
        day_of_week: 1,
        start_time: '09:00:00',
        end_time: '12:00:00',
        is_available: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
    const blocked = [
      {
        id: 'bt1',
        doctor_id: doctorId,
        start_time: '2026-02-02T09:30:00.000Z',
        end_time: '2026-02-02T10:30:00.000Z',
        reason: 'Meeting',
        created_at: new Date(),
      },
    ];
    const mockClient = createMockClient([
      { data: availability, error: null } as { data: unknown[]; error: null },
      { data: blocked, error: null } as { data: unknown[]; error: null },
      { data: [], error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockClient as any);

    const slots = await getAvailableSlots(doctorId, date, correlationId);

    const starts = slots.map((s) => s.start);
    expect(starts).toContain('2026-02-02T09:00:00.000Z');
    expect(starts).not.toContain('2026-02-02T09:30:00.000Z');
    expect(starts).not.toContain('2026-02-02T10:00:00.000Z');
    expect(starts).toContain('2026-02-02T10:30:00.000Z');
  });

  it('throws when service role client not available', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);

    await expect(getAvailableSlots(doctorId, date, correlationId)).rejects.toThrow(
      'Service role client not available for slot lookup'
    );
  });
});
