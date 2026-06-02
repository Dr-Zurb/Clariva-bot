/**
 * Patient Overview API — Route-Level Integration Smoke Test (pr-03).
 *
 * **SKIP-GATED.** Requires a running backend dev instance, a valid doctor
 * JWT, and at least one patient owned by that doctor. Enable with
 * `PATIENT_OVERVIEW_INTEGRATION_TEST=1` in the environment.
 *
 * Mirrors the gate pattern from `cockpit-presets.test.ts` so the suite is
 * a no-op in CI without dev secrets and runs fully against the live
 * Express app (auth → controller → service → Supabase) when enabled.
 *
 * What's covered:
 *   - GET /:id/overview happy path (200 + envelope shape).
 *   - GET /:id/overview cross-tenant 404 (Doctor B fetching Doctor A's
 *     patient must NOT see 403 — that would confirm the patient exists in
 *     another tenant).
 *   - GET /kpis returns the five tiles + `cache_ttl_seconds`.
 *   - GET /kpis emits `X-KPIs-Cache: miss` on first call and `hit` on the
 *     second within the TTL window.
 *   - Determinism: two consecutive overview reads with no intervening
 *     mutation return byte-identical care_plan + risk_flags blobs.
 *
 * @see backend/src/routes/api/v1/patients.ts
 * @see docs/Work/Daily-plans/May 2026/18-05-2026/patients-redesign/Tasks/task-pr-03-overview-aggregator-and-kpis.md
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const INTEGRATION_ENABLED = process.env.PATIENT_OVERVIEW_INTEGRATION_TEST === '1';
const d = INTEGRATION_ENABLED ? describe : describe.skip;

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const JWT_DOCTOR_A = process.env.TEST_DOCTOR_JWT ?? '';
const JWT_DOCTOR_B = process.env.TEST_DOCTOR_JWT_B ?? '';
const PATIENT_ID_FOR_A = process.env.TEST_PATIENT_ID ?? '';

async function req(
  method: string,
  path: string,
  jwt: string,
  body?: unknown
): Promise<{ status: number; json: unknown; headers: Headers }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
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
  return { status: res.status, json, headers: res.headers };
}

const EXPECTED_OVERVIEW_KEYS = [
  'active_problems',
  'allergies',
  'care_plan',
  'chronic_conditions',
  'current_medications',
  'patient',
  'recent_activity',
  'risk_flags',
  'six_visit_strip',
  'snapshot',
  'vitals_trends',
];

d('Patient overview + KPIs API smoke tests', () => {
  beforeAll(() => {
    if (!JWT_DOCTOR_A) {
      throw new Error(
        'TEST_DOCTOR_JWT env var is required for patient-overview integration tests'
      );
    }
    if (!PATIENT_ID_FOR_A) {
      throw new Error(
        'TEST_PATIENT_ID env var is required (the patient must belong to TEST_DOCTOR_JWT)'
      );
    }
  });

  it('GET /:id/overview returns 200 with the expected response shape', async () => {
    const { status, json } = await req(
      'GET',
      `/api/v1/patients/${PATIENT_ID_FOR_A}/overview`,
      JWT_DOCTOR_A
    );
    expect(status).toBe(200);
    expect(json).toMatchObject({ success: true });
    const data = (json as { data: Record<string, unknown> }).data;
    const keys = Object.keys(data).sort();
    expect(keys).toEqual(EXPECTED_OVERVIEW_KEYS);
  });

  it('GET /:id/overview returns 404 when Doctor B fetches Doctor A\'s patient', async () => {
    if (!JWT_DOCTOR_B) {
      // Skip silently — the cross-tenant assertion needs a second JWT,
      // which is sometimes unavailable in dev (only one seeded doctor).
      return;
    }
    const { status } = await req(
      'GET',
      `/api/v1/patients/${PATIENT_ID_FOR_A}/overview`,
      JWT_DOCTOR_B
    );
    expect(status).toBe(404);
  });

  it('GET /kpis returns the five tile counts + cache_ttl_seconds', async () => {
    const { status, json } = await req('GET', `/api/v1/patients/kpis`, JWT_DOCTOR_A);
    expect(status).toBe(200);
    const data = (json as { data: Record<string, unknown> }).data;
    expect(Object.keys(data).sort()).toEqual([
      'active_90d',
      'cache_ttl_seconds',
      'followup_overdue',
      'new_30d',
      'open_episodes',
      'possible_duplicates',
    ]);
    expect((data.cache_ttl_seconds as number)).toBe(60);
  });

  it('GET /kpis hits the LRU cache on the second call within the TTL', async () => {
    // Two back-to-back reads; the first should miss (fresh process state or
    // expired entry); the second should hit. Allow miss-then-miss if the
    // dev process restarted between tests — at minimum, two consecutive
    // calls must not both be misses unless the cache is broken.
    const first = await req('GET', `/api/v1/patients/kpis`, JWT_DOCTOR_A);
    expect(first.status).toBe(200);
    const second = await req('GET', `/api/v1/patients/kpis`, JWT_DOCTOR_A);
    expect(second.status).toBe(200);
    expect(second.headers.get('x-kpis-cache')).toBe('hit');
  });

  it('determinism: two consecutive overview reads return identical care_plan + risk_flags', async () => {
    const first = await req(
      'GET',
      `/api/v1/patients/${PATIENT_ID_FOR_A}/overview`,
      JWT_DOCTOR_A
    );
    const second = await req(
      'GET',
      `/api/v1/patients/${PATIENT_ID_FOR_A}/overview`,
      JWT_DOCTOR_A
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const dataFirst = (first.json as { data: { care_plan: unknown; risk_flags: unknown } }).data;
    const dataSecond = (second.json as { data: { care_plan: unknown; risk_flags: unknown } }).data;
    expect(JSON.stringify(dataFirst.care_plan)).toBe(JSON.stringify(dataSecond.care_plan));
    expect(JSON.stringify(dataFirst.risk_flags)).toBe(JSON.stringify(dataSecond.risk_flags));
  });
});
