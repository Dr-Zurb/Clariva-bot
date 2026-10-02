import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const APPT = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const CONV = '66666666-6666-4666-8666-666666666666';
const DOC = '11111111-1111-4111-8111-111111111111';

async function load() {
  jest.resetModules();
  process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
  process.env.CONSULTATION_TOKEN_SECRET = 'test-consultation-token-secret';
  const history = await import('../../../src/utils/history-form-token');
  const booking = await import('../../../src/utils/booking-token');
  const join = await import('../../../src/utils/consultation-token');
  const errors = await import('../../../src/utils/errors');
  return { ...history, ...booking, ...join, ValidationError: errors.ValidationError };
}

describe('history-form token', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('resolves one appointment and puts no clinical text in the payload', async () => {
    const { mintHistoryFormToken, verifyHistoryFormToken } = await load();
    const end = new Date('2030-01-15T10:30:00.000Z');
    const now = new Date('2030-01-15T09:00:00.000Z');
    const visit = { id: APPT, status: 'confirmed', scheduledEnd: end };
    const token = mintHistoryFormToken(visit, now);
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    expect(Object.keys(payload).sort()).toEqual(['appointmentId', 'exp', 'kind']);
    expect(payload.kind).toBe('history-form');
    expect(payload.appointmentId).toBe(APPT);
    expect(payload.exp).toBe(Math.floor(end.getTime() / 1000) + 2 * 60 * 60);
    const verified = verifyHistoryFormToken(token, visit, now);
    expect(verified).toEqual({ ok: true, appointmentId: APPT });
  });

  it('rejects a booking token, a join token, and a tampered signature', async () => {
    const {
      verifyHistoryFormToken,
      historyFormDenyStatus,
      generateBookingToken,
      generateConsultationToken,
      mintHistoryFormToken,
    } = await load();
    const visit = { id: APPT, status: 'pending', scheduledEnd: new Date('2030-01-15T10:30:00.000Z') };
    const now = new Date('2030-01-15T09:00:00.000Z');

    const booking = verifyHistoryFormToken(generateBookingToken(CONV, DOC), visit, now);
    expect(booking.ok).toBe(false);
    if (!booking.ok) expect(historyFormDenyStatus(booking.reason)).toBe(401);

    const join = verifyHistoryFormToken(generateConsultationToken(APPT), visit, now);
    expect(join.ok).toBe(false);

    const token = mintHistoryFormToken(visit, now);
    const [body, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    const tampered = verifyHistoryFormToken(`${body}.${flipped}`, visit, now);
    expect(tampered).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects an expired token and a cancelled or no-show visit with 410', async () => {
    const { mintHistoryFormToken, verifyHistoryFormToken, historyFormDenyStatus } = await load();
    const end = new Date('2030-01-15T10:30:00.000Z');
    const minted = mintHistoryFormToken(
      { id: APPT, status: 'confirmed', scheduledEnd: end },
      new Date('2030-01-15T09:00:00.000Z')
    );
    const after = new Date(end.getTime() + 2 * 60 * 60 * 1000 + 1000);
    const expired = verifyHistoryFormToken(
      minted,
      { id: APPT, status: 'confirmed', scheduledEnd: end },
      after
    );
    expect(expired).toEqual({ ok: false, reason: 'expired' });
    if (!expired.ok) expect(historyFormDenyStatus(expired.reason)).toBe(410);

    const closed = verifyHistoryFormToken(
      minted,
      { id: APPT, status: 'cancelled', scheduledEnd: end },
      new Date('2030-01-15T09:00:00.000Z')
    );
    expect(closed).toEqual({ ok: false, reason: 'visit_closed' });
    if (!closed.ok) expect(historyFormDenyStatus(closed.reason)).toBe(410);

    const noShow = verifyHistoryFormToken(minted, {
      id: APPT,
      status: 'no_show',
      scheduledEnd: end,
    }, new Date('2030-01-15T09:00:00.000Z'));
    expect(noShow).toEqual({ ok: false, reason: 'visit_closed' });
  });

  it('does not mint for a cancelled visit and does not accept another appointment', async () => {
    const { mintHistoryFormToken, verifyHistoryFormToken, ValidationError } = await load();
    expect(() =>
      mintHistoryFormToken(
        { id: APPT, status: 'cancelled', scheduledEnd: new Date('2030-01-15T10:30:00.000Z') },
        new Date('2030-01-15T09:00:00.000Z')
      )
    ).toThrow(ValidationError);

    const token = mintHistoryFormToken(
      { id: APPT, status: 'confirmed', scheduledEnd: null },
      new Date('2030-01-15T09:00:00.000Z')
    );
    const other = verifyHistoryFormToken(
      token,
      { id: OTHER, status: 'confirmed', scheduledEnd: null },
      new Date('2030-01-15T09:30:00.000Z')
    );
    expect(other).toEqual({ ok: false, reason: 'wrong_appointment' });
  });
});
