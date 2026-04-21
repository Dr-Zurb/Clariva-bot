import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a fresh Supabase client scoped to a single consultation session
 * via a backend-minted JWT. Used by the patient-facing text-consult page
 * (`/c/text/[sessionId]`) where the visitor is **not** logged in via
 * Supabase auth — they hold only a short-lived JWT issued by
 * `POST /api/v1/consultation/:sessionId/text-token`.
 *
 * The JWT is bound two places so both REST (RLS-checked INSERT/SELECT) and
 * Realtime (presence + Postgres changes) carry the right identity:
 *
 *   1. `global.headers.Authorization` — used by the `from(...)` builder
 *      against PostgREST. RLS in migration 052 reads `auth.jwt() ->>
 *      'consult_role'` and `auth.jwt() ->> 'session_id'` from this
 *      Bearer token to authorize patient-side reads/writes on
 *      `consultation_messages`.
 *
 *   2. `realtime.params.apikey` + `realtime.setAuth(jwt)` — Supabase
 *      Realtime authenticates with the anon key (apikey) **and** an
 *      identity JWT (set via `setAuth`). RLS for the broadcast filter
 *      uses the identity JWT.
 *
 * We intentionally **do not** call any auth methods (`signIn`,
 * `getSession`, etc.) on this client — the session state lives entirely
 * in the JWT we hand it. Auth-persistence is disabled to avoid
 * accidentally leaking identity into `localStorage` (where it would
 * outlive the page and confuse the next visitor on the same device).
 *
 * Token refresh: when the JWT is about to expire (or a 401 surfaces),
 * the caller should mint a fresh JWT via the exchange endpoint and call
 * `attachJwt(client, freshJwt)` rather than re-creating the client (which
 * would tear down active subscriptions).
 *
 * @see frontend/app/c/text/[sessionId]/page.tsx
 * @see backend/migrations/052_consultation_messages_patient_jwt_rls.sql
 */
export function createScopedRealtimeClient(jwt: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local."
    );
  }
  const client = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
    realtime: {
      params: { apikey: anon },
    },
  });
  client.realtime.setAuth(jwt);
  return client;
}

/**
 * Replace the JWT carried by an existing scoped client. Use this on
 * token refresh so live Realtime channels and any in-flight optimistic
 * sends continue without a remount cycle.
 *
 * Note: `global.headers` set at construction time can't be mutated via
 * the public API, so REST requests issued *after* this call still need
 * the new client. The pattern is:
 *
 *   - Realtime channels keep using the same client; `setAuth` updates
 *     the channel's JWT in-place on the wire (no resubscribe).
 *   - REST writes (INSERT) should use a fresh client built with
 *     `createScopedRealtimeClient(newJwt)`.
 *
 * In practice the patient page builds a fresh client on each token
 * refresh and migrates the channel subscription onto the new client —
 * see `TextConsultRoom`'s reconnect logic.
 */
export function attachJwtToRealtime(
  client: SupabaseClient,
  jwt: string,
): void {
  client.realtime.setAuth(jwt);
}
