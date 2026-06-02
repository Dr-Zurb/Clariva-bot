/**
 * Public doctor mode-schedule endpoint (pdm-07)
 *
 * SKIP-GATED — enable with PUBLIC_MODE_SCHEDULE_INTEGRATION_TEST=1.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const INTEGRATION_ENABLED = process.env.PUBLIC_MODE_SCHEDULE_INTEGRATION_TEST === '1';
const d = INTEGRATION_ENABLED ? describe : describe.skip;

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const DOCTOR_ID = process.env.TEST_DOCTOR_ID ?? '';

async function get(path: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

d('GET /api/v1/public/doctors/:id/mode-schedule', () => {
  beforeAll(() => {
    if (!DOCTOR_ID) {
      throw new Error('TEST_DOCTOR_ID env var is required for mode-schedule integration tests');
    }
  });

  it('returns 400 when from/to missing', async () => {
    const { status } = await get(`/api/v1/public/doctors/${DOCTOR_ID}/mode-schedule`);
    expect(status).toBe(400);
  });

  it('returns 400 for 61-day range', async () => {
    const { status } = await get(
      `/api/v1/public/doctors/${DOCTOR_ID}/mode-schedule?from=2026-05-01&to=2026-07-01`
    );
    expect(status).toBe(400);
  });

  it('returns modeByDate map for valid range', async () => {
    const { status, json } = await get(
      `/api/v1/public/doctors/${DOCTOR_ID}/mode-schedule?from=2026-05-18&to=2026-05-24`
    );
    expect(status).toBe(200);
    expect(json).toHaveProperty('modeByDate');
    expect(typeof (json as { modeByDate: unknown }).modeByDate).toBe('object');
  });
});
