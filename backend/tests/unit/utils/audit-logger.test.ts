/**
 * Audit logger async queue (np-03).
 *
 * Pins the lossless off-hot-path contract:
 *   - `logAuditEvent` enqueues without blocking on PostgREST insert.
 *   - `validateNoPHI` still runs synchronously before enqueue.
 *   - `drainAuditLogQueue` flushes all pending rows (shutdown path).
 *   - Multiple events batch into a single insert where possible.
 *   - Public helper signatures (`logSecurityEvent`, etc.) unchanged.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

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
  logAuditEvent,
  logSecurityEvent,
  drainAuditLogQueue,
  resetAuditLogQueueForTests,
  getPendingAuditLogCountForTests,
} from '../../../src/utils/audit-logger';

const CORRELATION_ID = 'cid-audit-queue-test';
const USER_ID = '00000000-0000-0000-0000-0000000000aa';

beforeEach(() => {
  jest.clearAllMocks();
  resetAuditLogQueueForTests();
  mockInsert.mockResolvedValue({ error: null });
});

async function flushTicks(): Promise<void> {
  await drainAuditLogQueue();
}

describe('logAuditEvent async queue', () => {
  it('does not call insert synchronously — flush happens on drain', async () => {
    await logAuditEvent({
      correlationId: CORRELATION_ID,
      userId: USER_ID,
      action: 'authenticate',
      resourceType: 'auth',
      status: 'success',
    });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(getPendingAuditLogCountForTests()).toBeGreaterThanOrEqual(0);

    await flushTicks();
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const batch = mockInsert.mock.calls[0]![0];
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({
      correlation_id: CORRELATION_ID,
      user_id: USER_ID,
      action: 'authenticate',
      resource_type: 'auth',
      status: 'success',
    });
  });

  it('batches multiple enqueued events into one insert on drain', async () => {
    await logAuditEvent({
      correlationId: 'c1',
      action: 'a1',
      resourceType: 'auth',
      status: 'success',
    });
    await logAuditEvent({
      correlationId: 'c2',
      action: 'a2',
      resourceType: 'auth',
      status: 'success',
    });
    await logAuditEvent({
      correlationId: 'c3',
      action: 'a3',
      resourceType: 'auth',
      status: 'failure',
    });

    await flushTicks();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const batch = mockInsert.mock.calls[0]![0];
    expect(batch).toHaveLength(3);
  });

  it('skips enqueue when PHI is detected in metadata (validateNoPHI unchanged)', async () => {
    await logAuditEvent({
      correlationId: CORRELATION_ID,
      action: 'read_patient',
      resourceType: 'patient',
      status: 'success',
      metadata: { patient_name: 'must-not-log' },
    });

    await flushTicks();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('never throws when insert fails', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'db down' } as never });

    await expect(
      logAuditEvent({
        correlationId: CORRELATION_ID,
        action: 'test',
        resourceType: 'auth',
        status: 'success',
      }),
    ).resolves.toBeUndefined();

    await flushTicks();
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe('logSecurityEvent', () => {
  it('enqueues a security_event row via the same async path', async () => {
    await logSecurityEvent(
      CORRELATION_ID,
      undefined,
      'failed_auth',
      'medium',
      '203.0.113.7',
      'Invalid token',
    );

    await flushTicks();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0]![0][0] as Record<string, unknown>;
    expect(row.action).toBe('security_event');
    expect(row.resource_type).toBe('security');
    expect(row.status).toBe('failure');
    expect(row.metadata).toMatchObject({
      eventType: 'failed_auth',
      severity: 'medium',
      ipAddress: '203.0.113.7',
    });
  });
});

describe('drainAuditLogQueue', () => {
  it('leaves the queue empty after drain', async () => {
    await logAuditEvent({
      correlationId: CORRELATION_ID,
      action: 'authenticate',
      resourceType: 'auth',
      status: 'success',
    });
    await drainAuditLogQueue();
    expect(getPendingAuditLogCountForTests()).toBe(0);
  });
});
