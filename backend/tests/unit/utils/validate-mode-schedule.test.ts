/**
 * validateModeSchedule (pdm-07 / DL-9)
 */

import { describe, it, expect } from '@jest/globals';
import { validateModeSchedule } from '../../../src/utils/validation';

describe('validateModeSchedule', () => {
  it('empty object → ok', () => {
    expect(validateModeSchedule({})).toEqual({ ok: true, value: {} });
  });

  it('null/undefined → ok empty', () => {
    expect(validateModeSchedule(null)).toEqual({ ok: true, value: {} });
    expect(validateModeSchedule(undefined)).toEqual({ ok: true, value: {} });
  });

  it('default_mode invalid → error', () => {
    const r = validateModeSchedule({ default_mode: 'invalid' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('default_mode');
  });

  it('date_range_overrides missing to → DL-9 error', () => {
    const r = validateModeSchedule({
      date_range_overrides: [{ from: '2026-05-01', mode: 'slot' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('DL-9');
  });

  it('date_range_overrides from > to → error', () => {
    const r = validateModeSchedule({
      date_range_overrides: [{ from: '2026-05-20', to: '2026-05-01', mode: 'slot' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('from > .to');
  });

  it('date_overrides invalid date format → error', () => {
    const r = validateModeSchedule({
      date_overrides: [{ date: '05-01-2026', mode: 'queue' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('YYYY-MM-DD');
  });

  it('past-dated date_override → ok (PD-Q8)', () => {
    const r = validateModeSchedule({
      date_overrides: [{ date: '2020-01-01', mode: 'queue' }],
    });
    expect(r).toEqual({
      ok: true,
      value: { date_overrides: [{ date: '2020-01-01', mode: 'queue' }] },
    });
  });
});
