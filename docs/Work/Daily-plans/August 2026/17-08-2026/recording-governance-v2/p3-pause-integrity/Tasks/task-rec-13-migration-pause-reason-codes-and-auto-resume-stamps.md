# Task rec-13: Migration — pause reason codes + auto-resume stamps

## 17 Aug 2026 — Batch [p3-pause-integrity](../plan-p3-recording-governance-v2-pause-integrity-batch.md) — Wave 1 — **S, ~2h**

---

## Task overview

One additive migration on `consultation_recording_audit` that unblocks the rest of the phase: an ENUM + column for preset pause reason codes (REC-D14), the stamps auto-resume needs to own a deadline across pod restarts (REC-D16), and a decision on how a patient-initiated pause is attributed (REC-D15).

It also has to deal with the free text that is already in the table. That is the part of this task that needs judgement, and it is the reason this is Opus.

**Estimated time:** ~2h
**Status:** ✅ Done 2026-08-18
**Hard deps:** none. This task gates rec-15, rec-16 and rec-17.
**Source:** REC-D14, REC-D15, REC-D16 · REC3-D1, REC3-D2, REC3-D3, REC3-D4.

**Change Type:** Update existing — additive schema change on a live governance table plus a one-time data redaction. Follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) §4.

---

## Model & execution guidance

**Recommended model:** **Opus — mandatory.** New migration on a table that holds regulatory audit rows, plus a destructive one-time backfill. [`00-agent-contract.mdc`](../../../../../../../../.cursor/rules/00-agent-contract.mdc) puts migrations on the hard-rules list; the charter's migration-budget section repeats it. Auto must not write this file.

**New chat? Yes.** Pre-load, in this order:

