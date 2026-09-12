/**
 * listPrescriptionsByAppointment — the cockpit's draft read.
 *
 * The doctor cannot type until this resolves, so it must stay a single
 * round-trip: medicines and attachments come back embedded, never as a
 * per-prescription fan-out.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import { listPrescriptionsByAppointment } from '../../../src/services/prescription-service';

const mockedDb = database as jest.Mocked<typeof database>;

const CORR = 'corr-list-by-appt';
const DOCTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const APPT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function mockClient(rows: Array<Record<string, unknown>>) {
  const tables: string[] = [];
  const select = jest.fn().mockReturnThis();
  mockedDb.getSupabaseAdminClient.mockReturnValue({
    from: jest.fn((table: string) => {
      tables.push(table);
      if (table === 'appointments') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn(async () => ({
            data: { id: APPT_ID, doctor_id: DOCTOR_ID },
            error: null,
          })),
        };
      }
      return {
        select,
        eq: jest.fn().mockReturnThis(),
        order: jest.fn(async () => ({ data: rows, error: null })),
      };
    }),
  } as never);
  return { tables, select };
}

describe('listPrescriptionsByAppointment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('embeds medicines and attachments in one query, sorted by sort_order', async () => {
    const { tables, select } = mockClient([
      {
        id: 'rx-1',
        appointment_id: APPT_ID,
        prescription_medicines: [
          { id: 'm-2', sort_order: 2 },
          { id: 'm-0', sort_order: 0 },
          { id: 'm-1', sort_order: 1 },
        ],
        prescription_attachments: [{ id: 'att-1' }],
      },
    ]);

    const result = await listPrescriptionsByAppointment(APPT_ID, CORR, DOCTOR_ID);

    expect(select).toHaveBeenCalledWith(
      '*, prescription_medicines(*), prescription_attachments(*)'
    );
    // A per-prescription fan-out would read these tables directly.
    expect(tables).not.toContain('prescription_medicines');
    expect(tables).not.toContain('prescription_attachments');
    expect(result[0]?.prescription_medicines?.map((m) => m.id)).toEqual([
      'm-0',
      'm-1',
      'm-2',
    ]);
    expect(result[0]?.prescription_attachments).toHaveLength(1);
  });

  it('returns empty relation arrays when the embed comes back null', async () => {
    mockClient([
      {
        id: 'rx-1',
        appointment_id: APPT_ID,
        prescription_medicines: null,
        prescription_attachments: null,
      },
    ]);

    const result = await listPrescriptionsByAppointment(APPT_ID, CORR, DOCTOR_ID);

    expect(result[0]?.prescription_medicines).toEqual([]);
    expect(result[0]?.prescription_attachments).toEqual([]);
  });
});
