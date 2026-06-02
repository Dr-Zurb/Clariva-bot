# Task pr-10: `OverviewTab` — snapshot, problems, allergies, conditions, meds, vitals, activity, care plan

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 5, Lane α step 0 — **M, ~4h**

---

## Task overview

Land the Overview tab — the doctor's first-fold view of "who is this patient and what's next." Renders the full DL-5 aggregator shape in a two-column dashboard layout:

- **Left column** — snapshot card (blood group, height, weight, BMI, preferred language) → active problems → allergies → chronic conditions → current medications.
- **Right column** — vitals sparklines (one Recharts `LineChart` per metric with normal-range bands) → recent activity feed (last 10 events) → care-plan banner (info / warning / danger by `risk_flags.severity` max).

Consumes `getPatientOverview(token, patientId)` from pr-04. Mounts inside pr-09's tab framework — this task modifies `PatientV2Shell.tsx`'s `renderTabContent('overview')` from `<TabPlaceholder>` to `<OverviewTab patientId={…} token={…} />`.

**Estimated time:** ~4h (30min file scaffolding + 1h section components + 1h vitals sparklines (Recharts setup) + 1h activity feed + care plan + 30min responsiveness / empty states + 30min verification).

**Status:** Done.

**Hard deps:** pr-04 (`getPatientOverview`), pr-09 (the tab framework + `renderTabContent` switch).

