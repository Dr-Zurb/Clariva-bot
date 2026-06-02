# Task pr-02: Server-side search / segment / sort / pagination on `GET /api/v1/patients`

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 1, Lane α step 1 — **S, ~3h**

---

## Task overview

Replace the client-side name filter in `PatientsListWithFilters.tsx` with a real server-side query surface so the new list table (pr-07) can scale past a few hundred patients and so segments (DL-4) and saved views (DL-9) can mean something. Extend `GET /api/v1/patients` with five query parameters — `q`, `segment`, `sort`, `page`, `pageSize` — and ship the SQL inside `backend/src/services/patient-service.ts` for each segment. RLS is unchanged; every query is scoped to `auth.uid() = doctor_id` exactly as today.

This task also performs a discovery step on the `patients` table: if there's no `patient_tag TEXT` column (the `untagged` segment depends on it), ship a single XS migration `103_patients_tags.sql` that adds the column with a sensible default + an index. The column has no PHI shape (it's a free-text label the doctor types in pr-07's bulk-tag action), so this migration is **not** on the hard-rules list and stays in Auto.

The v1 routes still consume the v1 response shape (no `total` / `page` fields). The new response shape extends the v1 envelope so the v1 callers keep working unchanged — the new pagination metadata is additive.

**Estimated time:** ~3h (15min discovery + 30min optional migration + 1.5h segment SQL + 30min controller/route wiring + 30min `psql` verification).

**Status:** Pending.

**Hard deps:** pr-01 (the `PatientListFilters` / `PatientListSortId` / `PatientSegmentId` types).

