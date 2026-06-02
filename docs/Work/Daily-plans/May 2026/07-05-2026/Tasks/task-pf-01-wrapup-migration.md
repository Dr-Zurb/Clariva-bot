# Task pf-01: Appointment wrap-up columns migration

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 1, Lane α step 0 — **XS, ~2h**

---

## Task overview

Add the four columns the wrap-up dialog (pf-04) and endpoint (pf-02) persist into: `diagnosis_text`, `diagnosis_tags`, `followup_date`, `followup_kind`. Plus two indices — a GIN index on `diagnosis_tags` for the recent-diagnoses autocomplete (`/v1/diagnoses/recent`), and a partial index on `(doctor_id, status) WHERE status = 'completed'` for the per-doctor recent-completions read.

This is the **first migration** in the batch and unblocks Phase 1's backend lane.

**Estimated time:** ~2h. ~20min Opus SQL review (PHI columns + GIN index sanity), ~1h Sonnet impl, ~30min apply + smoke.

**Status:** Shipped (2026-05-08).

**Hard deps:** none.

**Source:** [plan-patient-seeing-flow.md § P1.4](../../../../Product%20plans/plan-patient-seeing-flow.md#p14--migration-appointment-wrap-up-columns).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** for the SQL review (this is a new migration — per the efficiency guide's hard rules, all new migrations get an Opus pass), then **Sonnet 4.6 Medium** to type the file out.

**Why Opus:** new column on a high-volume table touched by RLS; GIN index storage cost; check constraint correctness; idempotency. One careful turn nails it.

**New chat?** **Yes — split:**

1. **Opus SQL review (~20min, Plan Mode):**
   - Pre-load: this task file + the `appointments` table schema (`backend/migrations/00X_initial.sql` and any later `appointments` migrations) + the existing RLS predicate for `appointments` (search `policy.*appointments`).
   - Ask: *"Review this migration SQL: additive columns + check constraint + GIN index + partial index. Confirm RLS doesn't need update (additive columns inherit existing predicates). Confirm `IF NOT EXISTS` is correct everywhere. Flag any storage / lock concerns on a populated table."*
   - Lock the SQL.

2. **Sonnet impl chat (~1h):**
   - Pre-load: this task file + the locked SQL.
   - Create `backend/migrations/0XX_appointment_wrapup.sql` (next free number — currently 097), apply locally, sanity-check via `psql \d appointments`.

**Composer-OK sub-steps:** none — this is a migration, all turns stay in Tier 1/2.

**Estimated turns:** 1 Opus design + 2 Sonnet impl turns.

---

## Acceptance criteria

### Migration

- [ ] New file `backend/migrations/0XX_appointment_wrapup.sql` (next free number; check `ls backend/migrations | tail -3` first).
- [ ] Adds four columns:

  ```sql
  ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS diagnosis_text   TEXT NULL,
    ADD COLUMN IF NOT EXISTS diagnosis_tags   TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS followup_date    DATE NULL,
    ADD COLUMN IF NOT EXISTS followup_kind    TEXT NULL;
  ```

- [ ] Adds the check constraint (separate `ALTER TABLE` to avoid the older PG syntax pitfalls):

  ```sql
  ALTER TABLE appointments
    DROP CONSTRAINT IF EXISTS appointments_followup_kind_check;
  ALTER TABLE appointments
    ADD CONSTRAINT appointments_followup_kind_check
    CHECK (followup_kind IS NULL OR followup_kind IN ('none','in_person','tele'));
  ```

- [ ] Adds two indices:

  ```sql
  CREATE INDEX IF NOT EXISTS idx_appointments_diagnosis_tags_gin
    ON appointments USING gin (diagnosis_tags);

  CREATE INDEX IF NOT EXISTS idx_appointments_doctor_completed_recent
    ON appointments (doctor_id, status)
    WHERE status = 'completed';
  ```

- [ ] Migration is **fully idempotent** — re-running is a no-op (every `IF NOT EXISTS` / `IF EXISTS` in the right place).

### RLS

- [ ] **No new policies needed** — additive columns inherit `appointments` RLS. Verify via:

  ```sql
  SELECT polname, polqual FROM pg_policies WHERE tablename = 'appointments';
  ```

  and confirm none of them filter on a column-name basis that would exclude these.

### Smoke

- [ ] Apply the migration on the local Supabase project (`supabase db push` or your equivalent flow).
- [ ] `\d appointments` shows the four new columns + check constraint.
- [ ] `\d+ idx_appointments_diagnosis_tags_gin` shows GIN index method.
- [ ] `INSERT INTO appointments (..., diagnosis_text, diagnosis_tags, followup_date, followup_kind) VALUES (..., 'Test dx', ARRAY['flu','viral'], '2026-06-01', 'in_person')` succeeds.
- [ ] `INSERT … followup_kind = 'invalid'` fails with the check constraint.

---

## Out of scope

- **`backfill`** — there's no historical wrap-up data to backfill; new columns default to safe values.
- **Reading these columns from anywhere** — pf-02 wires the controller; this task is migration-only.
- **`/v1/diagnoses/recent` endpoint** — that lives in pf-02. The GIN index in this migration is the prerequisite.
- **Any change to `consultation_sessions`** — wrap-up's session-end side effect uses the existing `endSession()` facade.

---

## Files expected to touch

**New:**
- `backend/migrations/0XX_appointment_wrapup.sql` (~30 LOC)

**Modified:** none.

**Deleted:** none.

---

## Notes / open decisions

1. **GIN vs BTREE on `diagnosis_tags`.** GIN is correct — array containment search (`@>`) is what `/v1/diagnoses/recent` will use to count tag frequency. Confirmed in Opus review.
2. **Partial index on `completed`.** Cheap (only completed rows indexed) and powers the per-doctor recent-completions read for the autocomplete.
3. **`diagnosis_tags` default `'{}'`** — empty array, not NULL — keeps queries simple (`WHERE doctor_id = ? AND array_length(diagnosis_tags, 1) > 0` etc).
4. **`followup_kind` constraint.** `'none'` is meaningful (doctor explicitly said "no follow-up needed"); NULL is "not yet decided" (e.g. mid-call save before wrap-up dialog runs).

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P1.4](../../../../Product%20plans/plan-patient-seeing-flow.md#p14--migration-appointment-wrap-up-columns)
- **Batch plan:** [plan-patient-flow-batch.md](../plan-patient-flow-batch.md)
- **Execution order:** [EXECUTION-ORDER-patient-flow.md § Phase 1](./EXECUTION-ORDER-patient-flow.md#phase-1--wrap-up-keystone)
- **Hard-rule for new migrations:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md § When to escalate to Opus](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
