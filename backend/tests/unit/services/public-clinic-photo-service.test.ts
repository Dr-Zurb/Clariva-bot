import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const APPT = '44444444-4444-4444-8444-444444444444';
const PATIENT = '77777777-7777-4777-8777-777777777777';
const DOCTOR = '11111111-1111-4111-8111-111111111111';
const CONV = '66666666-6666-4666-8666-666666666666';
const DOC = '88888888-8888-4888-8888-888888888888';

const state: {
  tables: string[];
  patientFiles: number;
  checkedIn: string | null;
  uploads: string[];
  removed: string[];
  deleted: boolean;
  documentSource: string;
} = {
  tables: [],
  patientFiles: 0,
  checkedIn: null,
  uploads: [],
  removed: [],
  deleted: false,
  documentSource: 'patient',
};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = self;
  b.eq = self;
  b.order = self;
  b.limit = self;
  b.insert = (payload: Record<string, unknown>) => {
    state.tables.push(`${table}:insert`);
    if (table === 'visit_documents' && payload.file_path) {
      throw new Error('path stored on the document row');
    }
    if (table === 'visit_document_pages' && typeof payload.file_path === 'string') {
      state.uploads.push(payload.file_path);
    }
    return b;
  };
  b.delete = () => {
    state.deleted = true;
    return b;
  };
  b.single = async () => ({ data: { id: DOC }, error: null });
  b.maybeSingle = async () => {
    if (table === 'appointments') {
      return {
        data: {
          id: APPT,
          doctor_id: DOCTOR,
          patient_id: PATIENT,
          status: 'confirmed',
          appointment_date: '2030-01-15T10:00:00.000Z',
          patient_checked_in_at: state.checkedIn,
        },
        error: null,
      };
    }
    if (table === 'doctor_settings') return { data: { slot_interval_minutes: 30 }, error: null };
    if (table === 'visit_documents') {
      return { data: { id: DOC, source: state.documentSource }, error: null };
    }
    return { data: { file_path: `${DOCTOR}/patient/${APPT}/page.jpg` }, error: null };
  };
  b.then = (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) => {
    const data =
      table === 'visit_documents'
        ? Array.from({ length: state.patientFiles }, (_, index) => ({
            id: `file-${index}`,
            document_type: 'other',
            source: 'patient',
          }))
        : table === 'visit_document_pages'
          ? [{ file_path: `${DOCTOR}/patient/${APPT}/page.jpg` }]
          : [];
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  };
  return b;
}

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      state.tables.push(table);
      return builder(table);
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          state.uploads.push(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          state.removed.push(...paths);
          return { error: null };
        },
        createSignedUrl: async () => ({ data: { signedUrl: 'https://files.example/signed' }, error: null }),
      }),
    },
  }),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn(async () => undefined),
}));

async function load() {
  jest.resetModules();
  process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
  const tokens = await import('../../../src/utils/history-form-token');
  const booking = await import('../../../src/utils/booking-token');
  const service = await import('../../../src/services/public-clinic-photo-service');
  return { tokens, booking, service };
}

function tokenFor(tokens: { mintHistoryFormToken: Function }) {
  return tokens.mintHistoryFormToken(
    { id: APPT, status: 'confirmed', scheduledEnd: new Date('2030-01-15T10:30:00.000Z') },
    new Date('2030-01-15T09:00:00.000Z')
  );
}

describe('patient photos', () => {
  beforeEach(() => {
    state.tables = [];
    state.patientFiles = 0;
    state.checkedIn = null;
    state.uploads = [];
    state.removed = [];
    state.deleted = false;
    state.documentSource = 'patient';
  });

  it('does not use the desk upload gate', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/services/public-clinic-photo-service.ts'),
      'utf8'
    );
    expect(src).not.toContain('loadWritableAppointment');
    expect(src).not.toContain('createVisitDocument');
    expect(src).not.toContain('/desk/');
  });

  it('stores a patient file under the patient prefix and refuses a sixth and a booking token', async () => {
    const { tokens, booking, service } = await load();
    const token = tokenFor(tokens);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
    const stored = await service.storePatientPhoto(
      { token, documentType: 'other', contentType: 'image/jpeg', bytes: jpeg },
      'corr-photo'
    );
    expect(stored.documentId).toBe(DOC);
    const path = state.uploads.find((item) => item.includes('/patient/'));
    expect(path).toContain(`${DOCTOR}/patient/${APPT}/`);
    expect(path).not.toContain('/desk/');
    expect(state.tables.join(' ')).not.toContain('patient_medications');

    state.patientFiles = 5;
    state.uploads = [];
    await expect(
      service.storePatientPhoto(
        { token, documentType: 'other', contentType: 'image/jpeg', bytes: jpeg },
        'corr-sixth'
      )
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.uploads.some((item) => item.includes('/patient/'))).toBe(false);

    await expect(
      service.storePatientPhoto(
        {
          token: booking.generateBookingToken(CONV, DOCTOR),
          documentType: 'other',
          contentType: 'image/jpeg',
          bytes: jpeg,
        },
        'corr-book'
      )
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('lists only a signed url and deletes before check-in', async () => {
    const { tokens, service } = await load();
    const token = tokenFor(tokens);
    state.patientFiles = 1;
    const listed = await service.listPatientPhotos(token, 'corr-list');
    expect(listed.photos[0]).toEqual({
      id: 'file-0',
      documentType: 'other',
      downloadUrl: 'https://files.example/signed',
    });
    expect(listed.canRemove).toBe(true);
    expect(JSON.stringify(listed)).not.toContain('file_path');
    expect(JSON.stringify(listed)).not.toContain('/desk/');

    await service.deletePatientPhoto(token, DOC, 'corr-del');
    expect(state.deleted).toBe(true);
    expect(state.removed[0]).toContain('/patient/');

    state.checkedIn = '2030-01-15T10:05:00.000Z';
    state.deleted = false;
    await expect(service.deletePatientPhoto(token, DOC, 'corr-locked')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(state.deleted).toBe(false);

    state.checkedIn = null;
    state.documentSource = 'front_desk';
    await expect(service.deletePatientPhoto(token, DOC, 'corr-desk')).rejects.toMatchObject({
      statusCode: 404,
    });

    state.checkedIn = '2030-01-15T10:05:00.000Z';
    state.deleted = false;
    await expect(service.deletePatientPhoto(token, DOC, 'corr-desk-open')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(state.deleted).toBe(false);
  });
});
