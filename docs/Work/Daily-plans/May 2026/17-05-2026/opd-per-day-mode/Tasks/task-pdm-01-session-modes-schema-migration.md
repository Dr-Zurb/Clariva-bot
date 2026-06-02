# Task pdm-01: `doctor_opd_session_modes` + audit table migration + PD-Q6 backfill

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 1, Lane α step 0 — **M, ~3.5h**

---

## Task overview

Land the data foundation for **every** downstream task in this batch:

1. **`doctor_opd_session_modes` (fact table, mutable).** One row per `(doctor_id, session_date)` recording the mode that day is operating in. PK = `(doctor_id, session_date)`. Written on first booking OR first manual flip (DL-10 lazy materialisation). Mutated by conversion service (pdm-04) and by the policy-defaulting code path on first booking (pdm-02 / pdm-07). Read by everything downstream — the doctor hub, the patient snapshot, the slot-join grace gate, the OPD-tab pill dropdown.
2. **`doctor_opd_session_mode_changes` (audit table, immutable).** One row per flip, append-only. Powers support diagnostics ("when did Dr. X flip Tuesday?") and the DL-14 soft nudge (`change_count >= 2`).
3. **Backfill (PD-Q6).** One `INSERT … SELECT` inside the migration that classifies every historical `(doctor, session_date)` with at least one non-cancelled appointment, using "any `opd_queue_entries` row exists for the day" as the queue heuristic. After backfill, every historically-touched date has a fact row; the resolver hierarchy never needs to invent a mode for past dates.

Migration is `100_opd_session_modes.sql`. Style matches existing predecessors (`028_opd_modes.sql`, `099_doctor_cockpit_layout_presets.sql`).

**Estimated time:** ~3.5h (1h schema design + ~30min RLS + 30min trigger + 30min backfill query + 30min unit-test fixtures + 30min verification + 30min for the inevitable Postgres syntax skirmish).

**Status:** Pending.

**Hard deps:** none — this is the load-bearing primitive.

