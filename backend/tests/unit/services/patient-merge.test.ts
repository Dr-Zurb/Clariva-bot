/**
 * rcp-28: mergePatients — doctor-scoped merge, source anonymization, identity integrity.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { mergePatients } from '../../../src/services/patient-service';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const sourceId = '11111111-1111-1111-1111-111111111111';
const targetId = '22222222-2222-2222-2222-222222222222';
const correlationId = 'corr-merge';

function createMergeSupabase() {
  const appointmentUpdates: unknown[] = [];
  const conversationUpdates: unknown[] = [];
  const patientUpdates: unknown[] = [];
  const updateEqFilters: Array<{ table: string; filters: Record<string, string> }> = [];

  const from = jest.fn((table: string) => {
    const filters: Record<string, string> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockImplementation((...args: unknown[]) => {
        const [col, val] = args as [string, string];
        filters[col] = val;
        return chain;
      }),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockImplementation(() => {
        if (table === 'conversations' || table === 'appointments') {
          return Promise.resolve({ data: { id: 'link-1' }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      update: jest.fn().mockImplementation((payload: unknown) => {
        if (table === 'appointments') appointmentUpdates.push(payload);
        if (table === 'conversations') conversationUpdates.push(payload);
        if (table === 'patients') patientUpdates.push(payload);
        const updateFilters: Record<string, string> = {};
        const updateChain: any = {
          eq: jest.fn().mockImplementation((...args: unknown[]) => {
            const [col, val] = args as [string, string];
            updateFilters[col] = val;
            updateEqFilters.push({ table, filters: { ...updateFilters } });
            return updateChain;
          }),
        };
        (updateChain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: null, error: null }).then(resolve);
        return updateChain;
      }),
      single: jest.fn().mockResolvedValue({
        data: {
          id: filters.patient_id ?? sourceId,
          name: 'Patient',
          phone: '+15550001111',
          medical_record_number: 'P-00001',
        },
        error: null,
      } as never),
    };
    return chain;
  });

  return {
    client: { from } as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    appointmentUpdates,
    conversationUpdates,
    patientUpdates,
    updateEqFilters,
  };
}

describe('mergePatients (rcp-28)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logDataModification as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
    (mockedAudit.logAuditEvent as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  it('moves appointments and conversations within doctor scope and anonymizes source', async () => {
    const mock = createMergeSupabase();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client);

    await mergePatients(doctorId, sourceId, targetId, correlationId);

    expect(mock.appointmentUpdates).toEqual([{ patient_id: targetId }]);
    expect(mock.conversationUpdates).toEqual([{ patient_id: targetId }]);
    expect(mock.patientUpdates).toEqual([
      expect.objectContaining({
        name: '[Merged]',
        phone: `merged-${sourceId}`,
        platform: null,
        platform_external_id: null,
      }),
    ]);

    const aptMove = mock.updateEqFilters.filter((f) => f.table === 'appointments');
    const aptFilters = Object.assign({}, ...aptMove.map((f) => f.filters));
    expect(aptFilters).toMatchObject({
      doctor_id: doctorId,
      patient_id: sourceId,
    });
    const convMove = mock.updateEqFilters.filter((f) => f.table === 'conversations');
    const convFilters = Object.assign({}, ...convMove.map((f) => f.filters));
    expect(convFilters).toMatchObject({
      doctor_id: doctorId,
      patient_id: sourceId,
    });
    const sourceAnon = mock.updateEqFilters.find((f) => f.table === 'patients');
    expect(sourceAnon?.filters).toMatchObject({ id: sourceId });
  });

  it('rejects merging source and target when they are the same patient', async () => {
    await expect(
      mergePatients(doctorId, sourceId, sourceId, correlationId)
    ).rejects.toThrow('Source and target patient must be different');
  });
});
