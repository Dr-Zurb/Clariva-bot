import { describe, expect, it } from '@jest/globals';
import { parseClinicStaffCliArgs } from '../../../src/utils/clinic-staff-cli';
import { ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';

describe('parseClinicStaffCliArgs', () => {
  it('parses a provision command', () => {
    const args = parseClinicStaffCliArgs([
      '--email',
      'Desk@Clinic.Test',
      '--doctor-id',
      DOCTOR_ID,
      '--display-name',
      'Front desk',
    ]);
    expect(args).toEqual({
      action: 'provision',
      email: 'desk@clinic.test',
      doctorId: DOCTOR_ID,
      displayName: 'Front desk',
    });
  });

  it('parses suspend / reactivate without a doctor id', () => {
    expect(parseClinicStaffCliArgs(['--suspend', '--email', 'a@b.co'])).toEqual({
      action: 'suspend',
      email: 'a@b.co',
    });
    expect(parseClinicStaffCliArgs(['--reactivate', '--email', 'a@b.co'])).toEqual({
      action: 'reactivate',
      email: 'a@b.co',
    });
  });

  it('rejects provision without a UUID doctor id', () => {
    expect(() =>
      parseClinicStaffCliArgs(['--email', 'a@b.co', '--doctor-id', 'not-a-uuid'])
    ).toThrow(ValidationError);
  });

  it('rejects a missing email', () => {
    expect(() => parseClinicStaffCliArgs(['--doctor-id', DOCTOR_ID])).toThrow(ValidationError);
  });
});
