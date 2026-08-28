/**
 * Doctor Verification Service unit tests (doctor-verification-v1 · ver-02/03/04).
 *
 * Covers the security-load-bearing behavior:
 *   - upload URLs reject bad MIME + are minted under the doctor's own prefix,
 *   - submit rejects a document path outside the doctor's prefix (escalation
 *     guard) and always writes status='pending_review' clearing prior verdict,
 *   - status maps a missing row to 'unverified' without throwing,
 *   - approve/reject stamp audit fields and 404 on a missing row,
 *   - reject requires a reason.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  approveVerification,
  createVerificationUploadUrl,
  getVerificationStatus,
  isDoctorVerified,
  listVerifications,
  rejectVerification,
  requestChangesVerification,
  submitVerification,
  verificationDocPath,
} from '../../../src/services/doctor-verification-service';
import * as database from '../../../src/config/database';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../src/utils/errors';

jest.mock('../../../src/config/database');

const mockedDb = database as jest.Mocked<typeof database>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const correlationId = 'corr-verify';

interface TableResult {
  data: unknown;
  error: unknown;
}

/**
 * Chainable + thenable Supabase table builder. select/eq/upsert/update/order
 * return the builder; single/maybeSingle resolve `result`; awaiting the
 * builder (terminal `.order(...)`) resolves `result`. Captures write payloads.
 */
function makeAdmin(opts: {
  table?: TableResult;
  upload?: { data: unknown; error: unknown };
  signed?: { data: unknown; error: unknown };
}) {
  const captured: { upsert?: unknown; update?: unknown } = {};
  const result = opts.table ?? { data: null, error: null };

  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve(result)),
    upsert: jest.fn((payload: unknown) => {
      captured.upsert = payload;
      return builder;
    }),
    update: jest.fn((payload: unknown) => {
      captured.update = payload;
      return builder;
    }),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };

  const storageFrom = {
    createSignedUploadUrl: jest.fn(() =>
      Promise.resolve(opts.upload ?? { data: null, error: null }),
    ),
    createSignedUrl: jest.fn(() =>
      Promise.resolve(opts.signed ?? { data: null, error: null }),
    ),
  };

  const admin = {
    from: jest.fn(() => builder),
    storage: { from: jest.fn(() => storageFrom) },
  };

  mockedDb.getSupabaseAdminClient.mockReturnValue(
    admin as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
  );

  return { admin, builder, storageFrom, captured };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('verificationDocPath', () => {
  it('builds a doctor-prefixed key with a mime extension', () => {
    expect(verificationDocPath(doctorId, 'certificate', 'application/pdf')).toBe(
      `${doctorId}/certificate.pdf`,
    );
    expect(verificationDocPath(doctorId, 'gov_id', 'image/png')).toBe(
      `${doctorId}/gov-id.png`,
    );
  });

  it('throws ForbiddenError for a disallowed mime', () => {
    expect(() =>
      verificationDocPath(doctorId, 'certificate', 'image/gif'),
    ).toThrow(ForbiddenError);
  });
});

