/**
 * Actor-aware audit metadata (receptionist-portal P1 · DL-6).
 * Existing audit-logger.test.ts is left unchanged.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockInsert = jest.fn<(batch: readonly unknown[]) => Promise<{ error: null }>>();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: mockInsert,
    })),
  })),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import {
  drainAuditLogQueue,
  logAuditEvent,
  logDataAccess,
  resetAuditLogQueueForTests,
} from '../../../src/utils/audit-logger';

const CORRELATION_ID = 'cid-acting-doctor-audit';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';

beforeEach(() => {
  jest.clearAllMocks();
  resetAuditLogQueueForTests();
  mockInsert.mockResolvedValue({ error: null });
});

describe('logAuditEvent onBehalfOfDoctorId', () => {
  it('writes a byte-identical row when onBehalfOfDoctorId is omitted', async () => {
    await logAuditEvent({
      correlationId: CORRELATION_ID,
      userId: ACTOR_ID,
      action: 'read_patient',
      resourceType: 'patient',
      status: 'success',
    });
    await drainAuditLogQueue();

    const row = (mockInsert.mock.calls[0]![0] as Record<string, unknown>[])[0];
    expect(row).toEqual({
      correlation_id: CORRELATION_ID,
      user_id: ACTOR_ID,
      action: 'read_patient',
      resource_type: 'patient',
      resource_id: undefined,
      status: 'success',
      error_message: undefined,
      metadata: undefined,
    });
  });

  it('stamps metadata.on_behalf_of_doctor_id when staff act for a doctor', async () => {
    await logDataAccess(CORRELATION_ID, ACTOR_ID, 'patient', undefined, DOCTOR_ID);
    await drainAuditLogQueue();

    const row = (mockInsert.mock.calls[0]![0] as Record<string, unknown>[])[0];
    expect(row.user_id).toBe(ACTOR_ID);
    expect(row.metadata).toEqual({ on_behalf_of_doctor_id: DOCTOR_ID });
  });
});
