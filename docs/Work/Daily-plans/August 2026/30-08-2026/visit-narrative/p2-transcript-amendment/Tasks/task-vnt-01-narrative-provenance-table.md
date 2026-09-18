# Task vnt-01: Narrative provenance table

> **Filename:** `task-vnt-01-narrative-provenance-table.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> **VN-Q5 = (b)** (owner, 2026-08-30). Store provenance, not text. This task is the migration. **Model: Opus (max thinking). Auto must not run this task.**

---

## 📋 Task Overview

Give a transcript-derived chart entry a memory of where it came from. One append-only row per accepted item, anchored to the transcript row and a character span inside it, so a clinician (or an auditor) can later ask *"why does this patient's chart say 'dengue'?"* and get *"the patient said it, at this point in this consult"* rather than a shrug.

The point of the design is what it **does not** store. Under the recommended VN-Q5 answer (b), this table holds no clinical free text at all — spans are integers, and the words they point at stay in `consultation_transcripts.transcript_text`, which already has retention and erasure governance from the `rec-*` program. That inherits erasure instead of creating a second obligation.

**Program / Phase:** visit-narrative · Phase 2 (transcript amendment)
**Batch:** [`plan-p2-visit-narrative-transcript-amendment-batch.md`](../plan-p2-visit-narrative-transcript-amendment-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md`](./EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md)
**Estimated Time:** ~3 hours
**Status:** 🟡 **ENGINEERING DONE — apply on dev residual** (owner override; ran on this model 2026-08-30)
**Completed:** —

**Change Type:**
- [x] **New feature** — new table, additive only. No ALTER of any existing table.
- [ ] **Update existing**

**Current State:** (checked against the codebase)
- ✅ **What exists:** `consultation_transcripts` (migration `061_consultation_transcripts.sql`) — `id`, `consultation_session_id` (FK → `consultation_sessions`, `ON DELETE CASCADE`), `provider`, `language_code`, `transcript_json`, `transcript_text`, `duration_seconds`, `cost_usd_cents`, `composition_sid`, `status` (`queued|processing|completed|failed`), `retry_count`, `error_message`, timestamps. RLS enabled, **service-role only, no policies**. Unique on `(consultation_session_id, provider)`. Its own header comment anticipates this exact reader: *"Plan 10 (AI clinical assist) will read this column."*
- ✅ **What exists:** the current house migration pattern, `223_visit_payments.sql` (2026-08-30) — deny-all RLS, append-only via a `reject_*_mutation()` trigger pair, `CREATE TABLE IF NOT EXISTS`, `COMMENT ON` for every non-obvious column, and the reverse migration documented in-file.
- ❌ **What's missing:** any record that an accepted chart item originated from a patient's recorded words. Today an accepted diagnosis is indistinguishable from one the doctor typed.
- ⚠️ **Notes:** highest existing migration is **223**. This one is **224**. Do not renumber, do not skip.
- ⚠️ **Notes:** the FK anchor is a decision with consequences — see Design Constraints. Anchoring to `consultation_transcripts(id)` inherits erasure via CASCADE; anchoring only to `consultation_sessions` does not, because session rows outlive transcripts through the regulatory retention window (061's header says so explicitly).
- ⚠️ **Notes — this may invalidate option (b)'s premise. Resolve at 1.3 before writing SQL.** Planning-time tracing found **no code path that deletes a `consultation_transcripts` row.** The recording archival worker and the erasure service both operate on `recording_artifact_index` and storage objects and never reference `consultation_transcripts`; the account-deletion worker doesn't either. The only deletion route is `ON DELETE CASCADE` from `consultation_sessions` — and 061's own header says session rows are deliberately *retained* through the regulatory window. If that holds, transcripts are effectively never pruned, and "erasure is inherited" inherits nothing: CASCADE would be correct-but-inert. That is a real finding about the **existing** retention posture, not something this table creates — but it is exactly the premise VN-Q5 option (b) was recommended on, so the owner needs it before deciding.

**Scope Guard:**
- Expected files touched: ≤ 4 (migration, `backend/src/types/database.ts`, `DB_SCHEMA.md`, one service or type module)
- **No ALTER of `consultation_transcripts`, `consultation_sessions`, `prescriptions`, or `recording_artifact_index`.**
- No change to the transcription worker or any retention / hard-delete worker.
- No write path in this task — the table is created and typed here; `vnt-03` / `vnt-04` populate it.
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-Q5, VN-DL-11, VN-DL-12
- Batch locks VNT-D1, VNT-D7
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) — §"Before creating a migration (MANDATORY)", RLS Migration Safety, Data Backfill Checklist
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4

