/**
 * Pure-helper unit tests for the OPD per-day mode conversion service
 * (pdm-04). Covers the slot↔queue algorithms in isolation — no Supabase,
 * no orchestrator. 10 fixtures total: 5 per direction.
 *
 * The fixtures snapshot the assignment shapes so a future refactor that
 * silently changes token order, overflow placement, or clear-fields
 * propagation breaks the test loudly.
 *
 * @see backend/src/services/opd/opd-mode-conversion-service.ts
 */

import { describe, it, expect } from '@jest/globals';
import {
  applyQueueToSlot,
  applySlotToQueue,
  isTelemedModality,
  type QueueAppointmentInput,
  type SlotAppointmentInput,
  type SlotGrid,
} from '../../../src/services/opd/opd-mode-conversion-algorithms';

// ============================================================================
// Helpers
// ============================================================================

function slotApt(overrides: Partial<SlotAppointmentInput> = {}): SlotAppointmentInput {
  return {
    id: 'apt-1',
    appointmentDate: '2026-05-18T04:30:00.000Z',
    createdAt: '2026-05-17T10:00:00.000Z',
    status: 'pending',
    opdSessionDelayMinutes: null,
    opdEarlyInviteExpiresAt: null,
    opdEarlyInviteResponse: null,
    ...overrides,
  };
}

function queueApt(overrides: Partial<QueueAppointmentInput> = {}): QueueAppointmentInput {
  return {
    id: 'apt-1',
    appointmentDate: '2026-05-18T04:30:00.000Z',
    tokenNumber: 1,
    status: 'pending',
    ...overrides,
  };
}

function buildLinearGrid(
  startIso: string,
  intervalMinutes: number,
  count: number
): SlotGrid {
  const startMs = new Date(startIso).getTime();
  const slots: string[] = [];
  for (let i = 0; i < count; i += 1) {
    slots.push(new Date(startMs + i * intervalMinutes * 60 * 1000).toISOString());
  }
  const sessionEndIso =
    count > 0
      ? new Date(startMs + count * intervalMinutes * 60 * 1000).toISOString()
      : startIso;
  return {
    sessionStartIso: startIso,
    sessionEndIso,
    intervalMinutes,
    slots,
  };
}

// ============================================================================
// applySlotToQueue — 5 fixtures
// ============================================================================

describe('applySlotToQueue (DL-4, lossless rank by date + created_at)', () => {
  it('fixture 1 — empty input returns empty result', () => {
    const result = applySlotToQueue([]);
    expect(result).toEqual({ assignments: [], notificationCount: 0 });
  });

  it('fixture 2 — all-pending, already sorted, tokens 1/2/3', () => {
    const input: SlotAppointmentInput[] = [
      slotApt({ id: 'a', appointmentDate: '2026-05-18T04:30:00.000Z' }),
      slotApt({ id: 'b', appointmentDate: '2026-05-18T05:00:00.000Z' }),
      slotApt({ id: 'c', appointmentDate: '2026-05-18T05:30:00.000Z' }),
    ];

    const result = applySlotToQueue(input);

    expect(result.notificationCount).toBe(3);
    expect(result.assignments).toEqual([
      {
        appointmentId: 'a',
        tokenNumber: 1,
        clearFields: [
          'opd_session_delay_minutes',
          'opd_early_invite_expires_at',
          'opd_early_invite_response',
        ],
      },
      {
        appointmentId: 'b',
        tokenNumber: 2,
        clearFields: [
          'opd_session_delay_minutes',
          'opd_early_invite_expires_at',
          'opd_early_invite_response',
        ],
      },
      {
        appointmentId: 'c',
        tokenNumber: 3,
        clearFields: [
          'opd_session_delay_minutes',
          'opd_early_invite_expires_at',
          'opd_early_invite_response',
        ],
      },
    ]);
  });

  it('fixture 3 — tiebreak by `createdAt` when `appointmentDate` is identical', () => {
    const input: SlotAppointmentInput[] = [
      // Same appointmentDate; LATER created_at on the helper output should be token 2.
      slotApt({
        id: 'late',
        appointmentDate: '2026-05-18T04:30:00.000Z',
        createdAt: '2026-05-17T10:00:00.000Z',
      }),
      slotApt({
        id: 'early',
        appointmentDate: '2026-05-18T04:30:00.000Z',
        createdAt: '2026-05-17T09:00:00.000Z',
      }),
    ];

    const result = applySlotToQueue(input);

    expect(result.assignments.map((a) => a.appointmentId)).toEqual(['early', 'late']);
    expect(result.assignments.map((a) => a.tokenNumber)).toEqual([1, 2]);
  });

  it('fixture 4 — mixed status (status filter happens upstream)', () => {
    // The pure helper accepts only non-terminal rows by contract;
    // the orchestrator filters status before calling. This fixture verifies
    // that the helper itself does NOT silently drop confirmed rows.
    const input: SlotAppointmentInput[] = [
      slotApt({ id: 'p1', appointmentDate: '2026-05-18T04:30:00.000Z', status: 'pending' }),
      slotApt({ id: 'c1', appointmentDate: '2026-05-18T05:00:00.000Z', status: 'confirmed' }),
      slotApt({ id: 'p2', appointmentDate: '2026-05-18T05:30:00.000Z', status: 'pending' }),
    ];

    const result = applySlotToQueue(input);

    expect(result.assignments).toHaveLength(3);
    expect(result.assignments.map((a) => a.tokenNumber)).toEqual([1, 2, 3]);
  });

  it('fixture 5 — slot-only state present is still nulled via `clearFields`', () => {
    const input: SlotAppointmentInput[] = [
      slotApt({
        id: 'a',
        opdSessionDelayMinutes: 10,
        opdEarlyInviteExpiresAt: '2026-05-18T04:00:00.000Z',
        opdEarlyInviteResponse: 'accepted',
      }),
    ];

    const result = applySlotToQueue(input);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]!.clearFields).toEqual([
      'opd_session_delay_minutes',
      'opd_early_invite_expires_at',
      'opd_early_invite_response',
    ]);
  });
});

