/**
 * Overlapping PATCH delete+insert must not leave two copies of each medicine.
 * Autosave + Print/Send used to interleave and print the list twice.
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
import { updatePrescription } from '../../../src/services/prescription-service';

const mockedDb = database as jest.Mocked<typeof database>;

const RX_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DOCTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const APPOINTMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CORR = 'corr-med-replace-race';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mockOverlappingMedicineReplace(ops: string[]) {
  const prescriptionRow = {
    id: RX_ID,
    doctor_id: DOCTOR_ID,
    appointment_id: APPOINTMENT_ID,
    attested_at: null,
    issued_at: null,
    superseded_by_id: null,
  };

  const from = jest.fn((table: string) => {
    if (table === 'prescriptions') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: prescriptionRow, error: null } as never),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null } as never),
        }),
      };
    }
    if (table === 'appointments') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: APPOINTMENT_ID, episode_id: null, status: 'confirmed' },
          error: null,
        } as never),
      };
    }
    if (table === 'prescription_medicines') {
      return {
        delete: jest.fn().mockReturnValue({
          eq: jest.fn(async () => {
            ops.push('delete-start');
            await delay(30);
            ops.push('delete-end');
            return { error: null };
          }),
        }),
        insert: jest.fn(async () => {
          ops.push('insert');
          return { error: null };
        }),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };
    }
    if (table === 'prescription_attachments') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };
    }
    return {};
  });

  mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);
}

describe('updatePrescription · medicine replace race', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes overlapping medicine replaces so delete+insert cannot interleave', async () => {
    const ops: string[] = [];
    mockOverlappingMedicineReplace(ops);

    await Promise.all([
      updatePrescription(
        RX_ID,
        { medicines: [{ medicineName: 'Paracetamol', duration: '5 days' }] },
        CORR,
        DOCTOR_ID
      ),
      updatePrescription(
        RX_ID,
        { medicines: [{ medicineName: 'Paracetamol', duration: '10 days' }] },
        CORR,
        DOCTOR_ID
      ),
    ]);

    expect(ops).toEqual([
      'delete-start',
      'delete-end',
      'insert',
      'delete-start',
      'delete-end',
      'insert',
    ]);
  });
});
