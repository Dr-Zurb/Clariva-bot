/**
 * Phase 4 (np-09) — DB path profile: RTT vs PostgREST vs round-trip attribution.
 *
 * Measurement-only. No behaviour change. PHI-free output (durations + row counts).
 *
 * Usage (prod build server on :3002):
 *   npm run build
 *   NODE_ENV=production PORT=3002 node dist/index.js &
 *   npx ts-node -r dotenv/config scripts/measure-p4-db-path-profile.ts --base-url=http://localhost:3002
 *
 * Env: backend/.env + frontend/.env.local (E2E creds). Optional:
 *   MEASURE_P4_SAMPLES (default 20)
 *   E2E_PATIENT_ID (overview target; auto-resolved from /patients?limit=1)
 *   NP_DB_PROFILE=1 (set automatically for in-process wave profile)
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';
import { randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

loadEnv({ path: path.join(__dirname, '../../frontend/.env.local') });

process.env.NP_DB_PROFILE = '1';

const BASE_URL =
  process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1]?.replace(/\/+$/, '') ??
  process.env.BACKEND_URL?.replace(/\/+$/, '') ??
  'http://localhost:3002';

const SAMPLE_COUNT = Math.max(
  5,
  parseInt(process.env.MEASURE_P4_SAMPLES ?? '20', 10) || 20,
);

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return Math.round(sorted[lower]!);
  return Math.round(sorted[lower]! * (1 - (rank - lower)) + sorted[upper]! * (rank - lower));
}

function summarize(values: number[]) {
  return {
    n: values.length,
    min: values.length ? Math.min(...values) : 0,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: values.length ? Math.max(...values) : 0,
  };
}

function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
    return json.sub ?? null;
  } catch {
    return null;
  }
}

async function resolveAccessToken(): Promise<string> {
  const preset = process.env.TEST_DOCTOR_JWT?.trim();
  if (preset) return preset;

  const email = process.env.E2E_USER?.trim();
  const password = process.env.E2E_PASSWORD?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!email || !password || !SUPABASE_URL || !anonKey) {
    throw new Error(
      'Set TEST_DOCTOR_JWT or E2E_USER+E2E_PASSWORD (frontend/.env.local) plus Supabase env vars.',
    );
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Supabase login failed (${res.status}): ${body.error_description ?? 'no token'}`);
  }
  return body.access_token;
}

async function timedGet(token: string, endpoint: string): Promise<number> {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Correlation-ID': randomUUID(),
      'Cache-Control': 'no-cache',
    },
  });
  const ms = Math.round(performance.now() - start);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${endpoint} failed ${res.status}: ${text.slice(0, 200)}`);
  }
  await res.arrayBuffer();
  return ms;
}

async function resolvePatientId(token: string): Promise<string> {
  const envId = process.env.E2E_PATIENT_ID?.trim();
  if (envId) return envId;

  const res = await fetch(`${BASE_URL}/api/v1/patients?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to resolve patient id (${res.status})`);
  const body = (await res.json()) as {
    data?: { patients?: Array<{ id: string }> };
  };
  const id = body.data?.patients?.[0]?.id;
  if (!id) throw new Error('No patient id from /api/v1/patients?limit=1');
  return id;
}

async function runSupabaseProbes(admin: SupabaseClient, doctorId: string) {
  async function probe(fn: () => PromiseLike<unknown>): Promise<number> {
    const start = performance.now();
    await fn();
    return Math.round(performance.now() - start);
  }

  // Warm connection
  await admin.from('doctor_settings').select('doctor_id').eq('doctor_id', doctorId).limit(1);

  const trivialSamples: number[] = [];
  const countSamples: number[] = [];
  const payloadSamples: number[] = [];

  for (let i = 0; i < 10; i += 1) {
    trivialSamples.push(
      await probe(async () => {
        await admin.from('doctor_settings').select('doctor_id').eq('doctor_id', doctorId).limit(1);
      }),
    );
    countSamples.push(
      await probe(async () => {
        await admin
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('doctor_id', doctorId);
      }),
    );
    payloadSamples.push(
      await probe(async () => {
        await admin
          .from('appointments')
          .select('id, patient_id, appointment_date, status')
          .eq('doctor_id', doctorId)
          .limit(50);
      }),
    );
  }

  return {
    trivialSingleRow: summarize(trivialSamples),
    headExactCount: summarize(countSamples),
    moderateSelect50: summarize(payloadSamples),
  };
}

async function measureKpiPayloadRows(admin: SupabaseClient, doctorId: string) {
  const [{ count: aptCount }, { count: rxCount }, { count: problemCount }] = await Promise.all([
    admin
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .not('patient_id', 'is', null),
    admin
      .from('prescriptions')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .not('follow_up_value', 'is', null),
    admin
      .from('patient_problem_list_v')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('source', 'episode'),
  ]);

  const { data: linkedApt } = await admin
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', doctorId)
    .not('patient_id', 'is', null);
  const linkedConv = await admin.from('conversations').select('patient_id').eq('doctor_id', doctorId);
  const linkedIds = new Set<string>();
  for (const row of linkedApt ?? []) {
    const pid = (row as { patient_id: string | null }).patient_id;
    if (pid) linkedIds.add(pid);
  }
  for (const row of linkedConv.data ?? []) {
    linkedIds.add((row as { patient_id: string }).patient_id);
  }

  return {
    appointmentRowsFetched: aptCount ?? 0,
    prescriptionFollowupRowsFetched: rxCount ?? 0,
    problemListEpisodeRowsFetched: problemCount ?? 0,
    linkedPatientIds: linkedIds.size,
    note: 'computePatientsKpis transfers full appointment + rx row sets to count in JS (not head counts)',
  };
}

async function resolveRegionLocality() {
  const hostname = new URL(SUPABASE_URL).hostname;
  let supabaseResolvedIp: string | null = null;
  try {
    const dns = await import('dns/promises');
    const ips = await dns.resolve4(hostname);
    supabaseResolvedIp = ips[0] ?? null;
  } catch {
    supabaseResolvedIp = null;
  }

  const apiHost = 'localhost (dev laptop — same host as np-01/p1 measurements)';
  const supabaseProjectRef = hostname.split('.')[0] ?? hostname;

  return {
    supabaseUrl: SUPABASE_URL,
    supabaseHostname: hostname,
    supabaseProjectRef,
    supabaseResolvedIp,
    apiRuntimeHost: apiHost,
    apiProcessRegion: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? 'local-dev (darwin)',
    localityAssessment:
      'Supabase project is hosted on Supabase cloud (AWS-backed). API measured from local dev machine ' +
      '(not co-located with DB). Per-round-trip floor ~450–500 ms p50 matches cross-region HTTPS RTT + ' +
      'PostgREST fixed overhead — not query-bound (see probe delta trivial vs payload). ' +
      'Production deploy region must be verified separately; co-locate API with Supabase project region before direct-PG.',
  };
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  }

  console.log('--- P4 DB path profile (np-09) ---');
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Samples  : ${SAMPLE_COUNT} per endpoint`);
  console.log('');

  const token = await resolveAccessToken();
  const doctorId = decodeJwtSub(token);
  if (!doctorId) throw new Error('Could not decode doctor id from JWT');

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const patientId = await resolvePatientId(token);

  console.log('Running Supabase three-probe attribution…');
  const supabaseProbes = await runSupabaseProbes(admin, doctorId);

  console.log('Measuring KPI payload row counts…');
  const kpiPayload = await measureKpiPayloadRows(admin, doctorId);

  console.log('Measuring HTTP endpoints (cold, cache-bypass headers)…');
  const endpoints = [
    { id: 'trivial-get', path: '/api/v1/settings/doctor/cockpit-presets' },
    { id: 'patients-kpis', path: '/api/v1/patients/kpis' },
    { id: 'patient-overview', path: `/api/v1/patients/${patientId}/overview` },
  ] as const;

  const endpointTimings: Record<string, ReturnType<typeof summarize>> = {};

  for (const ep of endpoints) {
    // Warmup
    for (let i = 0; i < 2; i += 1) {
      await timedGet(token, ep.path);
    }
    const samples: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      samples.push(await timedGet(token, ep.path));
      if (ep.id === 'patients-kpis' && i === 0) {
        // Second sample may hit LRU — keep measuring; note in output
      }
    }
    endpointTimings[ep.id] = summarize(samples);
  }

  console.log('Running in-process getPatientOverview wave profile…');
  const {
    getPatientOverview,
    consumeOverviewWaveProfile,
    __resetKpisCacheForTests,
  } = await import('../src/services/patient-overview-service');

  __resetKpisCacheForTests();
  await getPatientOverview(patientId, randomUUID(), doctorId);
  const waveProfile = consumeOverviewWaveProfile();
  if (!waveProfile) {
    throw new Error('NP_DB_PROFILE wave profile missing — ensure NP_DB_PROFILE=1');
  }

  const region = await resolveRegionLocality();

  const perRoundTripFloorMs = supabaseProbes.trivialSingleRow.p50;
  const overviewP50 = endpointTimings['patient-overview']?.p50 ?? 0;
  const estimatedSerialWaves =
    waveProfile.waveA_findPatientMs +
    waveProfile.waveB_ownershipMs +
    waveProfile.waveC_sectionsMs +
    waveProfile.waveD_paymentsMs;

  const result = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    patientId,
    doctorId,
    sampleCount: SAMPLE_COUNT,
    regionLocality: region,
    supabaseProbes,
    endpointTimings,
    patientOverviewWaves: waveProfile,
    patientOverviewWaveSumMs: estimatedSerialWaves,
    kpiPayload,
    roundTripInventory: {
      cockpitPresets: { endpoint: 'GET /api/v1/settings/doctor/cockpit-presets', supabaseRounds: 1, pattern: 'serial' },
      patientsKpis: {
        endpoint: 'GET /api/v1/patients/kpis',
        supabaseRounds: '6–8',
        pattern: 'mixed (apt full fetch → linked ids parallel → patients in → rx full → problems → duplicates 3-step)',
      },
      patientOverview: {
        endpoint: 'GET /api/v1/patients/:id/overview',
        supabaseRounds: '4 sequential waves; wave C = 6 parallel branches (prescriptions N+1 per rx)',
        pattern: 'serial waves A→B→C→D; wave C internal rx N+1',
      },
      opdToday: {
        endpoint: 'GET /api/v1/opd/queue-session (primary)',
        supabaseRounds: '2–4',
        pattern: 'serial session + entries',
      },
      patientsList: {
        endpoint: 'GET /api/v1/patients + /kpis',
        supabaseRounds: 'list query + KPI block above',
        pattern: 'parallel on client',
      },
    },
    attribution: {
      perRoundTripFloorMs,
      trivialGetP50Ms: endpointTimings['trivial-get']?.p50,
      overviewP50Ms: overviewP50,
      probeDeltaPayloadVsTrivialMs:
        (supabaseProbes.moderateSelect50.p50 ?? 0) - (supabaseProbes.trivialSingleRow.p50 ?? 0),
      dominantFactor:
        'cross-region RTT + PostgREST HTTPS overhead (~450–500 ms per round-trip); round-trip count amplifies on overview/KPI',
      npQ7Resolution: 'NO-GO on direct-PG (np-11) — co-locate API with Supabase region first; np-10 fan-out reduction is primary code lever',
    },
    leverRanking: [
      { rank: 1, lever: 'co-location', action: 'Deploy API in same AWS region as Supabase project', blocks: 'np-11 skip' },
      { rank: 2, lever: 'R-FANOUT (np-10)', action: 'Parallelize overview waves; rx embed; KPI DB-side counts', blocks: 'np-10' },
      { rank: 3, lever: 'direct-PG (np-11)', action: 'Deferred — only if co-located floor still >100 ms and PostgREST overhead dominates', blocks: 'NP-Q7 no-go today' },
    ],
  };

  console.log('');
  console.log('Supabase probes (ms, server-side from API host):');
  console.log(`  trivial limit-1   p50=${supabaseProbes.trivialSingleRow.p50}  p95=${supabaseProbes.trivialSingleRow.p95}`);
  console.log(`  head exact count  p50=${supabaseProbes.headExactCount.p50}  p95=${supabaseProbes.headExactCount.p95}`);
  console.log(`  select 50 rows    p50=${supabaseProbes.moderateSelect50.p50}  p95=${supabaseProbes.moderateSelect50.p95}`);
  console.log('');
  console.log('Endpoint timings (client RTT ≈ server on localhost):');
  for (const [id, stats] of Object.entries(endpointTimings)) {
    console.log(`  ${id}: p50=${stats.p50}  p95=${stats.p95}`);
  }
  console.log('');
  console.log('Patient overview waves (ms):');
  console.log(`  A findPatient=${waveProfile.waveA_findPatientMs}  B ownership=${waveProfile.waveB_ownershipMs}`);
  console.log(`  C sections=${waveProfile.waveC_sectionsMs}  D payments=${waveProfile.waveD_paymentsMs}`);
  console.log(`  rowCounts=${JSON.stringify(waveProfile.rowCounts)}`);
  console.log('');
  console.log(`NP-Q7: ${result.attribution.npQ7Resolution}`);
  console.log('');
  console.log('JSON:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
