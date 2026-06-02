/**
 * Phase 1 (np-02 + np-03) — authenticated-request floor + audit completeness.
 *
 * Measures against the np-01 baseline (`p0-measure/baseline.md`):
 *   1. p50/p95 client RTT for a trivial authenticated GET (localhost ≈ server floor).
 *   2. Audit completeness: N successful auths → N `authenticate` audit rows (± flush lag).
 *
 * Usage (prod build server already running, e.g. PORT=3002 NODE_ENV=production node dist/index.js):
 *   npx ts-node -r dotenv/config scripts/measure-p1-auth-floor.ts
 *   npx ts-node -r dotenv/config scripts/measure-p1-auth-floor.ts --base-url=http://localhost:3002
 *
 * Env (backend/.env + optional frontend/.env.local for E2E creds):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
 *   TEST_DOCTOR_JWT (optional — skips password login)
 *   E2E_USER + E2E_PASSWORD (from frontend/.env.local when TEST_DOCTOR_JWT unset)
 *   MEASURE_P1_SAMPLES (default 60)
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';
import { randomUUID } from 'crypto';

loadEnv({ path: path.join(__dirname, '../../frontend/.env.local') });

const BASE_URL =
  process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1]?.replace(/\/+$/, '') ??
  process.env.BACKEND_URL?.replace(/\/+$/, '') ??
  'http://localhost:3001';

const SAMPLE_COUNT = Math.max(
  10,
  parseInt(process.env.MEASURE_P1_SAMPLES ?? '60', 10) || 60,
);

/** Trivial authenticated read used in np-01 Today capture (`/cockpit-presets`). Override via --endpoint= */
const ENDPOINT =
  process.argv.find((a) => a.startsWith('--endpoint='))?.split('=')[1] ??
  '/api/v1/settings/doctor/cockpit-presets';

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return Math.round(sorted[lower]!);
  return Math.round(sorted[lower]! * (1 - (rank - lower)) + sorted[upper]! * (rank - lower));
}

async function resolveAccessToken(): Promise<string> {
  const preset = process.env.TEST_DOCTOR_JWT?.trim();
  if (preset) return preset;

  const email = process.env.E2E_USER?.trim();
  const password = process.env.E2E_PASSWORD?.trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!email || !password || !supabaseUrl || !anonKey) {
    throw new Error(
      'Set TEST_DOCTOR_JWT or E2E_USER+E2E_PASSWORD (frontend/.env.local) plus Supabase env vars.',
    );
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Supabase login failed (${res.status}): ${body.error_description ?? 'no token'}`);
  }
  return body.access_token;
}

async function timedGet(token: string, correlationId: string): Promise<number> {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${ENDPOINT}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Correlation-ID': correlationId,
    },
  });
  const ms = Math.round(performance.now() - start);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${ENDPOINT} failed ${res.status}: ${text.slice(0, 200)}`);
  }
  return ms;
}

async function countAuditRows(correlationIds: string[]): Promise<number> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for audit count.');
  }

  // PostgREST `in` filter — batch if huge (we use ≤60).
  const filter = `correlation_id=in.(${correlationIds.join(',')})`;
  const url = `${supabaseUrl}/rest/v1/audit_logs?${filter}&action=eq.authenticate&select=correlation_id`;

  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`audit_logs query failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const rows = (await res.json()) as unknown[];
  return rows.length;
}

async function main(): Promise<void> {
  console.log('--- P1 auth floor + audit completeness (np-02/np-03 gate) ---');
  console.log(`Base URL   : ${BASE_URL}`);
  console.log(`Endpoint   : GET ${ENDPOINT}`);
  console.log(`Samples    : ${SAMPLE_COUNT}`);
  console.log('');

  const token = await resolveAccessToken();

  // Warmup — JIT + connection pool
  for (let i = 0; i < 5; i += 1) {
    await timedGet(token, randomUUID());
  }

  const correlationIds: string[] = [];
  const timings: number[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const cid = randomUUID();
    correlationIds.push(cid);
    timings.push(await timedGet(token, cid));
  }

  const p50 = percentile(timings, 50);
  const p95 = percentile(timings, 95);
  const min = Math.min(...timings);
  const max = Math.max(...timings);

  // Allow async audit queue to flush (np-03 batch tick + network).
  await new Promise((r) => setTimeout(r, 3000));
  const auditRows = await countAuditRows(correlationIds);

  const result = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    endpoint: ENDPOINT,
    sampleCount: SAMPLE_COUNT,
    durationMs: { min, p50, p95, max },
    audit: {
      requests: SAMPLE_COUNT,
      rowsMatched: auditRows,
      complete: auditRows === SAMPLE_COUNT,
    },
    np01BaselineProd: { p50: 680, p95: 1280 },
    budgetMs: 100,
    gatePass: p50 < 100 && auditRows === SAMPLE_COUNT,
  };

  console.log('Timing (client RTT, ms):');
  console.log(`  min=${min}  p50=${p50}  p95=${p95}  max=${max}`);
  console.log('');
  console.log('np-01 prod baseline (Today cold backend): p50≈680  p95≈1280');
  console.log(`Budget: p50 < ~100 ms → ${p50 < 100 ? 'PASS' : 'FAIL'}`);
  console.log('');
  console.log(`Audit rows: ${auditRows}/${SAMPLE_COUNT} (action=authenticate, matching correlation IDs)`);
  console.log(`Audit completeness → ${auditRows === SAMPLE_COUNT ? 'PASS' : 'FAIL'}`);
  console.log('');
  console.log('JSON:');
  console.log(JSON.stringify(result, null, 2));

  if (!result.gatePass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
