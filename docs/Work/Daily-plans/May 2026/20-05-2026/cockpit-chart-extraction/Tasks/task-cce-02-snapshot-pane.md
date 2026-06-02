# Task cce-02: SnapshotPane (chart-section subset for the snapshot leaf)

## 20 May 2026 — Batch [Cockpit chart extraction — R-CHART](../plan-cockpit-chart-extraction-batch.md) — Wave 2, Lane α (Shape B parallel) — **S, ~2-3h**

---

## Task overview

After csf-03, the `snapshot` leaf in `getTelemedVideoTemplate(ctx)` mounts `<PatientChartPane>` which renders the full 5-section `<PatientChartPanel>` (Allergies, Chronic, Problems, Vitals, Previous prescriptions). Per source plan §R-CHART, Snapshot should be a **trimmed safety-glance view** focusing on:

- Allergies
- Chronic conditions
- Problem list
- Vitals — **last 3 readings only** (not the full history; that's the legacy chart panel's job, deferred behind R-HISTORY)
- Current medications — **active Rxs from the most recent visit only** (not the full prescription history)

The History pane (cce-03) handles deep-dive past-visit content. SnapshotPane is for the at-a-glance scan.

After this task:

- New file `frontend/components/patient-profile/panes/SnapshotPane.tsx` (~80-120 LOC).
- `<SnapshotPane>` renders the trimmed section subset using the existing `<PatientChartPanel>` infrastructure where possible. Sections that don't natively support the trim (e.g., Vitals limited to 3 readings, Previous Rx filtered to active-only) get small extensions to the section component or thin wrappers.
- Pane chrome: scrollable container; sections render read-only when `mode="default"` (the existing `PatientChartPanel` mode).
- Mounts in the `snapshot` leaf via cce-04 (Wave 3). This task only ships the component; the wiring is deferred.

This task is a **leaf-content swap** — replacing the heavyweight chart panel with a trimmed subset. Zero conflict with cce-01 (different files), zero conflict with cce-03 (different files), zero conflict with the in-flight csf-* (different files).

**Estimated time:** ~2-3h (1h for the section subset + Vitals trim + active-Rx filter, 1-2h for the wrapper + reuse evaluation, 30min for tsc / lint).

**Status:** Done.

**Hard deps:** None (cv2-* + csf-* shipped; no new contract needed).

