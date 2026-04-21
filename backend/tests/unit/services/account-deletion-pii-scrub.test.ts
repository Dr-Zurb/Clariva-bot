/**
 * Unit tests for `services/account-deletion-pii-scrub.ts` (Plan 02 · Task 33).
 *
 * The tests exercise the scrub function directly against a Supabase
 * mock and verify two properties that the task pins:
 *
 *   1. The `patients` row's personally-identifying columns are set to
 *      the `<scrubbed>` placeholder (or nulled where nullable).
 *   2. The scrub touches ONLY the `patients` table. Any attempt to
 *      call `.from('appointments')` / `.from('prescriptions')` /
 *      `.from('consultation_messages')` fails the test loudly.
 *
 * The second property is what makes the DPDP / GDPR carve-out safe:
 * the clinical artifacts must survive account deletion.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import {
  PII_SCRUB_PLACEHOLDER,
  scrubPatientPiiFromLogs,
} from '../../../src/services/account-deletion-pii-scrub';
import { InternalError, NotFoundError } from '../../../src/utils/errors';
import * as database from '../../../src/config/database';

const mockedDb = database as jest.Mocked<typeof database>;

beforeEach(() => {
  jest.clearAllMocks();
});

interface ExistingPatient {
  id: string;
  email: string | null;
  date_of_birth: string | null;
  age: number | null;
  medical_record_number: string | null;
  platform_external_id: string | null;
}

/**
 * Build a Supabase mock that supports the exact call chain
 * scrubPatientPiiFromLogs issues against the `patients` table:
 *   1. `.from('patients').select(...).eq('id', ...).maybeSingle()`
 *   2. `.from('patients').update(...).eq('id', ...)`
 * Any other table name throws — the test suite uses that to prove the
 * scrub never reaches appointments / prescriptions / consultation_messages.
 */
function buildAdminMock(existing: ExistingPatient | null, opts?: {
  selectError?: string;
  updateError?: string;
}) {
  const capturedUpdate: Record<string, unknown>[] = [];
  const tableTouches: string[] = [];

  const from = jest.fn((...args: unknown[]) => {
    const table = args[0] as string;
    tableTouches.push(table);
    if (table !== 'patients') {
      throw new Error(
        `scrubPatientPiiFromLogs must only touch 'patients' but reached '${table}'`,
      );
    }

    const maybeSingle = jest.fn().mockReturnValue(
      Promise.resolve({
        data: existing,
        error: opts?.selectError ? { message: opts.selectError } : null,
      }),
    );
    const selectEq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq: selectEq });

    const updateEq = jest.fn().mockReturnValue(
      Promise.resolve({
        data: null,
        error: opts?.updateError ? { message: opts.updateError } : null,
      }),
    );
    const update = jest.fn((payload: Record<string, unknown>) => {
      capturedUpdate.push(payload);
      return { eq: updateEq };
    });

    return { select, update };
  });

  return {
    client: { from } as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    capturedUpdate,
    tableTouches,
  };
}

describe('scrubPatientPiiFromLogs', () => {
  it('scrubs name/phone to the placeholder and nulls optional PII fields', async () => {
    const mock = buildAdminMock({
      id: 'p-1',
      email: 'p@example.com',
      date_of_birth: '1990-01-01',
      age: 34,
      medical_record_number: 'MRN-123',
      platform_external_id: 'ig-psid-xyz',
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client);

    const res = await scrubPatientPiiFromLogs({
      patientId: 'p-1',
      correlationId: 'corr-1',
    });

    expect(res.scrubbed).toBe(true);
    expect(mock.capturedUpdate).toHaveLength(1);
    const update = mock.capturedUpdate[0]!;
    expect(update.name).toBe(PII_SCRUB_PLACEHOLDER);
    expect(update.phone).toBe(PII_SCRUB_PLACEHOLDER);
    expect(update.email).toBe(PII_SCRUB_PLACEHOLDER);
    expect(update.date_of_birth).toBeNull();
    expect(update.age).toBeNull();
    expect(update.medical_record_number).toBeNull();
    expect(update.platform_external_id).toBeNull();
  });

  it('does not flip a NULL email to the placeholder (prevents misleading redaction)', async () => {
    const mock = buildAdminMock({
      id: 'p-2',
      email: null,
      date_of_birth: null,
      age: null,
      medical_record_number: null,
      platform_external_id: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client);

    await scrubPatientPiiFromLogs({ patientId: 'p-2', correlationId: 'corr-2' });

    expect(mock.capturedUpdate).toHaveLength(1);
    expect(Object.keys(mock.capturedUpdate[0]!)).not.toContain('email');
  });

  it('never touches appointments / prescriptions / consultation_messages', async () => {
    const mock = buildAdminMock({
      id: 'p-3',
      email: null,
      date_of_birth: null,
      age: null,
      medical_record_number: null,
      platform_external_id: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client);

    await scrubPatientPiiFromLogs({ patientId: 'p-3', correlationId: 'corr-3' });

    expect(mock.tableTouches.every((t) => t === 'patients')).toBe(true);
    expect(mock.tableTouches).not.toContain('appointments');
    expect(mock.tableTouches).not.toContain('prescriptions');
    expect(mock.tableTouches).not.toContain('consultation_messages');
  });

  it('throws NotFoundError when the patient row is missing', async () => {
    const mock = buildAdminMock(null);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client);
    await expect(
      scrubPatientPiiFromLogs({ patientId: 'p-missing', correlationId: 'c' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws InternalError when the SELECT errors at the DB layer', async () => {
    const mock = buildAdminMock(null, { selectError: 'boom-select' });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client);
    await expect(
      scrubPatientPiiFromLogs({ patientId: 'p-1', correlationId: 'c' }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('throws InternalError when the UPDATE errors at the DB layer', async () => {
    const mock = buildAdminMock(
      {
        id: 'p-4',
        email: null,
        date_of_birth: null,
        age: null,
        medical_record_number: null,
        platform_external_id: null,
      },
      { updateError: 'boom-update' },
    );
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client);
    await expect(
      scrubPatientPiiFromLogs({ patientId: 'p-4', correlationId: 'c' }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('throws InternalError when no admin client is configured', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);
    await expect(
      scrubPatientPiiFromLogs({ patientId: 'p-1', correlationId: 'c' }),
    ).rejects.toBeInstanceOf(InternalError);
  });
});
