# Task vna-02: Session identity for a walk-in visit

> **Filename:** `task-vna-02-walkin-session-identity.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> ⛔ **BLOCKED — needs `vna-01` green + VNA-Q1 decided.** §0 is expected to STOP.
> ⚠️ **This task may contain an irreversible operation.** Postgres cannot drop an ENUM value.

---

## 📋 Task Overview

Give a walk-in visit the identity that every piece of recording machinery in this codebase already assumes exists: a `consultation_sessions` row. Without it, room audio cannot be registered for retention, a transcript cannot be stored, and Phase 2's extract route has nothing to key on.

This is the phase's dependency cliff. It is also the finding most likely to be missed by anyone estimating Phase 3 from the outside, because from the UI a walk-in looks like just another appointment.

**Program / Phase:** visit-narrative · Phase 3 (ambient walk-in)
**Batch:** [`plan-p3-visit-narrative-ambient-walkin-batch.md`](../plan-p3-visit-narrative-ambient-walkin-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md`](./EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md)
**Estimated Time:** ~5 hours
**Status:** ⛔ **BLOCKED — not started**
**Completed:** —

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — a shipped ENUM and the session-creation path (under VNA-Q1 = (a))

**Current State:** (checked against the codebase, 2026-08-31)
- ✅ **What exists:** `049_consultation_sessions.sql` — `CREATE TYPE consultation_modality AS ENUM ('text', 'voice', 'video')`. `consultation_sessions.modality` is that ENUM, `NOT NULL`. Also `NOT NULL`: `appointment_id` (FK → `appointments`, CASCADE), `doctor_id`, `provider`, `scheduled_start_at`, `expected_end_at`, `status` (`consultation_status`, default `scheduled`). `provider_session_id` is uniquely indexed **where not null**.
- ✅ **What exists:** `056_recording_artifact_index.sql` — `session_id UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE RESTRICT`, with a header note that a cascading delete from `consultation_sessions` would bypass `archival_history` logging and is treated as a bug. **This is why VNA-D4 forces this task to exist.**
- ✅ **What exists:** `061_consultation_transcripts.sql` — `consultation_session_id NOT NULL` FK, CASCADE.
- ✅ **What exists:** `199_billing_usage_ledger.sql` — `modality TEXT NOT NULL CHECK (modality IN ('video','voice','text','in_person'))`. **The billing layer already has a name for an in-person visit.** The session layer does not. Reuse that spelling — `in_person` — and do not invent `walkin` / `offline` / `opd`.
- ✅ **What exists — walk-in identity, at the appointment level, three ways:** `consultation_type = 'in_clinic'` (`013`; free text with **no DB CHECK** — the API validates the four values), `booking_origin = 'walk_in'` (`192`, `NOT NULL` with a CHECK that includes it), and `patient_checked_in_at` (`193`). Plus an OPD token via `opd_queue_entries` (`028`). So appointment identity is not the problem — session identity is.
- ✅ **What exists — the in-clinic visit lifecycle, with no session in it:** `PatientProfilePage.handleStartConsult` routes an in-clinic start to `postAppointmentCheckIn` (no Twilio, no session), and `wrapUpAppointment` ends the visit, billing it as `in_person`. **Those two moments are the natural create/close points for a walk-in session row** — see §3.1.
- ⚠️ **Notes:** `provider` is `NOT NULL` and the registered values are `twilio_video`, `twilio_video_audio`, `supabase_realtime`. A room microphone is none of them, so option (a) needs a **new provider string as well as a new modality value** — two additions, not one.
- ⚠️ **Notes:** `consultation_sessions` already carries `recording_consent_at_book` and `recording_artifact_ref`. Check whether either is the right home for `vna-01`'s consent linkage before adding anything.
- ⚠️ **Notes:** `patient_checked_in_at` is **overloaded** — `193` introduced it for teleconsult lobby presence, and desk check-in stamps the same column. Do not read it as "the patient is physically here" on its own.
- ❌ **What's missing:** any way for an in-person visit to hold a session row, and therefore any way for it to hold a governed audio artifact or a transcript.
- ⚠️ **Notes:** `075` / `076` introduced `modality_initiator` + `consultation_modality` ENUM usage into the mid-consult modality state machine, and `070`'s header notes `voice_consult_sessions.modality` is read "across the codebase". **Widening this ENUM widens every one of those branches silently** — a `switch` gains an unhandled case with no compile error where the value is typed as a string.
- ⚠️ **Notes:** `provider`, `scheduled_start_at`, `expected_end_at` are `NOT NULL` and a walk-in has no provider and possibly no schedule. Whatever goes there is a **convention that outlives this phase** — document it in the migration header, do not let it be an accident of the first insert.