**Source:** [plan-patients-redesign-batch.md § Wave 5](../plan-patients-redesign-batch.md#wave-5--tabs-content-3-tasks-9h-with-parallelism--2-parallel-lanes-after-pr-09) + DL-5.

---

## Model & execution guidance

**Recommended model:** Auto. Composition-heavy: 9 section components rendering a known shape. Recharts is the only new dependency to install (verify before starting); if not installed, escalate the install command via package manager.

**Per-message escalation rule:** Escalate to Opus only if Recharts setup proves tricky (e.g. SSR hydration mismatch on first paint). Standard pattern; should not require escalation.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `frontend/lib/api/patients.ts` (post-pr-04 — `getPatientOverview`).
- `frontend/types/patient.ts` (post-pr-01 — `PatientOverviewData` and all sub-types).
- `frontend/components/patients-v2/PatientV2Shell.tsx` (post-pr-09 — the tab-content switch this task modifies).
- `frontend/components/ehr/sections/AllergiesSection.tsx` (visual reference — the in-cockpit allergies section, read-only mode).
- `frontend/components/ehr/sections/ChronicConditionsSection.tsx` (visual reference).
- `frontend/components/ehr/sections/VitalsSection.tsx` (visual reference for vitals presentation patterns).
- `frontend/components/ui/card.tsx`, `frontend/components/ui/badge.tsx`, `frontend/components/ui/skeleton.tsx`.
- `pnpm list recharts` output (verify Recharts is installed — task confirms or runs `pnpm --filter frontend add recharts`).
- Source plan §DL-5.

**Estimated turns:** 4–5 turns.

---

## Acceptance criteria

### Step 1 — `<OverviewTab>` main composition

- [x] **New file** `frontend/components/patients-v2/tabs/OverviewTab.tsx` (~150 LOC). Props: `{ patientId: string; token: string; }`.

- [x] **Fetch** `getPatientOverview(token, patientId)` in a `useEffect`. State: `{ data: PatientOverviewData | null; loading: boolean; error: string | null }`. Cancel on unmount.

- [x] **Layout** — responsive two-column grid:
  ```tsx
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
    <div className="space-y-4">
      <SnapshotCard snapshot={data.snapshot} />
      <ActiveProblemsCard problems={data.active_problems} />
      <AllergiesCard allergies={data.allergies} />
      <ChronicConditionsCard conditions={data.chronic_conditions} />
      <CurrentMedicationsCard meds={data.current_medications} />
    </div>
    <div className="space-y-4">
      <VitalsTrendsCard trends={data.vitals_trends} />
      <RecentActivityCard activity={data.recent_activity} />
      <CarePlanCard plan={data.care_plan} riskFlags={data.risk_flags} />
    </div>
  </div>
  ```

- [x] **Loading state** — skeleton-per-card layout (8 placeholder cards in the same grid).
- [x] **Error state** — single banner with the error message + retry button. Cards collapse.

### Step 2 — Left column cards

- [x] **`<SnapshotCard>`** (~50 LOC). 5 small key-value rows: Blood group, Height, Weight, BMI, Preferred language. `—` for nulls.

- [x] **`<ActiveProblemsCard>`** (~60 LOC). List of `ProblemListItem` rows; each row = bullet + label + (when present) onset date + status badge. Empty state: "No active problems recorded."

- [x] **`<AllergiesCard>`** (~70 LOC). Chip grid (one chip per allergy). Severe = red chip; moderate = amber; mild = neutral. Click chip → tooltip with `reaction_notes` if present. Empty state: "No known allergies." (Important UX nuance: explicitly state "no known" rather than just "none" — clinical meaning differs.)

- [x] **`<ChronicConditionsCard>`** (~60 LOC). Each row = condition name + "since {year}" + a small "Active" badge when `status = 'active'`. Empty state: "No chronic conditions recorded."

- [x] **`<CurrentMedicationsCard>`** (~80 LOC). Table-like rows: drug name (bold) + dose · frequency + "since {date}". Show top 5; "+N more" link expands inline (Phase 2 may surface a dedicated meds tab). Empty state: "No current medications."

### Step 3 — Right column cards

- [x] **`<VitalsTrendsCard>`** (~150 LOC). Six small Recharts `<LineChart>` instances, one per metric:
  - BP (combined systolic + diastolic on one chart with two lines + a 140/90 reference area)
  - Heart rate (with 60-100 reference area)
  - SpO2 (with 95-100 reference area; values < 92 highlighted)
  - Weight
  - BMI (with 18.5-25 reference area)
  
  Each mini-chart is ~80px tall, gridless, axis-less, just the line + dots + reference band. Hover shows a `<Tooltip>` with date + value. Empty metric (no data) renders as a flat "No data" message in the chart slot.

- [x] **`<RecentActivityCard>`** (~80 LOC). Vertical list of up to 10 rows. Each row = icon per `PatientActivityKind` + `{summary}` + relative time + (when `href` is set) `<Link>` wrapper. Group by date with a small "Today / Yesterday / This week / Earlier" divider. Empty state: "No recent activity."

- [x] **`<CarePlanCard>`** (~100 LOC). When `plan === null` AND `riskFlags.length === 0` → render an empty-state card with "No active care recommendations." Else:
  - Banner color = max severity (`info` = blue, `warning` = amber, `danger` = red).
  - `plan.next_step` rendered as the main headline.
  - `plan.overdue` as a bullet list.
  - `riskFlags` as chips at the bottom (each chip's color matches its severity).
  - Below the banner: an expandable "Why these recommendations?" details `<details>` rendering `plan.rationale[]`.

### Step 4 — Tab-switch wiring in `PatientV2Shell`

- [x] **Modify** `frontend/components/patients-v2/PatientV2Shell.tsx`'s `renderTabContent` function:
  ```ts
  function renderTabContent(tabId: string) {
    switch (tabId) {
      case 'overview':
        return <OverviewTab patientId={patient.id} token={token} />;
      // (other tabs still <TabPlaceholder>; pr-11 / pr-12 fill them)
      default:
        return <TabPlaceholder name={tabId} />;
    }
  }
  ```

### Step 5 — Telemetry + verification

- [x] Tab opens fire `patients_v2.tab_opened` with `{tab_id: 'overview', patient_id}` once per first render (pr-09 may already have a per-shell tab-open hook; verify and reuse).
- [x] `pnpm --filter frontend tsc --noEmit` clean. Recharts types resolve (if package was missing, `pnpm --filter frontend add recharts` + restart tsc).
- [x] `pnpm --filter frontend lint` clean.
- [x] `/dashboard/patients-v2/<id>?tab=overview` renders all 8 cards with seeded data. Empty-state copy renders for sections with no data.
- [x] Hovering a sparkline shows the tooltip with date + value.
- [x] Care-plan banner renders the right color when `risk_flags` includes a `danger`-severity entry.
- [x] At < 768px viewport (mobile), the layout stacks to single column.

---

## Out of scope

- **Inline editing** (e.g. add an allergy directly from the card). Phase 2.
- **Dedicated meds tab.** Phase 2.
- **AI-generated care plan.** Phase 3.
- **Vitals tab full chart.** pr-12 ships that.
- **Recent activity loading more entries.** Cap at 10; Phase 2 may add "Show all" → opens a dedicated activity tab.

---

## Files expected to touch

**New:**

- `frontend/components/patients-v2/tabs/OverviewTab.tsx` (~150 LOC).
- `frontend/components/patients-v2/tabs/overview/SnapshotCard.tsx` (~50 LOC).
- `frontend/components/patients-v2/tabs/overview/ActiveProblemsCard.tsx` (~60 LOC).
- `frontend/components/patients-v2/tabs/overview/AllergiesCard.tsx` (~70 LOC).
- `frontend/components/patients-v2/tabs/overview/ChronicConditionsCard.tsx` (~60 LOC).
- `frontend/components/patients-v2/tabs/overview/CurrentMedicationsCard.tsx` (~80 LOC).
- `frontend/components/patients-v2/tabs/overview/VitalsTrendsCard.tsx` (~150 LOC).
- `frontend/components/patients-v2/tabs/overview/RecentActivityCard.tsx` (~80 LOC).
- `frontend/components/patients-v2/tabs/overview/CarePlanCard.tsx` (~100 LOC).

**Modified:**

- `frontend/components/patients-v2/PatientV2Shell.tsx` (~10 LOC delta — switch `'overview'` case in `renderTabContent`).
- Conditionally: `frontend/package.json` (Recharts add — if not installed).

**Read but do not modify in this task:**

- `frontend/components/ehr/sections/AllergiesSection.tsx`, `ChronicConditionsSection.tsx`, `VitalsSection.tsx` (visual references).

---

## Notes / open decisions

1. **Why split the cards into separate files?** Eight cards in one 800-LOC file is hard to navigate. Per-file lets future tasks (Phase 2 inline-edit) modify one card without touching the orchestrator.

2. **Why Recharts over Visx / Chart.js / d3?** Recharts is the dominant React charting library; React-friendly API; declarative. Visx is more flexible but more code; Chart.js is canvas-based and harder to style. Recharts wins on time-to-first-render.

3. **Why no "Show all" link on the activity card?** Phase 1 caps at 10. The doctor wanting more activity is rare (the Visits tab + Rx tab + Vitals tab cover the bulk of historical events). Phase 2 may surface a dedicated activity tab if user research surfaces the need.

4. **Why "No known allergies" instead of "No allergies"?** Clinical convention. "No known" makes clear that absence-of-record doesn't mean absence-of-allergy (the patient might have allergies the doctor hasn't recorded). Subtle but real distinction.

5. **Should the SpO2 chart highlight points < 92 differently?** Yes — Phase 1 styles those points red (use Recharts `<Dot>` custom renderer that switches color by value). Subtle clinical safety signal.

6. **What if `overview.vitals_trends.bp_systolic` is empty but `bp_diastolic` has data?** The combined chart renders just the diastolic line. Code defensively against partial-data.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-5 (Overview aggregator shape)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 5 gate](./EXECUTION-ORDER-patients-redesign.md#wave-5-gate-after-pr-10--pr-11--pr-12).
- **Next task (same lane):** [`task-pr-12-vitals-and-files-tabs.md`](./task-pr-12-vitals-and-files-tabs.md) — Wave 5, Lane α step 1.
- **Parallel task in Lane β:** [`task-pr-11-history-tabs.md`](./task-pr-11-history-tabs.md) — independent of this task; can run simultaneously.

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Done
