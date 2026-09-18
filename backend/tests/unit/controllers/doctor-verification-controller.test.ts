/**
 * Doctor Verification Controller tests (doctor-verification-v1 · ver-03).
 *
 * Covers: doctor-scoped calls (service only ever sees req.user.id), 401 when
 * unauthenticated, and Zod validation rejection on a bad submit body.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/doctor-verification-service', () => ({
  VERIFICATION_ALLOWED_MIME: ['application/pdf', 'image/jpeg', 'image/png'],
  createVerificationUploadUrl: jest.fn(),
  submitVerification: jest.fn(),
  getVerificationStatus: jest.fn(),
}));

import {
  createUploadUrlHandler,
  getVerificationStatusHandler,
  submitVerificationHandler,
} from '../../../src/controllers/doctor-verification-controller';
import {
  createVerificationUploadUrl,
  getVerificationStatus,
  submitVerification,
} from '../../../src/services/doctor-verification-service';
import { UnauthorizedError } from '../../../src/utils/errors';

const mockedUploadUrl = createVerificationUploadUrl as jest.MockedFunction<
  typeof createVerificationUploadUrl
>;
const mockedSubmit = submitVerification as jest.MockedFunction<
  typeof submitVerification
>;
const mockedStatus = getVerificationStatus as jest.MockedFunction<
  typeof getVerificationStatus
>;

const DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function invoke(
  handler: typeof submitVerificationHandler,
  req: Request,
  res: Response,
): Promise<unknown> {
  let captured: unknown;
  await new Promise<void>((resolve) => {
    const next = (err?: unknown) => {
      if (err) captured = err;
      resolve();
    };
    void Promise.resolve(handler(req, res, next)).then(
      () => resolve(),
      (err: unknown) => {
        captured = err;
        resolve();
      },
    );
  });
  return captured;
}

function makeRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockedUploadUrl.mockResolvedValue({ path: `${DOCTOR_ID}/certificate.pdf`, token: 't' });
  mockedSubmit.mockResolvedValue({
    status: 'pending_review',
    submittedAt: '2026-07-22T00:00:00.000Z',
    reviewedAt: null,
    rejectReason: null,
  });
  mockedStatus.mockResolvedValue({
    status: 'unverified',
    submittedAt: null,
    reviewedAt: null,
    rejectReason: null,
  });
});

describe('getVerificationStatusHandler', () => {
  it('401 when unauthenticated', async () => {
    const err = await invoke(
      getVerificationStatusHandler,
      { correlationId: 'c' } as unknown as Request,
      makeRes(),
    );
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(mockedStatus).not.toHaveBeenCalled();
  });

  it('scopes to req.user.id', async () => {
    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'c',
    } as unknown as Request;
    const err = await invoke(getVerificationStatusHandler, req, makeRes());
    expect(err).toBeUndefined();
    expect(mockedStatus).toHaveBeenCalledWith(DOCTOR_ID, 'c');
  });
});

describe('submitVerificationHandler', () => {
  it('rejects an invalid body (missing registration number)', async () => {
    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'c',
      body: {
        fullName: 'Dr Jane',
        councilState: 'NMC',
        certificatePath: `${DOCTOR_ID}/certificate.pdf`,
      },
    } as unknown as Request;
    const err = await invoke(submitVerificationHandler, req, makeRes());
    expect(err).toBeDefined();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it('passes only req.user.id (ignores any body doctorId)', async () => {
    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'c',
      body: {
        doctorId: OTHER,
        fullName: 'Dr Jane',
        registrationNumber: 'REG1',
        councilState: 'NMC',
        certificatePath: `${DOCTOR_ID}/certificate.pdf`,
      },
    } as unknown as Request;
    const err = await invoke(submitVerificationHandler, req, makeRes());
    expect(err).toBeUndefined();
    expect(mockedSubmit).toHaveBeenCalledWith(
      DOCTOR_ID,
      expect.objectContaining({ registrationNumber: 'REG1' }),
      'c',
    );
  });
});

describe('createUploadUrlHandler', () => {
  it('rejects an invalid content type', async () => {
    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'c',
      body: { kind: 'certificate', contentType: 'image/gif' },
    } as unknown as Request;
    const err = await invoke(createUploadUrlHandler, req, makeRes());
    expect(err).toBeDefined();
    expect(mockedUploadUrl).not.toHaveBeenCalled();
  });

  it('mints for a valid request scoped to req.user.id', async () => {
    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'c',
      body: { kind: 'certificate', contentType: 'application/pdf' },
    } as unknown as Request;
    const err = await invoke(createUploadUrlHandler, req, makeRes());
    expect(err).toBeUndefined();
    expect(mockedUploadUrl).toHaveBeenCalledWith(
      DOCTOR_ID,
      'certificate',
      'application/pdf',
      'c',
    );
  });
});