**Scope Guard:**
- Expected files touched: ≤ 6 (migration, session-creation service, `database.ts`, `DB_SCHEMA.md`, at most two modality branch sites).
- **No ALTER of `consultation_transcripts`, `recording_artifact_index`, `archival_history`, or `appointments`.**
- No change to the Twilio room / recording / composition path.
- No change to the retention, archival, hard-delete, or erasure workers — they are consumed, not modified (VNA-D4).
- No audio, no capture, no transcription in this task.
- Any expansion requires explicit approval.

**Reference Documentation:**
- Batch VNA-Q1 (the decision), VNA-D4 (why it is a gate)
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) — §"Before creating a migration (MANDATORY)", RLS Migration Safety
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4
- [DB_SCHEMA.md](../../../../../../../Reference/engineering/architecture/DB_SCHEMA.md)

---

## ✅ Task Breakdown (Hierarchical)

### 0. Pre-flight — **expected to STOP**
- [ ] 0.1 `vna-01`'s gate green? If not → **STOP**. There is no reason to give a walk-in a recording identity before it is lawful to record one.
- [ ] 0.2 VNA-Q1 decided by the owner with an actual answer, not the plan's recommendation? If `⟨fill⟩` → **STOP**.
- [ ] 0.3 Read all migrations in numeric order per MIGRATIONS_AND_CHANGE.md. Focused read: `049`, `056`, `061`, `075`, `076`, `199`, `223`, `224`.
- [ ] 0.4 Confirm the next migration number is unclaimed (highest at draft time: `224`).

