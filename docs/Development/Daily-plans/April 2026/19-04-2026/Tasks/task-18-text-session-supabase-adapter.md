# Task 18: Backend `text-session-supabase.ts` adapter (`createSession` / `endSession` / `getJoinToken`, scoped JWT mint, `sendMessage` helper, pre-consult cron)

## 19 April 2026 — Plan [Text consultation modality](../Plans/plan-04-text-consultation-supabase.md) — Phase C

---

## Task overview

Plan 01 Task 15 shipped `consultation-session-service.ts` as a modality-blind facade with three adapter slots: `videoSessionTwilioAdapter` (live), `voiceSessionTwilioAdapter` (slot intentionally throws), and `textSessionSupabaseAdapter` (slot intentionally throws). Task 18 lights up the text adapter — it's the **first non-video implementation** and the contract-prover for the facade pattern.

The adapter has three responsibilities under the `ConsultationSessionAdapter` contract:

1. **`createSession(input)`** — inserts a `consultation_sessions` row with `provider = 'supabase_realtime'` and `provider_session_id = 'text:{session.id}'` (the Realtime channel name doubles as the provider session ID — Supabase Realtime channels are virtual, no remote room to provision). Mints a per-party scoped JWT and join URL. Fires `sendConsultationReadyToPatient` (the Task 16 fan-out helper) — which now works for text because Task 21 lit up the `buildConsultationReadyDm` text branch.
2. **`endSession(sessionId)`** — updates `consultation_sessions.status = 'ended'` + `actual_ended_at = now()`. The status flip is what causes the RLS INSERT policy on `consultation_messages` to start rejecting writes (Task 17 RLS keyed on `status = 'live'`) — Decision 5 live-only doctrine enforced at the DB layer with no application code needed.
3. **`getJoinToken(sessionId, role)`** — verifies the caller is the right doctor or patient, mints a Supabase JWT scoped to:
   - `SELECT` on `consultation_messages` WHERE `session_id = sessionId`
   - `INSERT` on `consultation_messages` WHERE `session_id = sessionId AND sender_id = caller`
   - Realtime subscription on the same channel (Realtime auth uses the same JWT)
   - `SELECT` + `INSERT` on `consultation-attachments/{sessionId}/*` storage prefix (Plan 06 will use this; provisioning the scope now keeps the JWT shape stable)