---

## ✅ Task Breakdown (Hierarchical)

### 1. Pre-flight (mandatory before writing SQL)
- [x] ✅ 1.1 Confirm the VN-Q5 decision is recorded in the batch plan with an actual answer, not `⟨fill⟩`. If it is still `⟨fill⟩`, **stop and surface**. **(b)** recorded 2026-08-30. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Read the migrations in numeric order for schema, naming, RLS, and trigger conventions (MIGRATIONS_AND_CHANGE.md makes this mandatory). Pay particular attention to `056` (`recording_artifact_index`), `061` (transcripts), and `223` (current house pattern). House pattern copied from `223` (deny-all RLS, append-only trigger pair, `IF NOT EXISTS`, in-file reverse). Neighbourhood from `056` / `061` (service-role only, no policies). - **Completed: 2026-08-30**
- [x] ✅ 1.3 Establish how transcripts are actually erased today — trace the `rec-*` retention / hard-delete path and the account-deletion worker. Write down what deletes a transcript row versus what only nulls its artifact. **This determines whether CASCADE is sufficient.** See Notes §1.3. CASCADE is the correct mechanism and is currently inert as policy. Owner accepted (b) with that caveat. Not a STOP. - **Completed: 2026-08-30**
- [x] ✅ 1.4 Confirm 224 is unclaimed. Highest existing file is `223_visit_payments.sql`. No `224_*`. - **Completed: 2026-08-30**

### 2. The migration
- [x] ✅ 2.1 One append-only row per accepted item. Identity: which doctor, which patient, which appointment / session, which transcript row, which character span, which target section, which created row, who accepted, when. - **Completed: 2026-08-30**
  - [x] ✅ 2.1.1 Under VN-Q5 = (b): **no clinical free-text column.** No quote column, no narrative column, no note column that could accumulate clinical text. Only `TEXT` column is `target_kind` (CHECK enum). - **Completed: 2026-08-30**
  - [x] ✅ 2.1.2 Under VN-Q5 = (c): struck — owner chose (b). - **Completed: 2026-08-30**
- [x] ✅ 2.2 Anchor the FK so erasure is inherited (see 1.3 and Design Constraints), with the CASCADE behaviour stated in a `COMMENT ON`. `transcript_id → consultation_transcripts(id) ON DELETE CASCADE`. - **Completed: 2026-08-30**
- [x] ✅ 2.3 Span integrity: a span cannot be negative and cannot end before it starts. Enforce at the schema level, not in the service. `span_start >= 0 AND span_end > span_start` (`[start, end)`). - **Completed: 2026-08-30**
- [x] ✅ 2.4 Append-only: `UPDATE` and `DELETE` raise, following the `223` trigger pattern. A correction is a later insert, never an edit — this is a provenance record. Direct DELETE raises; CASCADE from a parent is allowed (`pg_trigger_depth() > 1`) so 4.3 is possible. A naive copy of 223's always-raise DELETE trigger would block erasure. - **Completed: 2026-08-30**
- [x] ✅ 2.5 RLS enabled, **deny-all / service-role only**, matching `061` and `223`. Doctor access is gated at the endpoint, as it is for every table in this neighbourhood. - **Completed: 2026-08-30**
- [x] ✅ 2.6 Indexes for the two real read patterns: "provenance for this consult" and "provenance for this chart row". Nothing speculative. Plus `transcript_id` for CASCADE. - **Completed: 2026-08-30**
- [x] ✅ 2.7 `COMMENT ON TABLE` + every non-obvious column. State plainly that spans point into `consultation_transcripts.transcript_text` and that the table stores no clinical text of its own. - **Completed: 2026-08-30**
- [x] ✅ 2.8 Reverse migration documented in-file, per the repo convention. - **Completed: 2026-08-30**

### 3. Types + docs
- [x] ✅ 3.1 Add the row type to `backend/src/types/database.ts` following the existing shape conventions. `VisitNarrativeProvenance` + `InsertVisitNarrativeProvenance`. No update type (append-only). - **Completed: 2026-08-30**
- [x] ✅ 3.2 Update `DB_SCHEMA.md`. Also `RLS_POLICIES.md` (house pattern from 223). - **Completed: 2026-08-30**
- [x] ✅ 3.3 Answer the backfill question explicitly: **there is no backfill.** Historical accepted items have no provenance row, and the read path must render that as *"no source recorded"* — never as *"doctor-asserted"*. Recorded in the migration header, `DB_SCHEMA.md`, and here. - **Completed: 2026-08-30**