### 1. The pre-ALTER grep — **mandatory, before any SQL** (if VNA-Q1 = (a))
- [ ] 1.1 Enumerate **every** read of `consultation_modality` / `modality` / `current_modality` across `backend/` and `frontend/` in this file. Not a count — a list.
- [ ] 1.2 For each: state whether the in-person case is handled, or explicitly deferred with a reason. Exhaustive `switch` statements that would newly fall through are the dangerous ones.
- [ ] 1.3 Call out any branch that would silently mis-bill, mis-route, or mis-report an in-person session (`199`'s ledger is the obvious one; the mid-consult state machine in `076` is the subtle one).
- [ ] 1.4 If the list is longer than the Scope Guard's file budget → **STOP and surface.** Do not start a cross-cutting refactor inside this task.

### 2. The migration
- [ ] 2.1 Per VNA-Q1's answer, land the identity change. Under (a): add the `in_person` value using the spelling `199` already uses.
- [ ] 2.2 State plainly in the migration header **which parts are irreversible** and what the reverse does and does not undo. An ENUM value cannot be dropped; do not imply otherwise.
- [ ] 2.3 Document the convention for the `NOT NULL` columns a walk-in cannot naturally fill (`provider`, `scheduled_start_at`, `expected_end_at`) in the header, as a decision.
- [ ] 2.4 Re-runnable. `IF NOT EXISTS` / guarded `DO $$` blocks throughout, matching `049`'s own ENUM-creation guard.
- [ ] 2.5 No ALTER of any other table (Scope Guard).

### 3. Session creation for a walk-in
- [ ] 3.1 A walk-in visit acquires a session row at a defined moment. The two candidates are the existing in-clinic lifecycle points: `handleStartConsult` → `postAppointmentCheckIn`, or first arm. **Prefer first arm** — a session row created for every walk-in whether or not it is ever recorded is retention surface with no purpose, and `056`'s `ON DELETE RESTRICT` makes it permanent once an artifact attaches.
- [ ] 3.1.1 Close it at `wrapUpAppointment`, which already ends a `live` session when one exists — so the close path is inherited rather than invented.
- [ ] 3.2 Idempotent: arming twice, or a double-click, must not create two sessions for one appointment.
- [ ] 3.3 The row joins cleanly to `recording_artifact_index` and `consultation_transcripts` **without altering either** — this is the whole point of the task.

### 4. Types + docs
- [ ] 4.1 `backend/src/types/database.ts` — modality union updated; every switch the compiler now flags is handled or explicitly deferred.
- [ ] 4.2 `DB_SCHEMA.md` updated, including the `NOT NULL` conventions from 2.3.
- [ ] 4.3 Backfill question answered explicitly: **historical walk-in appointments get no session row.** Write that down.

### 5. Verification & Testing
- [ ] 5.1 Migration applies; re-applies as a no-op. **Operator** — no `psql` / `DATABASE_URL` / logged-in Supabase CLI in this environment (same constraint `vnt-01` §4 hit).
- [ ] 5.2 A walk-in session row can be referenced by `recording_artifact_index` and `consultation_transcripts`.
- [ ] 5.3 **Teleconsult regression:** existing voice / video / text sessions behave identically. Existing consultation, modality-change, and recording suites green.
- [ ] 5.4 Idempotency test for 3.2.
- [ ] 5.5 `npx tsc --noEmit` + lint clean.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/2NN_<walkin_session_identity>.sql
UPDATE: backend/src/types/database.ts
UPDATE: the consultation-session creation service
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md
MAYBE:  ≤ 2 modality branch sites surfaced by §1
```

**Existing Code Status:**
- ✅ `backend/migrations/049_consultation_sessions.sql` — EXISTS (the ENUM's origin).
- ✅ `backend/migrations/056_recording_artifact_index.sql` — EXISTS. **Not modified.**
- ✅ `backend/migrations/061_consultation_transcripts.sql` — EXISTS. **Not modified.**
- ✅ `backend/migrations/199_billing_usage_ledger.sql` — EXISTS. Source of the `in_person` spelling.

**When creating a migration:** (MANDATORY)
- [ ] Read all previous migrations in numeric order — see [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Irreversible operations get a header that says so.** The reverse block must not imply an ENUM value can be dropped.
- **`in_person`, not a fourth spelling.** `199` already chose; a second name for the same concept is a future bug.
- **The grep comes before the SQL.** An ENUM widened before its readers are enumerated is a silent-failure generator.
- **A session row that exists only to hold audio should be created only when audio is about to exist** (3.1).
- **Do not touch the retention machinery to make this easier.** If the join cannot be made to work without altering `056` or `061`, that is a **STOP** and VNA-Q1 needs re-answering.
- No PHI in logs.

**DO NOT include:** code, pseudo-code, function signatures, or DDL in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — a shipped type on a PHI-adjacent table.
  - [ ] **RLS verified?** `049`'s existing policies unchanged; confirm a widened ENUM does not widen any policy's reach.
- [ ] **Any PHI in logs?** Must be **no**.
- [ ] **External API or AI call?** No.
- [ ] **Retention / deletion impact?** **Yes, indirectly** — this row is what makes room audio governable at all (VNA-D4). Also confirm the `ON DELETE RESTRICT` on `056` still behaves for a walk-in session.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [ ] VNA-Q1 is recorded with a real answer and the migration matches it.
- [ ] §1's grep list is written into this file — a list, not a count.
- [ ] Migration applies, re-applies as a no-op, documents its reverse, and names what is irreversible.
- [ ] A walk-in session row is referenceable by `recording_artifact_index` and `consultation_transcripts` with **neither table altered**.
- [ ] Session creation is idempotent per appointment.
- [ ] Zero teleconsult regressions; existing suites green.
- [ ] `database.ts` + `DB_SCHEMA.md` updated; backfill answered in writing.
- [ ] Type-check + lint clean.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

⟨fill as executed⟩

---

## 📝 Notes

- `056`'s header is worth reading in full: it deliberately chose `ON DELETE RESTRICT` so that deleting a session cannot silently bypass `archival_history`. That posture is a gift to this phase — it means room audio, once registered, cannot be quietly orphaned. It also means a walk-in session row is effectively permanent once an artifact hangs off it.
- The reason option (c) (a synthetic `voice` session) is rejected in the plan: every "how many voice consults did we do" answer in the product would silently become wrong, forever, and no test would catch it.

---

## 🔗 Related Tasks

- [`task-vna-01-in-room-consent-surface.md`](./task-vna-01-in-room-consent-surface.md) — must be green first
- [`task-vna-03-in-room-audio-capture.md`](./task-vna-03-in-room-audio-capture.md) — first consumer of the session row
- [Phase 2 `vnt-01`](../../p2-transcript-amendment/Tasks/task-vnt-01-narrative-provenance-table.md) — the house migration pattern this task follows (`223`/`224`)

---

**Last Updated:** 2026-08-31
**Completed:** —
**Pattern:** Widen a shipped ENUM behind an enumerated grep; create the session lazily
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
