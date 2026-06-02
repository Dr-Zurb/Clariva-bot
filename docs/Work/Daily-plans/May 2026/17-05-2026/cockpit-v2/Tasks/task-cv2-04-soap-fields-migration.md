# Task cv2-04: `prescriptions` SOAP-field expansion + `investigations → investigations_orders` rename

## 17 May 2026 — Batch [Cockpit v2 — Phase 1](../plan-cockpit-v2-batch.md) — Wave 2, Lane α step 0 — **XS, ~3h**

---

## Task overview

Land the schema delta that R-RX-FORM and R-MIDDLE depend on. The current `prescriptions` table (from migration `026_prescriptions.sql`) carries the SOAP basics — CC, HOPI, provisional diagnosis, investigations (free-text), follow-up (free-text), patient education, clinical notes. The cockpit-v2 plan adds **structured fields** the new section components will edit:

- **Structured vitals** (replacing today's free-text vitals tracker in the Objective section): `vitals_bp_systolic INTEGER`, `vitals_bp_diastolic INTEGER`, `vitals_hr INTEGER`, `vitals_temp_c NUMERIC(4,1)`, `vitals_spo2 INTEGER`, `vitals_wt_kg NUMERIC(5,2)`, `vitals_ht_cm NUMERIC(5,1)`.
- **Examination findings** (Objective): `examination_findings TEXT`.
- **Differential diagnosis list** (Assessment): `differential_diagnosis TEXT[]` (Postgres array; null = no DDx considered).
- **Structured follow-up** (Plan): `follow_up_value INTEGER` + `follow_up_unit TEXT` (CHECK constraint: `'days' | 'weeks' | 'months' | 'as_needed'`). The existing free-text `follow_up TEXT` column **stays** for backwards-compat — populated as the rendered "value + unit" string on send for the deprecation window. Drops in a future Phase 3 batch.
- **Advice** (Plan): `advice TEXT`.
- **Referral** (Plan): `referral TEXT`.
- **Test results** (Plan): `test_results TEXT` — captures interpretation/notes about returned lab/imaging results (distinct from the investigations *order list* which lives in `investigations_orders`).

And one rename:

- `prescriptions.investigations` → `prescriptions.investigations_orders` (the legacy name conflates the *order list* a doctor writes with the *results* a doctor receives; the new name aligns with R-MIDDLE's Investigations-orders zone). The migration ships a **read-time compatibility view** `prescriptions_legacy_v` that exposes the old column name for any client still on the previous shape during the deprecation window.

If `prescription_drafts` exists as a separate table, the same columns + rename apply to it. The task spec includes a discovery step (`rg`) that locks the answer early.

**Estimated time:** ~3h (45min discovery + 1h migration SQL drafting + 30min type regen + 30min `psql` smoke + 30min documentation in the migration header).

**Status:** Pending.

**Hard deps:** cv2-01 (review packaging — Wave 2 starts after Wave 1 ships; no code dependency).

**Source:** [plan-cockpit-v2-batch.md § Wave 2](../plan-cockpit-v2-batch.md#wave-2--backend-migration--future-proofing-contracts-2-tasks-5h-2-parallel-lanes-after-cv2-01-ships) + R-RX-FORM + DL-28 in [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High**. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § "When to escalate to Opus"](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules):

- Rule #2: **The diff touches PHI columns** (vitals, diagnosis, clinical advice — every column added here is PHI under DPDP / HIPAA).
- Rule #3: **You're writing a new migration file** (cost of getting RLS or a CHECK constraint wrong is high; cost of getting the rename wrong is silent data loss on existing drafts).

Both rules apply independently. The task is small (~150 LOC of SQL), but the cost of a mistake compounds.

**Per-message escalation rule:** Not relevant — entire task is Opus. If a single message stalls (e.g. on the precise Postgres syntax for renaming a column inside a view), reload the precedent migration files (`026_prescriptions.sql`, `090_prescription_medicines_structured.sql`) rather than escalating further.

**Manual-Sonnet fallback:** Not appropriate for this task per hard-rules.

**New chat?** **Yes** — fresh Opus chat. Pre-load:

- This task file.
- `backend/migrations/026_prescriptions.sql` (the source table; column list, RLS policy, indexes — everything this task extends).
- `backend/migrations/090_prescription_medicines_structured.sql` (precedent for a prescription-table extension — most recent prescription-related schema change, sets the style guide for this migration).
- `backend/migrations/095_prescriptions_episode_link.sql` (another precedent — column add to `prescriptions`).
- `backend/migrations/100_opd_session_modes.sql` (the most recent migration; reference for current ID-prefix conventions, header comment style, and RLS audit-table patterns).
- `backend/src/types/database.ts` (the regen target — verify the prescriptions table type is defined here; if generated via Supabase CLI, the regen invocation is `pnpm --filter backend gen:types` or similar — task identifies the actual command from `package.json` scripts).
- `backend/src/services/prescription-service.ts` (the consumer service — `rg "\.investigations\b" backend/src` returns this and any other callers that need rename-aware fallbacks until the form-side migration in cv2-07).
- `backend/src/controllers/prescription-controller.ts` (the API surface — verify which columns are exposed via which endpoints).
- The output of `rg -l "prescription_drafts" backend/migrations backend/src` to settle whether the `prescription_drafts` table exists (task does this in Step 1 as a discovery step).
- Source plan §DL-28..DL-30.

**Estimated turns:** 3–4 turns (1 discovery + 1 migration SQL + 1 type regen + 1 verification + documentation).

---

## Acceptance criteria

### Step 1 — Discovery (lock the scope before writing SQL)

Run these `rg` commands and write the findings into the migration's header comment (so future readers understand why the migration's scope is what it is):

- [ ] `rg -l "prescription_drafts" backend/migrations backend/src` — returns either zero matches (the prescription draft state is held client-side / in `prescriptions` with a status flag) OR a list of files (a separate `prescription_drafts` table exists). **The answer dictates the migration's scope.** If `prescription_drafts` exists, this migration must apply the same column additions + the same rename to that table too. If it doesn't, the migration only touches `prescriptions`.
- [ ] `rg "\.investigations\b" backend/src` — enumerate every callsite of the old column name. These callsites will continue working post-migration via the `prescriptions_legacy_v` compatibility view, but cv2-07 will rename them at the call level. Document the count in the migration header.
- [ ] `rg "follow_up\b" backend/src` — same exercise for the free-text `follow_up` column. The free-text column stays; the new `follow_up_value` + `follow_up_unit` columns are ADDITIONS. Document the deprecation plan in the header.
- [ ] `rg "CREATE TABLE.*prescription" backend/migrations` — confirm the only prescription tables are `prescriptions`, `prescription_medicines`, `prescription_attachments`. If there's anything else (e.g. `prescription_drafts`, `prescription_templates`), it might or might not need the same migration — the task picks based on whether the column set is relevant.

**Record findings in the migration's header comment.** Example header:

```sql
-- ============================================================================
-- 103_prescription_soap_fields_expansion.sql
-- ============================================================================
-- Date: 2026-05-17
-- Batch: cockpit-v2 (Phase 1) — task cv2-04
-- Description:
--   SOAP-field expansion for the cockpit-v2 prescription form refactor.
--   Adds structured vitals (7 columns), examination findings, DDx list,
--   structured follow-up (value + unit, the free-text column stays for
--   backwards-compat), advice, referral, test_results.
--   Renames `investigations` → `investigations_orders` (the old name
--   conflated the order list with the results; cockpit-v2 splits the two).
--   Adds compatibility view `prescriptions_legacy_v` exposing the old
--   column name for the deprecation window.
--
-- PHI:
--   Every new column carries PHI (vitals, clinical findings, diagnosis-
--   adjacent, treatment plan). RLS on the `prescriptions` table already
--   covers all columns (doctor-only access via `auth.uid() = doctor_id`).
--   This migration does not modify RLS policies.
--
-- Discovery (run 2026-05-17):
--   - `prescription_drafts` table existence: <YES — N callsites / NO>
--   - `investigations` callsites in backend/src: N (renamed in cv2-07)
--   - `follow_up` (free-text) callsites in backend/src: N (deprecated; column stays)
--
-- Backwards-compat:
--   - Old `investigations` column name accessible via `prescriptions_legacy_v`
--     for the ~6-week deprecation window (Phase 3 retires the view).
--   - Free-text `follow_up` column stays; populated on send as
--     `"<value> <unit>"` rendered string by the new structured form.
--
-- Rollback (NOT shipped as a separate migration this batch — documenting only):
--   - DROP VIEW IF EXISTS prescriptions_legacy_v;
--   - ALTER TABLE prescriptions RENAME COLUMN investigations_orders TO investigations;
--   - ALTER TABLE prescriptions DROP COLUMN test_results, ... <every added column>;
--   - The DDx ARRAY column drops cleanly; no FK / referential issues.
--   - Existing data in renamed column survives (rename is data-preserving).
-- ============================================================================
```

### Step 2 — Write the migration SQL

File: `backend/migrations/103_prescription_soap_fields_expansion.sql`.

- [ ] **Add structured vitals columns.** ALL with sensible CHECK constraints to prevent garbage values:

  ```sql
  -- ----------------------------------------------------------------------------
  -- 1. Structured vitals (DL-28). Replaces today's free-text vitals tracker.
  --    NULL = "not recorded" — never an empty string. Range CHECKs prevent
  --    typo-grade data quality issues (e.g., 500 BP).
  -- ----------------------------------------------------------------------------
  ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS vitals_bp_systolic   INTEGER       NULL
      CHECK (vitals_bp_systolic IS NULL OR (vitals_bp_systolic BETWEEN 30 AND 300)),
    ADD COLUMN IF NOT EXISTS vitals_bp_diastolic  INTEGER       NULL
      CHECK (vitals_bp_diastolic IS NULL OR (vitals_bp_diastolic BETWEEN 20 AND 200)),
    ADD COLUMN IF NOT EXISTS vitals_hr            INTEGER       NULL
      CHECK (vitals_hr IS NULL OR (vitals_hr BETWEEN 20 AND 250)),
    ADD COLUMN IF NOT EXISTS vitals_temp_c        NUMERIC(4,1)  NULL
      CHECK (vitals_temp_c IS NULL OR (vitals_temp_c BETWEEN 30.0 AND 45.0)),
    ADD COLUMN IF NOT EXISTS vitals_spo2          INTEGER       NULL
      CHECK (vitals_spo2 IS NULL OR (vitals_spo2 BETWEEN 0 AND 100)),
    ADD COLUMN IF NOT EXISTS vitals_wt_kg         NUMERIC(5,2)  NULL
      CHECK (vitals_wt_kg IS NULL OR (vitals_wt_kg BETWEEN 0.5 AND 500.0)),
    ADD COLUMN IF NOT EXISTS vitals_ht_cm         NUMERIC(5,1)  NULL
      CHECK (vitals_ht_cm IS NULL OR (vitals_ht_cm BETWEEN 20.0 AND 250.0));

  COMMENT ON COLUMN prescriptions.vitals_bp_systolic IS 'PHI: BP systolic in mmHg. cockpit-v2 structured vitals (DL-28).';
  COMMENT ON COLUMN prescriptions.vitals_bp_diastolic IS 'PHI: BP diastolic in mmHg. cockpit-v2 structured vitals (DL-28).';
  COMMENT ON COLUMN prescriptions.vitals_hr IS 'PHI: Heart rate in beats/min. cockpit-v2 structured vitals (DL-28).';
  COMMENT ON COLUMN prescriptions.vitals_temp_c IS 'PHI: Temperature in degrees Celsius. cockpit-v2 structured vitals (DL-28).';
  COMMENT ON COLUMN prescriptions.vitals_spo2 IS 'PHI: SpO2 (oxygen saturation) percentage. cockpit-v2 structured vitals (DL-28).';
  COMMENT ON COLUMN prescriptions.vitals_wt_kg IS 'PHI: Weight in kilograms. cockpit-v2 structured vitals (DL-28).';
  COMMENT ON COLUMN prescriptions.vitals_ht_cm IS 'PHI: Height in centimetres. cockpit-v2 structured vitals (DL-28).';
  ```

- [ ] **Add Objective + Assessment + Plan text fields:**

  ```sql
  -- ----------------------------------------------------------------------------
  -- 2. Examination findings (Objective). Free-text textarea in the cockpit's
  --    <ObjectiveSection>.
  -- ----------------------------------------------------------------------------
  ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS examination_findings TEXT NULL;

  COMMENT ON COLUMN prescriptions.examination_findings IS 'PHI: doctor''s exam findings. cockpit-v2 (DL-28).';

  -- ----------------------------------------------------------------------------
  -- 3. Differential diagnosis list (Assessment). Postgres ARRAY: zero or
  --    more strings, each a candidate diagnosis. NULL = no DDx considered.
  --    Empty array {} is treated identically to NULL by the cockpit UI.
  -- ----------------------------------------------------------------------------
  ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS differential_diagnosis TEXT[] NULL;

  COMMENT ON COLUMN prescriptions.differential_diagnosis IS 'PHI: list of differential diagnoses. cockpit-v2 (DL-28). Stored as TEXT[]; NULL = not recorded.';

  -- ----------------------------------------------------------------------------
  -- 4. Plan fields: advice, structured follow-up, referral, test results.
  --    The legacy free-text `follow_up` column stays for backwards-compat.
  -- ----------------------------------------------------------------------------
  ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS advice         TEXT     NULL,
    ADD COLUMN IF NOT EXISTS follow_up_value INTEGER NULL
      CHECK (follow_up_value IS NULL OR follow_up_value >= 0),
    ADD COLUMN IF NOT EXISTS follow_up_unit  TEXT    NULL
      CHECK (follow_up_unit IS NULL OR follow_up_unit IN ('days', 'weeks', 'months', 'as_needed')),
    ADD COLUMN IF NOT EXISTS referral       TEXT     NULL,
    ADD COLUMN IF NOT EXISTS test_results   TEXT     NULL;

  -- Either both follow_up_value + follow_up_unit are set, or both are NULL,
  -- or only follow_up_unit = 'as_needed' is set (value irrelevant for 'as_needed').
  ALTER TABLE prescriptions
    ADD CONSTRAINT prescriptions_follow_up_pairing_chk CHECK (
      (follow_up_value IS NULL AND follow_up_unit IS NULL)
      OR (follow_up_value IS NOT NULL AND follow_up_unit IS NOT NULL AND follow_up_unit IN ('days', 'weeks', 'months'))
      OR (follow_up_value IS NULL AND follow_up_unit = 'as_needed')
    );

  COMMENT ON COLUMN prescriptions.advice IS 'PHI: doctor advice text. cockpit-v2 (DL-28).';
  COMMENT ON COLUMN prescriptions.follow_up_value IS 'Structured follow-up interval, paired with follow_up_unit. cockpit-v2 (DL-28). Legacy `follow_up` (free-text) stays for backwards-compat.';
  COMMENT ON COLUMN prescriptions.follow_up_unit IS 'Unit for follow_up_value: days|weeks|months|as_needed. cockpit-v2 (DL-28).';
  COMMENT ON COLUMN prescriptions.referral IS 'PHI: referral text. cockpit-v2 (DL-28).';
  COMMENT ON COLUMN prescriptions.test_results IS 'PHI: doctor''s interpretation of returned test results (distinct from the investigations_orders list). cockpit-v2 (DL-28).';
  ```

- [ ] **Rename `investigations → investigations_orders`:**

  ```sql
  -- ----------------------------------------------------------------------------
  -- 5. Rename `investigations` → `investigations_orders`. The legacy name
  --    conflated the *order list* a doctor writes (e.g., "CBC, LFT") with
  --    the *results* a doctor receives (which now live in `test_results`).
  --    The rename clarifies; existing data is preserved by RENAME COLUMN.
  -- ----------------------------------------------------------------------------
  ALTER TABLE prescriptions
    RENAME COLUMN investigations TO investigations_orders;

  COMMENT ON COLUMN prescriptions.investigations_orders IS 'PHI: investigations / tests the doctor has ORDERED (vs test_results which is interpretations of returned results). Renamed from `investigations` in cockpit-v2 / migration 103 (DL-28).';
  ```

- [ ] **Compatibility view `prescriptions_legacy_v`:**

  ```sql
  -- ----------------------------------------------------------------------------
  -- 6. Read-time compatibility view. Exposes the old column name
  --    `investigations` for the deprecation window (~6 weeks). Any client
  --    still on the pre-rename shape can read from this view instead.
  --    Phase 3 batch (rx-polish-densification) retires the view AND the
  --    legacy free-text `follow_up` column at the same time.
  --
  --    The view is read-only (no INSERT/UPDATE/DELETE triggers); writes
  --    must use the renamed column on the underlying table.
  -- ----------------------------------------------------------------------------
  CREATE OR REPLACE VIEW prescriptions_legacy_v AS
  SELECT
    id,
    appointment_id,
    patient_id,
    doctor_id,
    type,
    cc,
    hopi,
    provisional_diagnosis,
    investigations_orders AS investigations,  -- legacy alias
    follow_up,                                -- still present, deprecated
    patient_education,
    clinical_notes,
    sent_to_patient_at,
    created_at,
    updated_at
  FROM prescriptions;

  COMMENT ON VIEW prescriptions_legacy_v IS 'Read-only legacy view exposing pre-migration-103 column names. Retired by the rx-polish-densification batch (~6 weeks out). Writes must target the underlying `prescriptions` table directly.';

  -- RLS on the underlying table propagates to the view (Postgres standard
  -- behaviour for SECURITY INVOKER views, which is the default). No
  -- explicit RLS policy needed on the view.
  ```

- [ ] **Apply the same to `prescription_drafts` IF it exists.** Discovered in Step 1. If yes, every `ALTER TABLE prescriptions ...` block above is mirrored as `ALTER TABLE prescription_drafts ...`. The compatibility view `prescription_drafts_legacy_v` is created in parallel. If no, the migration only touches `prescriptions` and the header note explains why.

- [ ] **No new indexes.** The new columns are all NULL-able PHI; no anticipated query patterns on them require indexing (filters on `appointment_id` / `doctor_id` use existing indexes). If a future query pattern demands one, it's a Phase 3 followup.

- [ ] **No RLS changes.** The `prescriptions` table's existing RLS (`auth.uid() = doctor_id`) covers all columns including the new ones.

### Step 3 — Regenerate `backend/src/types/database.ts`

- [ ] Run the type-regen command (likely `pnpm --filter backend gen:types` or `supabase gen types typescript ...`; task identifies the actual command from `package.json` scripts before running).
- [ ] **Verify** the regenerated `prescriptions` row type:

  ```ts
  prescriptions: {
    Row: {
      id: string;
      appointment_id: string;
      patient_id: string | null;
      doctor_id: string;
      type: 'structured' | 'photo' | 'both';
      cc: string | null;
      hopi: string | null;
      provisional_diagnosis: string | null;
      investigations_orders: string | null;     // ← renamed
      follow_up: string | null;
      patient_education: string | null;
      clinical_notes: string | null;
      sent_to_patient_at: string | null;
      created_at: string;
      updated_at: string;
      // new fields:
      vitals_bp_systolic: number | null;
      vitals_bp_diastolic: number | null;
      vitals_hr: number | null;
      vitals_temp_c: number | null;
      vitals_spo2: number | null;
      vitals_wt_kg: number | null;
      vitals_ht_cm: number | null;
      examination_findings: string | null;
      differential_diagnosis: string[] | null;
      advice: string | null;
      follow_up_value: number | null;
      follow_up_unit: 'days' | 'weeks' | 'months' | 'as_needed' | null;
      referral: string | null;
      test_results: string | null;
    };
    Insert: { ... };  // same fields, all optional
    Update: { ... };
  };
  ```

  (If the Supabase gen tool emits `string` instead of the union literal for `follow_up_unit`, the CHECK constraint is enforced at the DB layer — that's fine. Adding a narrow client-side type alias is cv2-05's job.)

- [ ] **Type-check:** `pnpm --filter backend tsc --noEmit` clean.

- [ ] **`rg "\.investigations\b" backend/src/services backend/src/controllers`** returns the existing callsites. They still type-check **only** if they're reading from `prescriptions_legacy_v` (which exposes `investigations`). Direct `prescriptions.investigations` reads in TypeScript will fail type-checks after regen — **this is intentional.** Document the failed callsites in this task's notes; cv2-07 fixes them with the rename.

  **Workaround for the deprecation window:** If breaking the type-check is unacceptable for the Wave 2 acceptance gate (because cv2-07 doesn't land until Wave 4), add a temporary aliased Select pattern at the service call site:

  ```ts
  // backend/src/services/prescription-service.ts
  const { data } = await supabase
    .from('prescriptions')
    .select('id, investigations_orders'); // was: .select('id, investigations')
  const investigations = data?.[0]?.investigations_orders ?? null;
  ```

  Tag every workaround with `// TODO(cv2-07): rename investigations → investigations_orders in this caller.` Acceptance: type-check is clean.

### Step 4 — `psql` smoke

- [ ] **Apply the migration on a fresh database:**

  ```bash
  # Reset to clean state and apply all migrations including 103
  pnpm --filter backend supabase:reset   # or `supabase db reset` — verify command from package.json
  ```

  Expected: every migration applies; `103_prescription_soap_fields_expansion.sql` succeeds with no errors. The schema dump (`pg_dump -s`) shows all new columns + view.

- [ ] **Apply on a database with existing `prescriptions` rows:**

  ```bash
  # Insert a row pre-migration:
  psql ... -c "INSERT INTO prescriptions (appointment_id, doctor_id, type, cc, investigations) VALUES ('<some-uuid>', '<some-doctor-uuid>', 'structured', 'Fever', 'CBC');"

  # Apply migration 103:
  pnpm --filter backend supabase:migrate

  # Verify the rename preserved data:
  psql ... -c "SELECT id, investigations_orders FROM prescriptions WHERE cc='Fever';"
  # Expected: returns the row with investigations_orders = 'CBC'.

  # Verify the legacy view exposes the old column name:
  psql ... -c "SELECT investigations FROM prescriptions_legacy_v WHERE cc='Fever';"
  # Expected: returns 'CBC'.
  ```

- [ ] **Range CHECKs work:**

  ```sql
  -- Should succeed:
  INSERT INTO prescriptions (..., vitals_bp_systolic, vitals_bp_diastolic) VALUES (..., 120, 80);
  -- Should fail (out of range):
  INSERT INTO prescriptions (..., vitals_bp_systolic) VALUES (..., 500);
  -- Expected: ERROR — new row violates check constraint.
  ```

- [ ] **Follow-up pairing CHECK works:**

  ```sql
  -- Should succeed (both NULL):
  INSERT INTO prescriptions (..., follow_up_value, follow_up_unit) VALUES (..., NULL, NULL);
  -- Should succeed (paired):
  INSERT INTO prescriptions (..., follow_up_value, follow_up_unit) VALUES (..., 7, 'days');
  -- Should succeed ('as_needed' with NULL value):
  INSERT INTO prescriptions (..., follow_up_value, follow_up_unit) VALUES (..., NULL, 'as_needed');
  -- Should fail (orphan value):
  INSERT INTO prescriptions (..., follow_up_value, follow_up_unit) VALUES (..., 7, NULL);
  -- Should fail (invalid unit):
  INSERT INTO prescriptions (..., follow_up_value, follow_up_unit) VALUES (..., 7, 'fortnight');
  ```

- [ ] **DDx array round-trips:**

  ```sql
  INSERT INTO prescriptions (..., differential_diagnosis) VALUES (..., ARRAY['Viral fever', 'Dengue', 'UTI']);
  SELECT differential_diagnosis FROM prescriptions WHERE ...;
  -- Expected: {Viral fever,Dengue,UTI}
  ```

- [ ] **RLS still enforced.** Sign in as a doctor JWT (via `set local request.jwt.claim.sub = '<doctor-uuid>'` or via the Supabase client), insert a prescription with vitals + DDx + follow-up — succeeds. Switch to a different doctor's JWT — `SELECT` returns zero rows for the first doctor's prescription. (Standard RLS spot-check.)

### Step 5 — Documentation

- [ ] **Migration header is the documentation.** Step 1's findings + the deprecation plan + the rollback SQL all live in the header comment of `103_prescription_soap_fields_expansion.sql`. No separate doc file in this task.
- [ ] **No update to `docs/Reference/engineering/architecture/CONTRACTS.md`** — the migration is internal to the prescriptions table; no new public API contract.
- [ ] **No update to `docs/Work/capture/inbox.md`** unless an unexpected callsite or pre-existing data quality issue is discovered (e.g., existing prescription rows with garbage values that would fail the new CHECKs). If discovered, append to inbox under "cockpit-v2 — pre-migration data quality"; do NOT block the migration on it (the CHECKs only fire on NEW rows — existing rows are exempt from CHECKs added later in Postgres).

---

## Out of scope

- **Form-side rename of `investigations` → `investigations_orders`** — cv2-07. This task ships the schema; cv2-07 updates the cockpit form inputs and autosave path to use the new name.
- **Service-layer rename of `investigations` references** — cv2-07. The workaround in Step 3 (aliased SELECT or read from `prescriptions_legacy_v`) buys the deprecation window.
- **New structured vitals UI** — cv2-07.
- **`<RxFormContext>` and section component extractions** — cv2-05 + cv2-06.
- **PDF template tuning to print the new fields** — Phase 3 (rx-polish-densification batch).
- **Deprecation of the free-text `follow_up` column** — Phase 3. The free-text column stays for the ~6-week deprecation window; the new structured form populates it on send as a rendered string for backwards-compat.
- **Deprecation of `prescriptions_legacy_v`** — Phase 3. Stays for the ~6-week deprecation window.
- **Rollback migration as a separate file** — NOT shipped this batch. The rollback SQL is documented in the migration header for support / incident response only.
- **Indexes on the new columns** — none planned. No query pattern in Phase 1 / 2 reads any of these columns as a filter. If a future feature needs one, it's a Phase 3 add.
- **Audit table for prescription edits** — out of scope; the existing prescription update audit (if any in `prescription_audit_*` tables) covers the new columns automatically because it's row-level.

---

## Files expected to touch

**New:**

- `backend/migrations/103_prescription_soap_fields_expansion.sql` (~150 LOC — the migration).

**Modified:**

- `backend/src/types/database.ts` (~50 LOC delta — regenerated by `pnpm --filter backend gen:types`).
- (Conditional) Service files with `investigations` direct reads — 1-line aliased SELECT change per callsite, tagged with `// TODO(cv2-07):` for cv2-07 to finalise. Total delta < 30 LOC across N callers (where N is discovered in Step 1).

**Read but do not modify:**

- `backend/migrations/026_prescriptions.sql` (the source schema; precedent for column comments + RLS).
- `backend/migrations/090_prescription_medicines_structured.sql` (precedent for prescription-table extensions).
- `backend/src/services/prescription-service.ts` (consumer; only modified if Step 3 workaround is needed).

**Tests:** No new automated test files. The `psql` smoke in Step 4 is the verification. Existing prescription-service tests still pass post-migration (RLS unchanged; new columns default to NULL on insert).

---

## Notes / open decisions

1. **Why structured vitals as 7 columns and not a JSONB blob?** Two reasons. (a) **CHECK constraints.** A JSONB blob can't enforce "0 < BP < 300" at the DB layer; you'd need a `CHECK ((vitals_json->'bp_systolic')::int < 300)` which is fragile and slow. Structured columns get free range checks. (b) **Query-ability.** Phase 3's R-HISTORY pane will want a vitals timeline ("show BP over the last 6 months"). Structured columns make that an `SELECT created_at, vitals_bp_systolic` query; JSONB makes it a `->'bp_systolic'::int` expression that won't use an index. JSONB is right for sparse, schemaless data; vitals are dense and schema'd.

2. **Why `differential_diagnosis TEXT[]` instead of `JSONB`?** Same query argument: `WHERE 'Dengue' = ANY(differential_diagnosis)` is index-friendly. JSONB adds nothing for a list of strings.

3. **Why preserve the free-text `follow_up` column?** Three mount surfaces (appointment-detail, in-call, post-call) currently read it directly. Removing it would break any of those that hasn't been migrated. The structured form populates the free-text column on send as a rendered string (`"7 days"`, `"as needed"`) for the deprecation window. Phase 3 drops the column.

4. **Why a compatibility view for the rename?** Same reason — the deprecation window. Any service or test still on the old column name reads from the view; writes target the renamed underlying column. Phase 3 retires the view.

5. **Why `examination_findings` as TEXT and not structured?** Doctor's clinical findings are inherently free-form prose. Structuring them as "system: cardiovascular, finding: S1 S2 normal, ..." would force a clinical taxonomy nobody has agreed on. TEXT is the right shape; if a future batch wants structure, it'll add a sibling table without dropping this column.

6. **Why is the migration numbered 103?** Per the current migration index — `100_*`, `101_*`, `102_*` are claimed by the opd-per-day-mode batch (Wave 1 / Wave 3 / Wave 5). 103 is the next free number on 2026-05-17. If both batches land out of order, the numbering still works (Postgres applies migrations in lexical order, not by content).

7. **What if `prescription_drafts` is discovered to exist in Step 1?** Mirror every `ALTER TABLE` to that table. Mirror the compatibility view as `prescription_drafts_legacy_v`. Header comment notes both tables are extended. Time estimate grows from ~3h to ~4h.

8. **Could the migration ship the rollback as a separate `103_down.sql`?** Not the repo convention — current migrations don't ship paired down-migrations; rollbacks are documented in headers and applied manually via `psql` if needed. Don't deviate.

9. **Why not enforce `examination_findings IS NOT NULL` for `type = 'structured'`?** Optional fields are the right default in Phase 1. A doctor mid-call might save a draft with only CC + provisional diagnosis. The cockpit's send-Rx gate (Phase 3's R-RX-POLISH safety modal) will be the right place to enforce minimum-viable-content rules, not the DB schema.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:** as above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § R-RX-FORM + DL-28..DL-30](../../../Product%20plans/plan-cockpit-v2.md).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-v2.md` § Wave 2 gate](./EXECUTION-ORDER-cockpit-v2.md#wave-2-gate-after-cv2-04--cv2-09).
- **Parallel task in Wave 2:** [`task-cv2-09-future-proofing-contracts.md`](./task-cv2-09-future-proofing-contracts.md) — Lane β of Wave 2. Frontend type / contract extensions. Independent of this task; can run in parallel.
- **Next task in Lane:** N/A. Wave 2 Lane α ends here; Wave 3 Lane β (cv2-05) consumes this task's regenerated types.
- **Migration precedents:** [`backend/migrations/026_prescriptions.sql`](../../../../../backend/migrations/026_prescriptions.sql), [`backend/migrations/090_prescription_medicines_structured.sql`](../../../../../backend/migrations/090_prescription_medicines_structured.sql), [`backend/migrations/100_opd_session_modes.sql`](../../../../../backend/migrations/100_opd_session_modes.sql) (most recent migration; reference for header comment style).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
