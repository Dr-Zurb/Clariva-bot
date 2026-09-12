/**
 * lvc-15 — Phase 3 gate (backend half).
 * Last visit stays appointment-scoped (LVC-Q2). No new endpoint.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from '@jest/globals';

describe('lvc-15 Phase 3 gate', () => {
  it('getLastVisitSummary excludes the current appointment, not a sibling prescription id', () => {
    const src = readFileSync(
      join(__dirname, '../../src/services/prescription-service.ts'),
      'utf8'
    );
    const start = src.indexOf('export async function getLastVisitSummary');
    expect(start).toBeGreaterThan(-1);
    const slice = src.slice(start, start + 3500);
    expect(slice).toContain(".neq('appointment_id', beforeAppointmentId)");
    expect(slice).not.toContain('excludePrescriptionId');
    expect(slice).not.toContain('last-in-episode');
  });
});