// ============================================================================
// applyQueueToSlot — 5 fixtures
// ============================================================================

describe('applyQueueToSlot (DL-4, may overflow past sessionEnd)', () => {
  const sessionStart = '2026-05-18T04:00:00.000Z'; // 09:30 IST
  const intervalMinutes = 30;

  it('fixture 1 — empty input returns empty result regardless of grid', () => {
    const grid = buildLinearGrid(sessionStart, intervalMinutes, 5);
    const result = applyQueueToSlot([], grid);
    expect(result).toEqual({
      assignments: [],
      overflowCount: 0,
      notificationCount: 0,
    });
  });

  it('fixture 2 — equal capacity: 5 entries, 5-slot grid, zero overflow', () => {
    const grid = buildLinearGrid(sessionStart, intervalMinutes, 5);
    const input: QueueAppointmentInput[] = [
      queueApt({ id: 'q1', tokenNumber: 1 }),
      queueApt({ id: 'q2', tokenNumber: 2 }),
      queueApt({ id: 'q3', tokenNumber: 3 }),
      queueApt({ id: 'q4', tokenNumber: 4 }),
      queueApt({ id: 'q5', tokenNumber: 5 }),
    ];

    const result = applyQueueToSlot(input, grid);

    expect(result.overflowCount).toBe(0);
    expect(result.notificationCount).toBe(5);
    expect(result.assignments.map((a) => a.appointmentId)).toEqual([
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
    ]);
    expect(result.assignments.every((a) => !a.isOverflow)).toBe(true);
    expect(result.assignments.every((a) => a.opdEventType === 'standard')).toBe(true);
    expect(result.assignments.map((a) => a.newAppointmentDate)).toEqual([
      '2026-05-18T04:00:00.000Z',
      '2026-05-18T04:30:00.000Z',
      '2026-05-18T05:00:00.000Z',
      '2026-05-18T05:30:00.000Z',
      '2026-05-18T06:00:00.000Z',
    ]);
  });

  it('fixture 3 — overflow by 2: 7 entries, 5-slot grid', () => {
    const grid = buildLinearGrid(sessionStart, intervalMinutes, 5);
    const input: QueueAppointmentInput[] = Array.from({ length: 7 }, (_, i) =>
      queueApt({ id: `q${i + 1}`, tokenNumber: i + 1 })
    );

    const result = applyQueueToSlot(input, grid);

    expect(result.overflowCount).toBe(2);
    expect(result.notificationCount).toBe(7);

    const slotted = result.assignments.slice(0, 5);
    const overflow = result.assignments.slice(5);
    expect(slotted.every((a) => !a.isOverflow && a.opdEventType === 'standard')).toBe(true);
    expect(overflow.every((a) => a.isOverflow && a.opdEventType === 'return_after_completed')).toBe(true);

    // sessionEnd is 06:30Z (5 * 30min after 04:00Z). Overflow 1 → 07:00Z; overflow 2 → 07:30Z.
    expect(overflow.map((a) => a.newAppointmentDate)).toEqual([
      '2026-05-18T07:00:00.000Z',
      '2026-05-18T07:30:00.000Z',
    ]);
  });

  it('fixture 4 — non-contiguous grid (working-hour gap), overflow past LAST window', () => {
    // 2-slot morning (04:00Z, 04:30Z) + 2-slot afternoon (10:00Z, 10:30Z). End = 11:00Z.
    const grid: SlotGrid = {
      sessionStartIso: '2026-05-18T04:00:00.000Z',
      sessionEndIso: '2026-05-18T11:00:00.000Z',
      intervalMinutes: 30,
      slots: [
        '2026-05-18T04:00:00.000Z',
        '2026-05-18T04:30:00.000Z',
        '2026-05-18T10:00:00.000Z',
        '2026-05-18T10:30:00.000Z',
      ],
    };
    const input: QueueAppointmentInput[] = Array.from({ length: 6 }, (_, i) =>
      queueApt({ id: `q${i + 1}`, tokenNumber: i + 1 })
    );

    const result = applyQueueToSlot(input, grid);

    expect(result.overflowCount).toBe(2);
    expect(result.assignments.slice(0, 4).map((a) => a.newAppointmentDate)).toEqual(grid.slots);
    expect(result.assignments.slice(4).map((a) => a.newAppointmentDate)).toEqual([
      '2026-05-18T11:30:00.000Z',
      '2026-05-18T12:00:00.000Z',
    ]);
  });

  it('fixture 5 — all overflow: zero-capacity grid (doctor has no working hours)', () => {
    const grid: SlotGrid = {
      sessionStartIso: '2026-05-18T07:00:00.000Z',
      sessionEndIso: '2026-05-18T07:00:00.000Z',
      intervalMinutes: 30,
      slots: [],
    };
    const input: QueueAppointmentInput[] = [
      queueApt({ id: 'q1', tokenNumber: 1 }),
      queueApt({ id: 'q2', tokenNumber: 2 }),
      queueApt({ id: 'q3', tokenNumber: 3 }),
    ];

    const result = applyQueueToSlot(input, grid);

    expect(result.overflowCount).toBe(3);
    expect(result.assignments.every((a) => a.isOverflow)).toBe(true);
    expect(result.assignments.map((a) => a.newAppointmentDate)).toEqual([
      '2026-05-18T07:30:00.000Z',
      '2026-05-18T08:00:00.000Z',
      '2026-05-18T08:30:00.000Z',
    ]);
  });

  it('bonus — sorts by tokenNumber even when input is unsorted', () => {
    const grid = buildLinearGrid(sessionStart, intervalMinutes, 3);
    const input: QueueAppointmentInput[] = [
      queueApt({ id: 'q3', tokenNumber: 3 }),
      queueApt({ id: 'q1', tokenNumber: 1 }),
      queueApt({ id: 'q2', tokenNumber: 2 }),
    ];

    const result = applyQueueToSlot(input, grid);

    expect(result.assignments.map((a) => a.appointmentId)).toEqual(['q1', 'q2', 'q3']);
  });
});

// ============================================================================
// isTelemedModality (PD-Q4)
// ============================================================================

describe('isTelemedModality', () => {
  it('detects every telemed modality string (case-insensitive)', () => {
    expect(isTelemedModality('video')).toBe(true);
    expect(isTelemedModality('VIDEO')).toBe(true);
    expect(isTelemedModality('voice')).toBe(true);
    expect(isTelemedModality('text')).toBe(true);
    expect(isTelemedModality('chat')).toBe(true);
    expect(isTelemedModality(' chat ')).toBe(true);
  });

  it('returns false for in-clinic / null / empty', () => {
    expect(isTelemedModality('in_clinic')).toBe(false);
    expect(isTelemedModality(null)).toBe(false);
    expect(isTelemedModality(undefined)).toBe(false);
    expect(isTelemedModality('')).toBe(false);
  });
});
