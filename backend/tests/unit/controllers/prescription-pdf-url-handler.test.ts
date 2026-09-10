import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/prescription-service', () => ({
  getPrescriptionById: jest.fn(),
  createPrescription: jest.fn(),
  getLastPrescriptionInEpisode: jest.fn(),
  getLastSubjectiveForPatient: jest.fn(),
  listPrescriptionsByAppointment: jest.fn(),
  listPrescriptionsByPatient: jest.fn(),
  listRecentPrescriptionsByPatient: jest.fn(),
  updatePrescription: jest.fn(),
  attestPrescriptionIfUnset: jest.fn().mockResolvedValue({
    attestedAt: '2026-08-31T12:00:00.000Z',
    alreadyAttested: false,
  } as never),
}));

jest.mock('../../../src/services/prescription-attachment-service', () => ({
  createUploadUrl: jest.fn(),
  registerAttachment: jest.fn(),
  getAttachmentDownloadUrl: jest.fn(),
  deleteAttachment: jest.fn(),
}));

jest.mock('../../../src/services/notification-service', () => ({
  sendPrescriptionToPatient: jest.fn(),
}));

jest.mock('../../../src/services/prescription-pdf-service', () => ({
  forceRegeneratePrescriptionPdf: jest.fn(),
  getOrCreateSignedPdfUrl: jest.fn(),
  getPrescriptionPdfBytes: jest.fn(),
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorTimezone: jest.fn(async () => 'Asia/Kolkata'),
}));

jest.mock('../../../src/services/prescription-token-service', () => ({
  mintRxToken: jest.fn(),
  buildShareUrl: jest.fn(),
}));

import {
  getPrescriptionPdfHandler,
  getPrescriptionPdfUrlHandler,
} from '../../../src/controllers/prescription-controller';
import * as prescriptionService from '../../../src/services/prescription-service';
import * as pdfService from '../../../src/services/prescription-pdf-service';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../src/utils/errors';

const mockedGetById = prescriptionService.getPrescriptionById as jest.MockedFunction<
  typeof prescriptionService.getPrescriptionById
>;
const mockedGetOrCreate = pdfService.getOrCreateSignedPdfUrl as jest.MockedFunction<
  typeof pdfService.getOrCreateSignedPdfUrl
>;
const mockedGetBytes = pdfService.getPrescriptionPdfBytes as jest.MockedFunction<
  typeof pdfService.getPrescriptionPdfBytes
>;

const RX_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';

async function invoke(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => unknown,
  req: Request,
  res: Response,
): Promise<unknown> {
  let captured: unknown = undefined;
  const next = (err?: unknown): void => {
    captured = err;
  };
  await handler(req, res, next);
  await Promise.resolve();
  return captured;
}

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('getPrescriptionPdfUrlHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    const err = await invoke(
      getPrescriptionPdfUrlHandler,
      { user: undefined, params: { id: RX_ID }, correlationId: 'c' } as unknown as Request,
      mockRes(),
    );
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(mockedGetById).not.toHaveBeenCalled();
    expect(mockedGetOrCreate).not.toHaveBeenCalled();
  });

  it('rejects an invalid prescription id', async () => {
    const err = await invoke(
      getPrescriptionPdfUrlHandler,
      {
        user: { id: DOCTOR_ID },
        params: { id: 'not-a-uuid' },
        correlationId: 'c',
      } as unknown as Request,
      mockRes(),
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedGetById).not.toHaveBeenCalled();
  });

  it('returns a signed URL after ownership check', async () => {
    mockedGetById.mockResolvedValue({
      id: RX_ID,
      doctor_id: DOCTOR_ID,
    } as Awaited<ReturnType<typeof prescriptionService.getPrescriptionById>>);
    mockedGetOrCreate.mockResolvedValue({
      signedUrl: 'https://storage.example/rx.pdf?sig=1',
    });

    const res = mockRes();
    const err = await invoke(
      getPrescriptionPdfUrlHandler,
      {
        user: { id: DOCTOR_ID },
        params: { id: RX_ID },
        correlationId: 'corr-1',
      } as unknown as Request,
      res,
    );

    expect(err).toBeUndefined();
    expect(mockedGetById).toHaveBeenCalledWith(RX_ID, 'corr-1', DOCTOR_ID);
    expect(prescriptionService.attestPrescriptionIfUnset).not.toHaveBeenCalled();
    expect(mockedGetOrCreate).toHaveBeenCalledWith(RX_ID, DOCTOR_ID, 'corr-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { signedUrl: 'https://storage.example/rx.pdf?sig=1' },
      }),
    );
  });

  it('does not mint a URL when the doctor does not own the Rx', async () => {
    mockedGetById.mockRejectedValue(new NotFoundError('Prescription not found'));

    const err = await invoke(
      getPrescriptionPdfUrlHandler,
      {
        user: { id: DOCTOR_ID },
        params: { id: RX_ID },
        correlationId: 'c',
      } as unknown as Request,
      mockRes(),
    );

    expect(err).toBeInstanceOf(NotFoundError);
    expect(mockedGetOrCreate).not.toHaveBeenCalled();
  });
});

