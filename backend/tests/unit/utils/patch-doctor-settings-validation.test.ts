/**
 * Patch Doctor Settings Validation Tests (e-task-6)
 *
 * Tests validatePatchDoctorSettings: payout_schedule, payout_minor.
 */

import { describe, it, expect } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

describe('validatePatchDoctorSettings (e-task-6)', () => {
  it('accepts payout_schedule and payout_minor', () => {
    const result = validatePatchDoctorSettings({
      payout_schedule: 'daily',
      payout_minor: 10000,
    });
    expect(result.payout_schedule).toBe('daily');
    expect(result.payout_minor).toBe(10000);
  });

  it('accepts valid payout_schedule values', () => {
    for (const schedule of ['per_appointment', 'daily', 'weekly', 'monthly']) {
      const result = validatePatchDoctorSettings({ payout_schedule: schedule });
      expect(result.payout_schedule).toBe(schedule);
    }
  });

  it('accepts null payout_minor', () => {
    const result = validatePatchDoctorSettings({ payout_minor: null });
    expect(result.payout_minor).toBeNull();
  });

  it('rejects invalid payout_schedule', () => {
    expect(() =>
      validatePatchDoctorSettings({ payout_schedule: 'invalid' })
    ).toThrow(ValidationError);
    expect(() =>
      validatePatchDoctorSettings({ payout_schedule: 'yearly' })
    ).toThrow(ValidationError);
  });

  it('rejects negative payout_minor', () => {
    expect(() =>
      validatePatchDoctorSettings({ payout_minor: -1 })
    ).toThrow(ValidationError);
  });

  it('rejects unknown keys (strict)', () => {
    expect(() =>
      validatePatchDoctorSettings({ payout_schedule: 'daily', unknownKey: 'x' })
    ).toThrow(ValidationError);
  });

  it('accepts opd_mode and opd_policies (e-task-opd-02)', () => {
    const result = validatePatchDoctorSettings({
      opd_mode: 'queue',
      opd_policies: { slot_join_grace_minutes: 5 },
    });
    expect(result.opd_mode).toBe('queue');
    expect(result.opd_policies).toEqual({ slot_join_grace_minutes: 5 });
  });

  it('accepts null opd_policies', () => {
    const result = validatePatchDoctorSettings({ opd_policies: null });
    expect(result.opd_policies).toBeNull();
  });

  it('accepts instagram_receptionist_paused and pause message (RBH-09)', () => {
    const result = validatePatchDoctorSettings({
      instagram_receptionist_paused: true,
      instagram_receptionist_pause_message: 'We will reply soon.',
    });
    expect(result.instagram_receptionist_paused).toBe(true);
    expect(result.instagram_receptionist_pause_message).toBe('We will reply soon.');
  });

  it('rejects pause message over 500 chars', () => {
    expect(() =>
      validatePatchDoctorSettings({
        instagram_receptionist_pause_message: 'x'.repeat(501),
      })
    ).toThrow(ValidationError);
  });

  it('rejects invalid opd_mode', () => {
    expect(() =>
      validatePatchDoctorSettings({ opd_mode: 'hybrid' as 'slot' })
    ).toThrow(ValidationError);
  });

  it('accepts service_offerings_json null (SFU-01)', () => {
    const result = validatePatchDoctorSettings({ service_offerings_json: null });
    expect(result.service_offerings_json).toBeNull();
  });

  it('accepts valid service_offerings_json (SFU-01 + ARM-01 catch-all)', () => {
    const result = validatePatchDoctorSettings({
      service_offerings_json: {
        version: 1,
        services: [
          {
            service_key: 'follow',
            label: 'Follow-up',
            modalities: { video: { enabled: true, price_minor: 50000 } },
          },
          {
            service_key: 'other',
            label: 'Other / not listed',
            modalities: { video: { enabled: true, price_minor: 50000 } },
          },
        ],
      },
    });
    expect(result.service_offerings_json?.version).toBe(1);
    expect(result.service_offerings_json?.services).toHaveLength(2);
  });

  it('rejects service_offerings_json without catch-all other (ARM-01)', () => {
    expect(() =>
      validatePatchDoctorSettings({
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_key: 'follow',
              label: 'Follow-up',
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      })
    ).toThrow(ValidationError);
  });

  it('rejects invalid service_offerings_json (SFU-01)', () => {
    expect(() =>
      validatePatchDoctorSettings({
        service_offerings_json: { version: 1, services: [] },
      })
    ).toThrow(ValidationError);
  });

  it('accepts service_catalog_templates_json (SFU-14)', () => {
    const result = validatePatchDoctorSettings({
      service_catalog_templates_json: {
        templates: [
          {
            id: 'b1000000-0000-4000-8000-000000000002',
            name: 'My pack',
            updated_at: '2026-01-01T00:00:00.000Z',
            catalog: {
              version: 1,
              services: [
                {
                  service_id: 'a1000000-0000-4000-8000-000000000001',
                  service_key: 'x',
                  label: 'X',
                  modalities: { video: { enabled: true, price_minor: 100 } },
                },
              ],
            },
          },
        ],
      },
    });
    expect(result.service_catalog_templates_json?.templates).toHaveLength(1);
  });

  it('rejects duplicate user template ids (SFU-14)', () => {
    const tid = 'b1000000-0000-4000-8000-000000000002';
    expect(() =>
      validatePatchDoctorSettings({
        service_catalog_templates_json: {
          templates: [
            {
              id: tid,
              name: 'A',
              updated_at: '2026-01-01T00:00:00.000Z',
              catalog: {
                version: 1,
                services: [
                  {
                    service_id: 'a1000000-0000-4000-8000-000000000001',
                    service_key: 'a',
                    label: 'A',
                    modalities: { video: { enabled: true, price_minor: 100 } },
                  },
                ],
              },
            },
            {
              id: tid,
              name: 'B',
              updated_at: '2026-01-01T00:00:00.000Z',
              catalog: {
                version: 1,
                services: [
                  {
                    service_id: 'a2000000-0000-4000-8000-000000000003',
                    service_key: 'b',
                    label: 'B',
                    modalities: { video: { enabled: true, price_minor: 100 } },
                  },
                ],
              },
            },
          ],
        },
      })
    ).toThrow(ValidationError);
  });
});
