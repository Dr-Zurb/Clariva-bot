/**
 * OPD session overrun API smoke tests (pdm-09).
 *
 * SKIP-GATED — enable with `OPD_OVERRUN_INTEGRATION_TEST=1` + `TEST_DOCTOR_JWT`.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const INTEGRATION_ENABLED = process.env.OPD_OVERRUN_INTEGRATION_TEST === '1';
const d = INTEGRATION_ENABLED ? describe : describe.skip;

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const JWT = process.env.TEST_DOCTOR_JWT ?? '';

async function req(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${JWT}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

d('OPD session overrun API', () => {
  beforeAll(() => {
    if (!JWT) {
      throw new Error('TEST_DOCTOR_JWT is required for OPD overrun integration tests');
    }
  });

  it('GET /session/overrun requires date query param', async () => {
    const { status } = await req('GET', '/api/v1/opd/session/overrun');
    expect(status).toBe(400);
  });

  it('GET /session/overrun returns 200 with count and rows', async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const date = yesterday.toISOString().split('T')[0];
    const { status, json } = await req('GET', `/api/v1/opd/session/overrun?date=${date}`);
    expect(status).toBe(200);
    const data = (json as { data?: { count?: number; rows?: unknown[] } }).data;
    expect(typeof data?.count).toBe('number');
    expect(Array.isArray(data?.rows)).toBe(true);
  });
});