**Source:** [plan-patients-redesign-batch.md § Wave 1](../plan-patients-redesign-batch.md#wave-1--foundation-2-tasks-5h-single-sequential-lane) + DL-4, DL-11.

---

## Model & execution guidance

**Recommended model:** Auto. Standard backend extension: new query params + a switch on segment + parameterised SQL. The migration (if needed) is single-column additive, not on the hard-rules list (no RLS shape change, no PHI shape change — `patient_tag` is a clinic-internal label, not patient health data).

**Per-message escalation rule:** Escalate to Opus only if a single segment's SQL would require a non-trivial CTE or a recursive correlated subquery — the `at-risk-followup` segment is the closest candidate (joins `prescriptions.follow_up_value` against subsequent appointments). The task spec below pre-writes the SQL so escalation shouldn't be needed.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `backend/src/controllers/patient-controller.ts` (the controller this task extends — the `getPatients` handler).
- `backend/src/services/patient-service.ts` (the service this task extends — `getPatientsForDoctor` / equivalent).
- `backend/src/utils/validation.ts` (the existing query-param validator helpers).
- `backend/src/routes/api/v1/patients.ts` (route registration; should not need changes but verify).
- `backend/migrations/026_appointments_indexes.sql` (or whichever migration is the most recent precedent for an additive column + index — task picks the precedent from the latest 5 migrations).
- `frontend/types/patient.ts` (post-pr-01 — the type contracts this task implements).
- Source plan §DL-4, §DL-11.

**Estimated turns:** 3–4 turns (1 discovery + 1 migration (if needed) + 1 segment SQL + 1 controller/route + 1 verification).

---

## Acceptance criteria

### Step 1 — Discovery (lock the scope)

- [ ] Run `rg "patient_tag\b" backend/migrations` — record whether the column exists.
- [ ] Run `rg "patient_tag\b" backend/src/types/database.ts` — same.
- [ ] If the column exists, skip Step 2 (the migration). If it doesn't, proceed to Step 2.
- [ ] Run `rg "GROUP_CONCAT|FILTER \(WHERE|window function" backend/src/services` — sanity-check whether the codebase uses Postgres window functions yet. The segment SQL below uses `COUNT(*) FILTER (WHERE …)` extensively — verify Postgres version supports it (every supported PG version does; this is just a sanity check).

### Step 2 — Migration `103_patients_tags.sql` (conditional on Step 1 discovery)

If the discovery in Step 1 confirms the column doesn't exist, ship this single migration:

```sql
-- ============================================================================
-- 103_patients_tags.sql
-- ============================================================================
-- Date: 2026-05-18
-- Batch: patients-redesign (Phase 1) — task pr-02
-- Description:
--   Adds free-text `patient_tag` column to the `patients` table for the
--   "untagged" segment filter (DL-4) and the bulk-tag action (DL-11).
--   The tag is a clinic-internal label set by the doctor — no PHI.
--
-- Not on hard-rules list:
--   - No RLS shape change (the existing patients RLS predicate covers all columns).
--   - No PHI added (a tag like "VIP" or "Follow-up needed" is not patient health data).
--
-- Rollback (NOT shipped as a separate migration this batch — documenting only):
--   DROP INDEX IF EXISTS idx_patients_tag_lower;
--   ALTER TABLE patients DROP COLUMN IF EXISTS patient_tag;
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS patient_tag TEXT;

-- Index for `?segment=untagged` (cheap; the table is small per doctor)
-- and for any future text-search on tag values. Lower-cased to match the
-- case-insensitive search pattern the segment SQL uses.
CREATE INDEX IF NOT EXISTS idx_patients_tag_lower
  ON patients (doctor_id, LOWER(patient_tag))
  WHERE patient_tag IS NOT NULL;

COMMENT ON COLUMN patients.patient_tag IS
  'Doctor-set free-text label (e.g. "VIP", "Follow-up needed"). Not PHI.';
```

- [ ] Migration applies cleanly on a fresh DB and on a DB with existing rows. `INSERT INTO patients (..., patient_tag) VALUES (..., 'vip')` succeeds. `SELECT patient_tag FROM patients WHERE patient_tag = 'vip'` returns the row.
- [ ] Regenerate `backend/src/types/database.ts` — the `Patient` type gains `patient_tag: string | null`.

### Step 3 — Service-layer query function

Extend (or replace) the existing `getPatientsForDoctor(doctorId)` in `patient-service.ts` with `getPatientsForDoctorFiltered(doctorId, filters)`. The function returns the paginated shape `PatientsListPagedData`.

- [ ] **Function signature:**

  ```ts
  export async function getPatientsForDoctorFiltered(
    doctorId: string,
    filters: PatientListFilters,
  ): Promise<PatientsListPagedData> {
    // ...
  }
  ```

- [ ] **Query construction.** Build the WHERE clause progressively:

  1. **Base filter** (always): `doctor_id = $1` (RLS belt-and-suspenders even though the service is called inside an RLS-scoped Supabase client).
  2. **`q` (free-text)** — when non-empty, add: `AND (LOWER(name) LIKE LOWER($q_pat) OR phone LIKE $q_pat OR LOWER(medical_record_number) LIKE LOWER($q_pat) OR LOWER(platform_external_id) LIKE LOWER($q_pat))` where `$q_pat = '%' || $q || '%'`. (Substring; no fuzzy match — Phase 2 may add `pg_trgm` similarity.)
  3. **`segment`** — apply the matching SQL filter:
     - `active-90d` → `AND last_appointment_date >= now() - INTERVAL '90 days'`
     - `new-30d` → `AND created_at >= now() - INTERVAL '30 days'`
     - `at-risk-followup` → `AND id IN (SELECT p.patient_id FROM prescriptions p WHERE p.doctor_id = $1 AND p.follow_up_value IS NOT NULL AND (p.created_at + (p.follow_up_value || ' ' || COALESCE(p.follow_up_unit, 'days'))::INTERVAL) < now() AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.patient_id AND a.doctor_id = $1 AND a.appointment_date > (p.created_at + (p.follow_up_value || ' ' || COALESCE(p.follow_up_unit, 'days'))::INTERVAL) AND a.status IN ('completed', 'confirmed')))`
       - **Defensive note:** if `prescriptions.follow_up_value` / `follow_up_unit` don't exist on the running schema (cv2-04 ships them; this batch runs in parallel), gracefully degrade to the existing `follow_up TEXT` field with a regex-based extraction OR skip the segment with a 400 response (`segment unsupported on current schema`). The task does a `rg "follow_up_value" backend/src/types/database.ts` discovery to pick which path.
     - `no-show-prone` → `AND (SELECT COUNT(*) FILTER (WHERE status = 'no_show') FROM (SELECT status FROM appointments WHERE patient_id = patients.id AND doctor_id = $1 ORDER BY appointment_date DESC LIMIT 4) AS recent) >= 2`
     - `has-allergies` → `AND EXISTS (SELECT 1 FROM patient_allergies WHERE patient_id = patients.id AND doctor_id = $1 AND archived_at IS NULL)`
     - `has-open-episodes` → `AND EXISTS (SELECT 1 FROM patient_problem_list_v WHERE patient_id = patients.id AND doctor_id = $1 AND source = 'episode' AND episode_status IS DISTINCT FROM 'closed')`
     - `untagged` → `AND (patient_tag IS NULL OR patient_tag = '')`
  4. **No other implicit filters.**

- [ ] **Sort clause.** Map `sort` to ORDER BY:
  - `last-visit-desc` → `ORDER BY last_appointment_date DESC NULLS LAST, name ASC`
  - `last-visit-asc` → `ORDER BY last_appointment_date ASC NULLS LAST, name ASC`
  - `created-at-desc` → `ORDER BY created_at DESC`
  - `created-at-asc` → `ORDER BY created_at ASC`
  - `name-asc` → `ORDER BY LOWER(name) ASC`
  - Default (no `sort` param): `ORDER BY last_appointment_date DESC NULLS LAST, name ASC`.

- [ ] **Pagination.** Apply `LIMIT $pageSize OFFSET (($page - 1) * $pageSize)`. Default `pageSize = 50`, max `pageSize = 200` (clamp server-side; reject larger with 400).

- [ ] **`total` count.** Execute a second query with the same WHERE clause and `SELECT COUNT(*)` (no LIMIT / OFFSET). Optimised: skip the count query when `?page=1` AND the result set has `< pageSize` rows (then `total = result.length`).

- [ ] **`last_appointment_date` source.** Already in the `PatientSummary` shape — it's a JOIN from the `appointments` table the existing service computes. Preserve the existing JOIN; don't re-implement.

### Step 4 — Controller-layer wiring

- [ ] **In `backend/src/controllers/patient-controller.ts`**, extend the `getPatients` handler to parse query params via the validator:

  ```ts
  const filters: PatientListFilters = {
    q: validateOptionalString(req.query.q, { maxLength: 100 }),
    segment: validateOptionalEnum(req.query.segment, PATIENT_SEGMENT_IDS),
    sort: validateOptionalEnum(req.query.sort, PATIENT_LIST_SORT_IDS),
    page: validateOptionalIntegerInRange(req.query.page, { min: 1, max: 10_000, default: 1 }),
    pageSize: validateOptionalIntegerInRange(req.query.pageSize, { min: 1, max: 200, default: 50 }),
  };
  const result = await getPatientsForDoctorFiltered(doctorId, filters);
  res.json({ success: true, data: result });
  ```

  Where `PATIENT_SEGMENT_IDS` and `PATIENT_LIST_SORT_IDS` are exported constants matching the union types — declare them as `as const` arrays in `patient-service.ts` (or a new `patient-constants.ts` if the service file is already long).

- [ ] **Response shape envelope:**

  ```json
  {
    "success": true,
    "data": {
      "patients": [...],
      "total": 234,
      "page": 1,
      "pageSize": 50
    }
  }
  ```

- [ ] **Backwards-compat:** the v1 client (`getPatients` in `frontend/lib/api/index.ts`) reads `data.patients` only; adding `total` / `page` / `pageSize` doesn't break it. The v1 route at `/dashboard/patients` continues to work.

- [ ] **Validation errors return 400** with the existing error envelope (`{ success: false, error: { code, message } }`). Specific cases:
  - Unknown `segment` value → 400 with `code = 'invalid_segment'`.
  - Unknown `sort` value → 400 with `code = 'invalid_sort'`.
  - `pageSize > 200` → 400 with `code = 'page_size_too_large'`.
  - `at-risk-followup` requested on a schema without `follow_up_value` → 400 with `code = 'segment_unsupported_on_current_schema'` (only fires when the cv2-04 migration hasn't shipped; the task documents this in the validator).

### Step 5 — Verification (deterministic)

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter backend lint` clean.
- [ ] **Unit tests** — extend `backend/tests/unit/services/patient-service.test.ts` (or create a new test file `patient-service-filters.test.ts`) with one test per segment that asserts the WHERE clause includes the expected predicate (mock the Supabase client; assert the call args).
- [ ] **`psql` smoke** — pick a doctor JWT (or the local seed user); run via curl:
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/v1/patients?q=sm&segment=active-90d&sort=name-asc&page=1&pageSize=20"
  ```
  Expect: 200, `data.patients` is an array of ≤ 20 rows, all names containing "sm" (case-insensitive), all with a `last_appointment_date` within 90 days, sorted A→Z by name. `data.total` is the unpaginated count.
- [ ] **RLS smoke** — repeat the same curl with a different doctor's JWT; verify only their patients return.
- [ ] **The v1 list page (`/dashboard/patients`) still renders.** No regression.

---

## Out of scope

- **Frontend changes.** The v1 list page does not gain server-side filtering in this task; pr-07 ships the new table that consumes the new query params. The v1 client filter at `frontend/components/patients/PatientsListWithFilters.tsx:47` stays as-is.
- **The `getPatientById` endpoint.** pr-03 adds new endpoints (`/overview`, `/kpis`) but doesn't modify `/:id`.
- **Trigram / fuzzy search.** Phase 2. The Phase 1 `q` filter is plain substring (`LIKE '%…%'`).
- **Multi-tag filtering.** Phase 1 only supports `untagged` as a segment; arbitrary tag filtering is Phase 2.
- **Cursor pagination.** Phase 1 uses offset pagination (simpler; the table size is small enough per doctor for OFFSET to be efficient).

---

## Files expected to touch

**New (conditional on Step 1 discovery):**

- `backend/migrations/103_patients_tags.sql` (~25 LOC — the column + index + comment).

**Modified:**

- `backend/src/services/patient-service.ts` (~150 LOC delta — new `getPatientsForDoctorFiltered` function + segment SQL).
- `backend/src/controllers/patient-controller.ts` (~50 LOC delta — query-param parsing + new function call).
- `backend/src/utils/validation.ts` (~30 LOC delta — `validateOptionalEnum`, `validateOptionalIntegerInRange` helpers if they don't already exist).
- `backend/src/types/database.ts` (regenerated after the migration, if shipped).
- `backend/tests/unit/services/patient-service.test.ts` (~80 LOC delta — one test per segment).

**Read but do not modify in this task:**

- `frontend/lib/api/index.ts` (the existing v1 client — verify it doesn't break).
- `backend/src/routes/api/v1/patients.ts` (route registration — should already cover the existing endpoint).

---

## Notes / open decisions

1. **Why not push the segments into a view?** A view would duplicate the WHERE-clause logic in two places (the view definition + the controller's params). The switch-on-segment in the service is one place; easier to audit, easier to extend.

2. **Why offset pagination?** Per-doctor patient counts are bounded (~5k max for a busy specialist after a decade). OFFSET stays efficient at that scale. Cursor pagination is overkill and forces the frontend to track opaque cursor state.

3. **Why count separately?** Postgres doesn't return a `total` for a paginated query without a separate count. The optimisation in Step 3 (skip the count when result < pageSize on page 1) covers the common case (< 50 patients in a segment).

4. **The `at-risk-followup` fallback.** If cv2-04 hasn't merged, the segment SQL can't use `follow_up_value`. The task's two options: (a) regex over `follow_up TEXT` (brittle but works); (b) return 400 with a clear error code so the frontend hides the chip. Option (b) is safer — DL-4 lists this segment explicitly but doesn't promise it pre-cv2-04.

5. **Why is `patient_tag` not PHI?** It's a doctor-set internal label like "VIP" or "Needs follow-up" — clinic operational metadata, not a clinical observation about the patient. If a doctor types diagnosis text into the tag field, that's a UX education issue, not a schema issue. The Phase 2 tag taxonomy will provide guardrails.

6. **Cache the count?** No — the count is per-(doctor, filter combination), which would be a big cache key. The `kpis` endpoint (pr-03) caches the five most-common counts at 60s; the list-page count is recomputed per request. Fine at this scale.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [plan-patients-redesign-batch.md § DL-4 (server-side filters)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-11 (bulk select / tag column)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 1 gate](./EXECUTION-ORDER-patients-redesign.md#wave-1-gate-after-pr-01--pr-02).
- **Next task:** [`task-pr-03-overview-aggregator-and-kpis.md`](./task-pr-03-overview-aggregator-and-kpis.md) — Wave 2, Lane α step 0 (fresh Opus chat).

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Pending
