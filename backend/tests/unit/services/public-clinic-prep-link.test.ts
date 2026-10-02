import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const APPT = '44444444-4444-4444-8444-444444444444';
const DOCTOR = '11111111-1111-4111-8111-111111111111';
const CONV = '66666666-6666-4666-8666-666666666666';

const state: { status: string } = { status: 'confirmed' };

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = self;
  b.eq = self;
  b.maybeSingle = async () => {
    if (table === 'appointments') {
      return {
        data: {
          id: APPT,
          doctor_id: DOCTOR,
          status: state.status,
          appointment_date: '2030-01-15T10:00:00.000Z',
        },
        error: null,
      };
    }
    return { data: { slot_interval_minutes: 30 }, error: null };
  };
  return b;
}

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => builder(table),
  }),
}));

async function load() {
  jest.resetModules();
  process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
  process.env.CONSULTATION_TOKEN_SECRET = 'test-consultation-token-secret';
  const consult = await import('../../../src/utils/consultation-token');
  const booking = await import('../../../src/utils/booking-token');
  const service = await import('../../../src/services/public-clinic-prep-link-service');
  return { consult, booking, service };
}

describe('mintPrepPathForConsultationToken', () => {
  beforeEach(() => {
    state.status = 'confirmed';
  });

  it('returns a prep path and refuses a booking token', async () => {
    const { consult, booking, service } = await load();
    const token = consult.generateConsultationToken(APPT);
    const result = await service.mintPrepPathForConsultationToken(token, 'corr-share');
    expect(result.prepPath.startsWith('/book/prep?t=')).toBe(true);
    expect(result.prepPath).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain('/consult/join');
    expect(JSON.stringify(result)).not.toContain('/my-visit');

    await expect(
      service.mintPrepPathForConsultationToken(booking.generateBookingToken(CONV, DOCTOR), 'corr-book')
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses a cancelled visit', async () => {
    const { consult, service } = await load();
    state.status = 'cancelled';
    await expect(
      service.mintPrepPathForConsultationToken(consult.generateConsultationToken(APPT), 'corr-closed')
    ).rejects.toMatchObject({ statusCode: 410 });
  });
});

describe('show-up guards', () => {
  it('does not mint a prep token from the snapshot poll', () => {
    const src = readFileSync(resolve(__dirname, '../../../src/services/opd-snapshot-service.ts'), 'utf8');
    expect(src).not.toContain('mintHistoryFormToken');
    expect(src).not.toContain('buildHistoryFormPath');
  });

  it('does not expose desk orders on the public history or photo path', () => {
    const history = readFileSync(
      resolve(__dirname, '../../../src/services/public-clinic-history-service.ts'),
      'utf8'
    );
    const photos = readFileSync(
      resolve(__dirname, '../../../src/services/public-clinic-photo-service.ts'),
      'utf8'
    );
    for (const src of [history, photos]) {
      expect(src).not.toContain('listPendingLabAppointments');
      expect(src).not.toContain('visit_lab_order_fulfillments');
    }
  });
});
