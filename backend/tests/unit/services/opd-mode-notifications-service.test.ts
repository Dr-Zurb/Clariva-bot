/**
 * Drainer unit tests for debounced OPD mode notifications (pdm-06).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/opd/opd-mode-notification-dispatcher', () => ({
  notifyConversionAffectedPatients: jest.fn(),
}));

import { drainOpdPendingModeNotifications } from '../../../src/services/opd/opd-mode-notifications-service';
import { notifyConversionAffectedPatients } from '../../../src/services/opd/opd-mode-notification-dispatcher';

const mockedDispatch = notifyConversionAffectedPatients as jest.MockedFunction<
  typeof notifyConversionAffectedPatients
>;

type Filter = { type: 'or' | 'eq'; expr?: string; col?: string; value?: unknown };

class Chain {
  private filters: Filter[] = [];
  private mode: 'select' | 'update' | 'delete' = 'select';
  constructor(
    private readonly rows: PendingRow[],
    private readonly auditUpdates: Array<{ correlation_id: string }>
  ) {}

  select(_cols: string): this {
    return this;
  }

  or(expr: string): this {
    this.filters.push({ type: 'or', expr });
    return this;
  }

  update(_values: Record<string, unknown>): this {
    this.mode = 'update';
    return this;
  }

  eq(col: string, value: unknown): this {
    this.filters.push({ type: 'eq', col, value });
    return this;
  }

  delete(): this {
    this.mode = 'delete';
    return this;
  }

  private dueRows(): PendingRow[] {
    const now = Date.now();
    const ceilingMs = now - 30 * 60 * 1000;
    return this.rows.filter((row) => {
      const scheduledMs = new Date(row.scheduled_for).getTime();
      const firstFlipMs = new Date(row.first_flip_at).getTime();
      return scheduledMs <= now || firstFlipMs <= ceilingMs;
    });
  }

  then(
    resolve: (v: { data: unknown; error: unknown }) => unknown,
    reject?: (err: unknown) => unknown
  ): void {
    try {
      if (this.mode === 'select') {
        resolve({ data: this.dueRows(), error: null });
        return;
      }
      if (this.mode === 'update') {
        const correlationId = this.filters.find((f) => f.col === 'correlation_id')?.value as string;
        if (correlationId) {
          this.auditUpdates.push({ correlation_id: correlationId });
        }
        resolve({ data: null, error: null });
        return;
      }
      if (this.mode === 'delete') {
        const doctorId = this.filters.find((f) => f.col === 'doctor_id')?.value as string;
        const sessionDate = this.filters.find((f) => f.col === 'session_date')?.value as string;
        for (let i = this.rows.length - 1; i >= 0; i -= 1) {
          const r = this.rows[i]!;
          if (r.doctor_id === doctorId && r.session_date === sessionDate) {
            this.rows.splice(i, 1);
          }
        }
        resolve({ data: null, error: null });
        return;
      }
      resolve({ data: null, error: null });
    } catch (err) {
      if (reject) reject(err);
      else throw err;
    }
  }
}

interface PendingRow {
  doctor_id: string;
  session_date: string;
  first_flip_at: string;
  scheduled_for: string;
  latest_flip_mode: 'slot' | 'queue';
  payload_json: { correlation_id?: string };
}

function mockSupabase(rows: PendingRow[]) {
  const auditUpdates: Array<{ correlation_id: string }> = [];
  return {
    supabase: {
      from: (table: string) => {
        if (table === 'doctor_opd_pending_mode_notifications') {
          return new Chain(rows, auditUpdates);
        }
        if (table === 'doctor_opd_session_mode_changes') {
          return new Chain(rows, auditUpdates);
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
    auditUpdates,
  };
}

describe('drainOpdPendingModeNotifications', () => {
  beforeEach(() => {
    mockedDispatch.mockReset();
    mockedDispatch.mockResolvedValue(undefined);
  });

  it('dispatches when debounce elapsed and deletes pending row', async () => {
    const rows: PendingRow[] = [
      {
        doctor_id: 'doc-1',
        session_date: '2026-05-18',
        first_flip_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        latest_flip_mode: 'queue',
        payload_json: { correlation_id: 'corr-1' },
      },
    ];
    const { supabase, auditUpdates } = mockSupabase(rows);

    const summary = await drainOpdPendingModeNotifications(supabase as never);

    expect(summary).toEqual({ dispatched: 1, skipped: 0 });
    expect(mockedDispatch).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(0);
    expect(auditUpdates).toEqual([{ correlation_id: 'corr-1' }]);
  });

  it('skips when debounce not elapsed and ceiling not reached', async () => {
    const rows: PendingRow[] = [
      {
        doctor_id: 'doc-1',
        session_date: '2026-05-18',
        first_flip_at: new Date().toISOString(),
        scheduled_for: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
        latest_flip_mode: 'queue',
        payload_json: { correlation_id: 'corr-2' },
      },
    ];
    const { supabase } = mockSupabase(rows);

    const summary = await drainOpdPendingModeNotifications(supabase as never);

    expect(summary).toEqual({ dispatched: 0, skipped: 0 });
    expect(mockedDispatch).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });

  it('dispatches on 30-min ceiling even when scheduled_for is still in the future', async () => {
    const rows: PendingRow[] = [
      {
        doctor_id: 'doc-1',
        session_date: '2026-05-18',
        first_flip_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
        scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        latest_flip_mode: 'slot',
        payload_json: { correlation_id: 'corr-3' },
      },
    ];
    const { supabase } = mockSupabase(rows);

    const summary = await drainOpdPendingModeNotifications(supabase as never);

    expect(summary).toEqual({ dispatched: 1, skipped: 0 });
    expect(mockedDispatch).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(0);
  });

  it('counts skipped when dispatch throws and retains the row', async () => {
    mockedDispatch.mockRejectedValueOnce(new Error('sms down'));
    const rows: PendingRow[] = [
      {
        doctor_id: 'doc-1',
        session_date: '2026-05-18',
        first_flip_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        latest_flip_mode: 'queue',
        payload_json: {},
      },
    ];
    const { supabase } = mockSupabase(rows);

    const summary = await drainOpdPendingModeNotifications(supabase as never);

    expect(summary).toEqual({ dispatched: 0, skipped: 1 });
    expect(rows).toHaveLength(1);
  });
});
