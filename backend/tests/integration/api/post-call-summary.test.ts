/**
 * Post-call summary API — route-level integration smoke (voice B5 / video D1).
 *
 * **SKIP-GATED.** Requires a running backend, a doctor JWT, and a
 * consultation session id the doctor owns. Enable with
 * `POST_CALL_SUMMARY_INTEGRATION_TEST=1`.
 */

import { describe, it, expect } from '@jest/globals';

const INTEGRATION_ENABLED = process.env.POST_CALL_SUMMARY_INTEGRATION_TEST === '1';
const d = INTEGRATION_ENABLED ? describe : describe.skip;

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const JWT_DOCTOR = process.env.TEST_DOCTOR_JWT ?? '';
const SESSION_ID = process.env.TEST_CONSULTATION_SESSION_ID ?? '';

async function getSummary(
  sessionId: string,
  jwt: string,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(
    `${BASE_URL}/api/v1/consultation/${encodeURIComponent(sessionId)}/post-call-summary`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${jwt}` },
    },
  );
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

d('GET /api/v1/consultation/:sessionId/post-call-summary', () => {
  it('returns 200 + summary envelope for session participant', async () => {
    expect(JWT_DOCTOR).toBeTruthy();
    expect(SESSION_ID).toBeTruthy();

    const { status, json } = await getSummary(SESSION_ID, JWT_DOCTOR);
    expect(status).toBe(200);
    const body = json as { success?: boolean; data?: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data?.sessionId).toBe(SESSION_ID);
    expect(body.data).toHaveProperty('duration');
    expect(body.data).toHaveProperty('recording');
    expect(body.data).toHaveProperty('attachmentsCount');
    expect(body.data).toHaveProperty('prescriptionSent');
    expect(body.data).toHaveProperty('counterparty');
  });

  it('returns 401 without Authorization', async () => {
    expect(SESSION_ID).toBeTruthy();
    const res = await fetch(
      `${BASE_URL}/api/v1/consultation/${encodeURIComponent(SESSION_ID)}/post-call-summary`,
    );
    expect(res.status).toBe(401);
  });
});