describe('getPrescriptionPdfHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    const err = await invoke(
      getPrescriptionPdfHandler,
      { user: undefined, params: { id: RX_ID }, correlationId: 'c' } as unknown as Request,
      mockRes(),
    );
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(mockedGetById).not.toHaveBeenCalled();
    expect(mockedGetBytes).not.toHaveBeenCalled();
  });

  it('rejects an invalid prescription id', async () => {
    const err = await invoke(
      getPrescriptionPdfHandler,
      {
        user: { id: DOCTOR_ID },
        params: { id: 'not-a-uuid' },
        correlationId: 'c',
      } as unknown as Request,
      mockRes(),
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedGetBytes).not.toHaveBeenCalled();
  });

  it('streams PDF bytes after ownership check', async () => {
    const bytes = Buffer.from('%PDF-bytes%');
    mockedGetById.mockResolvedValue({
      id: RX_ID,
      doctor_id: DOCTOR_ID,
      version: null,
      issued_at: null,
      attested_at: null,
      created_at: '2026-09-09T04:45:00.000Z',
    } as Awaited<ReturnType<typeof prescriptionService.getPrescriptionById>>);
    mockedGetBytes.mockResolvedValue({ bytes, byteCount: bytes.length });

    const res = mockRes();
    const err = await invoke(
      getPrescriptionPdfHandler,
      {
        user: { id: DOCTOR_ID },
        params: { id: RX_ID },
        correlationId: 'corr-1',
      } as unknown as Request,
      res,
    );

    expect(err).toBeUndefined();
    expect(mockedGetById).toHaveBeenCalledWith(RX_ID, 'corr-1', DOCTOR_ID);
    expect(prescriptionService.attestPrescriptionIfUnset).not.toHaveBeenCalled();
    expect(mockedGetBytes).toHaveBeenCalledWith(RX_ID, 'corr-1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="prescription-9sep2026.pdf"'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(bytes);
  });

  it('names Version 2 with the clinic-local date', async () => {
    const bytes = Buffer.from('%PDF-bytes%');
    mockedGetById.mockResolvedValue({
      id: RX_ID,
      doctor_id: DOCTOR_ID,
      version: 2,
      issued_at: '2026-09-09T13:10:00.000Z',
      attested_at: '2026-09-09T13:10:00.000Z',
      created_at: '2026-09-09T04:45:00.000Z',
    } as Awaited<ReturnType<typeof prescriptionService.getPrescriptionById>>);
    mockedGetBytes.mockResolvedValue({ bytes, byteCount: bytes.length });

    const res = mockRes();
    await invoke(
      getPrescriptionPdfHandler,
      {
        user: { id: DOCTOR_ID },
        params: { id: RX_ID },
        correlationId: 'corr-1',
      } as unknown as Request,
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="prescription-9sep2026-v2.pdf"'
    );
  });

  it('does not fabricate v1 on an unversioned historical row', async () => {
    const bytes = Buffer.from('%PDF-bytes%');
    mockedGetById.mockResolvedValue({
      id: RX_ID,
      doctor_id: DOCTOR_ID,
      version: null,
      issued_at: null,
      attested_at: '2026-09-09T04:45:00.000Z',
      created_at: '2026-09-09T04:00:00.000Z',
    } as Awaited<ReturnType<typeof prescriptionService.getPrescriptionById>>);
    mockedGetBytes.mockResolvedValue({ bytes, byteCount: bytes.length });

    const res = mockRes();
    await invoke(
      getPrescriptionPdfHandler,
      {
        user: { id: DOCTOR_ID },
        params: { id: RX_ID },
        correlationId: 'corr-1',
      } as unknown as Request,
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="prescription-9sep2026.pdf"'
    );
  });

  it('does not stream bytes when the doctor does not own the Rx', async () => {
    mockedGetById.mockRejectedValue(new NotFoundError('Prescription not found'));

    const err = await invoke(
      getPrescriptionPdfHandler,
      {
        user: { id: DOCTOR_ID },
        params: { id: RX_ID },
        correlationId: 'c',
      } as unknown as Request,
      mockRes(),
    );

    expect(err).toBeInstanceOf(NotFoundError);
    expect(mockedGetBytes).not.toHaveBeenCalled();
  });
});
