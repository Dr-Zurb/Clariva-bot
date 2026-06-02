/**
 * Diagnose: does SUPABASE_JWT_SECRET match the Supabase project's JWT secret?
 *
 * Symptom this is for: text-consult chat where DOCTOR side connects fine
 * (Online badge), but PATIENT side is stuck "Reconnecting…" with no
 * messages, AND doctor's presence panel shows the patient as Offline.
 *
 * Theory: doctor JWT is minted by Supabase itself (real auth user) so it
 * always validates. Patient JWT is minted by `services/supabase-jwt-mint.ts`
 * with `env.SUPABASE_JWT_SECRET`. If that env value doesn't match the
 * project's actual JWT secret (Project Settings → API → JWT Settings),
 * Supabase rejects the patient JWT at REST AND Realtime — which is
 * exactly what we're seeing.
 *
 * What this script does:
 *   1. Mints a synthetic patient JWT using the same code path the
 *      runtime takes (`mintScopedConsultationJwt`).
 *   2. Hits PostgREST `from('consultation_messages').select(id)` with
 *      that JWT as Bearer + the project's anon key. Limit 1 — we don't
 *      care about the rows, only the auth verdict.
 *   3. Reports back:
 *        - 200 OK → secret matches; bug is elsewhere (Realtime config
 *          flag, channel auth setup, network).
 *        - 401 Unauthorized / "JWSError" → secret DOES NOT match. Fix:
 *          Supabase Dashboard → Project Settings → API → JWT Settings
 *          → "JWT Secret" → copy → paste into backend/.env as
 *          SUPABASE_JWT_SECRET, restart backend.
 *        - other → real network/config issue, dump status + body.
 *
 * Usage:
 *   npx ts-node backend/scripts/diagnose-text-consult-jwt.ts <session-uuid>
 *
 * Pass any active `consultation_sessions.id` UUID. The session doesn't
 * need to be live — RLS for SELECT is satisfied by the JWT claims, not
 * session status. If you don't have one handy, pass the all-zero UUID;
 * a 200 with [] is still a valid "secret matches" verdict.
 */

import 'dotenv/config';
import { mintScopedConsultationJwt, buildPatientSub } from '../src/services/supabase-jwt-mint';

async function main(): Promise<void> {
  const sessionId = process.argv[2] ?? '00000000-0000-0000-0000-000000000000';
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();

  if (!supabaseUrl || !anon) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in env.');
    process.exit(2);
  }
  if (!jwtSecret) {
    console.error('Missing SUPABASE_JWT_SECRET in env. This is the secret we are testing.');
    process.exit(2);
  }

  console.log('--- Text-consult JWT secret diagnostic ---');
  console.log(`Supabase URL : ${supabaseUrl}`);
  console.log(`Session id   : ${sessionId}`);
  console.log(`JWT secret   : ${jwtSecret.slice(0, 6)}…${jwtSecret.slice(-4)} (${jwtSecret.length} chars)`);
  console.log('');

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const sub = buildPatientSub('diagnose-fake-appt');
  const { token } = mintScopedConsultationJwt({
    sub,
    role: 'patient',
    sessionId,
    expiresAt,
  });

  const url = `${supabaseUrl}/rest/v1/consultation_messages?session_id=eq.${sessionId}&select=id&limit=1`;
  console.log(`GET ${url}`);
  console.log('');

  const res = await fetch(url, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const body = await res.text();

  console.log(`Status: ${res.status} ${res.statusText}`);
  console.log(`Body  : ${body.slice(0, 400)}`);
  console.log('');

  if (res.status === 200) {
    console.log('✅ Verdict: secret MATCHES. Patient JWT is valid against the project.');
    console.log('   Realtime "Reconnecting…" is NOT a JWT-signing issue.');
    console.log('   Next: check Realtime publication + dashboard "Realtime" toggle on');
    console.log('   the consultation_messages table, or look at the WS frame in browser');
    console.log('   devtools (filter "realtime/v1/websocket") for the close code.');
    process.exit(0);
  }

  if (res.status === 401) {
    let parsed: { code?: string; message?: string } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      // body wasn't JSON; that's fine
    }
    if (parsed.code === 'PGRST301' || /JW[ST]Error|signature/i.test(parsed.message ?? body)) {
      console.log('❌ Verdict: secret does NOT match. Fix:');
      console.log('   Supabase Dashboard → Project Settings → API → JWT Settings');
      console.log('   → copy "JWT Secret" → paste into backend/.env as SUPABASE_JWT_SECRET.');
      console.log('   Then restart the backend (touch backend/src/index.ts to bump nodemon).');
    } else {
      console.log('⚠️  401 but not a signature error. Token rejected for another reason:');
      console.log(`   ${parsed.message ?? body.slice(0, 200)}`);
    }
    process.exit(1);
  }

  console.log('⚠️  Unexpected status. Network/config issue rather than a JWT verdict.');
  process.exit(1);
}

main().catch((err) => {
  console.error('Diagnostic crashed:', err);
  process.exit(2);
});