**Source:** [plan-cockpit-v2.md § R-CHART (line 283)](../../../../Product%20plans/plan-cockpit-v2.md), [plan-cockpit-chart-extraction-batch.md § DL-1](../plan-cockpit-chart-extraction-batch.md#decision-lock-frozen-for-batch-duration).

---

## Model & execution guidance

**Recommended model:** **Auto** (Sonnet 4.6 Medium). Configuration of an existing component with a section subset. The trickiest bit is the "active medications" filter on `PreviousRxSection` — task adds a filter prop if needed.

**Per-message escalation rule:** if Auto stalls on whether to extend `PreviousRxSection` with a `filter` prop vs. build a fresh `<CurrentMedicationsSection>` from scratch, bump to Opus for one message. Most likely Auto picks "extend with filter prop" (smaller change, less duplication).

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/ehr/PatientChartPanel.tsx` (the existing 5-section panel — read top to bottom; it has the section composition pattern this task copies).
- `frontend/components/ehr/sections/AllergiesSection.tsx` (read for prop shape).
- `frontend/components/ehr/sections/ChronicConditionsSection.tsx` (read for prop shape).
- `frontend/components/ehr/sections/ProblemListSection.tsx` (read for prop shape).
- `frontend/components/ehr/sections/VitalsSection.tsx` (read; identify the prop that limits readings count, OR identify where the limit lives — if it's hardcoded, this task adds a `limit` prop).
- `frontend/components/ehr/sections/PreviousRxSection.tsx` (read; identify whether it supports filtering to active-only Rxs, OR identify where to add a `filter` prop).
- `frontend/components/patient-profile/panes/PatientChartPane.tsx` (the existing wrapper that csf-03 mounts in the snapshot leaf — read for the prop pattern).
- `frontend/components/ehr/AppointmentChartRail.tsx` (the rail wrapper around `PatientChartPanel` — read for the `hideHeader` pattern).

**Estimated turns:** 3-5 turns.

---

## Acceptance criteria

### Step 1 — Decide on reuse strategy

- [x] Read `PatientChartPanel.tsx` lines 113-222 and identify the SectionWrapper composition pattern.
- [x] **Pick one** based on what each section currently supports:
  - **Option A (preferred if sections support optional limits):** Build `<SnapshotPane>` as a thin component that renders the same 4 sections + active-only Previous Rx, passing the trim params via props. Add the new props to existing sections (e.g., `<VitalsSection limit={3} />`, `<PreviousRxSection filter="active-only" />`).
  - **Option B (fallback if sections are rigid):** Build `<SnapshotPane>` as a fresh component that doesn't reuse `<PatientChartPanel>` directly. Mount `<AllergiesSection>`, `<ChronicConditionsSection>`, `<ProblemListSection>` directly with their existing props; build a thin `<SnapshotVitals>` wrapper that calls the chart-context endpoint with `?limit=3`; build a thin `<CurrentMedications>` wrapper that fetches the patient's most recent active Rx and renders the medicines list.
- [x] Document the picked option at the top of `SnapshotPane.tsx`'s JSDoc with a one-paragraph rationale.

### Step 2 — Build `<SnapshotPane>`

- [x] New file `frontend/components/patient-profile/panes/SnapshotPane.tsx`. Top-of-file JSDoc explaining the component's role + the source-plan §R-CHART reference + the Snapshot subset rationale (DL-1).
- [x] Component signature:
  ```tsx
  export interface SnapshotPaneProps {
    appointment: Appointment;
    token: string;
    /** When true, the component does NOT render its own H2 header (the v2 shell renders pane chrome on top). */
    hideHeader?: boolean;
  }

  export default function SnapshotPane({ appointment, token, hideHeader = false }: SnapshotPaneProps): JSX.Element;
  ```
- [x] Component body renders a scrollable container with the 4-5 sections per the picked option. Use the existing `SectionWrapper` from `@/components/ehr/SectionWrapper` for each section so the visual pattern matches the legacy chart panel.
- [x] Use the same prop pattern as `<PatientChartPane>` (`appointment`, `token`, `hideHeader`) so cce-04's wiring is mechanically a copy of the existing snapshot leaf's render.
- [x] **Hide the existing H2** ("Patient chart" or section labels at the top) via `hideHeader` so the v2 shell's `<PaneHeader>` doesn't double up.
- [x] All sections render read-only (`mode="default"`; verify each section component honors the `mode` prop). The Snapshot pane is a glance, not an edit surface — even though `<PatientChartPanel>` allows the doctor to edit allergies / chronic / vitals, the cockpit-context Snapshot pane keeps those affordances (the existing `<SectionWrapper>` "+ Add" button) because the doctor sometimes adds an allergy mid-consult. Don't strip the add affordance unless the source plan explicitly says read-only.

### Step 3 — Extend section components if needed (Option A path)

- [x] If `<VitalsSection>` doesn't already accept a `limit` prop, add one. The backend's `listVitals` already supports `?limit=N` per `patient-chart-controller.ts` line 134-138. The section can simply forward the limit to its fetch call.
- [x] If `<PreviousRxSection>` doesn't already accept a filter for "active only" or "most recent visit only", add an optional `filter?: 'active-only' | 'most-recent-visit'` prop. Implementation in this task: the section's existing fetch returns all past Rxs; the new filter applies client-side after fetch. (Backend filtering can come later if performance warrants.)
- [x] Verify section components keep working when the new props are omitted (default behaviour unchanged for v1 callers).

### Step 4 — Verify backend support

- [x] `GET /api/v1/patients/:patientId/chart/vitals?limit=3` returns the last 3 vitals. (Already supported per `patient-chart-controller.ts` line 134-138; no backend change.)
- [x] `GET /api/v1/patients/:patientId/prescriptions` returns the patient's prescriptions. (Identify the existing endpoint; if no per-patient list exists, document it and propose the smallest change — possibly the existing `getPatientChartContext` aggregator already covers it.)
- [x] No backend changes required if all the data is already available.

### Step 5 — Tsc + lint + smoke

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] **Smoke render at a fixture page** (`/dashboard/_dev/side-sheet-smoke/page.tsx` from cce-01 OR a Storybook entry — task picks): mount `<SnapshotPane appointment={fixtureAppointment} token={fixtureToken} hideHeader />` and verify all 4-5 sections render. Vitals shows ≤ 3 readings. Current medications shows only active Rxs. No console errors.

---

## Out of scope

- **Wiring `<SnapshotPane>` into `templates.tsx`.** That's cce-04's job.
- **Building `<HistoryPane>` or visit-detail side sheet.** cce-03 owns those.
- **Backend pagination** on the prescriptions list. Out of scope per plan-batch.
- **Inline-edit affordances on Snapshot.** Sections keep their existing add buttons; no new edit affordances.
- **Snapshot pane filter chips** (e.g., "show last 6 months only"). Future polish.
- **Real-time live-update of the Snapshot when the doctor edits the underlying patient record from elsewhere.** The sections already use their own SWR / React Query hooks (verify on read); no new live-update logic in this task.

---

## Files expected to touch

**Created:**

- `frontend/components/patient-profile/panes/SnapshotPane.tsx` (~80-120 LOC).

**Modified (conditional, Option A path only):**

- `frontend/components/ehr/sections/VitalsSection.tsx` — add optional `limit?: number` prop (~5 LOC delta).
- `frontend/components/ehr/sections/PreviousRxSection.tsx` — add optional `filter?: 'active-only' | 'most-recent-visit'` prop (~10 LOC delta).

**Read but not modified:**

- `frontend/components/ehr/PatientChartPanel.tsx` (composition pattern).
- `frontend/components/ehr/SectionWrapper.tsx`.
- `frontend/components/patient-profile/panes/PatientChartPane.tsx`.

---

## Notes / open decisions

1. **Why not just keep the full `<PatientChartPanel>` in the Snapshot leaf?** Two reasons: (a) source plan §R-CHART explicitly defines Snapshot as a trimmed subset (allergies, chronic, current meds, recent vitals trend — not all 5 sections), (b) the History pane (cce-03) handles past-visit deep dive, so duplicating the Previous Rx history in Snapshot would be redundant.

2. **Why does the Snapshot pane keep the "+ Add" affordances?** Doctors sometimes capture an allergy mid-consult ("oh, you're allergic to sulfa? let me note that"). Stripping the add button forces them to leave the cockpit. The trim is about VIEW (less history, fewer readings), not capability.

3. **What if `<VitalsSection>`'s internal fetch hardcodes the limit?** Add a `limit` prop and forward it. The existing section likely already passes a limit (the chart-controller defaults to 200; the section may pass a different default). Read the section first; pick the smallest change.

4. **What about `<ProblemListSection>`?** The source plan §R-CHART doesn't explicitly mention "problem list" in Snapshot — only "allergies, chronic conditions, current medications, recent vitals trend." But the existing chart panel includes Problem List; including it in Snapshot is a mild extension over the source plan. Document the decision in the JSDoc and proceed (problem list is small + safety-relevant).

5. **What if the patient has zero allergies / zero chronic conditions / zero past Rxs?** Each section already handles its empty state (verify on read). The Snapshot pane defers to the section's empty state.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [plan-cockpit-v2.md § R-CHART](../../../../Product%20plans/plan-cockpit-v2.md), [plan-cockpit-chart-extraction-batch.md § DL-1](../plan-cockpit-chart-extraction-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-chart-extraction.md` § Wave 2 gate](./EXECUTION-ORDER-cockpit-chart-extraction.md#wave-2-gate-after-cce-02--cce-03).
- **Sibling lane:** [`task-cce-03-history-pane-and-visit-detail-sheet.md`](./task-cce-03-history-pane-and-visit-detail-sheet.md) — runs in parallel.
- **Successor:** [`task-cce-04-wire-snapshot-history-into-templates.md`](./task-cce-04-wire-snapshot-history-into-templates.md) — wires this component into the production templates.

---

**Owner:** TBD
**Created:** 2026-05-20
**Status:** Done