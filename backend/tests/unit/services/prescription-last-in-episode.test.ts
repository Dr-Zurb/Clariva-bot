/**
 * getLastPrescriptionInEpisode — rxl-08 exclusion key.
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
import { getLastPrescriptionInEpisode } from '../../../src/services/prescription-service';

const mockedDb = database as jest.Mocked<typeof database>;

const CORR = 'corr-rxl-08';
const DOCTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const APPT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const EPISODE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CURRENT_RX = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function mockEpisodeQuery(opts: {
  neq: ReturnType<typeof jest.fn>;
  is: ReturnType<typeof jest.fn>;
  rx?: Record<string, unknown> | null;
}) {
  mockedDb.getSupabaseAdminClient.mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === 'appointments') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn(async () => ({
            data: { id: APPT_ID, doctor_id: DOCTOR_ID, episode_id: EPISODE_ID },
            error: null,
          })),
        };
      }
      if (table === 'prescriptions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: opts.is.mockReturnThis(),
          neq: opts.neq.mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(async () => ({ data: opts.rx ?? null, error: null })),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest
          .fn<() => Promise<{ data: unknown[]; error: null }>>()
          .mockResolvedValue({ data: [], error: null }),
      };
    }),
  } as never);
}

describe('getLastPrescriptionInEpisode (rxl-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips superseded rows and the working note, not the appointment', async () => {
    const neq = jest.fn();
    const is = jest.fn();
    mockEpisodeQuery({
      neq,
      is,
      rx: { id: 'rx-sibling', doctor_id: DOCTOR_ID, episode_id: EPISODE_ID },
    });

    const result = await getLastPrescriptionInEpisode(
      APPT_ID,
      CORR,
      DOCTOR_ID,
      CURRENT_RX
    );

    expect(result?.id).toBe('rx-sibling');
    expect(is).toHaveBeenCalledWith('superseded_by_id', null);
    expect(neq).toHaveBeenCalledWith('id', CURRENT_RX);
    expect(neq).not.toHaveBeenCalledWith('appointment_id', APPT_ID);
  });

  it('does not exclude a prescription when the form has no id yet', async () => {
    const neq = jest.fn();
    const is = jest.fn();
    mockEpisodeQuery({ neq, is, rx: null });

    await getLastPrescriptionInEpisode(APPT_ID, CORR, DOCTOR_ID, null);

    expect(is).toHaveBeenCalledWith('superseded_by_id', null);
    expect(neq).not.toHaveBeenCalled();
  });
});