**Source:** [plan-opd-per-day-mode-batch.md § Wave 1](../plan-opd-per-day-mode-batch.md#wave-1--data-foundation-3-tasks-10h-single-sequential-lane) + `S1.1` and `DL-1` + `DL-10` + `DL-13` + `PD-Q6` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** (manually picked). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § "When to escalate to Opus"](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules):

> 3. You're writing a new migration file (the cost of getting RLS or a backfill wrong is high).

This is squarely on the hard-rules list — new migration + RLS policies + audit-log table + a backfill that must be correct on first try (re-running a backfill against a production DB is expensive). Auto would happily ship something that compiles and runs, but the failure mode is silent mis-classification of historical days, which then makes the past-dates-don't-show bug **worse** rather than fixing it.

**Per-message escalation rule:** N/A — start the chat on Opus.

**Fallback if stuck:** if Opus refuses to commit to a backfill heuristic, paste the `appointment-service.ts` lines 380–460 (the `opd_queue_entries` creation code) into the chat to confirm the PD-Q6 heuristic is correct by construction. The heuristic should not need its own paragraph of debate.

**New chat?** **Yes** — fresh Opus chat. Pre-load:

- This task file.
- `backend/migrations/028_opd_modes.sql` (the predecessor — same shape: table + RLS + `updated_at` trigger; this task adds a second table + a backfill).
- `backend/migrations/099_doctor_cockpit_layout_presets.sql` (the most recent migration — newest formatting / comment conventions).
- `backend/migrations/030_opd_session_delay.sql` and `backend/migrations/031_appointments_opd_edge_cases.sql` (the OPD-adjacent migrations that establish the slot-mode columns this batch's conversion code clears).
- `backend/src/services/appointment-service.ts` — **specifically lines ~380–460** where `opd_queue_entries` rows get created. The PD-Q6 backfill heuristic ("queue if any `opd_queue_entries` row exists for the day") is sound because these rows are only created in queue mode; pre-load this file to verify before writing the backfill query.
- Source plan §DL-1, §DL-10, §DL-13, §PD-Q6.

**Estimated turns:** 4–6 turns (1 schema design, 1 RLS, 1 trigger + backfill, 1 verification step, 1–2 for edge-case discussion and the Opus close-review of the diff before commit).

---

## Acceptance criteria

### Step 1 — Migration file boilerplate

- [ ] Create `backend/migrations/100_opd_session_modes.sql` matching the style of `028_opd_modes.sql` (banner comment, numbered sections, idempotent `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`).

- [ ] Banner comment:

  ```sql
  -- ============================================================================
  -- OPD per-day mode: session-day fact + audit (pdm-01)
  -- ============================================================================
  -- Migration: 100_opd_session_modes.sql
  -- Date: 2026-05-17
  -- Description:
  --   Replace doctor-global doctor_settings.opd_mode as the operational authority
  --   with a per-(doctor, session_date) fact table. Add an immutable audit log
  --   for every flip. Backfill every historically-touched (doctor, session_date)
  --   using "any opd_queue_entries row exists for the day" as the queue heuristic
  --   (PD-Q6).
  --
  -- After this migration:
  --   * doctor_opd_session_modes IS the authority for "what mode is this date in?"
  --   * doctor_settings.opd_mode survives as the lowest-priority resolver fallback
  --     (only consulted when no fact row AND no mode_schedule policy exists).
  --   * Every historically-touched (doctor, session_date) has a fact row with
  --     source='backfill' and change_count=0.
  --
  -- RLS: doctor owns rows (read + insert + update); backend uses service role.
  -- Audit rows are insert-only for doctors; no update / delete RLS policy.
  -- ============================================================================
  ```

### Step 2 — `doctor_opd_session_modes` (fact table, mutable)

- [ ] Create table:

  ```sql
  CREATE TABLE IF NOT EXISTS doctor_opd_session_modes (
    doctor_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_date  DATE NOT NULL,
    mode          TEXT NOT NULL
      CONSTRAINT doctor_opd_session_modes_mode_check CHECK (mode IN ('slot', 'queue')),
    source        TEXT NOT NULL DEFAULT 'doctor'
      CONSTRAINT doctor_opd_session_modes_source_check CHECK (
        source IN ('doctor', 'policy_default', 'backfill', 'system_overrun_fallback')
      ),
    change_count  INTEGER NOT NULL DEFAULT 0,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doctor_id, session_date)
  );
  ```

  **Column rationale:**

  - **`source`** — tracks how the row was created. `'backfill'` is the migration; `'policy_default'` is the policy-defaulting code path on first booking (pdm-07); `'doctor'` is every manual flip; `'system_overrun_fallback'` is reserved for a future code path where the 24h fallback re-flips a day's mode (currently unused but defined to keep the constraint stable).
  - **`change_count`** — increments on every flip. Read by the DL-14 soft nudge.
  - **`changed_at`** — separate from `updated_at` because `updated_at` is bumped by the trigger on any column update; `changed_at` is set only when `mode` actually changes. Conversion service (pdm-04) writes both.

- [ ] Indexes:

  ```sql
  -- Per-doctor lookups dominate (the resolver reads (doctor, date) ⇒ PK is enough).
  -- The query "what dates has Dr. X materialised?" is the only other shape, and the PK suffices.
  -- No additional indexes needed at this scale.
  ```

  Document the no-additional-indexes choice as a comment in the migration; downstream agents reviewing the migration should not be tempted to add speculative indexes.

- [ ] Comments:

  ```sql
  COMMENT ON TABLE doctor_opd_session_modes IS
    'Per-(doctor, session_date) mode fact. Authoritative read for "what mode is this date?" '
    'Replaces doctor_settings.opd_mode as the operational authority (pdm-01).';
  COMMENT ON COLUMN doctor_opd_session_modes.source IS
    'doctor | policy_default | backfill | system_overrun_fallback (pdm-01)';
  COMMENT ON COLUMN doctor_opd_session_modes.change_count IS
    'Number of mode flips since materialisation. Drives DL-14 soft nudge.';
  COMMENT ON COLUMN doctor_opd_session_modes.changed_at IS
    'Last time mode actually changed (distinct from updated_at, which bumps on any update).';
  ```

### Step 3 — `doctor_opd_session_mode_changes` (audit table, immutable)

- [ ] Create table:

  ```sql
  CREATE TABLE IF NOT EXISTS doctor_opd_session_mode_changes (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_date             DATE NOT NULL,
    from_mode                TEXT NULL
      CONSTRAINT doctor_opd_session_mode_changes_from_mode_check CHECK (from_mode IN ('slot', 'queue') OR from_mode IS NULL),
    to_mode                  TEXT NOT NULL
      CONSTRAINT doctor_opd_session_mode_changes_to_mode_check CHECK (to_mode IN ('slot', 'queue')),
    affected_apt_count       INTEGER NOT NULL DEFAULT 0,
    overflow_count           INTEGER NOT NULL DEFAULT 0,
    notification_dispatched  BOOLEAN NOT NULL DEFAULT false,
    triggered_by             TEXT NOT NULL
      CONSTRAINT doctor_opd_session_mode_changes_triggered_by_check CHECK (
        triggered_by IN ('doctor', 'system_policy', 'system_overrun_fallback', 'backfill')
      ),
    correlation_id           UUID NULL,
    notes                    TEXT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```

  **Column rationale:**

  - **`from_mode` nullable** — first materialisation of a date (the fact row didn't exist before) has no `from_mode`. Backfill writes one row per backfilled day with `from_mode = NULL, to_mode = backfilled_mode, triggered_by = 'backfill'`. Subsequent flips fill `from_mode` from the fact row's previous value.
  - **`notification_dispatched`** — flipped to `true` by pdm-06 when the debounced batch actually dispatches. Lets support diagnose "the doctor flipped 3 times in 4 min — did patients get notified at all?" with one query.
  - **`correlation_id`** — links audit rows that belong to the same conversion attempt (pdm-04's `correlationId`). Useful when a conversion is rolled back mid-transaction and the row never makes it.
  - **No `updated_at`** — immutable.

- [ ] Indexes:

  ```sql
  CREATE INDEX IF NOT EXISTS idx_doctor_opd_session_mode_changes_doctor_session
    ON doctor_opd_session_mode_changes (doctor_id, session_date, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_doctor_opd_session_mode_changes_correlation
    ON doctor_opd_session_mode_changes (correlation_id) WHERE correlation_id IS NOT NULL;
  ```

- [ ] Comments:

  ```sql
  COMMENT ON TABLE doctor_opd_session_mode_changes IS
    'Immutable audit log of every mode flip. One row per flip. Powers DL-14 nudge + support diagnostics (pdm-01).';
  ```

### Step 4 — RLS on both tables

- [ ] **Fact table** — doctor full CRUD on own rows; service role bypasses.

  ```sql
  ALTER TABLE doctor_opd_session_modes ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Doctors can read own session modes" ON doctor_opd_session_modes;
  DROP POLICY IF EXISTS "Doctors can insert own session modes" ON doctor_opd_session_modes;
  DROP POLICY IF EXISTS "Doctors can update own session modes" ON doctor_opd_session_modes;
  -- DELETE policy intentionally omitted: doctors cannot drop a materialised day.

  CREATE POLICY "Doctors can read own session modes"
    ON doctor_opd_session_modes FOR SELECT
    USING (doctor_id = auth.uid());

  CREATE POLICY "Doctors can insert own session modes"
    ON doctor_opd_session_modes FOR INSERT
    WITH CHECK (doctor_id = auth.uid());

  CREATE POLICY "Doctors can update own session modes"
    ON doctor_opd_session_modes FOR UPDATE
    USING (doctor_id = auth.uid())
    WITH CHECK (doctor_id = auth.uid());
  ```

  **No DELETE policy.** A doctor cannot drop a fact row — once a day is materialised, it stays. (If a future "I never operated that day, remove it from history" need surfaces, that's a service-role-only path through a support endpoint, not RLS.)

- [ ] **Audit table** — doctor read + insert on own rows; no update, no delete.

  ```sql
  ALTER TABLE doctor_opd_session_mode_changes ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Doctors can read own session mode changes" ON doctor_opd_session_mode_changes;
  DROP POLICY IF EXISTS "Doctors can insert own session mode changes" ON doctor_opd_session_mode_changes;

  CREATE POLICY "Doctors can read own session mode changes"
    ON doctor_opd_session_mode_changes FOR SELECT
    USING (doctor_id = auth.uid());

  CREATE POLICY "Doctors can insert own session mode changes"
    ON doctor_opd_session_mode_changes FOR INSERT
    WITH CHECK (doctor_id = auth.uid());

  -- No UPDATE policy: audit rows are immutable.
  -- No DELETE policy: audit rows are immutable.
  ```

### Step 5 — `updated_at` trigger on fact table

- [ ] Reuse the existing `update_updated_at_column()` function (introduced earlier in the migration history):

  ```sql
  DROP TRIGGER IF EXISTS doctor_opd_session_modes_updated_at ON doctor_opd_session_modes;
  CREATE TRIGGER doctor_opd_session_modes_updated_at
    BEFORE UPDATE ON doctor_opd_session_modes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  ```

  No trigger on the audit table (immutable, no UPDATE path).

### Step 6 — PD-Q6 backfill (in the same migration)

- [ ] **Fact table backfill.** One `INSERT … SELECT` that materialises every `(doctor, session_date)` with ≥ 1 non-cancelled appointment:

  ```sql
  INSERT INTO doctor_opd_session_modes (doctor_id, session_date, mode, source, change_count, changed_at, created_at, updated_at)
  SELECT
    a.doctor_id,
    a.appointment_date::date AS session_date,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM opd_queue_entries q
        WHERE q.doctor_id = a.doctor_id
          AND q.session_date = a.appointment_date::date
      ) THEN 'queue'
      ELSE 'slot'
    END AS mode,
    'backfill' AS source,
    0 AS change_count,
    now() AS changed_at,
    now() AS created_at,
    now() AS updated_at
  FROM appointments a
  WHERE a.status NOT IN ('cancelled')
  GROUP BY a.doctor_id, a.appointment_date::date
  ON CONFLICT (doctor_id, session_date) DO NOTHING;
  ```

  **Why `GROUP BY`?** Many appointments per `(doctor, date)`; we want one row per group, not one row per appointment.

  **Why `ON CONFLICT … DO NOTHING`?** Defensive — the migration is idempotent. Re-running it on a DB that's already been backfilled (e.g., after a partial restore) is a no-op.

  **Why `'cancelled'` only excluded (not `'pending'` / `'confirmed'`)?** PD-Q6 says "at least one non-cancelled appointment." Past dates that had only cancellations are dead history; no need to materialise them. Forward-dated `pending` / `confirmed` are the live ones — they need materialisation so the resolver returns a stable mode.

- [ ] **Audit table backfill.** One row per backfilled day with `from_mode = NULL, to_mode = mode, triggered_by = 'backfill'`:

  ```sql
  INSERT INTO doctor_opd_session_mode_changes (doctor_id, session_date, from_mode, to_mode, affected_apt_count, overflow_count, notification_dispatched, triggered_by, correlation_id, notes, created_at)
  SELECT
    m.doctor_id,
    m.session_date,
    NULL AS from_mode,
    m.mode AS to_mode,
    (
      SELECT COUNT(*)
      FROM appointments a
      WHERE a.doctor_id = m.doctor_id
        AND a.appointment_date::date = m.session_date
        AND a.status NOT IN ('cancelled')
    ) AS affected_apt_count,
    0 AS overflow_count,
    false AS notification_dispatched,
    'backfill' AS triggered_by,
    NULL AS correlation_id,
    'Initial backfill from migration 100 (PD-Q6 heuristic).' AS notes,
    now() AS created_at
  FROM doctor_opd_session_modes m
  WHERE m.source = 'backfill';
  ```

  **Why a second pass instead of one combined CTE?** Readability + the audit table's `affected_apt_count` subquery would balloon a combined CTE. The two passes are ~100ms total on a 100k-appointment DB.

### Step 7 — Type generation + frontend types stub

- [ ] **Regenerate Supabase types** (run after the migration is applied):

  ```bash
  pnpm --filter backend supabase:gen-types
  # (Or whatever the project's standard type-gen command is — verify in package.json.)
  ```

  Verify `backend/src/types/database.ts` now includes `doctor_opd_session_modes` and `doctor_opd_session_mode_changes` rows.

- [ ] **Frontend types stub** (one file, future tasks extend it):

  Create `frontend/types/opd-session.ts`:

  ```ts
  // Per-(doctor, session_date) mode fact. Read by OpdTodayClient and downstream.
  // pdm-01: type definitions only; consumers added in pdm-02 / pdm-03.
  export type OpdSessionDayMode = 'slot' | 'queue';

  export type OpdSessionDayModeSource =
    | 'doctor'
    | 'policy_default'
    | 'backfill'
    | 'system_overrun_fallback';

  export interface OpdSessionDayModeRow {
    doctorId: string;
    sessionDate: string; // ISO date (YYYY-MM-DD)
    mode: OpdSessionDayMode;
    source: OpdSessionDayModeSource;
    changeCount: number;
    changedAt: string; // ISO datetime
    createdAt: string;
    updatedAt: string;
  }
  ```

### Step 8 — Verification (deterministic)

- [ ] **Schema applies cleanly:**

  ```bash
  pnpm --filter backend supabase:migrate:reset   # or the project's reset command
  # Expected: migration 100 reports success.
  ```

- [ ] **Idempotency:**

  ```bash
  pnpm --filter backend supabase:migrate:up      # re-run on already-migrated DB
  # Expected: no errors, no row changes (CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING).
  ```

- [ ] **Backfill correctness — spot-check 20 random historical days.** From the seed / dev DB:

  ```sql
  -- Sample 10 historical days that should be 'queue':
  SELECT m.doctor_id, m.session_date, m.mode,
         (SELECT COUNT(*) FROM opd_queue_entries q WHERE q.doctor_id = m.doctor_id AND q.session_date = m.session_date) AS queue_rows
  FROM doctor_opd_session_modes m
  WHERE m.mode = 'queue'
  ORDER BY RANDOM()
  LIMIT 10;
  -- Expected: every row has queue_rows > 0.

  -- Sample 10 historical days that should be 'slot':
  SELECT m.doctor_id, m.session_date, m.mode
  FROM doctor_opd_session_modes m
  WHERE m.mode = 'slot'
  ORDER BY RANDOM()
  LIMIT 10;
  -- Expected: zero opd_queue_entries rows for each.
  -- Verify by hand-picking 2-3 from the result.
  ```

  Document the spot-check numbers in the PR description ("20/20 random rows verified correct").

- [ ] **No regression** — every existing OPD-related migration and the existing OPD test suite still pass. `pnpm --filter backend test -- opd` clean.

- [ ] **Type-check** — `pnpm --filter backend tsc --noEmit` clean. `pnpm --filter frontend tsc --noEmit` clean (the new `frontend/types/opd-session.ts` file should be referenced nowhere yet — that's pdm-02's job — so it just sits as an unused export).

- [ ] **RLS smoke** — as a doctor JWT, `SELECT * FROM doctor_opd_session_modes` returns only own rows. As a different doctor's JWT, the same query returns zero rows. As the service role, all rows visible.

- [ ] **Audit row immutability smoke** — as a doctor JWT, `UPDATE doctor_opd_session_mode_changes SET notes = 'tamper'` fails with an RLS rejection.

---

## Out of scope

- **Conversion service** — pdm-04. This migration creates the tables; the writes come later.
- **Unified `/opd/session` endpoint** — pdm-02. The new tables exist but no API exposes them yet.
- **Read-path consumers** — pdm-03. `OpdTodayClient.tsx`, `opd-snapshot-service.ts`, `assertSlotJoinAllowedForPatient` still read `doctor_settings.opd_mode` after this task — that's pdm-03's swap.
- **Notification batch table** — pdm-06's migration (`101_opd_pending_mode_notifications.sql`).
- **Policy resolver** — pdm-07 adds the per-date resolver that consumes the fact table.
- **Soft nudge advisory** — pdm-11 reads `change_count`.
- **`doctor_settings.opd_mode` deprecation** — PD-D4, deferred. The column stays writable + readable as the lowest-priority resolver fallback.
- **`session_overrun` flag on appointments** — pdm-09 decides derived-on-read vs new column. Not this task's surface area.

---

## Files expected to touch

**New:**

- `backend/migrations/100_opd_session_modes.sql` (~150 LOC — schema + RLS + trigger + backfill, in the style of `028_opd_modes.sql`).
- `frontend/types/opd-session.ts` (~30 LOC — type stubs for pdm-02 onwards).

**Modified:**

- `backend/src/types/database.ts` (regenerated — adds `doctor_opd_session_modes` and `doctor_opd_session_mode_changes` table rows).

**Tests:** no new test files in this task. The backfill correctness check is a deterministic spot-check (Step 8); fixture-based tests for conversion live in pdm-04.

---

## Notes / open decisions

1. **Why not a partial unique constraint on `(doctor_id, session_date)` for the audit table?** Each flip writes a fresh row; no UNIQUE on `(doctor_id, session_date)` because the same `(doctor, date)` can be flipped many times. The PK is the surrogate `id`. The composite index `(doctor_id, session_date, created_at DESC)` covers the support-query shape ("show me the flip history for Dr. X on Tuesday").
2. **Why `gen_random_uuid()` for the audit `id`?** Matches the project convention (see `028_opd_modes.sql` line 27, `opd_queue_entries.id`). `pgcrypto` is already enabled.
3. **Could the fact table use a UUID surrogate key instead of the composite PK?** It could, but `(doctor_id, session_date)` is the natural key, no lookup ever needs the surrogate, and a composite PK auto-indexes for the dominant query shape ("what mode is Dr. X's Tuesday?"). Surrogate adds bytes without value.
4. **Why is `source = 'system_overrun_fallback'` defined but unused?** Forward-compat. DL-8's 24h auto-reschedule fallback could conceivably re-flip a day's mode (e.g., if the fallback rolls a queue day into slot mode for a specific overflow re-org pattern). Defining the value now means future code can write it without a constraint migration.
5. **Could backfill misclassify "I deleted all my queue entries last week"?** Yes, but only for days where the doctor ran queue mode, completed every appointment, and then explicitly deleted the queue entries via a custom path. In practice the `opd_queue_entries` rows live for ≥ 7 days (no scheduled deletion). If a doctor manually nuked queue entries from the DB, they're outside the support contract. Accept the small risk.
6. **Why not insert a "default" row for every doctor regardless of bookings?** Lazy materialisation (DL-10). A row is only meaningful once the day has a booking; pre-creating rows for every doctor × every date for the next year would be ~1M rows of noise.
7. **What if a doctor has no `appointment_date::date` rows but has `opd_queue_entries`?** Impossible by FK — `opd_queue_entries.appointment_id` references `appointments.id`. The backfill query is correct by construction.
8. **Could the migration deadlock with concurrent booking writes during the backfill?** The `INSERT … SELECT … ON CONFLICT DO NOTHING` takes a row-level lock per inserted row; the `appointments` table read is consistent. On a busy production DB, run the migration in a maintenance window or wrap it in `STATEMENT_TIMEOUT 0` to prevent the default 30s timeout from killing a long backfill. Document in the PR.

---

## References

- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-1, DL-10, DL-13, PD-Q6](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Schema precedent:** [`backend/migrations/028_opd_modes.sql`](../../../../../backend/migrations/028_opd_modes.sql) — table + RLS + trigger pattern.
- **Newest-migration style:** [`backend/migrations/099_doctor_cockpit_layout_presets.sql`](../../../../../backend/migrations/099_doctor_cockpit_layout_presets.sql) — formatting + comment conventions.
- **Backfill heuristic ground truth:** `backend/src/services/appointment-service.ts` lines 380–460 — the `opd_queue_entries` creation code that justifies "queue if any queue row exists".
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 1 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-1-gate-after-pdm-03).
- **Next task:** [`task-pdm-02-unified-session-endpoint.md`](./task-pdm-02-unified-session-endpoint.md) — fresh chat (Auto). Pre-loads this migration's outputs (types, table shapes).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
