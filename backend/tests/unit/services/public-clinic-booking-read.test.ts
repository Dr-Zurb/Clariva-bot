import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, jest } from '@jest/globals';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';
import {
  validateDaySlotsQuery,
  validatePublicClinicDaySlotsQuery,
  validatePublicClinicPageQuery,
  validateSlotPageInfoQuery,
} from '../../../src/utils/validation';
import {
  buildPublicClinicPageInfo,
  doctorIdFromPublicSlugRow,
  resolveDoctorIdByPublicSlug,
} from '../../../src/services/public-clinic-booking-service';

const mockEq = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => mockEq(...args),
      }),
    }),
  }),
}));

const DOCTOR_A = '11111111-1111-4111-8111-111111111111';
const DOCTOR_B = '22222222-2222-4222-8222-222222222222';

describe('public clinic slug read', () => {
  it('returns only the doctor whose slug matched', () => {
    expect(
      doctorIdFromPublicSlugRow('city-clinic', {
        doctor_id: DOCTOR_A,
        public_slug: 'city-clinic',
      })
    ).toBe(DOCTOR_A);
  });

  it('does not return another practice when the slug is unknown or mismatched', () => {
    expect(() => doctorIdFromPublicSlugRow('missing-clinic', null)).toThrow(NotFoundError);
    expect(() =>
      doctorIdFromPublicSlugRow('city-clinic', {
        doctor_id: DOCTOR_B,
        public_slug: 'other-clinic',
      })
    ).toThrow(NotFoundError);
  });

  it('queries the requested slug and returns that doctor only', async () => {
    mockEq.mockImplementation((column: unknown, value: unknown) => ({
      maybeSingle: async () => {
        if (column === 'public_slug' && value === 'city-clinic') {
          return {
            data: { doctor_id: DOCTOR_A, public_slug: 'city-clinic' },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    }));

    await expect(resolveDoctorIdByPublicSlug('city-clinic', 'corr')).resolves.toBe(DOCTOR_A);
    await expect(resolveDoctorIdByPublicSlug('other-clinic', 'corr')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(mockEq).toHaveBeenCalledWith('public_slug', 'other-clinic');
  });

  it('builds a book header with no conversation or patient fields', () => {
    const page = buildPublicClinicPageInfo({
      doctorId: DOCTOR_A,
      settings: {
        practice_name: 'City Clinic',
        timezone: 'Asia/Kolkata',
        opd_mode: 'slot',
      } as never,
      opdMode: 'slot',
      doctorVerified: false,
    });

    expect(page.doctorId).toBe(DOCTOR_A);
    expect(page.practiceName).toBe('City Clinic');
    expect(page.mode).toBe('book');
    expect(page.bookingAllowed).toBe(false);
    expect(page.bookingBlockedReason).toBe('doctor_not_verified');
    expect(page).not.toHaveProperty('conversationId');
    expect(page).not.toHaveProperty('patientId');
    expect(page).not.toHaveProperty('clinicAddress');
    expect(page).not.toHaveProperty('specialty');
    expect(JSON.stringify(page)).not.toContain(DOCTOR_B);
  });

  it('includes the work address as the clinic address', () => {
    const page = buildPublicClinicPageInfo({
      doctorId: DOCTOR_A,
      settings: {
        practice_name: 'City Clinic',
        timezone: 'Asia/Kolkata',
        opd_mode: 'slot',
        address_summary: '  12 Market Road  ',
        specialty: '  General physician  ',
      } as never,
      opdMode: 'slot',
      doctorVerified: true,
    });

    expect(page.clinicAddress).toBe('12 Market Road');
    expect(page.specialty).toBe('General physician');
    expect(page.bookingAllowed).toBe(true);
  });

  it('keeps token booking queries token-only', () => {
    expect(() => validateDaySlotsQuery({ date: '2026-09-23' })).toThrow(ValidationError);
    expect(() => validateSlotPageInfoQuery({})).toThrow(ValidationError);
    expect(validatePublicClinicPageQuery({ slug: 'City-Clinic' }).slug).toBe('city-clinic');
    expect(() => validatePublicClinicDaySlotsQuery({ slug: 'city-clinic' })).toThrow(
      ValidationError
    );

    const routes = readFileSync(
      join(__dirname, '../../../src/routes/api/v1/bookings.ts'),
      'utf8'
    );
    expect(routes).toContain("router.get('/day-slots', getDaySlotsHandler)");
    expect(routes).toContain("router.get('/slot-page-info', getSlotPageInfoHandler)");
    expect(routes).toContain(
      "router.get('/public/page-info', publicSessionLimiter, getPublicClinicPageInfoHandler)"
    );
    expect(routes).toContain(
      "router.get('/public/day-slots', publicSessionLimiter, getPublicClinicDaySlotsHandler)"
    );
    expect(routes).toContain(
      "router.get('/public/chat-visits', publicSessionLimiter, getPublicChatVisitsHandler)"
    );
  });
});
