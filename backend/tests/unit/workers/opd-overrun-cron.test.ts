/**
 * Unit tests for `workers/opd-overrun-cron.ts` (pdm-09).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(async () => ({ timezone: 'Asia/Kolkata' })),
}));

const mockComputeGrid = jest.fn<() => Promise<{
  sessionEndIso: string;
  sessionStartIso: string;
  intervalMinutes: number;
  slots: string[];
}>>();
jest.mock('../../../src/services/opd/opd-mode-conversion-service', () => ({
  computeSlotGridForDate: mockComputeGrid,
}));

const mockBulkResolve = jest.fn<() => Promise<{ resolved: number; results: [] }>>();
jest.mock('../../../src/services/opd/opd-overrun-service', () => ({
  bulkResolveSessionOverrun: mockBulkResolve,
}));

import {
  runOpdOverrunFlaggingCron,
  runOpdOverrunFallbackCron,
} from '../../../src/workers/opd-overrun-cron';

type Candidate = { id: string; doctor_id: string; appointment_date: string };

describe('runOpdOverrunFlaggingCron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockComputeGrid.mockResolvedValue({
      sessionEndIso: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      sessionStartIso: new Date().toISOString(),
      intervalMinutes: 30,
      slots: [],
    });
  });

  it('returns zeros when no candidates', async () => {
    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnValue({
          then: (resolve: (v: { data: []; error: null }) => void) => resolve({ data: [], error: null }),
        }),
      })),
    };

    const result = await runOpdOverrunFlaggingCron(supabase as never);
    expect(result).toEqual({ candidatesScanned: 0, flagged: 0, errors: 0 });
  });

  it('flags rows when session ended more than 30 min ago', async () => {
    const candidates: Candidate[] = [
      { id: 'apt-1', doctor_id: 'doc-1', appointment_date: '2026-05-15T06:00:00.000Z' },
    ];
    let flaggedBatch = 0;

    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnValue({
          then: (resolve: (v: { data: Candidate[]; error: null }) => void) =>
            resolve({ data: candidates, error: null }),
        }),
        update: jest.fn(() => ({
          in: jest.fn().mockReturnThis(),
          is: jest.fn().mockImplementation(async () => {
            flaggedBatch += 1;
            return { error: null };
          }),
        })),
      })),
    };

    const result = await runOpdOverrunFlaggingCron(supabase as never);
    expect(result.candidatesScanned).toBe(1);
    expect(result.flagged).toBe(1);
    expect(flaggedBatch).toBe(1);
  });

  it('does not flag when session end is within grace window', async () => {
    mockComputeGrid.mockResolvedValue({
      sessionEndIso: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      sessionStartIso: new Date().toISOString(),
      intervalMinutes: 30,
      slots: [],
    });

    const candidates: Candidate[] = [
      { id: 'apt-1', doctor_id: 'doc-1', appointment_date: '2026-05-15T06:00:00.000Z' },
    ];

    const updateMock = jest.fn();
    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnValue({
          then: (resolve: (v: { data: Candidate[]; error: null }) => void) =>
            resolve({ data: candidates, error: null }),
        }),
        update: updateMock,
      })),
    };

    const result = await runOpdOverrunFlaggingCron(supabase as never);
    expect(result.flagged).toBe(0);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('runOpdOverrunFallbackCron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBulkResolve.mockResolvedValue({ resolved: 3, results: [] });
  });

  it('returns zeros when no candidates', async () => {
    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnValue({
          then: (resolve: (v: { data: []; error: null }) => void) => resolve({ data: [], error: null }),
        }),
      })),
    };

    const result = await runOpdOverrunFallbackCron(supabase as never);
    expect(result).toEqual({ candidatesScanned: 0, rescheduled: 0, errors: 0 });
  });

  it('invokes bulkResolveSessionOverrun for stale groups', async () => {
    const candidates = [
      { doctor_id: 'doc-1', appointment_date: '2026-05-15T06:00:00.000Z' },
    ];

    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnValue({
          then: (resolve: (v: { data: typeof candidates; error: null }) => void) =>
            resolve({ data: candidates, error: null }),
        }),
      })),
    };

    const result = await runOpdOverrunFallbackCron(supabase as never);
    expect(mockBulkResolve).toHaveBeenCalledTimes(1);
    const callArgs = mockBulkResolve.mock.calls[0] as unknown[];
    expect(callArgs[3]).toBe('reschedule_all');
    expect(result.rescheduled).toBe(3);
  });

  it('counts errors when bulk resolve throws', async () => {
    mockBulkResolve.mockRejectedValueOnce(new Error('lock timeout'));
    const candidates = [
      { doctor_id: 'doc-1', appointment_date: '2026-05-15T06:00:00.000Z' },
    ];

    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnValue({
          then: (resolve: (v: { data: typeof candidates; error: null }) => void) =>
            resolve({ data: candidates, error: null }),
        }),
      })),
    };

    const result = await runOpdOverrunFallbackCron(supabase as never);
    expect(result.errors).toBe(1);
    expect(result.rescheduled).toBe(0);
  });
});
