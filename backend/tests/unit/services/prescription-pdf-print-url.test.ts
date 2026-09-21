/**
 * Doctor print URL: unsent Rx re-render; sent Rx remint the frozen file.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(async () => ({ timezone: 'Asia/Kolkata' })),
}));

jest.mock('../../../src/services/letterhead-service', () => ({
  resolveLetterhead: jest.fn(async () => ({
    clinicName: 'Clinic',
    qualifications: null,
    specialty: null,
    registrationNumber: null,
    clinicAddress: null,
    logo: null,
    header: null,
    footer: null,
    footerLine: null,
    hideHaloCredit: true,
    preset: 'classic',
    pageSize: 'a4',
    accentColor: '#111111',
    chromeColor: '#111111',
    patientColor: '#111111',
    preprintMarginTopMm: 0,
    preprintMarginBottomMm: 0,
    headerHeightMm: 20,
    footerHeightMm: 16,
    pageMarginTopMm: 12,
    pageMarginRightMm: 12,
    pageMarginBottomMm: 12,
    pageMarginLeftMm: 12,
    logoSize: 'md',
    patientIdentityPreset: 'standard',
    showPatientPhone: true,
    showPatientGuardian: true,
    showPatientMrn: true,
    showPatientAddress: true,
    background: null,
    backgroundPreset: 'none',
    backgroundOpacity: 1,
    headerFit: 'cover',
    footerFit: 'cover',
    backgroundFit: 'cover',
    headerTextSize: 'md',
    patientTextSize: 'md',
    bodyTextSize: 'md',
  })),
}));

jest.mock('@react-pdf/renderer', () => ({
  renderToBuffer: jest.fn(async () => Buffer.from('%PDF-stub%')),
  Document: () => null,
  Page: () => null,
  View: () => null,
  Text: () => null,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: jest.fn() },
}));

jest.mock('../../../src/templates/prescription-pdf/PrescriptionDocument', () => ({
  PrescriptionDocument: () => null,
}));

import { renderToBuffer } from '@react-pdf/renderer';
import * as database from '../../../src/config/database';
import { invalidatePrescriptionPdfCache } from '../../../src/services/prescription-pdf-cache';
import {
  getOrCreateSignedPdfUrl,
  getPrescriptionPdfBytes,
} from '../../../src/services/prescription-pdf-service';

const mockedRender = renderToBuffer as jest.MockedFunction<typeof renderToBuffer>;

const mockedDb = database as jest.Mocked<typeof database>;

const RX_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
const APT_ID = '33333333-3333-4333-8333-333333333333';
const STORED_URL = 'https://storage.example/old.pdf?sig=stale';
const FRESH_URL = 'https://storage.example/new.pdf?sig=fresh';

function mockAdmin(opts: {
  sentToPatientAt: string | null;
  signedUrl: string;
  downloadBytes?: Buffer | null;
}) {
  const upload = jest.fn(async () => ({ error: null }));
  const createSignedUrl = jest.fn(async () => ({
    data: { signedUrl: opts.signedUrl },
    error: null,
  }));
  const download = jest.fn(async () => {
    if (opts.downloadBytes === null) return { data: null, error: { message: 'missing' } };
    const bytes = opts.downloadBytes ?? Buffer.from('%PDF-stored%');
    return {
      data: {
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      },
      error: null,
    };
  });

  const rxRow = {
    id: RX_ID,
    appointment_id: APT_ID,
    doctor_id: DOCTOR_ID,
    created_at: '2026-08-25T00:00:00.000Z',
    sent_to_patient_at: opts.sentToPatientAt,
    cc: 'wrist pain',
    hopi: 'RA flare',
    provisional_diagnosis: 'RA',
    investigations_orders: 'CBC',
    follow_up: null,
    patient_education: null,
  };

  const from = jest.fn((table: string) => {
    if (table === 'prescriptions') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(async () => ({
          data: { doctor_id: DOCTOR_ID, sent_to_patient_at: opts.sentToPatientAt },
          error: null,
        })),
        single: jest.fn(async () => ({ data: rxRow, error: null })),
      };
    }
    if (table === 'prescription_medicines') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn(async () => ({ data: [], error: null })),
      };
    }
    if (table === 'appointments') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(async () => ({
          data: {
            id: APT_ID,
            doctor_id: DOCTOR_ID,
            patient_id: null,
            patient_name: 'Gurleen Kaur',
            patient_phone: '9000025008',
            appointment_date: '2026-08-25T00:00:00.000Z',
          },
          error: null,
        })),
      };
    }
    if (table === 'patient_vitals') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      };
    }
    return {};
  });

  return {
    client: {
      from,
      auth: {
        admin: {
          getUserById: jest.fn(async () => ({ data: { user: null }, error: null })),
        },
      },
      storage: { from: jest.fn().mockReturnValue({ upload, createSignedUrl, download }) },
    },
    upload,
    createSignedUrl,
    download,
  };
}

describe('getOrCreateSignedPdfUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidatePrescriptionPdfCache(RX_ID);
  });

  it('remints the stored file for a sent prescription and does not re-render', async () => {
    const adm = mockAdmin({
      sentToPatientAt: '2026-08-25T10:00:00.000Z',
      signedUrl: STORED_URL,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const result = await getOrCreateSignedPdfUrl(RX_ID, DOCTOR_ID, 'corr-print');

    expect(result.signedUrl).toBe(STORED_URL);
    expect(mockedRender).not.toHaveBeenCalled();
    expect(adm.upload).not.toHaveBeenCalled();
    expect(adm.createSignedUrl).toHaveBeenCalled();
  });

  it('re-renders an unsent prescription even when a stored PDF already exists', async () => {
    const adm = mockAdmin({ sentToPatientAt: null, signedUrl: FRESH_URL });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const result = await getOrCreateSignedPdfUrl(RX_ID, DOCTOR_ID, 'corr-print');

    expect(result.signedUrl).toBe(FRESH_URL);
    expect(mockedRender).toHaveBeenCalledTimes(1);
    expect(adm.upload).toHaveBeenCalled();
  });
});

describe('getPrescriptionPdfBytes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidatePrescriptionPdfCache(RX_ID);
  });

  it('returns rendered bytes without uploading or signing', async () => {
    const adm = mockAdmin({ sentToPatientAt: null, signedUrl: FRESH_URL });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    await expect(getPrescriptionPdfBytes(RX_ID, 'corr-bytes')).resolves.toEqual({
      bytes: Buffer.from('%PDF-stub%'),
      byteCount: Buffer.from('%PDF-stub%').length,
    });
    expect(adm.upload).not.toHaveBeenCalled();
    expect(adm.createSignedUrl).not.toHaveBeenCalled();
  });

  it('downloads the frozen file for a sent prescription', async () => {
    const stored = Buffer.from('%PDF-frozen%');
    const adm = mockAdmin({
      sentToPatientAt: '2026-08-25T10:00:00.000Z',
      signedUrl: STORED_URL,
      downloadBytes: stored,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const result = await getPrescriptionPdfBytes(RX_ID, 'corr-frozen');

    expect(result.bytes.equals(stored)).toBe(true);
    expect(mockedRender).not.toHaveBeenCalled();
    expect(adm.download).toHaveBeenCalled();
  });

  it('re-renders an unsent draft on each print so a newly saved medicine is not skipped', async () => {
    const adm = mockAdmin({ sentToPatientAt: null, signedUrl: FRESH_URL });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    await getPrescriptionPdfBytes(RX_ID, 'corr-1');
    await getPrescriptionPdfBytes(RX_ID, 'corr-2');

    expect(mockedRender).toHaveBeenCalledTimes(2);
  });

  it('serves cached bytes for a sent prescription without re-rendering', async () => {
    const stored = Buffer.from('%PDF-frozen%');
    const adm = mockAdmin({
      sentToPatientAt: '2026-08-25T10:00:00.000Z',
      signedUrl: STORED_URL,
      downloadBytes: stored,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    await getPrescriptionPdfBytes(RX_ID, 'corr-1');
    await getPrescriptionPdfBytes(RX_ID, 'corr-2');

    expect(adm.download).toHaveBeenCalledTimes(1);
    expect(mockedRender).not.toHaveBeenCalled();
  });
});
