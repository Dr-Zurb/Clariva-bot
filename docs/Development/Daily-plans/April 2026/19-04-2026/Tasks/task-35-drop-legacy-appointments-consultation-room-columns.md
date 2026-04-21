# Task 35: Drop legacy `appointments.consultation_room_*` columns post-cutover

## 19 April 2026 — Plan [Foundation: consultation_sessions schema + facade + fan-out + IG phone capture](../Plans/plan-01-foundation-consultation-sessions.md) — Phase A (Decision 8 follow-up)

---

## Task overview

Task 15 introduced the `consultation_sessions` table and the modality-blind facade with a **lazy-write strategy**: every new video session is written to **both** the new table and the legacy `appointments.consultation_room_*` columns from `migrations/021_appointments_consultation_room.sql` so in-flight readers don't break. This task closes that loop by dropping the legacy columns once telemetry confirms there's no in-flight code path or row depending on them.

The work is small — one migration, two grep passes, one telemetry confirmation — but the **timing matters**: ship this **at least 14 days after Task 15** lands in production, AND only after the gating dashboard query (below) returns zero rows for at least 7 consecutive days.

The columns dropped:

```text
appointments.consultation_room_sid
appointments.consultation_room_status
appointments.consultation_room_provider
appointments.consultation_started_at
appointments.consultation_ended_at
appointments.consultation_recording_status
appointments.consultation_recording_artifact_ref
(verify exact column list against migration 021 at PR-time)
```

After this task ships, `consultation_sessions` is the only source of truth for any consultation lifecycle field. Any future code reading `appointments.consultation_room_*` will fail at compile time (TypeScript) or query time (Postgres).

**Estimated time:** ~1 hour (actual: ~4 hours — task description understated scope; see Decision log 2026-04-19)

**Status:** Code-complete (2026-04-19). **Merge GATED on Task 15 + 14 days production stability + telemetry green** — see Decision log for the merge-time owner checklist.

**Depends on:** Task 15 (hard); the 14-day cutover window starts the day Task 15 lands in production.

**Plan:** [plan-01-foundation-consultation-sessions.md](../Plans/plan-01-foundation-consultation-sessions.md)

---

## Acceptance criteria

- [ ] **Cutover gate met:** at least 14 calendar days have passed since Task 15 shipped to production AND the gating SQL query (below) has returned zero rows for ≥7 consecutive days. Both confirmations recorded in this task's Decision log with run dates.
- [ ] **PR-time grep clean (TypeScript readers):**
  ```text
  rg "consultation_room_sid|consultation_room_status|consultation_started_at|consultation_ended_at|consultation_recording_status|consultation_recording_artifact_ref" --type ts
  ```
  Returns zero matches outside test fixtures and migration files. If any production code still references these fields, fix it as part of this PR before dropping the columns. Include the grep output in the PR description.
- [ ] **PR-time grep clean (SQL readers):**
  ```text
  rg "consultation_room_(sid|status|provider)|consultation_(started|ended)_at|consultation_recording_(status|artifact_ref)" --type sql
  ```
  Same — zero matches outside `migrations/021_*.sql`, this task's drop migration, and historical migrations.
- [ ] **Drop migration shipped:** `backend/migrations/0NN_drop_appointments_consultation_room_columns.sql` (next free number) drops every column added by `migrations/021_appointments_consultation_room.sql`. Forward + reverse migrations both written. Reverse re-adds the columns as nullable (data is gone but the schema can be reconstructed).
- [ ] **Lazy-write removed:** the dual-write code in `consultation-verification-service.ts` (or wherever Task 15 added it) is removed in the same PR. New sessions write **only** to `consultation_sessions` after this task lands.
- [ ] **Test suite stays green** — no test depends on the legacy columns post-removal.
- [ ] **Type-check + lint clean** on every touched file.

---

## Gating SQL query (run before merge — must return 0 rows for 7 consecutive days)

```sql
-- Must return 0 rows for at least 7 consecutive days before this task can merge.
-- Confirms no in-flight video session is still relying on the legacy columns.
SELECT id, scheduled_at, consultation_room_status
FROM appointments
WHERE consultation_room_status IN ('scheduled', 'live')
  AND scheduled_at > now() - interval '24 hours';
```