### 4. Verification & Testing
- [ ] 4.1 Apply on dev. Re-apply — must be a clean no-op (`IF NOT EXISTS` throughout). **Operator:** paste `224_visit_narrative_provenance.sql` in the Supabase SQL editor, then paste again. No `psql` / `DATABASE_URL` / logged-in Supabase CLI in this environment.
- [ ] 4.2 Prove append-only: `UPDATE` raises, `DELETE` raises. Verification SQL in Notes.
- [ ] 4.3 Prove erasure inheritance: delete a transcript row on dev, confirm its provenance rows go with it. **Assert this; do not read it off the DDL.** Verification SQL in Notes — run inside a transaction and `ROLLBACK`.
- [ ] 4.4 Prove RLS: an anon and an authenticated client can read nothing. Verification SQL in Notes.
- [x] ✅ 4.5 `npx tsc --noEmit` + lint. Backend `tsc --noEmit` exit 0; `eslint src/types/database.ts` exit 0. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/224_visit_narrative_provenance.sql
UPDATE: backend/src/types/database.ts
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md
MAYBE:  a types module for the provenance row shape (only if the service layer needs it before vnt-03)
```

**Existing Code Status:**
- ✅ `backend/migrations/061_consultation_transcripts.sql` — EXISTS (the anchor). **Not modified.**
- ✅ `backend/migrations/223_visit_payments.sql` — EXISTS (the pattern to copy).
- ✅ `backend/migrations/224_visit_narrative_provenance.sql` — written 2026-08-30. Apply on dev is residual.

**When creating a migration:** (MANDATORY)
- [x] Read all previous migrations in numeric order to understand schema, naming, RLS, triggers, and how the project connects to the database — see [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4. Focused read: `056`, `061`, `049` (session FKs), `223` (current house pattern).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Erasure is inherited, not invented.** The whole reason option (b) is recommended is that a span is an integer and the words live in a table whose retention is already governed. If the FK anchoring does not actually deliver that inheritance (verify at 1.3), the option's justification collapses and this is a **STOP**, not a workaround.
- **A provenance record that can be edited is not a provenance record.** Append-only is the point, not a nicety.
- **No PHI in logs** (COMPLIANCE.md) — log identifiers and counts, never span contents, never resolved text.
- Service-role-only RLS matching the neighbourhood (`056`, `061`, `223`). Doctor scoping happens at the endpoint.
- Additive only. No ALTER of an existing table anywhere in this migration.
- The migration must be safe to re-run and must document its own reverse.

**DO NOT include:** code, pseudo-code, function signatures, or DDL in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — new table adjacent to PHI.
  - [ ] **RLS verified?** Deny-all / service-role only in DDL. Live proof is 4.4 (operator).
- [x] **Any PHI in logs?** **No** — schema only; no logger calls.
- [x] **External API or AI call?** No — this task is schema only.
- [x] **Retention / deletion impact?** **Yes.** Under (b) inherited via CASCADE. Mechanism in DDL; live proof is 4.3 (operator). No new PHI text store.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] VN-Q5 is recorded with a real answer and this migration matches it. **(b)** — spans, not text.
- [ ] Migration `224` applies cleanly, re-applies as a no-op, and documents its reverse in-file. Reverse is in-file. Apply is operator (4.1).
- [ ] Append-only proven (UPDATE raises, DELETE raises). Operator (4.2).
- [ ] Deleting a transcript removes its provenance rows — **asserted on dev**, not inferred. Operator (4.3).
- [ ] RLS proven closed to anon and authenticated. Operator (4.4).
- [x] Under (b): no column can hold clinical free text. Grep the DDL: the only `TEXT` column is `target_kind` with a six-value CHECK. No quote / narrative / note / JSONB.
- [x] `database.ts` + `DB_SCHEMA.md` updated. Backfill question answered in writing (§3.3).
- [x] Type-check + lint clean.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** A naive copy of `223`'s DELETE trigger (always `RAISE`) would make `ON DELETE CASCADE` from `consultation_transcripts` fail, so 4.3 could never pass.
**Solution:** Direct DELETE raises (`pg_trigger_depth() <= 1`). CASCADE from a parent runs at depth > 1 and is allowed. Documented on the function.

**Issue:** No `psql`, no `DATABASE_URL`, Supabase CLI not logged in — cannot apply or assert 4.1–4.4 from this environment.
**Solution:** Left 4.1–4.4 for the operator. Verification SQL is below.

---

## 📝 Notes

- Migration `061`'s header is worth reading in full before designing this one — it explains why transcripts were deliberately kept *out* of `recording_artifact_index` (different lifecycle: derived, re-runnable, independently pruneable). The same reasoning applies one level down: provenance is derived from a transcript and should not be welded into it.
- `061` also notes session rows outlive transcripts through the retention window. That is precisely why anchoring provenance to the session rather than the transcript would leave dangling rows after a transcript prune.

### §1.3 — how a transcript is erased today (2026-08-30)

Traced `recording-erasure-service.ts`, `recording-archival-worker` (via that service), and `account-deletion-worker.ts`:

| Path | What it touches | Deletes `consultation_transcripts`? |
|---|---|---|
| Archival worker | `recording_artifact_index` + storage objects | **No** |
| `recording-erasure-service` | same index + Twilio composition + storage | **No** — reads `consultation_sessions` only |
| Account-deletion worker | PII scrub + `auth.admin.deleteUser` | **No** mention of transcripts |
| Transcription worker / service | INSERT / status UPDATE | **No** DELETE |

The only SQL delete route is `ON DELETE CASCADE` from `consultation_sessions`. `061`'s header says session rows are deliberately retained through the regulatory window. So **no production path deletes a transcript row**. CASCADE on this table is the correct inheritance (when a transcript *is* deleted, provenance goes with it) and is **currently inert as policy**. Owner accepted (b) with that caveat. Not a STOP — do not invent a prune worker here.

### Dev verification SQL (4.1–4.4)

After applying `224_visit_narrative_provenance.sql` twice (second pass must be a no-op):

```sql
-- 4.2 / 4.3 — wrap in a transaction and ROLLBACK.
BEGIN;

