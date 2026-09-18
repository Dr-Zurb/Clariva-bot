/**
 * rxl-06 — attest stamp + content-write guard.
 *
 * API-boundary proofs (service throws typed ConflictError with HTTP 409):
 *   - draft write succeeds
 *   - attested write is refused
 *   - historical null-stamp + completed appointment is refused
 *   - stamp is set once; a second attest does not move it
 *   - child-table upload is refused on an attested Rx
 *   - changedFields is names only (no values)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
}));
jest.mock('../../../src/services/prescription-pdf-cache', () => ({
  invalidatePrescriptionPdfCache: jest.fn(),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorTimezone: jest.fn(async () => 'Asia/Kolkata'),
}));

import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';
import { ConflictError } from '../../../src/utils/errors';
import {
  assertPrescriptionContentWritable,
  attestPrescriptionIfUnset,
  updatePrescription,
} from '../../../src/services/prescription-service';
import { createUploadUrl } from '../../../src/services/prescription-attachment-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const RX_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DOCTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const APPOINTMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CORR = 'corr-rxl-06';

type RxRow = {
  id: string;
  doctor_id: string;
  appointment_id: string;
  attested_at: string | null;
  issued_at?: string | null;
  superseded_by_id?: string | null;
};

function chainable(terminal: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(terminal).then(resolve);
      }
      if (typeof prop === 'symbol') return undefined;
      if (!chain[prop]) {
        chain[prop] = jest.fn(() => self);
      }
      return chain[prop];
    },
  });
  return self as {
    select: jest.Mock;
    eq: jest.Mock;
    is: jest.Mock;
    order: jest.Mock;
    limit: jest.Mock;
    single: jest.Mock;
    maybeSingle: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    insert: jest.Mock;
  };
}

function mockAdmin(opts: {
  rx: RxRow;
  appointmentStatus: string | null;
  stampWrite?: { attested_at: string } | null;
  raceRead?: { attested_at: string } | null;
}) {
  const rxSelect = chainable({ data: opts.rx, error: null });
  rxSelect.single = jest.fn(async () => ({ data: opts.rx, error: null })) as never;
  rxSelect.maybeSingle = jest.fn(async () => ({
    data: opts.stampWrite ?? null,
    error: null,
  })) as never;

  const apptSelect = chainable({
    data: opts.appointmentStatus
      ? { id: APPOINTMENT_ID, status: opts.appointmentStatus, episode_id: null }
      : { id: APPOINTMENT_ID, episode_id: null, status: opts.appointmentStatus },
    error: null,
  });
  apptSelect.single = jest.fn(async () => ({
    data: opts.appointmentStatus
      ? { id: APPOINTMENT_ID, status: opts.appointmentStatus, episode_id: null }
      : null,
    error: opts.appointmentStatus ? null : { message: 'missing status' },
  })) as never;

  const updateChain = chainable({
    data: opts.stampWrite ?? null,
    error: null,
  });
  updateChain.maybeSingle = jest.fn(async () => ({
    data: opts.stampWrite ?? null,
    error: null,
  })) as never;
  updateChain.single = jest.fn(async () => ({
    data: opts.raceRead ?? opts.stampWrite ?? opts.rx,
    error: null,
  })) as never;

  const medDelete = chainable({ data: null, error: null });
  const medInsert = jest.fn(async () => ({ error: null }));
  const medSelect = chainable({ data: [], error: null });
  medSelect.order = jest.fn(async () => ({ data: [], error: null })) as never;

  const attSelect = chainable({ data: [], error: null });
  attSelect.eq = jest.fn(async () => ({ data: [], error: null })) as never;

  const from = jest.fn((table: string) => {
    if (table === 'prescriptions') {
      return {
        select: jest.fn(() => rxSelect),
        update: jest.fn(() => updateChain),
      };
    }
    if (table === 'appointments') {
      return {
        select: jest.fn(() => apptSelect),
      };
    }
    if (table === 'prescription_medicines') {
      return {
        delete: jest.fn(() => medDelete),
        insert: medInsert,
        select: jest.fn(() => medSelect),
      };
    }
    if (table === 'prescription_attachments') {
      return {
        select: jest.fn(() => attSelect),
      };
    }
    return {};
  });

  mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);
  return { from, updateChain };
}

describe('rxl-06 attest + write guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-10T06:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refuses a content write to an attested prescription with ConflictError 409', async () => {
    mockAdmin({
      rx: {
        id: RX_ID,
        doctor_id: DOCTOR_ID,
        appointment_id: APPOINTMENT_ID,
        attested_at: '2026-08-31T10:00:00.000Z',
      },
      appointmentStatus: 'confirmed',
    });

    await expect(
      updatePrescription(RX_ID, { cc: 'fever' }, CORR, DOCTOR_ID)
    ).rejects.toMatchObject({
      name: 'ConflictError',
      statusCode: 409,
      details: { reason: 'attested' },
    });
    expect(mockedAudit.logDataModification).not.toHaveBeenCalled();
  });

  it('allows a content write to a draft on an open appointment', async () => {
    mockAdmin({
      rx: {
        id: RX_ID,
        doctor_id: DOCTOR_ID,
        appointment_id: APPOINTMENT_ID,
        attested_at: null,
      },
      appointmentStatus: 'confirmed',
    });

    await updatePrescription(RX_ID, { cc: 'fever' }, CORR, DOCTOR_ID);

    expect(mockedAudit.logDataModification).toHaveBeenCalledWith(
      CORR,
      DOCTOR_ID,
      'update',
      'prescription',
      RX_ID,
      ['cc']
    );
    const metadataArg = mockedAudit.logDataModification.mock.calls[0];
    expect(JSON.stringify(metadataArg)).not.toContain('fever');
  });

  it('refuses a historical null-stamp row whose appointment is completed', async () => {
    mockAdmin({
      rx: {
        id: RX_ID,
        doctor_id: DOCTOR_ID,
        appointment_id: APPOINTMENT_ID,
        attested_at: null,
      },
      appointmentStatus: 'completed',
    });

    await expect(assertPrescriptionContentWritable(RX_ID, DOCTOR_ID, CORR)).rejects.toBeInstanceOf(
      ConflictError
    );
    await expect(assertPrescriptionContentWritable(RX_ID, DOCTOR_ID, CORR)).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'appointment_locked' },
    });
  });

  it('sets the stamp once; a second attest does not move it', async () => {
    const first = '2026-08-31T12:00:00.000Z';
    mockAdmin({
      rx: {
        id: RX_ID,
        doctor_id: DOCTOR_ID,
        appointment_id: APPOINTMENT_ID,
        attested_at: null,
      },
      appointmentStatus: 'confirmed',
      stampWrite: { attested_at: first },
    });

    const created = await attestPrescriptionIfUnset(RX_ID, DOCTOR_ID, CORR);
    expect(created).toEqual({ attestedAt: first, alreadyAttested: false });
    expect(mockedAudit.logDataModification).toHaveBeenCalledWith(
      CORR,
      DOCTOR_ID,
      'update',
      'prescription',
      RX_ID,
      ['attested_at']
    );

    mockAdmin({
      rx: {
        id: RX_ID,
        doctor_id: DOCTOR_ID,
        appointment_id: APPOINTMENT_ID,
        attested_at: first,
      },
      appointmentStatus: 'confirmed',
    });

    const again = await attestPrescriptionIfUnset(RX_ID, DOCTOR_ID, CORR);
    expect(again).toEqual({ attestedAt: first, alreadyAttested: true });
  });

  it('refuses an attachment upload on an attested prescription', async () => {
    mockAdmin({
      rx: {
        id: RX_ID,
        doctor_id: DOCTOR_ID,
        appointment_id: APPOINTMENT_ID,
        attested_at: '2026-08-31T10:00:00.000Z',
      },
      appointmentStatus: 'confirmed',
    });

    await expect(
      createUploadUrl(RX_ID, DOCTOR_ID, 'scan.jpg', 'image/jpeg', CORR)
    ).rejects.toMatchObject({
      name: 'ConflictError',
      statusCode: 409,
      details: { reason: 'attested' },
    });
  });

  it('allows a same-day attested write on a completed appointment (rxl-23)', async () => {
    mockAdmin({
      rx: {
        id: RX_ID,
        doctor_id: DOCTOR_ID,
        appointment_id: APPOINTMENT_ID,
        attested_at: '2026-09-10T04:45:00.000Z',
        issued_at: null,
        superseded_by_id: null,
      },
      appointmentStatus: 'completed',
    });

    await updatePrescription(RX_ID, { cc: 'fever' }, CORR, DOCTOR_ID);

    expect(mockedAudit.logDataModification).toHaveBeenCalledWith(
      CORR,
      DOCTOR_ID,
      'update',
      'prescription',
      RX_ID,
      ['cc']
    );
  });

  it('refuses a superseded row even when issued today (rxl-23)', async () => {
    mockAdmin({
      rx: {
        id: RX_ID,
        doctor_id: DOCTOR_ID,
        appointment_id: APPOINTMENT_ID,
        attested_at: '2026-09-10T04:45:00.000Z',
        issued_at: '2026-09-10T04:45:00.000Z',
        superseded_by_id: '22222222-2222-2222-2222-222222222222',
      },
      appointmentStatus: 'completed',
    });

    await expect(
      updatePrescription(RX_ID, { cc: 'fever' }, CORR, DOCTOR_ID)
    ).rejects.toMatchObject({
      name: 'ConflictError',
      statusCode: 409,
      details: { reason: 'superseded' },
    });
  });
});