Optional secondary check (catches stuck rooms that lazy-write semantics intentionally don't migrate):

```sql
-- Stuck "live" rooms older than 24h — these are the only edge case worth ops attention before drop.
SELECT id, scheduled_at, consultation_room_status, doctor_id
FROM appointments
WHERE consultation_room_status = 'live'
  AND scheduled_at < now() - interval '24 hours'
  AND consultation_ended_at IS NULL;
```

If the secondary check returns rows, those are stuck legacy sessions — close them manually before dropping the columns (or accept that their state will be lost). Document any closures in the Decision log.

| Run date | Primary count | Secondary count | Notes |
|----------|---------------|-----------------|-------|
| (TODO)   |               |                 | Day 1 — must be 0 for 7 days running |
| (TODO)   |               |                 | Day 2 |
| (TODO)   |               |                 | Day 3 |
| (TODO)   |               |                 | Day 4 |
| (TODO)   |               |                 | Day 5 |
| (TODO)   |               |                 | Day 6 |
| (TODO)   |               |                 | Day 7 — green-light merge |

---

## Drop migration template

```sql
-- ============================================================================
-- Drop legacy appointments.consultation_room_* columns post-Decision-8 cutover
-- ============================================================================
-- Migration:   0NN_drop_appointments_consultation_room_columns.sql
-- Date:        TBD (must be ≥ 14 days after migration 049_consultation_sessions.sql shipped)
-- Description:
--   Removes legacy single-column-per-field consultation lifecycle fields from
--   `appointments`. All readers / writers cut over to consultation_sessions table
--   in Task 15 (migration 049). Gating telemetry confirmed no in-flight rows
--   depend on these columns for ≥7 days; see task file Decision log.
-- ============================================================================

ALTER TABLE appointments
  DROP COLUMN IF EXISTS consultation_room_sid,
  DROP COLUMN IF EXISTS consultation_room_status,
  DROP COLUMN IF EXISTS consultation_room_provider,
  DROP COLUMN IF EXISTS consultation_started_at,
  DROP COLUMN IF EXISTS consultation_ended_at,
  DROP COLUMN IF EXISTS consultation_recording_status,
  DROP COLUMN IF EXISTS consultation_recording_artifact_ref;

-- Verify exact column list against migrations/021_appointments_consultation_room.sql
-- before merging. Add or remove DROP COLUMN clauses to match.
```

```sql
-- Reverse migration
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS consultation_room_sid               TEXT,
  ADD COLUMN IF NOT EXISTS consultation_room_status            TEXT,
  ADD COLUMN IF NOT EXISTS consultation_room_provider          TEXT,
  ADD COLUMN IF NOT EXISTS consultation_started_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_ended_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_recording_status       TEXT,
  ADD COLUMN IF NOT EXISTS consultation_recording_artifact_ref TEXT;

-- Note: reverse re-adds the schema but does NOT restore data. If a production
-- rollback is ever needed, also restore from a pre-migration snapshot.
```

---

## Out of scope

- Backfilling historical data into `consultation_sessions`. Lazy-write was the explicit strategy in Task 15 — historical rows finish on the legacy path and are then read-only from a migration-archive table or simply lost (already accepted).
- Dropping or modifying any other `appointments` columns. Only the consultation-room fields from migration 021.
- Frontend changes. The frontend already reads consultation lifecycle from the facade (Plan 03), not directly from the columns.
- Touching `consultation_type` (migration 013). That column **stays** — it's the booking-time intent that drives `consultation_sessions.modality` on insert and is also used for analytics/filtering on the appointments list.

---

## Files expected to touch

**Backend:**

- `backend/migrations/0NN_drop_appointments_consultation_room_columns.sql` — new (number depends on what's free at PR-time; likely 050+ after Tasks 15 and 16 ship)
- `backend/src/services/consultation-verification-service.ts` — remove the lazy-write block added in Task 15
- Any service/worker file that still references the dropped columns (should be zero per the grep gate; if any exist, fix them in this PR)

**Tests:**

- Existing tests should stay green untouched. If any test references the legacy columns (likely some integration / appointment-service tests), update them to read from `consultation_sessions` instead.

---

## Notes / open decisions

1. **Pre-merge production telemetry:** the 7-day green window is non-negotiable. If a busy region has long-running sessions, the window may need to extend (e.g. one full menstrual-cycle / care-episode window for gynecology). Use judgment; document the actual window used in the Decision log.
2. **Rollback plan:** if a regression is discovered post-merge, the reverse migration restores the schema (without data). Production code can fall back to the legacy columns ONLY if Task 15's lazy-write code is also restored (revert that PR). Document this in the PR description.
3. **Data archival:** before dropping, optionally `pg_dump` the columns to a parquet/JSON archive for long-tail audit/legal needs. Not required for v1 (consultation_sessions has parallel data for everything written after Task 15 shipped) but worth a 5-min check with ops before merge.
4. **Coordinate with Plan 02 (Decision 4 — recording governance).** Plan 02 ships the source-of-truth `recording_consent_decision` column on `appointments`. That's a NEW column unrelated to the dropped legacy columns; no conflict. Verify at PR-time.
5. **The drop migration is intentionally idempotent** (`DROP COLUMN IF EXISTS`) so re-running on a partially-cleaned environment is safe.

---

## References

- **Plan:** [plan-01-foundation-consultation-sessions.md](../Plans/plan-01-foundation-consultation-sessions.md) — Task 35 entry + lazy-write rationale
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 8 LOCKED entry
- **Sibling task:** [task-15-consultation-sessions-facade-and-schema.md](./task-15-consultation-sessions-facade-and-schema.md) — the prerequisite that ships the new table + lazy-write
- **Legacy migration being undone:** `backend/migrations/021_appointments_consultation_room.sql`
- **Stays untouched:** `backend/migrations/013_appointments_consultation_type.sql` (`consultation_type` column drives `consultation_sessions.modality`)

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Code-complete (awaiting merge-time gate confirmation) — see Decision log

---

## Decision log

### 2026-04-19 — Code-complete; production gates explicitly deferred to merge-time

**What shipped in this PR**

1. **Drop migration** `backend/migrations/059_drop_legacy_appointments_consultation_room.sql` — drops exactly three columns:
   - `appointments.consultation_room_sid`
   - `appointments.consultation_started_at`
   - `appointments.consultation_ended_at`
2. **Reverse migration** `backend/migrations/060_rollback_drop_legacy_appointments_consultation_room.sql` — re-adds the three columns as nullable and back-fills from `consultation_sessions` (latest session per appointment via `DISTINCT ON`).
3. **Backend readers migrated** away from the dropped columns:
   - `backend/src/services/appointment-service.ts` — `startConsultation` now writes only to `consultation_sessions`; `getConsultationToken` / `getAppointmentById` / `listAppointmentsForDoctor` / `listAppointmentsForPatient` / `getDoctorAppointments` all enrich returned `Appointment` rows with a new `consultation_session` summary via `findLatestAppointmentSessionSummary(Bulk)`.
   - `backend/src/services/consultation-verification-service.ts` — Twilio webhooks now resolve `RoomSid → appointmentId` via `findSessionByProviderSessionId('twilio_video', RoomSid)`; `handleRoomEnded` writes `actual_ended_at` to `consultation_sessions` (no longer to the dropped `appointments.consultation_ended_at`); `tryMarkVerified` reads `actual_ended_at` from `consultation_sessions`.
   - `backend/src/services/opd-snapshot-service.ts` — `buildPatientOpdSnapshot` and `inferDoctorBusySnapshot` read `actual_started_at` / `actual_ended_at` from `consultation_sessions` instead of the dropped `appointments.consultation_*_at` columns.
4. **Session service enrichment helpers added** in `backend/src/services/consultation-session-service.ts`:
   - `AppointmentConsultationSessionSummary` interface (shape exposed on API payloads).
   - `findLatestAppointmentSessionSummary(appointmentId)` (single-row fetch for detail views).
   - `findLatestAppointmentSessionSummariesBulk(appointmentIds)` (bulk fetch for list views; returns `Map<appointmentId, summary>`).
5. **Type updates**:
   - `backend/src/types/database.ts` — removed the three legacy fields from `Appointment`; added `consultation_session?: …` nested summary (not a DB column — populated post-fetch by the enrichment layer).
   - `frontend/types/appointment.ts` — identical change; added exported `ConsultationSessionSummary` interface.
6. **Frontend migrated** to the nested summary:
   - `frontend/components/consultation/AppointmentConsultationActions.tsx` — `consultationStarted` now derives from `appointment.consultation_session?.provider_session_id`.
   - `frontend/components/consultation/ConsultationLauncher.tsx` — same; `existingProviderSessionId` replaces the old `consultation_room_sid` gate.
7. **Tests**:
   - `backend/tests/unit/services/consultation-verification-service.test.ts` — rewritten; 6 tests all green. Mocks `consultation-session-service` helpers and routes `from(...)` calls per table (`appointments` / `consultation_sessions` / `payments` / `doctor_settings`).
   - `backend/tests/unit/services/opd-snapshot-service.test.ts` — updated mock chain to include `.order()`; `baseApt` trimmed, `baseSession` added for the new `consultation_sessions` lookup; 2 tests green.
   - `backend/tests/unit/services/appointment-service.test.ts` — mocks the two new enrichment helpers to `null` / empty map so existing mock admin chains stay viable; all 14 tests green.
8. **Full backend suite**: `99 suites, 1283 tests, all green` post-migration.
9. **Full TypeScript compile**: `tsc --noEmit` clean on backend **and** frontend.
10. **Lint**: no new lint errors introduced on any touched file (verified via `ReadLints`).

**Scope corrections vs. the original task description**

The task body listed seven legacy columns (`consultation_room_sid`, `consultation_room_status`, `consultation_room_provider`, `consultation_started_at`, `consultation_ended_at`, `consultation_recording_status`, `consultation_recording_artifact_ref`) but `migrations/021_appointments_consultation_room.sql` only ever added **three** of them: `consultation_room_sid`, `consultation_started_at`, `consultation_ended_at`. Migration 021 also added `doctor_joined_at`, `patient_joined_at`, `consultation_duration_seconds`, `verified_at`, and `clinical_notes` — all of those are **kept**; they're still read by payout verification and the post-consult clinical-notes flow.

The task's "Out of scope: Frontend" claim was also incorrect — removing the three columns changes the `Appointment` API payload shape, which two frontend components (`ConsultationLauncher`, `AppointmentConsultationActions`) were actively reading. Those are migrated in this PR.

**Production gates — deferred to merge-time owner checklist**

The acceptance criteria require (a) Task 15 to have been in production ≥ 14 days, and (b) the gating SQL query to return 0 rows for 7 consecutive days. Neither has been confirmed at code-completion time. Per explicit user decision (2026-04-19 chat), the gates are treated as a **merge-time owner checklist**, not a code-completion blocker. Before this PR is merged, the owner must:

- [ ] Confirm migration 049 (`consultation_sessions`) has been in production ≥ 14 calendar days. Record the production-deploy date.
- [ ] Run the gating query (primary + secondary, from the "Gating SQL query" section above) for 7 consecutive days. Record counts in the table. Expect: primary = 0 for all 7 days; any non-zero secondary row must be manually closed and documented before merge.
- [ ] (Optional, recommended by ops) `pg_dump` the three columns to an audit archive before running the drop migration on production.
- [ ] Revert this PR (not just the migration — also the application-code changes) if any in-flight regression surfaces; 060 restores the schema but not the data, so the revert must happen before new writes start mirroring back to the legacy columns. (Though note: lazy-write is also removed in this PR, so no new mirrors occur after merge.)

**Rollback semantics reminder:** 060 restores the schema and back-fills from `consultation_sessions`, but any read path that still expects the legacy columns would need the Task-15 dual-write restored — which means reverting this PR in full, not just running 060.

