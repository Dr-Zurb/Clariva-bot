/**
 * OPD ETA pure math (e-task-opd-03)
 */

import { describe, it, expect } from '@jest/globals';
import { buildQueueDayPreview, computeEtaMinutesFromRollingAverage } from '../../../src/services/opd/opd-eta';

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

describe('buildQueueDayPreview', () => {
  const windows = [
    { start: '2026-10-02T03:30:00.000Z', end: '2026-10-02T07:30:00.000Z' },
  ];

  it('puts token 1 at the start of the doctor window', () => {
    const preview = buildQueueDayPreview({
      windows,
      nextToken: 1,
      avgConsultationSeconds: 600,
      coldStartMinutes: 10,
    });
    expect(preview?.nextToken).toBe(1);
    expect(preview?.expectedAt).toBe('2026-10-02T03:30:00.000Z');
    expect(preview?.avgMinutes).toBe(10);
  });

  it('places a later token by the average visit length', () => {
    const preview = buildQueueDayPreview({
      windows,
      nextToken: 4,
      avgConsultationSeconds: 600,
      coldStartMinutes: 10,
    });
    expect(preview?.expectedAt).toBe('2026-10-02T04:00:00.000Z');
  });
});
