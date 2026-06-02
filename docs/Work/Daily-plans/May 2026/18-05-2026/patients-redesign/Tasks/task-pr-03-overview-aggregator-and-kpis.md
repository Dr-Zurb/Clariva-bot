# Task pr-03: `GET /api/v1/patients/:id/overview` aggregator + `GET /api/v1/patients/kpis` endpoint

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 2, Lane α step 0 — **M, ~4h**

---

## Task overview

Land the two backend endpoints that power Wave 3's KPI strip and Wave 5's Overview / Vitals tabs. Both compose PHI from multiple resource tables (`prescriptions`, `appointments`, `patient_vitals_readings`, `patient_allergies`, `patient_conditions`, `patient_problem_list_v`, `refunds` / `payments`) into single round-trip responses so the frontend doesn't fan out N requests per patient view.

The aggregator is the Opus task of this batch — not because the SQL is hard individually (each existing service exposes a clean query function), but because **the RLS predicates have to compose correctly across joins**. `prescriptions`, `appointments`, and `patient_vitals_readings` each carry their own `doctor_id` RLS predicate; the aggregator must call them in a way that doesn't silently leak across tenants. The naive approach ("just SELECT them all in one CTE") will return rows from any doctor's patient if the JOIN predicate is misspecified. The correct approach is to invoke each existing service via the doctor-scoped Supabase client in parallel via `Promise.all`, then compose the responses in TypeScript. That's safer, more auditable, and matches every other multi-table aggregator in the codebase.

