# Task 15: Generalize video scaffolding into `consultation-session-service.ts` facade + new `consultation_sessions` table (Decision 8 LOCKED schema)

## 19 April 2026 — Plan [Foundation: consultation_sessions schema + facade + fan-out + IG phone capture](../Plans/plan-01-foundation-consultation-sessions.md) — Phase A

---

## Task overview

Today, every video-consult artifact is bolted onto `appointments` (`consultation_room_sid`, `consultation_started_at`, `consultation_ended_at`, etc. — see `migrations/021_appointments_consultation_room.sql`) and the only adapter is `consultation-room-service.ts`, which is called directly from controllers / workers / frontend token endpoints. This shape works for video-only but cannot host text or voice without re-inventing per-modality state.

This task lands the **modality-blind backbone** Plan 01 (and every subsequent plan) builds on:

1. **New `consultation_sessions` table** keyed on `(modality, provider, provider_session_id)` per the Decision 8 LOCKED schema (full DDL in this file).
2. **Rename** `consultation-room-service.ts` → `video-session-twilio.ts`. Behavior unchanged; this becomes one of three adapters.
3. **New `consultation-session-service.ts` facade** with a typed `ConsultationSessionAdapter` interface. The facade is the single entry point for `createSession()` / `endSession()` / `getJoinToken()` from the rest of the codebase. The video adapter is registered under modality `'video'`; voice + text adapters throw "ships in Plan 05/04" until those plans land.
4. **Lazy-write strategy:** the migration creates the table empty. The facade writes a new `consultation_sessions` row for **every new** call. Existing in-flight rooms continue to use the legacy `appointments.consultation_room_*` columns until they end. Task 35 ships ~14 days later to drop the legacy columns.
5. **Update every caller of `consultation-room-service.ts`** to go through the facade. Only one caller exists today (`appointment-service.ts`) so the rename + redirect is small.

The largest risk is the rename touching every caller cleanly — verify with a PR-time grep that returns zero direct callers of `video-session-twilio.ts` outside the adapter file itself.

**Estimated time:** 4–6 hours (actual: ~5h)

**Status:** Implementation complete (2026-04-19); pending PR + production smoke test.

**Depends on:** Task 14 (audit metric exists; capture flow understood). Soft-blocks Task 16 (`sendConsultationReadyToPatient` needs `consultation_sessions.id` as input).

**Plan:** [plan-01-foundation-consultation-sessions.md](../Plans/plan-01-foundation-consultation-sessions.md)

---

## Acceptance criteria