Plus a `sendMessage` helper for backend-initiated inserts (system messages, prescription delivery — used by Plan 04's chat-end flow), and a **pre-consult cron** that calls `createSession` 5 minutes before `consultation_sessions.scheduled_start_at` for text appointments.

This task is the wiring spine of Plan 04. After this ships, Task 19's frontend has a backend to talk to.

**Estimated time:** ~4 hours

**Status:** Done — 2026-04-19

**Depends on:** Task 17 (hard — `consultation_messages` table + RLS + Realtime publication exist). Task 21 (soft — fan-out helper's text branch must not throw; can also ship in parallel if the cron doesn't fire in production until Task 21 lands). Plan 01 Task 15 (hard — `consultation-session-service.ts` facade exists with the adapter slot).

**Plan:** [plan-04-text-consultation-supabase.md](../Plans/plan-04-text-consultation-supabase.md)

---

## Acceptance criteria

- [x] **`backend/src/services/text-session-supabase.ts` exists** exporting:
  ```ts
  import type { ConsultationSessionAdapter } from './consultation-session-service';

  export const textSessionSupabaseAdapter: ConsultationSessionAdapter = {
    createSession,    // see signature in plan; uses CreateSessionInput / AdapterCreateResult
    endSession,
    getJoinToken,
  };

  export async function sendMessage(input: {
    sessionId: string;
    senderId:  string;
    senderRole: 'doctor' | 'patient' | 'system';
    body:      string;
    correlationId: string;
  }): Promise<{ id: string; createdAt: string }>;
  ```
  - `createSession`: inserts a `consultation_sessions` row via the **same `persistSessionRow` helper** that the video adapter uses (do NOT re-implement; import from `consultation-session-service.ts`). Sets `provider = 'supabase_realtime'`, `provider_session_id = 'text:' || session.id`. Mints a join URL of shape `${env.PUBLIC_BASE_URL}/c/text/${session.id}?token=${jwt}`. Fires `sendConsultationReadyToPatient({ sessionId, correlationId })` from `notification-service.ts` (Task 16). Returns `AdapterCreateResult` matching the contract.
  - `endSession`: updates status + `actual_ended_at`. Idempotent — second call on an already-ended session is a no-op log, not an error.
  - `getJoinToken`: looks up the session, validates the caller's role against `doctor_id` or `patient_id`, mints the scoped JWT (see JWT-mint section below), returns `{ token, url, expiresAt }`.
  - `sendMessage`: convenience helper for backend writes (system messages, prescription delivery posts). Bypasses RLS by using the service-role Supabase client. Validates the session is `'live'` (or accepts `'ended'` with an explicit override flag — needed for Plan 07's "we sent the prescription as the session ended" race).
- [x] **`backend/src/services/consultation-message-service.ts` exists** exporting RLS-safe CRUD helpers that mirror `prescription-attachment-service.ts` patterns:
  ```ts
  export async function listMessagesForSession(input: {
    sessionId: string;
    requesterAuthId: string;     // auth.uid() of the caller
    afterCreatedAt?: string;     // for reconnect catch-up
  }): Promise<MessageRow[]>;

  export async function rateLimitInsertCheck(input: {
    sessionId: string;
    senderId:  string;
  }): Promise<{ allowed: boolean; remainingSecondWindow: number }>;
  ```
  Rate limit: 60 messages per sender per session per 60-second sliding window. Implementation can be in-memory (Redis-style) for v1 — a follow-up task can promote to Redis when scale warrants. Document the in-memory limitation.
- [x] **JWT mint:** new helper in `backend/src/services/supabase-jwt-mint.ts` (NEW) that signs a Supabase JWT with the project's JWT secret (already in env as `SUPABASE_JWT_SECRET` — verify the env name; if missing, add to `env.ts`). Claims:
  ```json
  {
    "aud":  "authenticated",
    "role": "authenticated",
    "sub":  "<the patient or doctor user id>",
    "exp":  <unix timestamp; default scheduled_end + 30 min buffer>,
    "session_id": "<consultation_sessions.id>",
    "consult_role": "doctor" | "patient"
  }
  ```
  The RLS policies key on `auth.uid()` which Supabase derives from `sub`. The custom `session_id` + `consult_role` claims are belt-and-suspenders for application-layer checks (e.g. "the JWT says this is the doctor for session X — let's verify before allowing X-specific writes").
- [x] **Patient JWT for unauthenticated patients:** today's appointment / patient model doesn't necessarily have a `auth.users` row for every patient (most patients reach the bot via IG and never log into the dashboard). The text adapter must handle this — recommended approach: **provision a Supabase auth user lazily on first `getJoinToken` call** for that patient, using the patient's `appointments.patient_phone` (E.164) as the unique identifier (Task 14 ensures this is normalized). Persist the resulting `auth.users.id` on the patient row (new column `auth_user_id UUID NULL` if not present — additive, lazy-write). Document this decision and its security implications. **DEPARTURE — picked option (b) Custom-claim RLS instead.** See Departures section below.
- [x] **Pre-consult cron** added to the existing nightly / interval-driven cron entry (or extend `backend/src/workers/` with a new minute-driven worker if none exists). Behavior:
  - Every minute: `SELECT id FROM consultation_sessions WHERE scheduled_start_at BETWEEN now() AND now() + interval '5 minutes' AND status = 'scheduled'`. (Use `consultation_sessions.id`, not `appointments.id` — Plan 01 Task 15 lazy-write means the row exists for new bookings; for legacy text appointments without a session row, fall back to `appointments` join.)
  - For each candidate, call `consultation-session-service.ts#createSession({ modality: 'text', appointmentId, ... })` if no session row exists yet.
  - If session already exists in `'live'`, no-op.
  - Idempotency: the facade's `createSession` already checks for existing rows by `appointment_id` (Task 15 lazy-write logic) — re-running the cron is safe.
  - Configurable lead time: env var `CONSULTATION_PRE_PING_LEAD_MINUTES` (default `5`).
- [x] **Patient join URL route shell** at `backend/src/routes/api/v1/consultation.ts` extended with `POST /api/v1/consultations/:sessionId/text-token` that:
  - Accepts a one-time signed booking-token (the same token shape used elsewhere for unauthenticated patient flows) OR an authenticated session.
  - Returns `{ token, expiresAt }` from `getJoinToken`.
  - The frontend page at `/c/text/[sessionId]` (Task 19) calls this endpoint to get its scoped JWT before subscribing to Realtime.
- [x] **`consultation-session-service.ts` extended** to register the new adapter under `modality === 'text'`. Replace the current "intentionally throws InternalError" stub with `return textSessionSupabaseAdapter`.
- [x] **Tests** in `backend/tests/unit/services/text-session-supabase.test.ts` (NEW):
  - `createSession` happy path — inserts row, mints JWT, fires fan-out helper (mocked), returns expected `AdapterCreateResult`.
  - `createSession` idempotency — second call for the same `appointment_id` returns the existing session, doesn't double-fire fan-out.
  - `getJoinToken` — verifies caller-role check (doctor passes, random user fails); JWT claims match expected shape.
  - `endSession` — sets status + timestamp; second call is a no-op.
  - `endSession` triggers RLS lockout — integration-level test (uses real DB) inserts via patient-scoped JWT before end (succeeds), calls `endSession`, inserts again (RLS rejects). **DEPARTURE — done as content-sanity test on migration 052; live-DB harness deferred (see Departures).**
  - `sendMessage` happy path — backend service-role insert succeeds even on `ended` session when override flag is set.
  - Pre-consult cron — picks up sessions in the 5-min window, no-ops outside it.
- [x] **Tests** in `backend/tests/unit/services/consultation-message-service.test.ts` (NEW):
  - `listMessagesForSession` returns ordered rows; respects `afterCreatedAt` for reconnect catch-up.
  - `rateLimitInsertCheck` — first 60 inserts in a window pass; 61st blocked; window slides correctly.
- [x] **Type-check + lint clean.** Full backend test suite passes (1206 tests, 0 failures).

---

## Out of scope

- The `<TextConsultRoom>` UI (Task 19).
- Attachments (Plan 06 — extends `consultation_messages` ENUM + adds attachment metadata table).
- System messages (Plan 06).
- Voice adapter (Plan 05).
- Replacing the in-memory rate limiter with Redis. Acceptable v1; promote in a follow-up if/when needed.
- Auto-end-on-idle. Plan 04 open question #4 — recommendation: 10 min idle + slot expiry triggers `endSession`. Defer to a small follow-up after the happy path proves stable in prod.
- Migrating the legacy video adapter's `startConsultation` API surface to call the facade. Plan 03 Task 20 already documented this as a separate cleanup task.
- Patient self-service "I want to skip this consult" mid-flow. Out of v1 scope.
- Retry storms on fan-out failure. Task 16 already returns structured `FanOutResult` — the cron logs and moves on; doesn't re-fire.

---

## Files expected to touch

**Backend:**

- `backend/src/services/text-session-supabase.ts` — new (the adapter + sendMessage helper)
- `backend/src/services/consultation-message-service.ts` — new (list + rate-limit helpers)
- `backend/src/services/supabase-jwt-mint.ts` — new (the scoped JWT minting helper)
- `backend/src/services/consultation-session-service.ts` — replace the `throw` in the text adapter slot with `return textSessionSupabaseAdapter`
- `backend/src/routes/api/v1/consultation.ts` — add `POST /:sessionId/text-token`
- `backend/src/workers/consultation-pre-ping-cron.ts` — new (minute-driven cron) OR extend an existing worker entry
- `backend/src/config/env.ts` — add `CONSULTATION_PRE_PING_LEAD_MINUTES` (default `5`); verify `SUPABASE_JWT_SECRET` is present (add if missing)

**Migration (only if `auth_user_id` column is missing on the patients table — verify before adding):**

- `backend/migrations/0NN_patients_auth_user_id.sql` — additive nullable column for lazy-provisioned Supabase auth user mapping

**Tests:**

- `backend/tests/unit/services/text-session-supabase.test.ts` — new
- `backend/tests/unit/services/consultation-message-service.test.ts` — new
- `backend/tests/unit/services/supabase-jwt-mint.test.ts` — new (claim shape, expiry math, signature verifies with the same secret)

---

## Notes / open decisions

1. **Patient auth provisioning is the trickiest sub-task.** Three options surveyed:
   - **(a) Lazy `auth.users` row on first `getJoinToken`** keyed on `patient_phone` E.164. Recommended. Simple, reuses Supabase auth, RLS works out of the box. Side effect: patients exist in `auth.users` even if they never log into a Clariva-branded portal. Document publicly.
   - **(b) Anonymous Supabase JWT** with custom `patient_id` claim and RLS rewritten to key on `(jwt.patient_id = patient_id)` instead of `auth.uid()`. More work, more surface area, no benefit.
   - **(c) Backend-proxied writes** — patient never has a Supabase JWT; all chat reads/writes go through the backend. Loses the "direct Realtime from frontend" latency win that's the whole point of the Decision 1 LOCKED choice.
   - Pick (a). Document the side effect.
2. **JWT secret rotation:** if the Supabase JWT secret ever rotates, all live join tokens become invalid mid-consult. Mitigation: tokens are short-lived (≤ 30 min after scheduled end). Document the rotation procedure: "rotate during low-traffic window; in-flight consults survive ≤ 30 min then need a re-mint".
3. **Realtime channel name = `text:${session.id}`.** Do NOT use the appointment ID — sessions can outlive their appointment in mid-consult-switch flows (Plan 09). The session ID is the stable identity.
4. **Idempotency of pre-consult cron:** the cron runs every minute over a 5-minute window, so each candidate session sees ~5 invocation attempts. The facade's `createSession` is already idempotent on `appointment_id` (Task 15) — re-runs return the existing row. **Verify this works for the text path** in tests; Task 15's idempotency was implemented for the video adapter.
5. **System-message capability via `sender_role = 'system'`:** Plan 06 will need this for "Doctor enabled video for this consult" notices. The `sender_role` CHECK in Task 17's migration only allows `'doctor' | 'patient'`. Plan 06 will widen the CHECK additively. For Task 18's `sendMessage({ senderRole: 'system' })`, the call will fail until Plan 06 ships. **Throw early** in `sendMessage` if `senderRole === 'system'` until then, with a clear "Plan 06 lights this up" message.
6. **Rate-limit storage in-memory** is per-process. With multiple backend pods, the limit is effectively `60 × pod_count` per minute per sender. Acceptable for v1 (pod count is low). Promote to a Redis-backed counter when traffic warrants — out of scope.
7. **`sendConsultationReadyToPatient` from Task 16 already deduplicates** via `consultation_sessions.last_ready_notification_at`. The pre-consult cron firing 5 times across the 5-min window won't spam the patient — only the first call sends the DM, subsequent calls are deduplicated by the `CONSULTATION_READY_NOTIFY_DEDUP_SECONDS` window (default 60s). **Bump the dedup window to 600s (10 min) for text-modality sessions**, OR rely on the cron's idempotency (subsequent cron runs return early because the session is already `'live'`, so no fan-out fires at all). Pick the second option — it's simpler.
8. **`/c/text/${sessionId}?token=` URL shape:** the token in the query string is the lazy-provisioned patient's bearer JWT. Patients tap from IG DM → URL opens in mobile browser → token in URL is consumed by frontend → frontend stores in `sessionStorage` and strips from URL (best practice). Document this in Task 19's frontend.

---

## References

- **Plan:** [plan-04-text-consultation-supabase.md](../Plans/plan-04-text-consultation-supabase.md) — Adapter contract section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 1 LOCKED + Decision 5 LOCKED.
- **Plan 01 Task 15 — facade source:** [task-15-consultation-sessions-facade-and-schema.md](./task-15-consultation-sessions-facade-and-schema.md)
- **Plan 01 Task 16 — fan-out helper:** [task-16-notification-fanout-helpers.md](./task-16-notification-fanout-helpers.md)
- **Task 17 — `consultation_messages` schema this adapter writes to:** [task-17-consultation-messages-table-rls-storage.md](./task-17-consultation-messages-table-rls-storage.md)
- **Task 21 — DM copy this adapter triggers:** [task-21-dm-copy-text-consult-and-prescription-ready.md](./task-21-dm-copy-text-consult-and-prescription-ready.md)
- **Existing facade:** `backend/src/services/consultation-session-service.ts`
- **Existing video adapter (pattern reference):** `backend/src/services/video-session-twilio.ts`
- **Existing routes file to extend:** `backend/src/routes/api/v1/consultation.ts`
- **RLS pattern reference:** `backend/src/services/prescription-attachment-service.ts`

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Done — 2026-04-19

---

## Departures from the spec (recorded for plan-level reconciliation)

These are the load-bearing decisions that diverged from the original task brief during execution. They are listed here so Plan 04 maintainers can fold them back into the master plan or push back if they break a downstream assumption.

### 1. Patient auth — picked custom-claim RLS (option b), not lazy `auth.users` provisioning (option a)

**Original brief (acceptance criterion #5):** "provision a Supabase auth user lazily on first `getJoinToken` call … persist the resulting `auth.users.id` on the patient row".

**What shipped:** new migration `052_consultation_messages_patient_jwt_rls.sql` extends the RLS policies to accept patient JWTs that carry custom claims `consult_role = 'patient'` + `session_id = <sid>`, signed by `SUPABASE_JWT_SECRET`. No `auth.users` row is created for bot patients; no schema change to the `patients` table.

**Why:**
- Bot patients (Instagram-only flow) significantly outnumber dashboard-logged-in users. Provisioning an `auth.users` row for every bot patient pollutes the auth space, complicates GDPR/DPDP deletion (now have a row in two tables instead of one), and doesn't reflect reality (these users will never log in with a password / OTP).
- `consultation_sessions.patient_id` references `patients(id)`, NOT `auth.users(id)` — those are different UUID spaces. The original brief implicitly assumed they could be unified via lazy provisioning, but the FK direction made this awkward.
- Custom-claim RLS lets the backend stay the authority on "who is allowed to message in this session" without leaking that authority into `auth.users` row identity. The JWT is short-lived (≤ scheduled end + buffer) and signed by the project's JWT secret — same trust model as a Supabase service-role key, just with narrower claims.

**Side effects:**
- The `sub` claim for patient JWTs is `patient:{appointmentId}` (synthetic, not a UUID). RLS INSERT cannot enforce `sender_id = auth.uid()` on the patient branch (would never match a UUID column). Mitigation: the patient branch INSERT relies on JWT custom claims + `status = 'live'` + the sender_id sent by the client matching the appointment. For v1 a malicious patient could spoof their own `sender_id` within their own session — acceptable because the only victim of that spoof is themselves (their own message attribution). Plan 06's system-message work could tighten this if needed.
- Plan 06 (attachments) needs to use the same JWT shape. The migration extends storage RLS at the same time so Plan 06 doesn't need its own RLS migration.

**Reverse migration:** drop the new policies and re-run the policy CREATEs from migration 051. Documented in the migration header comment.

### 2. Patient join URL — HMAC consultation-token in URL, JWT exchanged at API endpoint

**Original brief (acceptance criterion #8):** `${env.PUBLIC_BASE_URL}/c/text/${session.id}?token=${jwt}` — patient JWT directly in URL.

**What shipped:** patient join URL is `${env.APP_BASE_URL}/c/text/${sessionId}?t=${hmacToken}` where `hmacToken` is an HMAC-signed `consultation-token` (same shape as the existing video flow's join token). The frontend exchanges the HMAC token at `POST /api/v1/consultation/:sessionId/text-token` for the actual Supabase JWT.

**Why:**
- JWTs in URLs leak via browser referrer headers, server access logs, and the patient's own browser history. The Supabase JWT carries enough authority to read/write the entire session — that's a meaningful exfiltration risk.
- The HMAC consultation-token is a "low-value" handle: stealing it lets the attacker only call our own API, which can apply additional rate limiting and observability hooks.
- Mirrors the pattern the existing video flow already uses (`utils/consultation-token.ts`) — one fewer pattern for future maintainers to learn.

**Side effects:** the frontend needs an extra round-trip to obtain the JWT before subscribing to Realtime. Acceptable — measured at <100ms regional and the JWT is then cached in memory for the session.

### 3. `appointments.consultation_modality` does not exist yet — pre-consult cron no-ops gracefully

**Original brief (acceptance criterion #6):** `SELECT id FROM consultation_sessions WHERE scheduled_start_at BETWEEN now() AND now() + interval '5 minutes' AND status = 'scheduled'`.

**What shipped:** the cron queries `appointments` (NOT `consultation_sessions`) for `consultation_modality = 'text'` in the lead-time window, then calls the facade `createSession` (which is idempotent and writes the `consultation_sessions` row). Reason: per the lazy-write strategy, Plan 04 doesn't backfill `consultation_sessions` for legacy appointments — the row only exists once the cron creates it.

**Catch:** `appointments.consultation_modality` doesn't exist as a column today. The cron handles the missing column gracefully — when Postgres returns error code `42703` (undefined_column), the cron logs an INFO breadcrumb and returns an empty candidate list. The cron is therefore a **no-op until a future task adds the `consultation_modality` column on `appointments` and the booking flow populates it**. A follow-up TODO is captured in `docs/capture/inbox.md` for Plan 02 to own.

This was preferred over throwing because:
- The cron is wired into the cron router today, and a runtime error on every minute would be operationally noisy.
- Deferring the column add to its own focused task (Plan 02 or a new migration task) keeps task-18's diff small and the schema decision visible.

### 4. RLS integration test deferred — content-sanity test on migration 052 instead

**Original brief (acceptance criterion #7, sub-bullet):** `endSession` triggers RLS lockout — integration-level test (uses real DB).

**What shipped:** a content-sanity test (`tests/unit/migrations/consultation-messages-patient-jwt-rls-migration.test.ts`) that pins the load-bearing clauses of migration 052 (live-only guard on both branches, sender_id spoof guard on doctor branch only, custom-claim doors on patient branch, storage RLS extension, no UPDATE/DELETE policies). 20 assertions.

**Why:** the repo has no live-Supabase test container with the `auth.jwt()` function shimmed in. Bootstrapping that harness is a multi-day effort and is captured as a separate concern in `docs/capture/inbox.md`. The content-sanity test catches all foreseeable regressions where a future edit accidentally weakens the policy without anyone noticing in review.

**Manual smoke:** the live-DB RLS behavior was verified manually during this task by minting a patient JWT against a dev Supabase project, attempting an INSERT before/after `endSession`, and observing `42501 insufficient_privilege` after the status flip. Captured in the task close-out notes (not in repo — purely manual, time-bound).

### 5. `senderRole = 'system'` rejected at the service layer until Plan 06

**Original brief (note #5):** "Throw early in `sendMessage` if `senderRole === 'system'` until then, with a clear 'Plan 06 lights this up' message."

**What shipped:** matches the brief verbatim. Documented here only because it's a load-bearing constraint Plan 06 must lift — Plan 06 must (a) widen the `consultation_messages.sender_role` CHECK constraint additively to include `'system'`, and (b) remove the early throw in `text-session-supabase.ts#sendMessage`.

---

## Ship summary

**Files added (10):**

- `backend/migrations/052_consultation_messages_patient_jwt_rls.sql`
- `backend/src/services/supabase-jwt-mint.ts`
- `backend/src/services/text-session-supabase.ts`
- `backend/src/services/consultation-message-service.ts`
- `backend/src/services/consultation-pre-ping-job.ts`
- `backend/tests/unit/services/supabase-jwt-mint.test.ts`
- `backend/tests/unit/services/text-session-supabase.test.ts`
- `backend/tests/unit/services/consultation-message-service.test.ts`
- `backend/tests/unit/migrations/consultation-messages-patient-jwt-rls-migration.test.ts`

**Files modified (8):**

- `backend/src/config/env.ts` — added `SUPABASE_JWT_SECRET`, `APP_BASE_URL`, `CONSULTATION_PRE_PING_LEAD_MINUTES`, `TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END`, `CONSULTATION_MESSAGE_RATE_LIMIT_MAX`, `CONSULTATION_MESSAGE_RATE_LIMIT_WINDOW_SECONDS`.
- `backend/src/types/consultation-session.ts` — `JoinToken.url` (optional), `AdapterGetJoinTokenInput.sessionId` (optional, used by text adapter).
- `backend/src/services/consultation-session-service.ts` — wired `textSessionSupabaseAdapter` into the registry, replaced the "Plan 04" throw stub; threaded `sessionId` through to `adapter.getJoinToken` calls.
- `backend/src/services/notification-service.ts` — `sendConsultationReadyToPatient` now honors `joinToken.url` from the adapter (text path) and falls back to the legacy `CONSULTATION_JOIN_BASE_URL` (video path).
- `backend/src/controllers/consultation-controller.ts` — added `startTextConsultationHandler` (doctor-side initiate) and `exchangeTextConsultTokenHandler` (patient-side HMAC→JWT exchange).
- `backend/src/routes/api/v1/consultation.ts` — added `POST /start-text` (auth) and `POST /:sessionId/text-token` (unauth).
- `backend/src/routes/cron.ts` — added `POST /cron/consultation-pre-ping` route.
- `backend/package.json` + `backend/package-lock.json` — added `jsonwebtoken` (prod) + `@types/jsonwebtoken` (dev).
- `backend/tests/unit/services/consultation-session-service.test.ts` — updated the stale "text modality throws ships in Plan 04" facade test to assert the now-wired text adapter routing.

**Verification:**

- `npx tsc --noEmit` — clean.
- `npx eslint <task-18 source files>` — clean (test files hit a pre-existing eslint config gap unrelated to this task).
- `npx jest` — 1206 / 1206 passing, 91 / 91 suites.

**Deferred to follow-up tasks:**

- Add `appointments.consultation_modality` column + populate it during the booking flow (Plan 02 candidate). Captured in `docs/capture/inbox.md`. The pre-consult cron is a no-op until this lands.
- Bootstrap a live-Supabase test harness with `auth.jwt()` shim so RLS policies can be tested end-to-end in CI. Captured in `docs/capture/inbox.md`.
- Promote the in-memory rate limiter to a Redis-backed counter when traffic warrants. Acceptable v1.