The endpoint also derives **care-plan recommendations** and **risk flags** from those PHI inputs. The derivation rules are deterministic and explicit (no LLM call — that's Phase 3). Each rule is documented inline so a reviewer can audit why a given recommendation surfaced.

The KPI endpoint is the same discipline at smaller scale — 5 `COUNT(*)` queries gated by `auth.uid() = doctor_id`, cached server-side at 60s per doctor.

**Estimated time:** ~4h (15min discovery + 1h aggregator structure + 1h care-plan/risk-flag rules + 1h KPIs + 30min `psql` RLS smoke + 15min response-shape validation).

**Status:** Pending.

**Hard deps:** pr-01 (the `PatientOverviewData` / `PatientsKpis` types — the response shapes this task must match exactly).

**Source:** [plan-patients-redesign-batch.md § Wave 2](../plan-patients-redesign-batch.md#wave-2--backend-aggregator--frontend-client-wrappers-2-tasks-5h-single-sequential-lane) + DL-5, DL-6.

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High**. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § "When to escalate to Opus"](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules):

- **Rule #1: The diff touches `auth.uid()`, RLS policies, audit-logging path.** The aggregator's correctness depends on RLS predicates aligning across 6 resource tables. A naive JOIN inside one SQL statement can silently leak across tenants if the predicate is misspecified.
- **Rule #2: The diff touches PHI columns.** The response shape contains vitals (BP, HR, SpO2), allergies, conditions, current medications, and a recent-activity feed referencing PHI rows. Every field on the wire is PHI.

Both rules apply independently. The task is M-sized (~400 LOC of TypeScript), but the cost of a mistake compounds (silent PHI leak across tenants is the highest-severity bug class in this codebase).

**Per-message escalation rule:** Not relevant — entire task is Opus. If a single message stalls on a derivation rule (e.g. "what counts as 'overdue follow-up' precisely?"), back up to the rule list in Step 4 of this spec rather than escalating further. The rules are pinned here so the agent doesn't invent its own.

**Manual-Sonnet fallback:** Not appropriate per hard-rules.

**New chat?** **Yes** — fresh Opus chat. Pre-load:

- This task file.
- `backend/src/controllers/patient-chart-controller.ts` (the existing chart-context controller — the precedent for multi-section composed responses; aggregator follows the same pattern).
- `backend/src/services/patient-chart-service.ts` (each query function the aggregator calls: `listAllergies`, `listChronicConditions`, `listVitals`, `listProblems` — task identifies the exact names).
- `backend/src/services/prescription-service.ts` (`listPrescriptionsForPatient` or equivalent — the source for current medications and the follow-up-derivation input).
- `backend/src/services/appointment-service.ts` (the source for the six-visit strip + recent activity).
- `backend/src/services/refund-service.ts` (the payment events for the recent activity feed; verify the table is per-doctor).
- `backend/src/services/patient-service.ts` (the `getPatientById` function the aggregator reuses for the identity slice).
- `backend/src/utils/errors.ts` (error envelope conventions).
- `backend/src/utils/http.ts` (the cache-control header helper if it exists, else task adds inline).
- `backend/migrations/087_patient_chart_context.sql` (the schema of the chart-context tables this aggregator reads from).
- `frontend/types/patient.ts` (post-pr-01 — the response shapes to match exactly).
- Source plan §DL-5, §DL-6.

**Estimated turns:** 5–7 turns (1 discovery + 1 controller skeleton + 1 aggregator service + 1 care-plan/risk-flag rules + 1 KPI endpoint + 1 verification round + 1 cleanup).

---

## Acceptance criteria

### Step 1 — Discovery (lock the resource map before writing code)

- [ ] `rg "auth\.uid\(\)" backend/migrations | grep -E "(prescriptions|appointments|patient_vitals|patient_allergies|patient_conditions|patient_problems)"` — confirm every source table has an RLS policy gated on `auth.uid() = doctor_id`. Record the exact policy names in the controller's header comment.
- [ ] `rg "create or replace view patient_problem_list" backend/migrations` — confirm the view's filter clause; the aggregator inherits the view's RLS by querying it through the doctor-scoped client.
- [ ] Enumerate the existing service functions the aggregator will call. Expected (verify):
  - `getPatientById(id, supabase)` from `patient-service.ts`
  - `listPatientAllergies(supabase, patientId)` from `patient-chart-service.ts`
  - `listPatientChronicConditions(supabase, patientId)` from `patient-chart-service.ts`
  - `listPatientProblems(supabase, patientId)` from `patient-chart-service.ts`
  - `listPatientVitals(supabase, patientId, options?)` from `patient-chart-service.ts` — verify the `?windowDays` option exists; if not, extend with a `since: Date` argument (additive).
  - `listPrescriptionsForPatient(supabase, patientId)` from `prescription-service.ts` — verify name; ships the current-medication derivation input.
  - `listAppointmentsForPatient(supabase, patientId, options?)` from `appointment-service.ts` — verify this exists OR if it's only `getAppointments(supabase)` (full doctor scope, then filter), add the per-patient variant in this task.
- [ ] Record the discovery findings in the new controller file's header comment so a future reviewer can trace each shape segment back to its source service.

### Step 2 — Controller scaffolding

- [ ] **New file** `backend/src/controllers/patient-overview-controller.ts`. Two exported handlers:

  ```ts
  /**
   * GET /api/v1/patients/:id/overview
   *
   * Composes patient chart context (snapshot, problems, allergies, conditions,
   * vitals, current meds), the six-visit strip, the recent activity feed, and
   * derived care-plan + risk-flag arrays into a single PatientOverviewData payload.
   *
   * RLS: every internal service call uses the doctor-scoped Supabase client.
   * Tenant isolation belt-and-suspenders: the controller also asserts
   * patient.doctor_id === auth.uid() before composing.
   *
   * Cache: no server-side cache on this endpoint (per-patient hot path; the
   * patient might just have new vitals entered). Cache-Control: private, no-cache.
   */
  export async function getPatientOverview(req, res) { ... }

  /**
   * GET /api/v1/patients/kpis
   *
   * Returns the 5 KPI counts (DL-6) for the authenticated doctor.
   *
   * Cache: 60s per doctor via a process-local LRU. ETag emitted; clients
   * receive 304 on revalidation. Cache key = `kpis:${doctorId}`.
   */
  export async function getPatientsKpis(req, res) { ... }
  ```

- [ ] **New file** `backend/src/services/patient-overview-service.ts` — the composition logic. Keep the controller thin; the service file owns the SQL composition and the derivation rules.

- [ ] **Route registration** in `backend/src/routes/api/v1/patients.ts`:
  ```ts
  router.get('/:id/overview', requireAuth, getPatientOverview);
  router.get('/kpis', requireAuth, getPatientsKpis);  // BEFORE /:id rate-matched routes
  ```
  **Important:** register `/kpis` BEFORE any `/:id` parameterised route, otherwise `kpis` will match `:id`. The task verifies this — if the existing route file order would catch `kpis` as an id, reorder.

### Step 3 — Aggregator composition

- [ ] **Tenant assertion first.** Inside `getPatientOverview`:
  ```ts
  const patient = await getPatientById(req.params.id, doctorScopedSupabase);
  if (!patient) return res.status(404).json(notFoundEnvelope('Patient not found.'));
  // (The Supabase client is doctor-scoped, so a Patient B belonging to Doctor B
  // returns null here when Doctor A queries — this is the belt-and-suspenders.)
  ```

- [ ] **Parallel section fetches** via `Promise.all`:
  ```ts
  const [
    allergies,
    chronicConditions,
    problems,
    vitalsRecent,
    prescriptions,
    appointments,
  ] = await Promise.all([
    listPatientAllergies(doctorScopedSupabase, patientId),
    listPatientChronicConditions(doctorScopedSupabase, patientId),
    listPatientProblems(doctorScopedSupabase, patientId),
    listPatientVitals(doctorScopedSupabase, patientId, { sinceDays: 90 }),
    listPrescriptionsForPatient(doctorScopedSupabase, patientId, { limit: 50 }),
    listAppointmentsForPatient(doctorScopedSupabase, patientId, { limit: 100 }),
  ]);
  ```
  If any one section throws, the aggregator returns 500 with `{ code: 'aggregator_partial_failure', failed_section: '<name>' }`. Do NOT silently default to an empty array per section — that creates the impression that the patient has no allergies when the API actually failed.

- [ ] **Snapshot derivation.** From `vitalsRecent`, take the most recent reading per metric:
  ```ts
  const snapshot: PatientOverviewSnapshot = {
    blood_group: null,                  // Phase 2 — no column yet
    height_cm: latestVital(vitalsRecent, 'height_cm'),
    weight_kg: latestVital(vitalsRecent, 'weight_kg'),
    bmi: latestVital(vitalsRecent, 'bmi'),
    preferred_language: patient.preferred_language ?? null,  // already in patients table; verify
  };
  ```

- [ ] **Current medications derivation.** From the most-recent non-archived prescription, expand its `prescription_medicines` rows into `PatientCurrentMedication[]`. Sort by `prescribed_at DESC`. Cap at 20 rows. `still_taking` is `null` in Phase 1 (no med-recon prompt yet — Phase 2 will add a separate column on `prescription_medicines`).

- [ ] **Vitals trends shape.** Pivot the `vitalsRecent` rows into one array per metric, sorted by `recorded_at ASC`, capped at 30 readings per metric:
  ```ts
  const vitals_trends: PatientVitalsTrends = {
    bp_systolic: pickMetric(vitalsRecent, 'bp_systolic'),
    bp_diastolic: pickMetric(vitalsRecent, 'bp_diastolic'),
    // ...etc
  };
  ```

- [ ] **Recent activity feed (10 rows, mixed kinds, newest first).** Merge events from:
  - Appointments → `{ kind: 'visit', occurred_at: a.appointment_date, summary: '<modality> consult — <status>', href: '/dashboard/appointments/<id>' }`
  - Prescriptions → `{ kind: 'prescription', occurred_at: p.created_at, summary: '<medicine count> medicines prescribed', href: '/dashboard/appointments/<appointment_id>' }`
  - Payments (if `refund-service.ts` exposes them) → `{ kind: 'payment', occurred_at: r.created_at, summary: '<amount> <currency> received', href: null }`
  - No-shows → `{ kind: 'no_show', occurred_at: a.appointment_date, summary: 'Marked as no-show', href: '/dashboard/appointments/<id>' }`
  - Messages → DEFER. The message-event table doesn't have a single read path for "events per patient"; Phase 2 will add. In Phase 1, skip this kind.
  - File uploads → DEFER pending Phase 2 storage backend.

  Merge → sort by `occurred_at DESC` → slice to `[0, 10]`.

- [ ] **Six-visit strip (DL-8).** From `appointments`, take the 6 most recent (any status), newest-leftmost. Each entry's `chief_complaint` comes from the latest `prescription_drafts` snapshot for that appointment if present, else `appointment.notes`, else `null`. Bound the per-entry chief-complaint string at 80 chars (longer = `…` truncated).

### Step 4 — Care-plan + risk-flag derivation rules (deterministic, explicit)

The rules below are the **complete** Phase 1 rule set. Adding a sixth rule belongs in a separate task. Each rule is documented inline so a reviewer can trace why a given recommendation surfaced.

#### Care-plan rules

The care plan is `null` when NO rule fires. When ≥ 1 rule fires, set:

- `next_step: string` — the single highest-priority "do this next" string, based on the rule priority order below.
- `overdue: string[]` — every fired rule's overdue-line description, in priority order.
- `rationale: string[]` — for each entry in `overdue`, a human-readable "why" string the doctor can show the patient.

**Rule CP-1 (priority 1) — Follow-up overdue.** If any prescription has `follow_up_value IS NOT NULL` AND the derived follow-up date (`p.created_at + (value || ' ' || unit)::INTERVAL`) is < now() AND no completed appointment exists for this patient after that derived date:
- `next_step` = "Follow-up overdue since <date>"
- `overdue.push("Follow-up due <date> — overdue by <N> days")`
- `rationale.push("Last prescription on <date> scheduled a follow-up after <interval>")`

**Rule CP-2 (priority 2) — Next scheduled follow-up.** Else if a future appointment exists with `status = 'confirmed'` AND `notes ILIKE '%follow-up%'` OR with a prior prescription's follow-up date matching:
- `next_step` = "Follow-up scheduled for <date>"
- (no `overdue` entry — it's on track)

**Rule CP-3 (priority 3) — Vitals recheck pending.** If the latest BP reading has `bp_systolic >= 140 OR bp_diastolic >= 90` AND no vitals reading has been taken in the last 14 days:
- `next_step` (only if no higher rule fires) = "BP recheck recommended"
- `overdue.push("BP recheck pending since <date>")`
- `rationale.push("Last BP recorded <value> on <date>; above target range")`

**Rule CP-4 (priority 4) — Open episode without recent contact.** If any `patient_problem_list_v` row has `source = 'episode'` AND `episode_status != 'closed'` AND no appointment in the last 30 days:
- `next_step` (only if no higher rule fires) = "Open episode hasn't been seen in 30+ days"
- `overdue.push("<problem label> — open since <since_date>")`
- `rationale.push("Episode active without a follow-up visit in 30+ days")`

**Rule CP-5 (priority 5) — Medication refill window.** If any current medication has `prescribed_at` more than 25 days ago AND the medicine's frequency-derived duration is < 30 days:
- `next_step` (only if no higher rule fires) = "Refill likely needed in <N> days"
- `overdue` — only if the derived end-date is already past: `push("<drug> refill due since <date>")`
- `rationale.push("<drug> prescribed for <duration>; supply ends <date>")`

If no rule fires, return `care_plan: null`.

#### Risk-flag rules

`risk_flags: PatientRiskFlag[]` — every fired rule adds an entry. Severity is fixed per rule.

**Rule RF-1 (`BP_TREND_RISING`, `warning`).** Last 3 BP readings all show `bp_systolic >= 140 OR bp_diastolic >= 90`:
- `label`: "BP > 140/90 on last 3 visits"

**Rule RF-2 (`SPO2_LOW`, `danger`).** Latest SpO2 reading < 92:
- `label`: "SpO₂ <value>% on <date>"

**Rule RF-3 (`NO_SHOW_PATTERN`, `warning`).** 2+ of the last 4 appointments have `status = 'no_show'`:
- `label`: "Missed <N> of last 4 appointments"

**Rule RF-4 (`ALLERGY_ALERT`, `info`).** Patient has ≥ 1 active allergy with `severity = 'severe'`:
- `label`: "Severe allergy — <allergen>"

**Rule RF-5 (`POLYPHARMACY`, `info`).** Patient has ≥ 5 active concurrent medications (from the current-meds derivation):
- `label`: "<N> active medications — review for interactions"

If no rule fires, return `risk_flags: []` (an empty array, not null).

### Step 5 — KPI endpoint

- [ ] **`getPatientsKpis` handler** runs 5 `COUNT(*)` queries through the doctor-scoped client. Each count maps to a `PatientSegmentId` filter from pr-02 (the SQL is identical to the segment SQL, just `SELECT COUNT(*)` instead of returning rows):
  - `active_90d.count` — patients with last_appointment_date in last 90 days
  - `new_30d.count` — patients with created_at in last 30 days
  - `followup_overdue.count` — distinct patients matching the `at-risk-followup` segment SQL
  - `open_episodes.count` — distinct patients with ≥ 1 row in `patient_problem_list_v` matching the `has-open-episodes` SQL
  - `possible_duplicates.count` — number of duplicate groups (call `getPossibleDuplicates` from `patient-service.ts` and `.length`)

- [ ] **`delta_7d`** for each KPI is the count of patients who entered the segment in the last 7 days (i.e. the same WHERE clause AND `created_at >= now() - 7d` or `last_appointment_date >= now() - 7d` as appropriate). Negative deltas (patients who left a segment) are out of scope for Phase 1 — report `delta_7d` as the inflow only.

- [ ] **60s server-side cache** per doctor:
  ```ts
  const cacheKey = `kpis:${doctorId}`;
  const cached = kpisCache.get(cacheKey);
  if (cached) { res.json(cached); return; }
  const fresh = await computeKpis(doctorScopedSupabase);
  kpisCache.set(cacheKey, fresh, /* ttlSec */ 60);
  res.set('Cache-Control', 'private, max-age=60');
  res.json({ success: true, data: fresh });
  ```
  Use a process-local LRU (e.g. `node-lru-cache` if already a dependency; otherwise a simple `Map<string, {value, expiresAt}>` with TTL eviction inline). Cache eviction on patient mutations is deferred (60s staleness is acceptable).

### Step 6 — Verification (deterministic)

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter backend lint` clean.
- [ ] **Unit tests** — new file `backend/tests/unit/services/patient-overview-service.test.ts`:
  - One test per care-plan rule (CP-1 .. CP-5) asserting the rule fires on a constructed fixture.
  - One test per risk-flag rule (RF-1 .. RF-5) asserting the flag appears.
  - One test for "no rules fire" → `care_plan: null`, `risk_flags: []`.
  - One test for "two rules fire" → `next_step` matches the higher-priority rule, `overdue` contains both.
- [ ] **Integration test** — new file `backend/tests/integration/api/patient-overview.test.ts`:
  - Seed two doctors (A, B) with one patient each.
  - GET `/api/v1/patients/<Patient A's id>/overview` with Doctor A's JWT → 200, response shape matches `PatientOverviewData`.
  - GET the same with Doctor B's JWT → 404 (not 403 — tenant isolation, not authorisation).
  - GET `/api/v1/patients/kpis` with Doctor A's JWT → 200, response shape matches `PatientsKpis`.
  - GET the same path back-to-back twice within 60s → second response is cached (record-and-replay; the second call should not hit the SQL layer).
- [ ] **`psql` smoke** — pick a doctor JWT; curl:
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/v1/patients/<id>/overview" | jq '.data | keys'
  ```
  Expect: `["active_problems", "allergies", "care_plan", "chronic_conditions", "current_medications", "patient", "recent_activity", "risk_flags", "six_visit_strip", "snapshot", "vitals_trends"]` (alphabetical).
- [ ] **Determinism** — running the aggregator twice against an unchanged patient returns byte-identical `care_plan` + `risk_flags`. (Run twice, diff with `jq`.)

---

## Out of scope

- **Caching the per-patient overview response.** The hot path is "doctor just edited vitals → reload page → expect fresh vitals trend"; caching would surprise. Cache-Control: `private, no-cache`.
- **AI-derived care plan.** Phase 3. The Phase 1 rules are deterministic; they should NOT be replaced by an LLM call here.
- **The Files / file_upload activity kind.** Deferred until the file-storage backend lands (Phase 2).
- **The Messages activity kind.** Deferred until a per-patient message-events query path is built.
- **Negative `delta_7d`** (patients who left a segment). Phase 2.
- **Cache eviction on patient mutation.** 60s staleness is acceptable; Phase 2 may wire a Supabase-realtime invalidator.
- **`patient_message_event` / similar tables that don't exist yet.** The activity feed only includes kinds with a live data source.
- **A reusable derivation library.** Each rule lives inline in the service. If a sixth rule emerges, the task that adds it can decide whether to factor into a shared library.

---

## Files expected to touch

**New:**

- `backend/src/controllers/patient-overview-controller.ts` (~100 LOC — two handler functions with structured logging).
- `backend/src/services/patient-overview-service.ts` (~300 LOC — aggregator composition + 5 care-plan rules + 5 risk-flag rules + 5 KPI queries).
- `backend/tests/unit/services/patient-overview-service.test.ts` (~250 LOC — rule-by-rule unit tests).
- `backend/tests/integration/api/patient-overview.test.ts` (~150 LOC — RLS + cache integration tests).

**Modified:**

- `backend/src/routes/api/v1/patients.ts` (~10 LOC delta — two new route registrations, with `/kpis` BEFORE the `:id` parameterised routes).
- `backend/src/services/appointment-service.ts` (conditional — if `listAppointmentsForPatient` doesn't exist, add it as an additive function; ~30 LOC).
- `backend/src/services/patient-chart-service.ts` (conditional — if `listPatientVitals` doesn't accept `?sinceDays`, extend; ~10 LOC).

**Read but do not modify in this task:**

- `backend/src/controllers/patient-chart-controller.ts` (precedent pattern for multi-section composed responses).
- `backend/src/services/prescription-service.ts` (the source for current-medication derivation; do not modify).
- `backend/src/services/refund-service.ts` (the source for payment events).
- `backend/migrations/087_patient_chart_context.sql` (the schema reference).

---

## Notes / open decisions

1. **Why parallel `Promise.all` calls instead of one big SQL query?** Each call goes through the doctor-scoped Supabase client, which means each call inherits the RLS predicate of its source table. Combining them into one `SELECT … FROM prescriptions p JOIN appointments a JOIN patient_vitals_readings v WHERE …` requires that the JOIN predicate exactly mirror the RLS predicate — and getting that wrong silently leaks data. The parallel-fetch + TypeScript-compose pattern is the canonical secure pattern for multi-table aggregators in this codebase (see `patient-chart-controller.ts` for the existing precedent).

2. **Why no message-events in the activity feed?** No single source-of-truth table for "messages for patient X" — message events are spread across `consultation_messages`, `bot_messages`, and platform-specific log tables. Pulling them coherently is a Phase 2 task.

3. **Why is `care_plan: null` valid?** A patient with no follow-ups, no risk flags, and no overdue items should not surface a care-plan banner. Returning `null` instead of an empty `{ next_step: null, overdue: [], rationale: [] }` makes the frontend's "render banner?" check a single boolean.

4. **Why is `chief_complaint` in the six-visit strip nullable?** Drafts are created during the consult; the latest draft for a no-show appointment may not exist. `null` is the honest answer; the frontend tooltip handles it (renders just date + modality + status).

5. **Why is the KPI cache 60s, not 300s?** A doctor who books a new patient expects the "New this month" tile to refresh within a minute. 60s is the sweet spot between "feels real-time" and "doesn't slam the DB".

6. **Why an LRU instead of a Redis cache?** The KPI compute is sub-100ms; a single-process LRU is fine at the scale of one backend instance per environment. When the backend scales horizontally (Phase 2 or later), upgrade to Redis.

7. **What if a doctor has 10,000 patients?** The KPI counts run unbounded `COUNT(*)` queries. At 10k patients this is < 50ms in Postgres. If it ever becomes a concern, add a `patient_kpi_snapshot` materialised view refreshed nightly + on patient-mutation triggers. Out of scope for Phase 1.

8. **Why is `delta_7d` inflow-only?** Computing "patients who left a segment in the last 7 days" requires snapshotting the segment membership 7 days ago, which we don't have. Phase 2 could add a daily snapshot job; Phase 1 reports inflow only and the frontend labels accordingly (the KPI tile chevron is "↑ N" not "+N / -M").

9. **Could the aggregator be a Supabase RPC function instead of a controller?** Yes, and it would be a single round-trip to Postgres. The reason it's a controller: the 5 care-plan rules + 5 risk-flag rules need to live somewhere maintainable, and TypeScript with unit tests beats a 500-line PL/pgSQL function on every axis except network latency. The latency cost (~6 small queries vs 1 big query) is acceptable.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [plan-patients-redesign-batch.md § DL-5 (overview aggregator shape)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-6 (KPIs)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 2 gate](./EXECUTION-ORDER-patients-redesign.md#wave-2-gate-after-pr-03--pr-04).
- **AGENT-EXECUTION-EFFICIENCY-GUIDE hard rules:** [#1 (RLS / `auth.uid()`)](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules) and [#2 (PHI columns)](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules).
- **Precedent batches:** existing chart-context aggregator patterns in `backend/src/controllers/patient-chart-controller.ts`.
- **Next task:** [`task-pr-04-frontend-api-client-wrappers.md`](./task-pr-04-frontend-api-client-wrappers.md) — Wave 2, Lane α step 1 (Auto chat; consumes the response shapes this task ships).

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Pending