- [x] **Migration shipped:** `backend/migrations/049_consultation_sessions.sql` creates the `consultation_sessions` table + the two new ENUMs (`consultation_modality`, `consultation_status`) + indexes per the schema below. Idempotent via `IF NOT EXISTS` / `DO $$` guards so re-runs on a migrated DB are no-ops; rollback is a single `DROP TABLE consultation_sessions; DROP TYPE consultation_status; DROP TYPE consultation_modality;`.
- [x] **Rename complete:** `backend/src/services/consultation-room-service.ts` renamed to `backend/src/services/video-session-twilio.ts`. Public API unchanged (the legacy primitives `createTwilioRoom` / `generateVideoAccessToken` / `isTwilioVideoConfigured` still exported, plus a new `completeTwilioRoom` for the adapter's `endSession`). The single existing caller (`backend/src/services/appointment-service.ts`) updated to import from the new path **only** via the new facade (`consultation-session-service.ts`).
- [x] **Facade exists:** `backend/src/services/consultation-session-service.ts` exports `createSession()`, `endSession()`, `getJoinToken()`, plus the lazy-write bridge `getJoinTokenForAppointment()` and lookup helpers (`findSessionById`, `findActiveSessionByAppointment`, `findSessionByProviderSessionId`) and lifecycle helpers (`updateSessionStatus`, `markParticipantJoined`). Adapter registry routes per modality; voice + text throw `InternalError("Voice adapter ships in Plan 05")` / `Error("Text adapter ships in Plan 04")` — verified by `consultation-session-service.test.ts`. Video adapter (`videoSessionTwilioAdapter`) registered.
- [x] **Lazy-write working:** every facade `createSession({ modality: 'video' })` call inserts a row into `consultation_sessions` AND `startConsultation` in `appointment-service.ts` continues to populate `appointments.consultation_room_sid` + `consultation_started_at` so legacy read paths (`getConsultationToken`, `consultation-verification-service.ts`) keep functioning. `consultation-verification-service.ts` lifecycle handlers also mirror Twilio room events into the new session row via the new `mirrorTwilioRoomEventToSession()` helper (silent for legacy in-flight rows with no session row).
- [x] **PR-time grep clean:** zero direct callers of `video-session-twilio.ts` outside `consultation-session-service.ts`. Confirmed with `rg "from .*video-session-twilio" --type ts | rg -v "consultation-session-service\.ts"` (only doc-comment references remain).
- [ ] **Existing video flow zero-regression:** **NOT YET RUN.** Production smoke test pending — book a video appointment via IG bot → cron / scheduler creates session → doctor + patient join → both sides see each other → recording fires → consult ends → prescription delivered. Locally: full backend jest suite (83 suites / 1097 tests) green.
- [x] **Tests:**
  - `backend/tests/unit/services/consultation-session-service.test.ts` — 15 tests covering facade routing (`voice` / `text` throw), lazy-write insert + idempotency, `getJoinToken` lookup + `NotFoundError`, `getJoinTokenForAppointment` bridge with-and-without session row, provider lookup, end-session terminal behavior.
  - `backend/tests/unit/services/video-session-twilio.test.ts` — 12 tests; renamed from `consultation-room-service.test.ts` and extended with adapter-object coverage (`createSession`, `getJoinToken` doctor/patient identity, `endSession` happy path + 20404 swallow).
- [x] **Type-check + lint clean** on every touched file (`npx tsc --noEmit` exit 0; ReadLints clean on all 6 touched files).

---

## DDL — `backend/migrations/049_consultation_sessions.sql`

```sql
-- ============================================================================
-- Multi-modality consultation sessions (Decision 8 LOCKED)
-- ============================================================================
-- Migration: 049_consultation_sessions.sql
-- Date:      2026-04-19
-- Description:
--   Generalize video-only `appointments.consultation_room_*` scaffolding into
--   a modality-blind `consultation_sessions` table that supports text, voice,
--   and video behind a single FK. Lazy-write during cutover; legacy columns
--   stay populated until 049-followup migration drops them (~14 days later).
-- ============================================================================

CREATE TYPE consultation_modality AS ENUM ('text', 'voice', 'video');
CREATE TYPE consultation_status   AS ENUM ('scheduled', 'live', 'ended', 'no_show', 'cancelled');

CREATE TABLE consultation_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id            UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  doctor_id                 UUID NOT NULL,
  patient_id                UUID NOT NULL,

  modality                  consultation_modality NOT NULL,
  status                    consultation_status   NOT NULL DEFAULT 'scheduled',

  provider                  TEXT NOT NULL,
  provider_session_id       TEXT,

  scheduled_start_at        TIMESTAMPTZ NOT NULL,
  expected_end_at           TIMESTAMPTZ NOT NULL,
  actual_started_at         TIMESTAMPTZ,
  actual_ended_at           TIMESTAMPTZ,

  doctor_joined_at          TIMESTAMPTZ,
  patient_joined_at         TIMESTAMPTZ,

  recording_consent_at_book BOOLEAN,
  recording_artifact_ref    TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultation_sessions_appointment       ON consultation_sessions(appointment_id);
CREATE INDEX idx_consultation_sessions_doctor_status     ON consultation_sessions(doctor_id, status);
CREATE INDEX idx_consultation_sessions_provider_session  ON consultation_sessions(provider, provider_session_id);

-- ============================================================================
-- RLS — both parties of the session can read; service role writes
-- ============================================================================
ALTER TABLE consultation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultation_sessions_select ON consultation_sessions
  FOR SELECT
  USING (doctor_id = auth.uid() OR patient_id = auth.uid());
```

**Notes on the schema:**
- `recording_consent_at_book` is denormalized from `appointments` (Plan 02 ships the source-of-truth column there); shipping the column now lets the read path stay one-table-only.
- `provider` is a free-text TEXT (not an enum) so a future `whatsapp` / `pstn` provider can be registered without a schema bump.
- `expected_end_at` denormalized from `appointment.scheduled_at + appointment.duration_minutes`; the facade computes it on insert.

---

## Facade interface — `backend/src/services/consultation-session-service.ts`

```ts
import type { videoSessionTwilioAdapter } from './video-session-twilio';
// (voice + text adapters from Plans 05 / 04 — not registered here in this task)

export type Modality = 'text' | 'voice' | 'video';

export type CreateSessionInput = {
  appointmentId: string;
  doctorId:      string;
  patientId:     string;
  modality:      Modality;
  scheduledStartAt: Date;
  expectedEndAt:    Date;
  recordingConsentAtBook?: boolean;     // Plan 02 will pass this
};

export type SessionRecord = {
  id:                  string;
  modality:            Modality;
  provider:            string;
  providerSessionId?:  string;
  joinUrl:             string;            // for the inviting party (caller of createSession)
  // ... (full shape defined alongside type)
};

export type JoinToken = {
  token:     string;
  expiresAt: Date;
};

export interface ConsultationSessionAdapter {
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  endSession(sessionId: string): Promise<void>;
  getJoinToken(sessionId: string, role: 'doctor' | 'patient'): Promise<JoinToken>;
}

const adapters: Record<Modality, () => ConsultationSessionAdapter> = {
  video: () => videoSessionTwilioAdapter,
  voice: () => { throw new Error('Voice adapter ships in Plan 05'); },
  text:  () => { throw new Error('Text adapter ships in Plan 04'); },
};

export async function createSession(input: CreateSessionInput): Promise<SessionRecord> {
  const adapter = adapters[input.modality]();
  const session = await adapter.createSession(input);
  await persistSessionRow(session, input);   // INSERT consultation_sessions
  return session;
}

export async function endSession(sessionId: string): Promise<void> { /* … */ }
export async function getJoinToken(sessionId: string, role: 'doctor' | 'patient'): Promise<JoinToken> { /* … */ }
```

**Adapter registration is by-modality only.** Don't pre-register voice or text — let them throw, so the test suite catches premature wiring before Plans 04/05 actually land.

---

## Lazy-write behavior (the part that's easy to get wrong)

The facade's `persistSessionRow()` writes into `consultation_sessions` for every new call. The existing `appointment-service.ts` and `consultation-verification-service.ts` paths that today read/write `appointments.consultation_room_*` keep doing that — both writes happen for every new video session for the duration of the cutover window.

In code:

```ts
async function persistSessionRow(session: SessionRecord, input: CreateSessionInput): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  await admin.from('consultation_sessions').insert({
    id:                  session.id,
    appointment_id:      input.appointmentId,
    doctor_id:           input.doctorId,
    patient_id:          input.patientId,
    modality:            input.modality,
    provider:            session.provider,
    provider_session_id: session.providerSessionId,
    scheduled_start_at:  input.scheduledStartAt,
    expected_end_at:     input.expectedEndAt,
    recording_consent_at_book: input.recordingConsentAtBook ?? null,
    status:              'scheduled',
  });
}
```

**Backfill is intentionally NOT in scope.** Existing rows in `appointments` with populated `consultation_room_*` aren't backfilled into `consultation_sessions` — they finish on the legacy path and don't need the new row. Task 35 verifies zero in-flight rows on legacy columns before dropping them.

---

## Out of scope

- Adding voice or text adapter implementations (Plans 04 + 05).
- Backfilling historical video appointments into `consultation_sessions`. Lazy-write is the explicit strategy.
- Dropping the legacy `appointments.consultation_room_*` columns. Task 35 ships that ~14 days post-cutover.
- Frontend changes — Plan 03 (`<ConsultationLauncher>` / `<LiveConsultPanel>`) consumes the facade.
- Recording consent column on `appointments`. Plan 02 (Task 27) owns that. The `recording_consent_at_book` column on `consultation_sessions` is created here for forward-compat but stays NULL until Task 27 ships.
- Notification fan-out. Task 16 wires that on top of this facade.

---

## Files expected to touch

**Backend:**
- `backend/migrations/049_consultation_sessions.sql` — new
- `backend/src/services/consultation-room-service.ts` — **rename** to `video-session-twilio.ts`; update file-header comment
- `backend/src/services/consultation-session-service.ts` — new facade
- `backend/src/services/appointment-service.ts` — update import path; route through facade instead of importing video adapter directly
- `backend/src/services/consultation-verification-service.ts` — extend to also write into `consultation_sessions` rows (lazy-write side); read path unchanged for now
- `backend/src/types/consultation-session.ts` — new types file (`Modality`, `Provider`, `SessionRecord`, `CreateSessionInput`, `JoinToken`, `ConsultationSessionAdapter`)

**Tests:**
- `backend/tests/unit/services/consultation-session-service.test.ts` — new (facade routing, throw branches for voice/text, lazy-write side-effect)
- `backend/tests/unit/services/video-session-twilio.test.ts` — renamed from existing `consultation-room-service.test.ts` if present; otherwise new

---

## Notes / open decisions

1. **`expected_end_at` source.** Originally proposed to read `appointment.scheduled_at + appointment.duration_minutes`. **Reality (audit during implementation):** `appointments` has no `duration_minutes` column; the closest equivalent is `env.SLOT_INTERVAL_MINUTES` (default 30). `startConsultation` now derives `expectedEndAt = appointment_date + SLOT_INTERVAL_MINUTES`. When Plan 02 introduces a per-appointment duration column, swap this default out at the call site.
2. **`provider` string for video.** Uses `'twilio_video'`. Plan 05's voice adapter will register as `'twilio_video_audio'` (already declared in `Provider` union in `types/consultation-session.ts`) so the two share the underlying Twilio Video machinery without colliding on `(provider, provider_session_id)` lookups. Plan 04's text adapter will register as `'supabase_realtime'`.
3. **`provider_session_id` for video.** Reuses Twilio Video room SID — same value as `appointments.consultation_room_sid` during the lazy-write window. Provider lookup index is partial (`WHERE provider_session_id IS NOT NULL`) so rows that haven't been provisioned yet don't bloat the index.
4. **Session-row UPDATE pathways.** Implemented as `updateSessionStatus(sessionId, status, { actualStartedAt?, actualEndedAt? })` and `markParticipantJoined(sessionId, role, joinedAt)` on the facade. `consultation-verification-service.ts` is the only consumer today (via the local `mirrorTwilioRoomEventToSession` helper).
5. **Migration number.** Tip was at 048; this task ships 049. If a parallel PR pre-empts this number rebase to the next free integer — no semantic dependency on the value.
6. **`appointments.patient_id` is nullable** (guest bookings without a linked `patients` row). To match reality the new `consultation_sessions.patient_id` column is also nullable, with the RLS `SELECT` policy guarding the `auth.uid()` comparison behind `IS NOT NULL`. Adapters that need a patient identity derive it from `appointmentId` instead (Twilio Video uses `patient-{appointmentId}`).
7. **Task 35 drop-list correction needed (follow-up).** Task 35's drop migration template currently lists columns that don't exist on `appointments` (`consultation_room_status`, `consultation_room_provider`, `consultation_recording_status`, `consultation_recording_artifact_ref`) and omits columns that do exist (`doctor_joined_at`, `patient_joined_at`, `doctor_left_at`, `patient_left_at`, `consultation_duration_seconds`). Update Task 35 before it runs to drop the actually-existing legacy columns from migration 021. **Not blocking Task 15.**

---

## References

- **Plan:** [plan-01-foundation-consultation-sessions.md](../Plans/plan-01-foundation-consultation-sessions.md) — full schema rationale
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 8 LOCKED entry
- **Today's video service:** `backend/src/services/consultation-room-service.ts` (the rename target)
- **Today's video columns:** `backend/migrations/021_appointments_consultation_room.sql`
- **Today's modality column:** `backend/migrations/013_appointments_consultation_type.sql` (drives `consultation_sessions.modality` on insert)
- **Single existing caller:** `backend/src/services/appointment-service.ts:23` (imports from `./consultation-room-service`)

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Implementation complete (2026-04-19); pending PR + production smoke test
