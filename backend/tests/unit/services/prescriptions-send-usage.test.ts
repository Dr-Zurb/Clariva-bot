/**
 * Prescription Send · doctor_drug_usage increment (rx-polish-favorites · rxf-03)
 *
 * Covers `incrementDoctorDrugUsageOnSend` and wiring from
 * `sendPrescriptionToPatient` / non-wiring from `updatePrescription`.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/config/email', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../../../src/services/instagram-service', () => ({
  sendInstagramMessage: jest.fn(),
  sendInstagramImage: jest.fn(),
  sendInstagramFile: jest.fn(),
}));
jest.mock('../../../src/services/instagram-connect-service', () => ({
  getInstagramAccessTokenForDoctor: jest.fn().mockResolvedValue(null as never),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn().mockResolvedValue({
    practice_name: 'Test Clinic',
    timezone: 'Asia/Kolkata',
  } as never),
}));
jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn().mockRejectedValue(new Error('pdf skipped in test') as never),
}));
jest.mock('../../../src/services/prescription-attachment-service', () => ({
  createAttachmentSignedUrlForDelivery: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
}));

import { incrementDoctorDrugUsageOnSend } from '../../../src/services/doctor-drug-usage-service';
import { sendPrescriptionToPatient } from '../../../src/services/notification-service';
import { updatePrescription } from '../../../src/services/prescription-service';
import * as database from '../../../src/config/database';
import * as emailConfig from '../../../src/config/email';
import * as usageService from '../../../src/services/doctor-drug-usage-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedEmail = emailConfig as jest.Mocked<typeof emailConfig>;

const correlationId = 'corr-rxf-03';
const doctorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const prescriptionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const appointmentId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const drugX = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const drugY = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const drugZ = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

function buildUsageRpcMock(initialRows: Array<{ drug_master_id: string; usage_count: number }>) {
  const rows = new Map(initialRows.map((r) => [r.drug_master_id, { ...r }]));
  const rpc = jest.fn(async (fn: string, args: { p_doctor_id: string; p_drug_master_ids: string[] }) => {
    if (fn !== 'increment_doctor_drug_usage_batch') {
      return { data: null, error: { message: 'unknown rpc' } };
    }
    for (const drugId of args.p_drug_master_ids) {
      const existing = rows.get(drugId);
      if (existing) {
        existing.usage_count += 1;
      } else {
        rows.set(drugId, { drug_master_id: drugId, usage_count: 1 });
      }
    }
    return { data: null, error: null };
  });
  return { rpc, rows };
}

interface SendSupabaseOpts {
  medicines: Array<{ medicine_name: string; drug_master_id?: string | null }>;
  patientEmail?: string | null;
}

function buildSendSupabaseMock(opts: SendSupabaseOpts) {
  const updateEq = jest.fn().mockResolvedValue({ error: null } as never);
  const update = jest.fn().mockReturnValue({ eq: updateEq });

  const from = jest.fn((table: string) => {
    if (table === 'prescriptions') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: prescriptionId,
            appointment_id: appointmentId,
            doctor_id: doctorId,
            type: 'structured',
          },
          error: null,
        } as never),
        update,
      };
    }
    if (table === 'appointments') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: appointmentId,
            patient_id: 'patient-1',
            doctor_id: doctorId,
            conversation_id: null,
          },
          error: null,
        } as never),
      };
    }
    if (table === 'prescription_medicines') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: opts.medicines, error: null } as never),
      };
    }
    if (table === 'prescription_attachments') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };
    }
    if (table === 'patients') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            email: opts.patientEmail ?? null,
            platform: null,
            platform_external_id: null,
          },
          error: null,
        } as never),
      };
    }
    if (table === 'conversations') {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null } as never),
        single: jest.fn().mockResolvedValue({ data: null, error: null } as never),
      };
      return chain;
    }
    return {};
  });

  return { from, update, updateEq };
}

describe('incrementDoctorDrugUsageOnSend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('increments existing row', async () => {
    const { rpc, rows } = buildUsageRpcMock([{ drug_master_id: drugX, usage_count: 5 }]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ rpc } as never);

    await incrementDoctorDrugUsageOnSend(doctorId, [drugX], correlationId);

    expect(rpc).toHaveBeenCalledWith('increment_doctor_drug_usage_batch', {
      p_doctor_id: doctorId,
      p_drug_master_ids: [drugX],
    });
    expect(rows.get(drugX)?.usage_count).toBe(6);
  });

  it('inserts new row', async () => {
    const { rpc, rows } = buildUsageRpcMock([]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ rpc } as never);

    await incrementDoctorDrugUsageOnSend(doctorId, [drugY], correlationId);

    expect(rows.get(drugY)).toEqual({ drug_master_id: drugY, usage_count: 1 });
  });

  it('ignores free-text drugs when caller passes only drug-master ids', async () => {
    const { rpc, rows } = buildUsageRpcMock([]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ rpc } as never);

    await incrementDoctorDrugUsageOnSend(doctorId, [drugX], correlationId);

    expect(rpc).toHaveBeenCalledWith(
      'increment_doctor_drug_usage_batch',
      expect.objectContaining({ p_drug_master_ids: [drugX] }),
    );
    expect(rows.size).toBe(1);
    expect(rows.has(drugX)).toBe(true);
  });

  it('batches per send — one rpc call for three unique drug-master ids', async () => {
    const { rpc } = buildUsageRpcMock([]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ rpc } as never);

    await incrementDoctorDrugUsageOnSend(doctorId, [drugX, drugY, drugZ], correlationId);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('increment_doctor_drug_usage_batch', {
      p_doctor_id: doctorId,
      p_drug_master_ids: [drugX, drugY, drugZ],
    });
  });

  it('no-op on zero-drug send', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue({ rpc: jest.fn() } as never);

    await incrementDoctorDrugUsageOnSend(doctorId, [], correlationId);

    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

describe('sendPrescriptionToPatient · usage increment wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEmail.sendEmail.mockResolvedValue(true);
  });

  it('calls increment after a successful email send with drug-master medicines', async () => {
    const incrementSpy = jest
      .spyOn(usageService, 'incrementDoctorDrugUsageOnSend')
      .mockResolvedValue(undefined);
    const mockSupabase = buildSendSupabaseMock({
      medicines: [
        { medicine_name: 'Paracetamol', drug_master_id: drugX },
        { medicine_name: 'Free text', drug_master_id: null },
      ],
      patientEmail: 'patient@example.com',
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await sendPrescriptionToPatient(prescriptionId, correlationId, doctorId);

    expect(result.sent).toBe(true);
    expect(incrementSpy).toHaveBeenCalledTimes(1);
    expect(incrementSpy).toHaveBeenCalledWith(doctorId, [drugX], correlationId);
    incrementSpy.mockRestore();
  });

  it('does not increment when send fails (no patient link)', async () => {
    const incrementSpy = jest
      .spyOn(usageService, 'incrementDoctorDrugUsageOnSend')
      .mockResolvedValue(undefined);
    const mockSupabase = buildSendSupabaseMock({
      medicines: [{ medicine_name: 'Paracetamol', drug_master_id: drugX }],
      patientEmail: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await sendPrescriptionToPatient(prescriptionId, correlationId, doctorId);

    expect(result.sent).toBe(false);
    expect(incrementSpy).not.toHaveBeenCalled();
    incrementSpy.mockRestore();
  });

  it('does not increment when medicines have no drug_master_id', async () => {
    const incrementSpy = jest
      .spyOn(usageService, 'incrementDoctorDrugUsageOnSend')
      .mockResolvedValue(undefined);
    const mockSupabase = buildSendSupabaseMock({
      medicines: [{ medicine_name: 'Custom compound', drug_master_id: null }],
      patientEmail: 'patient@example.com',
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    await sendPrescriptionToPatient(prescriptionId, correlationId, doctorId);

    expect(incrementSpy).not.toHaveBeenCalled();
    incrementSpy.mockRestore();
  });
});

describe('updatePrescription · draft save does NOT increment usage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not call incrementDoctorDrugUsageOnSend on PATCH medicines', async () => {
    const incrementSpy = jest.spyOn(usageService, 'incrementDoctorDrugUsageOnSend');
    const deleteEq = jest.fn().mockResolvedValue({ error: null } as never);
    const deleteChain = { eq: deleteEq };
    const insert = jest.fn().mockResolvedValue({ error: null } as never);
    const updateEq = jest.fn().mockResolvedValue({ error: null } as never);
    const update = jest.fn().mockReturnValue({ eq: updateEq });

    const prescriptionRow = {
      id: prescriptionId,
      doctor_id: doctorId,
      appointment_id: appointmentId,
    };

    const from = jest.fn((table: string) => {
      if (table === 'prescriptions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockImplementation(() => {
            return Promise.resolve({ data: prescriptionRow, error: null } as never);
          }),
          update,
        };
      }
      if (table === 'appointments') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: appointmentId, episode_id: null },
            error: null,
          } as never),
        };
      }
      if (table === 'prescription_medicines') {
        return {
          delete: jest.fn().mockReturnValue(deleteChain),
          insert,
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

    await updatePrescription(
      prescriptionId,
      {
        medicines: [
          {
            medicineName: 'Paracetamol',
            drugMasterId: drugX,
          },
        ],
      },
      correlationId,
      doctorId,
    );

    expect(incrementSpy).not.toHaveBeenCalled();
    incrementSpy.mockRestore();
  });
});
