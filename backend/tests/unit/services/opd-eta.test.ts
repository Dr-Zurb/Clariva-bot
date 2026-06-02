/**
 * OPD ETA pure math (e-task-opd-03)
 */

import { describe, it, expect } from '@jest/globals';
import { computeEtaMinutesFromRollingAverage } from '../../../src/services/opd/opd-eta';

describe('computeEtaMinutesFromRollingAverage', () => {
  it('uses cold-start minutes when no telemetry', () => {
    const r = computeEtaMinutesFromRollingAverage(3, null, 10);
    expect(r.avgMinutesUsed).toBe(10);
    expect(r.etaMinutes).toBe(30);
  });

  it('uses rolling average seconds when present', () => {
    const r = computeEtaMinutesFromRollingAverage(2, 600, 10);
    expect(r.avgMinutesUsed).toBe(10);
    expect(r.etaMinutes).toBe(20);
  });

  it('treats zero ahead as zero ETA', () => {
    const r = computeEtaMinutesFromRollingAverage(0, 300, 10);
    expect(r.etaMinutes).toBe(0);
  });
});