- This task file, then [`../plan-p3-recording-governance-v2-pause-integrity-batch.md`](../plan-p3-recording-governance-v2-pause-integrity-batch.md), then [`../../plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) (§Decision lock → Pause, and §Migration budget).
- [`MIGRATIONS_AND_CHANGE.md`](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) — read before writing a single line of SQL.
- `backend/migrations/064_consultation_recording_audit.sql` — the **whole file**. The header (L22–70) is the design doctrine for this table; the reason CHECK is L104–116; the ENUM is L73–89; the orphan-sweep partial index is L122–127; the column comments are L136–155.
- `backend/migrations/071_recording_audit_action_video_values.sql` — the whole file. This is the ENUM-widening precedent, including its `ADD VALUE IF NOT EXISTS` idempotency note (L52–57) and its "do not reverse, forward-supersede" stance (L61–70).
- `backend/src/services/recording-pause-service.ts` L92–136 (bounds, `DEFAULT_KIND`, the `AuditRow` shape) and L273–333 (the double-row write).
- `backend/src/services/recording-track-service.ts` L191–330 — the sibling writer's `LedgerMetadata` shape and, specifically, `resolveActor` (L293–321) and its null-`patientId` fallback to the all-zeros system UUID.
- `backend/src/services/recording-escalation-service.ts` L1021–1025 — the existing "pinned canonical reason string" precedent, which is the closest thing in the codebase to what rec-15 will do.
- One recent migration for header/rollback style — `backend/migrations/195_appointment_start_notify_stamp.sql`.
- One recent migration content-sanity test for shape — `backend/tests/unit/migrations/recording-audit-action-video-values-migration.test.ts`.

**Before writing anything:** re-derive the migration number from the live folder with `ls backend/migrations/ | grep -E '^[0-9]{3}_' | sort | tail -1`. **Do not use a bare `ls … | sort | tail -1`** — `_inspection_consultation_rls.sql` is unnumbered and sorts last, so it will hand you the wrong head. Budget is **197**; the head at planning time was `195_appointment_start_notify_stamp.sql` and p2 has 196 budgeted, but phases may land out of order and other programs may slip a migration in. **The number in this task file is a budget, not a reservation.** Also read every prior migration that touches this table before adding to it — 064 and 071 are the two that matter, and both are in the pre-load list for that reason.

**Estimated turns:** 2–3.

---

## The decision this task must make: existing free-text `reason` values

`consultation_recording_audit.reason` currently holds whatever doctors typed. Some of it is almost certainly clinical content — that is the entire premise of REC-D14. Four paths were considered:

| Path | Verdict |
|---|---|
| Map every legacy value to `administrative` | **Rejected.** It fabricates a governance fact. The doctor never asserted "administrative"; we would be putting words in a clinician's mouth inside the table a regulator reads. A wrong coded reason is worse than a missing one. |
| Null the `reason` out | **Rejected as stated.** Migration 064's CHECK (L104–116) requires `reason` to be non-null and 5–200 chars whenever `action` is `recording_paused`, so a bare null-out fails on the existing rows. It also destroys the fact that a reason was captured at all. |
| Move the free text to a `legacy_reason` column | **Rejected.** It relocates the exposure without reducing it, and it doubles the number of columns that every future export, dashboard and erasure path has to remember to exclude. |
| **Redact in place and stamp the redaction** | **Chosen.** |

**Chosen path (REC3-D3):** for pre-existing `recording_paused` rows, replace the free-text `reason` with a fixed non-clinical sentinel token, leave `pause_reason_code` NULL (never guessed), and stamp the redaction on the row's `metadata` so the ledger is honest about having been changed and by which migration. Everything that makes the row an audit row — actor, role, action, timestamp, correlation id, Twilio sid, status — is preserved untouched.

Why this is data minimisation and not falsification: the audit ledger's job is to prove *that* a pause happened, *who* caused it and *when*. None of that is being altered. Only the free-text payload — the part that should never have been collected, per REC-D14 — is removed, and the removal is itself recorded. Leaving it in place would mean knowingly retaining clinical content in a service-role governance table with no retention path of its own.

**Before applying the redaction:** count the affected rows and record the number in this task's Notes section. If the count is zero (likely in a pre-launch database) the redaction is a no-op and should still ship, so the migration is correct against any environment. If the count is non-trivial, ship it anyway — the exposure is the reason this migration exists — but the number belongs in the record.

**Read surface:** a legacy row is rendered as "reason not recorded in preset form" wherever a reason is shown. rec-15 and rec-18/19 consume that; this task only has to make the state distinguishable.

---

## Acceptance criteria

### 1. Reason codes

- [x] 1.1 A new ENUM type for the five preset pause reasons, seeded with exactly `patient_request`, `sensitive_disclosure`, `third_party_present`, `administrative`, `technical` — and nothing else.
  - [x] 1.1.1 Guarded by the `pg_type` DO-block pattern from Migration 064 L73–89, so re-running the migration is a no-op.
  - [x] 1.1.2 The five values are seeded up front. Migration 064's header (L31–34) explains why: `ALTER TYPE … ADD VALUE` cannot be used in the same transaction as the value's first use. Do not leave a value out "for later".
- [x] 1.2 A new nullable `pause_reason_code` column on `consultation_recording_audit` typed to that ENUM.
- [x] 1.3 A constraint requiring the code on new `recording_paused` rows, added in Postgres's not-yet-validated form so historical rows are exempt rather than blocking the migration.
  - [x] 1.3.1 The exemption is documented in the migration header, not left for a future reader to infer from the constraint's state.
- [x] 1.4 The existing 5–200-character reason CHECK is **not dropped**. `recording_stopped` and `patient_revoked_video_mid_session` still rely on it (see the pinned canonical string at `recording-escalation-service.ts:1021-1025`). Any change to that constraint must keep those two actions' behaviour identical.

### 2. Auto-resume stamps (REC-D16)

- [x] 2.1 Columns sufficient for a polling job to own a deadline with no in-process state: when the pause is due to auto-resume, and how many extensions have been consumed.
  - [x] 2.1.1 Extension count is bounded at the schema level to the one extension REC-D16 allows — the cap is not left purely to service code.
  - [x] 2.1.2 Both are nullable and null on every historical row; no backfill.
- [x] 2.2 A partial index supporting the "pauses whose auto-resume deadline has passed and which are still open" sweep, following the shape and rationale of `idx_recording_audit_attempted` (064 L122–127) — partial so it stays small.
- [x] 2.3 A way to mark a pause row as **closed by a consult that ended while paused** (REC-D16's dangling stamp) that is distinguishable from both "resumed normally" and "auto-resumed".
  - [x] 2.3.1 Decide and document whether this is a new ENUM value on `recording_audit_action` (following 071's precedent) or a metadata/column discriminator on the existing `recording_resumed` action. **Migration 071's header (L28–49) argues explicitly for keeping status out of the action name** — align with it or record why not.

### 3. Patient-actor attribution (REC-D15 · REC3-D4)

- [x] 3.1 Confirm in the task Notes that **no ENUM or CHECK widening is needed for the patient role** — `action_by_role` already permits `'patient'` (064 L97) and `recording_paused` already exists in `recording_audit_action` (064 L79–86). Do not add either.
- [x] 3.2 Resolve the real blocker: `action_by` is `UUID NOT NULL` (064 L96) while a bot patient's scoped-JWT `sub` is the synthetic string `patient:{appointmentId}` and `consultation_sessions.patient_id` may be null.
  - [x] 3.2.1 Prefer a surrogate UUID that already has precedent — `recording-track-service.resolveActor` (L307–321) falls back to the all-zeros system UUID; Migrations 086 and 105 use the session id as a synthetic UUID surrogate for exactly this problem. Pick one, document it in a column comment, and make sure `action_by_role` still reads `'patient'` so attribution survives even when the identifier is a surrogate.
  - [x] 3.2.2 A surrogate must never make a patient row indistinguishable from a system row. If the chosen surrogate collides with the system convention, choose the other one.
  - [x] 3.2.3 **Altering `action_by`'s column type is a STOP-and-surface.** Do not widen it to TEXT to make this easier.

### 4. Legacy free-text redaction (REC3-D3)

- [x] 4.1 Count the affected rows first; record the count in Notes.
- [x] 4.2 Replace free text on pre-existing `recording_paused` rows with the fixed sentinel token; leave `pause_reason_code` NULL.
- [x] 4.3 Stamp the redaction (which migration, when) on the row so the mutation is self-documenting.
- [x] 4.4 Idempotent: re-running the migration must not re-redact already-redacted rows or produce a different result.
- [x] 4.5 Actor, role, action, timestamp, correlation id and metadata status are provably unchanged. State this in the header.

### 5. Types, comments, test

- [x] 5.1 Extend the backend row type for `consultation_recording_audit` to carry the new column(s), matching the existing style in `backend/src/types/`.
- [x] 5.2 Column and type comments for every new object, in the voice of 064 L136–155 — a future operator running `\d+` should learn *why*, not just *what*. Say plainly that `pause_reason_code` exists so no clinical free text is ever written here again.
- [x] 5.3 Content-sanity migration test following the convention of `backend/tests/unit/migrations/recording-audit-action-video-values-migration.test.ts`.
  - [x] 5.3.1 Pins the exact five ENUM values, so adding a sixth is a deliberate act with a failing test in front of it.
  - [x] 5.3.2 Pins that the legacy 5–200 reason CHECK still exists.
- [x] 5.4 Update the phase batch plan's migration row with the number actually used.

### Out of scope

- Any service, controller, worker or UI change — rec-15 (codes), rec-16 (auto-resume), rec-17 (patient pause) consume this schema.
- Reading, rendering or validating the new columns.
- The reconciliation worker (rec-20) — this task only keeps its index shape available.
- Any RLS policy. This table is service-role-only by design (064 §Safety, L59–62).
- Any second migration.

---

## Scope Guard

- **Expected files touched: ≤ 4** — the new migration, the backend row type, the migration content-sanity test, and the batch plan's migration row.
- **DO NOT TOUCH:** `recording-pause-service.ts`, `recording-track-service.ts`, `recording-escalation-service.ts`, `consultation-controller.ts`, any frontend file, any RLS policy, `video_escalation_audit`, `recording_artifact_index`, `archival_history`.
- **STOP and surface** if: a second migration appears necessary · an RLS policy needs to change · `action_by` needs a type change · the legacy reason CHECK cannot be preserved for `recording_stopped` / `patient_revoked_video_mid_session`.

---

## Global safety gate (MANDATORY)

- [x] **Data touched?** Yes — schema plus a one-time redaction on `consultation_recording_audit`.
  - [x] **RLS verified?** Yes — no policy exists or changes; service-role only, per 064.
- [x] **Any PHI in logs?** Must be No. The redaction must never log the value it is removing, not even at debug.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** Yes — this removes previously-retained free text. That is the intent; §4 records it.

---

## Design constraints (NO IMPLEMENTATION)

- Additive and idempotent. `IF NOT EXISTS` / DO-block guards throughout, per 064 §Safety.
- Reverse ops documented in-file but not run — 071 L61–70's stance is the house rule for this table.
- Naming stays snake_case and consistent with the table's existing columns.
- Never read `process.env`; nothing in this task touches config.
- The migration must be correct against a database with zero legacy rows and one with thousands.

---

## Done when

Migration applies clean and re-applies as a no-op; the five reason codes are pinned by a test; new pauses can be required to carry a code without breaking a single historical row; the auto-resume deadline and extension count are queryable by a polling job with a supporting partial index; patient attribution has a documented, non-colliding actor identity; legacy free text is gone and its removal is stamped; the affected-row count is written into Notes; no RLS change; no second migration.

---

## Notes

- **Migration number:** `196_recording_pause_reason_codes_and_auto_resume_stamps.sql`. Live head was `195_appointment_start_notify_stamp.sql`. Charter budgeted 197 (196 for p2); p2 had not landed, so this task took the next sequential number. p2 must re-derive.
- **Legacy `recording_paused` row count before redaction:** **0** (dev DB, 2026-08-18, `count: exact` / head-only — no reason text read). Redaction still ships; re-apply is a no-op.
- **Patient-actor surrogate:** `consultation_sessions.id` with `action_by_role = 'patient'`. Precedent: Migrations 086 and 105. Rejected the all-zeros system UUID (`recording-track-service.resolveActor` / 064) because that would make a patient pause indistinguishable from a system row (3.2.2). `action_by` type unchanged. No role CHECK widening — `'patient'` already allowed (064 L97).
- **Dangling-pause stamp:** column discriminator `pause_closed_as` (`manual_resume` | `auto_resume` | `session_ended_while_paused`), not a new `recording_audit_action` value. Aligns with 071 L28–49: status stays off the action name.

---

## Related tasks

- [`task-rec-15-preset-pause-reason-codes.md`](./task-rec-15-preset-pause-reason-codes.md) — first consumer of the ENUM.
- [`task-rec-16-auto-resume-countdown-and-dangling-pause.md`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md) — first consumer of the stamps.
- [`task-rec-17-patient-initiated-pause.md`](./task-rec-17-patient-initiated-pause.md) — first consumer of the actor decision.
- [Execution order](./EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md)

---

**Last Updated:** 2026-08-18.
**Pattern:** additive migration + guarded ENUM + not-yet-validated constraint + stamped one-time redaction.
