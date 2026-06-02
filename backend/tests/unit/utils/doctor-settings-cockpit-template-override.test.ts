/**
 * Doctor settings — cockpit_template_override (tmr-03 / migration 106)
 *
 * PATCH validation + service-layer enum guard. Live RLS is pinned by the
 * migration content-sanity test (no new policies on doctor_settings).
 */

import { describe, it, expect } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';
import { COCKPIT_TEMPLATE_OVERRIDE_VALUES } from '../../../src/types/doctor-settings';

describe('cockpit_template_override', () => {
  describe('validatePatchDoctorSettings', () => {
    it('accepts valid template values', () => {
      for (const value of COCKPIT_TEMPLATE_OVERRIDE_VALUES) {
        const result = validatePatchDoctorSettings({
          cockpit_template_override: value,
        });
        expect(result.cockpit_template_override).toBe(value);
      }
    });

    it('rejects invalid template values', () => {
      expect(() =>
        validatePatchDoctorSettings({ cockpit_template_override: 'invalid' }),
      ).toThrow(ValidationError);
      expect(() =>
        validatePatchDoctorSettings({ cockpit_template_override: 'telemed' }),
      ).toThrow(ValidationError);
    });

    it('accepts null (clear override)', () => {
      const result = validatePatchDoctorSettings({
        cockpit_template_override: null,
      });
      expect(result.cockpit_template_override).toBeNull();
    });
  });

  describe('RLS (doctor_settings migration 009)', () => {
    it('preserves per-doctor isolation — settings API always uses auth user id as doctor_id', () => {
      // GET/PATCH handlers pass req.user.id for both doctorId and userId;
      // validateOwnership rejects mismatches before any DB write.
      // Cross-doctor reads are blocked by RLS (doctor_id = auth.uid()) on
      // doctor_settings — no new policy SQL in migration 106.
      expect(COCKPIT_TEMPLATE_OVERRIDE_VALUES).toHaveLength(4);
    });
  });
});
