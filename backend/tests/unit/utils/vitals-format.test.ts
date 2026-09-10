import { formatVitalsForOutput } from '../../../src/utils/vitals-format';

describe('formatVitalsForOutput', () => {
  it('returns null when nothing is recorded', () => {
    expect(formatVitalsForOutput({})).toBeNull();
    expect(formatVitalsForOutput(null)).toBeNull();
  });

  it('omits BP unless both systolic and diastolic are present', () => {
    expect(formatVitalsForOutput({ vitalsBpSystolic: 118 })).toBeNull();
    expect(formatVitalsForOutput({ vitalsHr: 92 })).toBe('HR 92');
  });

  it('joins present vitals and attaches BP posture/limb', () => {
    expect(
      formatVitalsForOutput({
        vitalsBpSystolic: 118,
        vitalsBpDiastolic: 76,
        vitalsBpPosture: 'sitting',
        vitalsBpLimb: 'left_arm',
        vitalsHr: 92,
        vitalsTempC: 38.2,
        vitalsSpo2: 98,
        vitalsWtKg: 58,
      }),
    ).toBe('BP 118/76 (sitting, L arm) · HR 92 · Temp 38.2 °C · SpO₂ 98% · Wt 58 kg');
  });

  it('appends the visit-level vitals note after the numbers', () => {
    expect(
      formatVitalsForOutput({
        vitalsHr: 88,
        note: 'sitting, post-walk',
      }),
    ).toBe('HR 88 — sitting, post-walk');
  });
});