-- Pick any completed transcript that already has a session + appointment + doctor.
-- Replace the UUIDs if the SELECT returns nothing.
WITH src AS (
  SELECT t.id AS transcript_id,
         t.consultation_session_id,
         s.appointment_id,
         s.doctor_id,
         s.patient_id
  FROM consultation_transcripts t
  JOIN consultation_sessions s ON s.id = t.consultation_session_id
  LIMIT 1
),
ins AS (
  INSERT INTO visit_narrative_provenance (
    doctor_id, patient_id, appointment_id, consultation_session_id,
    transcript_id, span_start, span_end, target_kind, accepted_by
  )
  SELECT doctor_id, patient_id, appointment_id, consultation_session_id,
         transcript_id, 0, 1, 'prose', doctor_id
  FROM src
  RETURNING id, transcript_id
)
SELECT id FROM ins;

-- 4.2 UPDATE must raise
UPDATE visit_narrative_provenance SET span_end = 2
WHERE id = (SELECT id FROM visit_narrative_provenance ORDER BY accepted_at DESC LIMIT 1);

-- 4.2 direct DELETE must raise
DELETE FROM visit_narrative_provenance
WHERE id = (SELECT id FROM visit_narrative_provenance ORDER BY accepted_at DESC LIMIT 1);

-- 4.3 deleting the *test* transcript (only if you inserted a throwaway row)
-- must remove its provenance. Do not delete a real production transcript.
-- DELETE FROM consultation_transcripts WHERE id = '<throwaway>';
-- SELECT count(*) FROM visit_narrative_provenance WHERE transcript_id = '<throwaway>';
-- expect 0

ROLLBACK;

-- 4.4 — as anon and as authenticated (not service_role):
--   SELECT * FROM visit_narrative_provenance;
-- expect 0 rows (RLS deny-all). Service-role SELECT is allowed and is not the test.
```

---

## 🔗 Related Tasks

- [`task-vnt-02-extraction-pass.md`](./task-vnt-02-extraction-pass.md) — produces the spans this table records
- [`task-vnt-03-evidence-tier-proposal.md`](./task-vnt-03-evidence-tier-proposal.md) — first writer
- [Prior phase](../../p1-one-box/) — VN-Q5 was answered "ephemeral" there; this is where that answer expires

---

**Last Updated:** 2026-08-30
**Completed:** — (4.1–4.4 operator apply residual)
**Pattern:** Append-only provenance sidecar, erasure inherited via CASCADE
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