describe('createVerificationUploadUrl', () => {
  it('rejects a disallowed MIME type', async () => {
    makeAdmin({});
    await expect(
      createVerificationUploadUrl(doctorId, 'certificate', 'image/gif', correlationId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('mints a signed upload URL under the doctor prefix', async () => {
    const { storageFrom } = makeAdmin({
      upload: {
        data: { path: `${doctorId}/certificate.pdf`, token: 'tok-123' },
        error: null,
      },
    });
    const res = await createVerificationUploadUrl(
      doctorId,
      'certificate',
      'application/pdf',
      correlationId,
    );
    expect(res).toEqual({ path: `${doctorId}/certificate.pdf`, token: 'tok-123' });
    expect(storageFrom.createSignedUploadUrl).toHaveBeenCalledWith(
      `${doctorId}/certificate.pdf`,
      { upsert: true },
    );
  });
});

describe('submitVerification', () => {
  const validInput = {
    fullName: 'Dr Jane',
    registrationNumber: 'REG123',
    councilState: 'NMC',
    specialty: 'Dermatology',
    certificatePath: `${doctorId}/certificate.pdf`,
  };

  it('rejects a certificate path outside the doctor prefix (escalation guard)', async () => {
    makeAdmin({});
    await expect(
      submitVerification(
        doctorId,
        { ...validInput, certificatePath: 'someone-else/cert.pdf' },
        correlationId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a gov ID path outside the doctor prefix', async () => {
    makeAdmin({});
    await expect(
      submitVerification(
        doctorId,
        { ...validInput, govIdPath: 'attacker/id.png' },
        correlationId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('writes pending_review, clears prior verdict, returns the view', async () => {
    const { captured } = makeAdmin({
      table: {
        data: {
          status: 'pending_review',
          submitted_at: '2026-07-22T00:00:00.000Z',
          reviewed_at: null,
          reject_reason: null,
        },
        error: null,
      },
    });
    const view = await submitVerification(doctorId, validInput, correlationId);

    expect(view.status).toBe('pending_review');
    const payload = captured.upsert as Record<string, unknown>;
    expect(payload.doctor_id).toBe(doctorId);
    expect(payload.status).toBe('pending_review');
    expect(payload.reviewed_at).toBeNull();
    expect(payload.reviewed_by).toBeNull();
    expect(payload.reject_reason).toBeNull();
    expect(payload.submitted_at).toEqual(expect.any(String));
  });
});

describe('getVerificationStatus / isDoctorVerified', () => {
  it('missing row → unverified without throwing', async () => {
    makeAdmin({ table: { data: null, error: null } });
    const view = await getVerificationStatus(doctorId, correlationId);
    expect(view).toEqual({
      status: 'unverified',
      submittedAt: null,
      reviewedAt: null,
      rejectReason: null,
    });
  });

  it('maps an existing row', async () => {
    makeAdmin({
      table: {
        data: {
          status: 'rejected',
          submitted_at: '2026-07-22T00:00:00.000Z',
          reviewed_at: '2026-07-22T01:00:00.000Z',
          reject_reason: 'blurry cert',
        },
        error: null,
      },
    });
    const view = await getVerificationStatus(doctorId, correlationId);
    expect(view.status).toBe('rejected');
    expect(view.rejectReason).toBe('blurry cert');
  });

  it('isDoctorVerified true only for verified status', async () => {
    makeAdmin({ table: { data: { status: 'verified' }, error: null } });
    await expect(isDoctorVerified(doctorId, correlationId)).resolves.toBe(true);

    makeAdmin({ table: { data: { status: 'pending_review' }, error: null } });
    await expect(isDoctorVerified(doctorId, correlationId)).resolves.toBe(false);

    makeAdmin({ table: { data: { status: 'changes_requested' }, error: null } });
    await expect(isDoctorVerified(doctorId, correlationId)).resolves.toBe(false);

    makeAdmin({ table: { data: null, error: null } });
    await expect(isDoctorVerified(doctorId, correlationId)).resolves.toBe(false);
  });
});

describe('listVerifications', () => {
  it('maps rows to minimal list items', async () => {
    makeAdmin({
      table: {
        data: [
          {
            doctor_id: doctorId,
            status: 'pending_review',
            full_name: 'Dr Jane',
            registration_number: 'REG123',
            council_state: 'NMC',
            specialty: 'Derm',
            submitted_at: '2026-07-22T00:00:00.000Z',
          },
        ],
        error: null,
      },
    });
    const items = await listVerifications('pending_review', correlationId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      doctorId,
      status: 'pending_review',
      fullName: 'Dr Jane',
    });
  });
});

describe('approveVerification / rejectVerification', () => {
  it('approve stamps verified + clears reject reason', async () => {
    const { captured } = makeAdmin({
      table: { data: { doctor_id: doctorId }, error: null },
    });
    await approveVerification(doctorId, 'ops', correlationId);
    const payload = captured.update as Record<string, unknown>;
    expect(payload.status).toBe('verified');
    expect(payload.reviewed_by).toBe('ops');
    expect(payload.reviewed_at).toEqual(expect.any(String));
    expect(payload.reject_reason).toBeNull();
  });

  it('approve 404s when the row is missing', async () => {
    makeAdmin({ table: { data: null, error: null } });
    await expect(
      approveVerification(doctorId, 'ops', correlationId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reject requires a non-empty reason', async () => {
    makeAdmin({ table: { data: { doctor_id: doctorId }, error: null } });
    await expect(
      rejectVerification(doctorId, '   ', 'ops', correlationId),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('reject stamps rejected + reason', async () => {
    const { captured } = makeAdmin({
      table: { data: { doctor_id: doctorId }, error: null },
    });
    await rejectVerification(doctorId, 'blurry cert', 'ops', correlationId);
    const payload = captured.update as Record<string, unknown>;
    expect(payload.status).toBe('rejected');
    expect(payload.reject_reason).toBe('blurry cert');
  });

  it('reject 404s when the row is missing', async () => {
    makeAdmin({ table: { data: null, error: null } });
    await expect(
      rejectVerification(doctorId, 'reason', 'ops', correlationId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('requestChangesVerification', () => {
  it('requires a non-empty note', async () => {
    makeAdmin({ table: { data: { doctor_id: doctorId }, error: null } });
    await expect(
      requestChangesVerification(doctorId, '   ', 'ops', correlationId),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('stamps changes_requested + note + audit fields', async () => {
    const { captured } = makeAdmin({
      table: { data: { doctor_id: doctorId }, error: null },
    });
    await requestChangesVerification(
      doctorId,
      'please re-upload cert',
      'admin-1',
      correlationId,
    );
    const payload = captured.update as Record<string, unknown>;
    expect(payload.status).toBe('changes_requested');
    expect(payload.reject_reason).toBe('please re-upload cert');
    expect(payload.reviewed_by).toBe('admin-1');
    expect(payload.reviewed_at).toEqual(expect.any(String));
  });

  it('404s when the row is missing', async () => {
    makeAdmin({ table: { data: null, error: null } });
    await expect(
      requestChangesVerification(doctorId, 'note', 'ops', correlationId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
