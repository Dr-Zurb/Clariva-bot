/**
 * obj-22 — objective media attachment tag + delete (prescription-attachment-service).
 *
 * Covers the P5-D4 contract:
 *   - `createUploadUrl(..., 'objective')` routes the storage object into an `objective/`
 *     segment under the prescription folder (the tag); without it the legacy photo-Rx path
 *     shape is unchanged.
 *   - `deleteAttachment` removes the storage object + the DB row via the existing ownership
 *     check (reuses the shipped DELETE RLS policy — no widening).
 *
 * Mocks the admin client (same doctrine as snapshot-storage-service.test.ts): assert observable
 * behavior (the path handed to storage, the storage.remove call), not insert internals.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn(async () => undefined),
  logDataAccess: jest.fn(async () => undefined),
}));

import {
  createUploadUrl,
  deleteAttachment,
} from '../../../src/services/prescription-attachment-service';
import * as database from '../../../src/config/database';

const mockGetAdmin = database.getSupabaseAdminClient as unknown as jest.Mock;

const PRESCRIPTION_ID = 'rx-1';
const USER_ID = 'doc-1';
const ATTACHMENT_ID = 'att-1';
const OBJECTIVE_PATH = `${USER_ID}/${PRESCRIPTION_ID}/objective/uuid-wound.jpg`;

function makeAdmin() {
  const createSignedUploadUrl = jest.fn(async (path: string) => ({
    data: { path, token: 'upload-token' },
    error: null,
  }));
  const remove = jest.fn(async () => ({ data: [], error: null }));
  const storageFrom = jest.fn(() => ({ createSignedUploadUrl, remove }));

  const admin = {
    from: jest.fn((table: string) => {
      if (table === 'prescriptions') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: PRESCRIPTION_ID, doctor_id: USER_ID }, error: null }),
            }),
          }),
        };
      }
      // prescription_attachments
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: ATTACHMENT_ID, prescription_id: PRESCRIPTION_ID, file_path: OBJECTIVE_PATH },
                error: null,
              }),
            }),
          }),
        }),
        delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      };
    }),
    storage: { from: storageFrom },
  };

  return { admin, createSignedUploadUrl, remove };
}

beforeEach(() => {
  mockGetAdmin.mockReset();
});

describe('createUploadUrl objective tag (obj-22)', () => {
  it('routes objective media into an `objective/` path segment', async () => {
    const { admin, createSignedUploadUrl } = makeAdmin();
    mockGetAdmin.mockReturnValue(admin);

    await createUploadUrl(PRESCRIPTION_ID, USER_ID, 'wound.jpg', 'image/jpeg', 'corr-1', 'objective');

    const usedPath = createSignedUploadUrl.mock.calls[0]![0] as string;
    expect(usedPath).toContain(`${USER_ID}/${PRESCRIPTION_ID}/objective/`);
    expect(usedPath.endsWith('wound.jpg')).toBe(true);
  });

  it('leaves the legacy path shape unchanged when no category is given', async () => {
    const { admin, createSignedUploadUrl } = makeAdmin();
    mockGetAdmin.mockReturnValue(admin);

    await createUploadUrl(PRESCRIPTION_ID, USER_ID, 'rx.jpg', 'image/jpeg', 'corr-1');

    const usedPath = createSignedUploadUrl.mock.calls[0]![0] as string;
    expect(usedPath).not.toContain('/objective/');
    expect(usedPath.startsWith(`${USER_ID}/${PRESCRIPTION_ID}/`)).toBe(true);
  });
});

describe('createUploadUrl subjective per-complaint segment (sdp-02)', () => {
  it('pins subjective media into a `subjective/{complaintId}/` segment', async () => {
    const { admin, createSignedUploadUrl } = makeAdmin();
    mockGetAdmin.mockReturnValue(admin);

    await createUploadUrl(PRESCRIPTION_ID, USER_ID, 'rash.jpg', 'image/jpeg', 'corr-1', 'subjective', 'cmp-7');

    const usedPath = createSignedUploadUrl.mock.calls[0]![0] as string;
    expect(usedPath).toContain(`${USER_ID}/${PRESCRIPTION_ID}/subjective/cmp-7/`);
    expect(usedPath.endsWith('rash.jpg')).toBe(true);
  });

  it('sanitizes an unsafe complaintId down to a single safe folder segment', async () => {
    const { admin, createSignedUploadUrl } = makeAdmin();
    mockGetAdmin.mockReturnValue(admin);

    await createUploadUrl(PRESCRIPTION_ID, USER_ID, 'rash.jpg', 'image/jpeg', 'corr-1', 'subjective', '../../evil/id_$$');

    const usedPath = createSignedUploadUrl.mock.calls[0]![0] as string;
    // Slashes / dots / unsafe chars are stripped — no path traversal, exactly one folder level.
    expect(usedPath).toContain(`${USER_ID}/${PRESCRIPTION_ID}/subjective/evilid/`);
    expect(usedPath).not.toContain('..');
  });

  it('falls back to an `unpinned` folder when complaintId is empty/missing', async () => {
    const { admin, createSignedUploadUrl } = makeAdmin();
    mockGetAdmin.mockReturnValue(admin);

    await createUploadUrl(PRESCRIPTION_ID, USER_ID, 'rash.jpg', 'image/jpeg', 'corr-1', 'subjective', '');

    const usedPath = createSignedUploadUrl.mock.calls[0]![0] as string;
    expect(usedPath).toContain(`${USER_ID}/${PRESCRIPTION_ID}/subjective/unpinned/`);
  });

  it('does not touch the objective segment shape when subjective is used', async () => {
    const { admin, createSignedUploadUrl } = makeAdmin();
    mockGetAdmin.mockReturnValue(admin);

    await createUploadUrl(PRESCRIPTION_ID, USER_ID, 'rash.jpg', 'image/jpeg', 'corr-1', 'subjective', 'cmp-7');

    const usedPath = createSignedUploadUrl.mock.calls[0]![0] as string;
    expect(usedPath).not.toContain('/objective/');
  });
});

describe('deleteAttachment (obj-22)', () => {
  it('removes the storage object and deletes the row', async () => {
    const { admin, remove } = makeAdmin();
    mockGetAdmin.mockReturnValue(admin);
    const deleteSpy = jest.spyOn(admin, 'from');

    await deleteAttachment(PRESCRIPTION_ID, ATTACHMENT_ID, 'corr-1', USER_ID);

    expect(remove).toHaveBeenCalledWith([OBJECTIVE_PATH]);
    // Ownership check + attachment lookup + delete all go through `from`.
    expect(deleteSpy).toHaveBeenCalledWith('prescription_attachments');
  });
});
