/**
 * mca-01: Instagram prescription send is a generic ready-notice + share URL.
 * No PDF / image helpers, no medicine names in the IG body.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

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
  getInstagramAccessTokenForDoctor: jest.fn(),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn().mockResolvedValue({
    practice_name: 'Test Clinic',
    timezone: 'Asia/Kolkata',
  } as never),
}));
jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(),
}));
jest.mock('../../../src/services/prescription-pdf-cache', () => ({
  invalidatePrescriptionPdfCache: jest.fn(),
}));
jest.mock('../../../src/services/prescription-token-service', () => ({
  mintRxToken: jest.fn(() => 'rx-token'),
  buildShareUrl: jest.fn(
    (_base: string, id: string, token: string) => `https://app.test/r/${id}?t=${token}`
  ),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
}));
jest.mock('../../../src/services/doctor-drug-usage-service', () => ({
  incrementDoctorDrugUsageOnSend: jest.fn().mockResolvedValue(undefined as never),
}));

import { sendPrescriptionToPatient } from '../../../src/services/notification-service';
import * as database from '../../../src/config/database';
import * as emailConfig from '../../../src/config/email';
import * as instagramService from '../../../src/services/instagram-service';
import * as instagramConnectService from '../../../src/services/instagram-connect-service';
import * as pdfService from '../../../src/services/prescription-pdf-service';
import { env } from '../../../src/config/env';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedEmail = emailConfig as jest.Mocked<typeof emailConfig>;

const correlationId = 'corr-mca-01';
const doctorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const prescriptionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const appointmentId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const drugX = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function buildSendSupabaseMock() {
  const updateChain = {
    eq: jest.fn(() => updateChain),
    then: (resolve: (v: { error: null }) => unknown) =>
      Promise.resolve({ error: null }).then(resolve),
  };
  const update = jest.fn().mockReturnValue(updateChain);

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
            attested_at: null,
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
            conversation_id: 'conv-rx-1',
          },
          error: null,
        } as never),
      };
    }
    if (table === 'prescription_medicines') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [{ medicine_name: 'Amlodipine', drug_master_id: drugX }],
          error: null,
        } as never),
      };
    }
    if (table === 'patients') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            email: 'patient@example.com',
            platform: 'instagram',
            platform_external_id: 'ig-psid-1',
          },
          error: null,
        } as never),
      };
    }
    if (table === 'conversations') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null } as never),
        single: jest.fn().mockResolvedValue({ data: null, error: null } as never),
      };
    }
    if (table === 'messages') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { created_at: new Date().toISOString() },
          error: null,
        } as never),
      };
    }
    return {};
  });

  return { from, update };
}

describe('sendPrescriptionToPatient · IG link-only (mca-01)', () => {
  const originalBaseUrl = env.APP_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedEmail.sendEmail.mockResolvedValue(true);
    jest
      .mocked(instagramConnectService.getInstagramAccessTokenForDoctor)
      .mockResolvedValue('doctor-token' as never);
    env.APP_BASE_URL = 'https://app.test';
  });

  afterEach(() => {
    env.APP_BASE_URL = originalBaseUrl;
  });

  it('sends the prescription by email and does not message Instagram', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildSendSupabaseMock() as never);
    jest.mocked(pdfService.generatePrescriptionPdf).mockResolvedValue({
      storagePath: 'prescription-pdfs/doc/rx.pdf',
      signedUrl: 'https://storage.test/rx.pdf',
      generatedAt: new Date().toISOString(),
      byteCount: 12,
      cacheHit: false,
      bytes: Buffer.from('pdf'),
    } as never);

    const result = await sendPrescriptionToPatient(prescriptionId, correlationId, doctorId);

    expect(result.sent).toBe(true);
    expect(instagramService.sendInstagramImage).not.toHaveBeenCalled();
    expect(instagramService.sendInstagramFile).not.toHaveBeenCalled();
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
    expect(result.channels?.instagram).toBe(false);
    expect(result.channels?.email).toBe(true);
    expect(mockedEmail.sendEmail).toHaveBeenCalled();
    const emailBody = jest.mocked(mockedEmail.sendEmail).mock.calls[0]?.[2];
    expect(emailBody).toMatch(/Amlodipine/i);
    expect(emailBody).toContain('https://app.test/r/');
  });

  it('skips Instagram when the share URL cannot be minted; email still sends', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildSendSupabaseMock() as never);
    jest
      .mocked(pdfService.generatePrescriptionPdf)
      .mockRejectedValue(new Error('pdf skipped') as never);

    const result = await sendPrescriptionToPatient(prescriptionId, correlationId, doctorId);

    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
    expect(instagramService.sendInstagramImage).not.toHaveBeenCalled();
    expect(instagramService.sendInstagramFile).not.toHaveBeenCalled();
    expect(mockedEmail.sendEmail).toHaveBeenCalled();
    expect(result.channels?.instagram).toBe(false);
    expect(result.channels?.email).toBe(true);
  });
});
