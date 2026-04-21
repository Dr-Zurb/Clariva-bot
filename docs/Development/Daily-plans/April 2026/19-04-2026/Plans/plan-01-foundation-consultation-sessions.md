# Plan 01 — Foundation: `consultation_sessions` schema + modality-agnostic facade + notification fan-out + IG phone capture

## Carve out the modality-blind backbone every other plan builds on top of

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 8 (one `consultation_sessions` table for all three modalities) LOCKED. Notification fan-out for clinical urgent moments (LOCKED). Phase A scope.
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). This plan is the **first** in the sequence — no hard dependencies; existing video room keeps working uninterrupted via lazy-write.

---

## Goal

Land the schema and the service-layer facade that every modality (text, voice, video) reads and writes through. After this plan ships:

- A new `consultation_sessions` table exists, generalized over `(modality, provider, provider_session_id)` per Decision 8 LOCKED.
- `consultation-room-service.ts` (today's video-only Twilio wrapper) is renamed to `video-session-twilio.ts` and becomes one adapter behind a new modality-agnostic `consultation-session-service.ts` facade.
- Notification fan-out helpers (`sendConsultationReadyToPatient`, `sendPrescriptionReadyToPatient`) exist, modeled on the existing `sendPrescriptionToPatient` parallel-fanout shape — so when text/voice ship in Plans 04 + 05, the urgent-moment notification path is already there.
- The IG-bot booking flow has been audited (and minimally extended if needed) to confirm we capture `patient_phone` for SMS fan-out — without this, fan-out has nothing to fan out to.

This plan does **not** ship any new modality. It refactors the existing video flow to read/write through the new facade with **lazy-write** semantics so live calls aren't disrupted.

---

## Companion plans

- [plan-02-recording-governance-foundation.md](./plan-02-recording-governance-foundation.md) — depends on the `consultation_sessions.id` shipped here as its FK source.
- [plan-03-doctor-modality-launcher.md](./plan-03-doctor-modality-launcher.md) — depends on this facade for `createSession()`.
- [plan-04-text-consultation-supabase.md](./plan-04-text-consultation-supabase.md), [plan-05-voice-consultation-twilio.md](./plan-05-voice-consultation-twilio.md) — both ship as new adapters behind this facade.

---

## Audit summary (current code)

### What exists today (we keep / extend / rename — never delete)

| Component | Path | Plan-01 disposition |
|-----------|------|---------------------|
| Twilio Video room creation, token mint, recording lifecycle | `backend/src/services/consultation-room-service.ts` | **Rename** to `video-session-twilio.ts`; becomes adapter behind facade. **No behavioral change.** |
| Video columns on `appointments`: `consultation_room_sid`, `consultation_started_at`, `consultation_ended_at`, `consultation_room_status`, `consultation_recording_*` | `backend/migrations/021_appointments_consultation_room.sql` | **Stay during cutover.** Lazy-write strategy: existing live calls keep using these columns until ended; only **new** calls go through the new table. Drop migration ships ~14 days post-cutover (master-plan Task 35). |
| Video room frontend | `frontend/components/consultation/VideoRoom.tsx` | **No change in this plan.** Reads via the facade in Plan 03. |
| Existing `notification-service.ts` cascade pattern | `backend/src/services/notification-service.ts` (existing helpers like `sendPrescriptionToPatient`) | **Extend** with new fan-out helpers; cascade helpers stay for non-urgent. |
| SMS infra | `backend/src/services/twilio-sms-service.ts` | **Read-only consume** — already exists. |
| `consultation_type` column on `appointments` | `backend/migrations/013_appointments_consultation_type.sql` | **Read-only consume** — value drives the new `consultation_sessions.modality` column. |

### What's missing (this plan delivers)

| Gap | Why it's foundational |
|-----|-----------------------|
| **No modality-blind session table.** Every consult artifact is bolted onto `appointments`. | Plans 04, 05, 06, 07, 08, 09 all need a single FK target. Without this, every plan re-invents its own state model. |
| **No facade in front of Twilio.** `consultation-room-service.ts` is called directly from controllers + workers + frontend token endpoint. | Plans 04, 05 cannot add a second/third adapter without an interface. |
| **No fan-out helper for urgent moments.** Existing `sendPrescriptionToPatient` is the right shape but per-prescription, not per-modality-event. | Plans 04 + 05 both need to fire `sendConsultationReadyToPatient` when their session is joinable. |
| **IG-bot phone capture not verified.** SMS fan-out fails silently if `patient_phone` is null on a high % of bookings. | Decision: notification fan-out LOCKED for urgent moments. If phone capture is broken, fan-out degrades to email + IG only — acceptable but must be **measured** before Plan 04 ships. |

---

## Tasks (from the master plan, in implementation order)

| # | Master-plan task | Phase | Effort | Risk |
|---|------------------|-------|--------|------|
| 14 | A.0 — Verify (and minimally extend if needed) IG-bot booking flow captures `patient_phone` for SMS fan-out | A.0 | ≤2h | Low — read-only audit + tiny conversation-state extension if missing |
| 15 | A — Generalize video scaffolding into `consultation-session-service.ts` facade + new `consultation_sessions` table per Decision 8 LOCKED schema | A | 4–6h | **Medium** — schema migration with lazy-write strategy; needs a clean rename pass on every caller of today's `consultation-room-service.ts` |
| 16 | A / E — Multi-channel notification fan-out helpers (`sendConsultationReadyToPatient`, `sendPrescriptionReadyToPatient`) modeled on `sendPrescriptionToPatient` | A | ~3h | Low — additive helpers; existing cascade helpers untouched |
| 35 | A (Decision 8 follow-up) — Post-cutover drop migration removing obsolete consultation columns from `appointments` | A | ~1h | Low — ships **~14 days after Task 15 lands**, once dashboards confirm no in-flight rows still rely on the old columns |

**Suggested order:** 14 (parallel-or-first; cheap audit) → 15 (the heavy one — single big PR) → 16 (parallel with 15 if a second engineer is available; otherwise after) → 35 (~14 days later, gated on telemetry).

---

## Target schema (Decision 8 LOCKED — copied from master plan for in-place reference)

```sql
CREATE TYPE consultation_modality AS ENUM ('text', 'voice', 'video');
CREATE TYPE consultation_status   AS ENUM ('scheduled', 'live', 'ended', 'no_show', 'cancelled');

CREATE TABLE consultation_sessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id           UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  doctor_id                UUID NOT NULL REFERENCES doctors(id),
  patient_id               UUID NOT NULL REFERENCES patients(id),

  modality                 consultation_modality NOT NULL,
  status                   consultation_status   NOT NULL DEFAULT 'scheduled',

  provider                 TEXT NOT NULL,            -- 'twilio_video' | 'supabase_realtime'
  provider_session_id      TEXT,                     -- room SID, channel ID, etc.

  scheduled_start_at       TIMESTAMPTZ NOT NULL,
  expected_end_at          TIMESTAMPTZ NOT NULL,
  actual_started_at        TIMESTAMPTZ,
  actual_ended_at          TIMESTAMPTZ,

  doctor_joined_at         TIMESTAMPTZ,
  patient_joined_at        TIMESTAMPTZ,

  recording_consent_at_book BOOLEAN,                 -- mirror of appointments.recording_consent_decision (denormalized for fast read)
  recording_artifact_ref    TEXT,                    -- generic; per-modality adapters interpret

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultation_sessions_appointment ON consultation_sessions(appointment_id);
CREATE INDEX idx_consultation_sessions_doctor_status ON consultation_sessions(doctor_id, status);
CREATE INDEX idx_consultation_sessions_provider_session ON consultation_sessions(provider, provider_session_id);
```

**Lazy-write strategy:** the migration creates the table empty. The facade's `createSession()` writes into it for every **new** call. Existing in-flight video rooms continue to read/write the legacy `appointments.consultation_room_*` columns until they hit `ended`. After 14 days (Task 35), once telemetry confirms zero rows in `appointments.consultation_room_status IN ('scheduled','live')`, the legacy columns are dropped via a single `ALTER TABLE` migration.

---

## Facade interface (Task 15 — implementation contract)

```ts
// backend/src/services/consultation-session-service.ts (NEW)

export interface ConsultationSessionAdapter {
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  endSession(sessionId: string): Promise<void>;
  getJoinToken(sessionId: string, role: 'doctor' | 'patient'): Promise<JoinToken>;
  // (more methods land in Plans 04 / 05 — `sendMessage` for text adapter, etc.)
}

const adapters: Record<Modality, ConsultationSessionAdapter> = {
  video: videoSessionTwilioAdapter, // = today's renamed consultation-room-service.ts
  voice: () => { throw new Error('Voice adapter ships in Plan 05'); },
  text:  () => { throw new Error('Text adapter ships in Plan 04'); },
};

export async function createSession(input: CreateSessionInput): Promise<SessionRecord> {
  const adapter = adapters[input.modality];
  const session = await adapter.createSession(input);
  await persistSessionRow(session); // writes into consultation_sessions
  return session;
}
```

**Key invariant:** every caller — controllers, webhook handlers, frontend `/token` endpoint — goes through this facade. **No direct calls to `consultation-room-service.ts` (renamed `video-session-twilio.ts`) survive after Task 15.** A grep at PR-time should return zero matches outside the adapter file itself.

---

## Notification fan-out (Task 16 — implementation contract)

```ts
// backend/src/services/notification-service.ts (EXTEND)

// EXISTING (cascade pattern — keep as-is for non-urgent):
//   sendConsultationLinkToPatient(...)         // booking confirmation
//   sendAppointmentReminder24h(...)             // day-before reminder

// NEW (fan-out pattern — clinical urgent moments):
export async function sendConsultationReadyToPatient(input: {
  appointmentId: string;
  patientId: string;
  modality: Modality;
  joinUrl: string;
}): Promise<FanOutResult> {
  // Fire all three in parallel; collect successes; log failures.
  // Channels: SMS (twilio-sms-service.ts), email (existing), IG DM (existing).
  // No "first wins" — redundancy is the point.
}

export async function sendPrescriptionReadyToPatient(input: {
  appointmentId: string;
  patientId: string;
  prescriptionId: string;
  pdfUrl: string;
}): Promise<FanOutResult> { /* same pattern */ }
```

The existing `sendPrescriptionToPatient` already fans out — Task 16 is essentially "copy that shape, give it two new entry points named for the clinical moment." Returns a `FanOutResult` record that records which channels succeeded so dashboards can spot patterns (e.g. SMS failing 30% of the time in a region).

---

## Phase A.0 deep dive (Task 14 — IG-bot phone capture)

**What to verify:**

1. Open `backend/src/workers/instagram-dm-webhook-handler.ts` and trace the booking conversation state machine.
2. Confirm a state collects `patient_phone` (E.164 format, validated) before `awaiting_payment`.
3. Confirm `appointments.patient_phone` (or whichever table the booking writes to) is **not nullable** by the time the appointment is `confirmed`.
4. If a step is missing, add a `collectPhoneForSms` state with copy: *"What's the best phone number to send appointment reminders + the consult link to? (we use SMS as a backup if you can't reach the IG message)"*
5. Backfill any existing `patient_phone IS NULL` rows by re-prompting on the next IG interaction (don't silently break them).

**Acceptance:** new bookings reach `confirmed` with `patient_phone IS NOT NULL` >99.5% of the time over a 7-day rolling window. Surface the metric in the existing ops dashboard.

---

## Files expected to touch

**Backend:**

- `backend/src/services/consultation-room-service.ts` → **renamed** to `backend/src/services/video-session-twilio.ts`. Behavior unchanged.
- `backend/src/services/consultation-session-service.ts` (**new** — modality-agnostic facade)
- `backend/src/services/consultation-verification-service.ts` (**extend** to read/write the new `consultation_sessions` row alongside today's `appointments` columns during the lazy-write window)
- `backend/src/services/notification-service.ts` (**extend** with `sendConsultationReadyToPatient` + `sendPrescriptionReadyToPatient`)
- `backend/src/types/consultation-session.ts` (**new** — `Modality`, `Provider`, `SessionRecord`, `CreateSessionInput`, `JoinToken` types)
- `backend/src/workers/instagram-dm-webhook-handler.ts` (**audit; extend only if phone-capture step missing**)
- `backend/src/utils/dm-copy.ts` (**extend only if** new phone-capture step lands → add `buildPhoneCapturePrompt` + `buildPhoneCaptureRetry`)
- DB migration: **new** `consultation_sessions` table (Migration ~022 or next free number)
- DB migration (Task 35, ships ~14 days later): drop `appointments.consultation_room_*` columns

**Tests:**

- `backend/tests/unit/services/consultation-session-service.test.ts` (new — facade routing, lazy-write semantics, persists row)
- `backend/tests/unit/services/notification-service-fanout.test.ts` (new — fan-out helpers fire all channels in parallel, partial-failure tolerance)
- `backend/tests/unit/workers/instagram-dm-webhook-phone-capture.test.ts` (new only if phone-capture step lands)

**Frontend:** none in this plan. Plan 03 picks up the consumer side.

---

## Acceptance criteria

- [ ] **Task 14:** booking phone-capture rate measured + ≥99.5% confirmed for new bookings, backfill plan documented for legacy null rows.
- [ ] **Task 15:** `consultation_sessions` table created via migration; `consultation-room-service.ts` renamed to `video-session-twilio.ts`; new `consultation-session-service.ts` facade exists; **every caller of the old service is updated** to go through the facade (PR-time grep returns zero direct callers); existing video-room flow continues to work end-to-end (smoke test: book a video appointment, doctor + patient join, both sides see each other, recording fires, prescription delivered); new `consultation_sessions` rows are written for every new video booking; old `appointments.consultation_room_*` columns continue to be written during the lazy-write window.
- [ ] **Task 16:** `sendConsultationReadyToPatient` + `sendPrescriptionReadyToPatient` exist; both fan out to SMS + email + IG DM in parallel; partial-failure tolerated; `FanOutResult` returned + logged.
- [ ] **Task 35 (~14 days post-15):** dashboard confirms no `appointments.consultation_room_status IN ('scheduled','live')` rows; drop migration shipped; PR-time grep confirms zero readers of the dropped columns.
- [ ] All new code passes `tsc --noEmit` + `eslint` clean.
- [ ] Backend regression suite stays green (no test-count regression).

---

## Open questions / decisions for during implementation

1. **Migration number:** what's the next free migration number after `021_appointments_consultation_room.sql`? Likely `022_*` but verify with `ls backend/migrations/` before creating.
2. **`consultation_sessions.recording_consent_at_book`** is denormalized from `appointments` for fast read. Plan 02 owns the source-of-truth columns on `appointments`. Decide whether to ship the denormalized column in Plan 01 (preferred — one schema migration) or split it out (one less column at first, but a later schema bump).
3. **Provider strings:** `'twilio_video'` covers both video-with-camera and audio-only-as-voice (Decision 2 LOCKED — voice = video-with-camera-off). For `'supabase_realtime'` text, the `provider_session_id` is the Realtime channel name. Document this in `consultation-session.ts` type comments.
4. **Lazy-write cutover telemetry:** what specific dashboard query will confirm "no in-flight rows on legacy columns" before Task 35 fires? Likely a Supabase studio query against `appointments WHERE consultation_room_status IN ('scheduled','live')`. Record the query in the Task 35 file.

---

## Non-goals

- No new modality ships in this plan. Text and voice land in Plans 04 + 05.
- No frontend changes in this plan. The launcher UI lands in Plan 03.
- No recording consent UI in this plan. Plan 02 owns that.
- No mid-consult modality switching. Plan 09 owns that and depends on this facade.

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 8 LOCKED entry has the full rationale for one-table-per-three-modalities.
- **Today's video room service:** `backend/src/services/consultation-room-service.ts`
- **Today's video room migration:** `backend/migrations/021_appointments_consultation_room.sql`
- **Today's `consultation_type` column:** `backend/migrations/013_appointments_consultation_type.sql`
- **Existing notification cascade:** `backend/src/services/notification-service.ts`
- **Existing SMS service:** `backend/src/services/twilio-sms-service.ts`
- **IG-bot booking handler:** `backend/src/workers/instagram-dm-webhook-handler.ts`

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Drafted; ready for owner review and implementation start. No hard blockers.
