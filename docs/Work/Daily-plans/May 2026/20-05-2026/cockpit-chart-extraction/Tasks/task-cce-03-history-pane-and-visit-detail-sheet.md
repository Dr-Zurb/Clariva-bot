# Task cce-03: HistoryPane + VisitDetailSideSheet (first real consumer of cv2-09 contract)

## 20 May 2026 — Batch [Cockpit chart extraction — R-CHART](../plan-cockpit-chart-extraction-batch.md) — Wave 2, Lane β (Shape B parallel) — **M, ~3-4h**

---

## Task overview

After csf-03, the `history` leaf in `getTelemedVideoTemplate(ctx)` mounts `<PanePlaceholder title="History" futureRItem="R-CHART (Snapshot/History split deferred)" />` — a labeled placeholder visible to doctors. cce-03 replaces the placeholder with real content: a list of past visit cards that click-to-expand into a visit-detail side sheet.

After this task:

- New file `frontend/components/patient-profile/panes/HistoryPane.tsx` (~80-120 LOC).
- New file `frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx` (~80-120 LOC).
- HistoryPane fetches past prescriptions for the appointment's patient, renders them as compact cards (date, CC, working Dx, medicines count) most-recent-first.
- Clicking any card calls `useSideSheet().open({...})` from cce-01's primitive, opening `<VisitDetailSideSheet rxId={...} />` in the right-edge slide-in.
- VisitDetailSideSheet fetches the full Rx by id and renders all DL-24 fields read-only.
- Both files are mounted by cce-04 (Wave 3); this task only ships them.

This task is the **first real consumer** of cv2-09's side-sheet contract. The framework (cce-01) ships in Wave 1; this task makes it real.

**Estimated time:** ~3-4h (~1h for the past-Rx list query + cards, ~1.5h for the side-sheet content (12 read-only field blocks), ~1h for state management + polish, ~30min for tsc / lint / smoke).

**Status:** Done.

**Hard deps:** cce-01 (the side-sheet primitive — `useSideSheet().open()` must exist).

**Source:** [plan-cockpit-v2.md § R-CHART (line 283)](../../../../Product%20plans/plan-cockpit-v2.md), [plan-cockpit-chart-extraction-batch.md § DL-2, DL-5](../plan-cockpit-chart-extraction-batch.md#decision-lock-frozen-for-batch-duration).

---

## Model & execution guidance

**Recommended model:** **Auto** (Sonnet 4.6 Medium). List + card + side-sheet content. Bounded by the existing prescription record shape.

**Per-message escalation rule:** if Auto stalls on the per-patient prescription list endpoint (the trickiest discovery — does it already exist or need to be added?), bump to Opus for one message. Most likely it exists (the Previous-Rx side sheet's predecessor `<PreviousRxSection>` already calls into something).

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- post-cce-01 — `frontend/components/patient-profile/SideSheetHost.tsx` (the primitive this task consumes).
- `frontend/lib/api/prescriptions.ts` (or whatever the Rx client wrapper is — `rg "listPrescriptions|getPrescriptions" frontend/lib/api`).
- `frontend/types/prescription.ts` (the Rx record shape — read for the read-only fields the side sheet renders; verify all DL-24 fields are typed).
- `frontend/components/ehr/sections/PreviousRxSection.tsx` (visual reference for the past-Rx layout pattern; do NOT import or extend per DL-2 — build fresh).
- `frontend/components/ui/card.tsx` (the visit card visual primitive).
- `frontend/components/ui/scroll-area.tsx` (if available — Radix scroll for the history list).
- `backend/src/controllers/prescription-controller.ts` (verify the per-patient list endpoint and the get-by-id endpoint).

**Estimated turns:** 4-6 turns.

---

## Acceptance criteria

### Step 1 — Identify the past-Rx fetch path

- [x] Run `rg "listPrescriptions|getPrescriptions|getPatientPrescriptions" frontend/lib/api` to find the existing client wrapper.
- [x] If a per-patient list wrapper exists (e.g., `getPatientPrescriptions(patientId, token)`), use it. If not, identify the closest existing call and propose adding a thin wrapper to `frontend/lib/api/prescriptions.ts` (or wherever Rx client lives). The wrapper hits the existing backend route — DON'T propose a new backend route per DL-6.
- [x] If the backend doesn't have a per-patient prescription list endpoint, **stop** and document. Either (a) extend an existing endpoint with a `?patient_id=` query param (smallest change) or (b) escalate the task to add a new endpoint. Most likely path (a) — the existing prescription-controller is well-structured for query-param extension.

### Step 2 — Build `<HistoryPane>`

- [x] New file `frontend/components/patient-profile/panes/HistoryPane.tsx`. Top-of-file JSDoc: role, source-plan reference (§R-CHART), DL-2 (build fresh, don't reuse `PatientVisitsTimeline`).
- [x] Component signature mirrors `<SnapshotPane>` from cce-02 (same prop pattern):
  ```tsx
  export interface HistoryPaneProps {
    appointment: Appointment;
    token: string;
    hideHeader?: boolean;
  }

  export default function HistoryPane({ appointment, token, hideHeader = false }: HistoryPaneProps): JSX.Element;
  ```
- [x] Internal data flow: on mount, fetch past prescriptions for `appointment.patient_id` (the appointment's patient). If `patient_id == null` (walk-in), render a small "No patient context" message — but this case won't fire in production because walk-ins don't reach the chart leaves anyway (DL-7).
- [x] Loading state: skeleton (3-4 placeholder cards). Empty state: friendly "No past visits for this patient" message. Error state: small inline error banner with retry button.
- [x] Render past Rxs as a vertical scrollable list of compact cards, most-recent-first. Each card shows:
  - Date (relative, e.g., "3 days ago" + absolute on hover)
  - Chief complaint (truncate to ~60 chars with `...` overflow)
  - Working Dx (from `provisional_diagnosis` field)
  - Medicines count badge (e.g., "💊 5")
- [x] Clicking a card calls `useSideSheet().open({ id: 'visit-detail-' + rx.id, title: 'Visit · ' + formatDate(rx.created_at), content: <VisitDetailSideSheet rxId={rx.id} token={token} />, defaultWidth: 480, canDock: false })`.
- [x] Cards have a hover state + focus state (keyboard accessible — pressing Enter on a focused card opens the sheet too).

### Step 3 — Build `<VisitDetailSideSheet>`

- [x] New file `frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx`. Top-of-file JSDoc: role, DL-5 (read-only).
- [x] Component signature:
  ```tsx
  export interface VisitDetailSideSheetProps {
    rxId: string;
    token: string;
  }

  export default function VisitDetailSideSheet({ rxId, token }: VisitDetailSideSheetProps): JSX.Element;
  ```
- [x] Internal data flow: on mount, fetch the full Rx by id via the existing `getPrescription(rxId, token)` (or equivalent) wrapper. Loading skeleton; error inline.
- [x] Render read-only field blocks for each DL-24 field, in order:
  1. **Chief complaint** — `rx.chief_complaint` (single-line; large)
  2. **History of present illness** — `rx.history_of_present_illness` (multi-line; preserve line breaks)
  3. **Vitals** — `rx.vitals` (structured object — render BP / HR / Temp / SpO2 / Wt / Ht / BMI as a chip-grid; missing fields rendered as "—")
  4. **Examination findings** — `rx.examination_findings` (multi-line)
  5. **Provisional diagnosis** — `rx.provisional_diagnosis`
  6. **Differential diagnosis** — `rx.differential_diagnosis` (string array — render as chips)
  7. **Investigations orders** — `rx.investigations_orders` (multi-line)
  8. **Medicines** — `rx.medicines` (array — render each as a row: name, dose, frequency, duration, instructions)
  9. **Advice** — `rx.advice` (multi-line)
  10. **Follow-up** — `rx.follow_up_in` (`{n, unit}` — render as "in 7 days" etc.)
  11. **Test results** — `rx.test_results` (multi-line)
  12. **Referral** — `rx.referral` (single-line if present)
- [x] Each field block has a label + the value. Empty fields render the label dimmed with "—" as the value (so the doctor sees what was captured vs. left blank).
- [x] No edit affordances per DL-5. No "Reopen this Rx" button (out of scope).
- [x] Skeleton state during fetch. Error state with a retry.

### Step 4 — Wire HistoryPane → side sheet

- [x] Verify the `useSideSheet()` hook from cce-01 is imported in `HistoryPane.tsx`.
- [x] Verify clicking a card opens the side sheet correctly. Single-sheet semantic: clicking a different card replaces the current sheet (cce-01's behavior).
- [x] Pressing `Esc` dismisses the sheet (cce-01 handles this — verify it works).

### Step 5 — Tsc + lint + smoke

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] **Smoke at the dev fixture page** (cce-01's `_dev/side-sheet-smoke/page.tsx` OR a new fixture for HistoryPane — task picks): mount `<HistoryPane appointment={fixtureAppointment} token={fixtureToken} hideHeader />` for a patient with several past Rxs. Verify cards render. Click a card → side sheet opens with the right Rx detail. Click a different card → sheet replaces. `Esc` dismisses.
- [x] **No regression in cce-01's smoke** — the dev-only side-sheet smoke still works.

---

## Out of scope

- **Side-sheet docking.** DL-3, DL-4 — host always renders fixed-width.
- **Multi-sheet stacking.** cce-01's single-sheet semantic is final for this batch.
- **Apply-previous-Rx-to-current-draft button.** R-RX-POLISH/4.x; future batch.
- **History pane filter chips** (visit type, date range, modality). Future polish.
- **Backend pagination** of the past-Rx list. Future if patient counts grow.
- **Real-time live-update** when a new Rx is sent during the consult. The list refreshes on next page load; no live-update in this batch.
- **Click on the chronic-condition chip in the visit detail to open a sub-side-sheet with that condition's history.** Recursion of side sheets is out of scope.
- **Wiring HistoryPane / VisitDetailSideSheet into `templates.tsx`.** cce-04's job.

---

## Files expected to touch

**Created:**

- `frontend/components/patient-profile/panes/HistoryPane.tsx` (~80-120 LOC).
- `frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx` (~80-120 LOC).

**Modified (conditional, only if discovery requires):**

- `frontend/lib/api/prescriptions.ts` (or wherever Rx client lives) — add `getPatientPrescriptions(patientId, token)` thin wrapper if not already present (~10 LOC).
- `backend/src/controllers/prescription-controller.ts` + `backend/src/services/prescription-service.ts` — add `?patient_id=` query param support to the existing list endpoint if not already present (~20 LOC across both files; no schema change).

**Read but not modified:**

- `frontend/types/prescription.ts` (the Rx record shape).
- `frontend/components/ehr/sections/PreviousRxSection.tsx` (visual reference only).

---

## Notes / open decisions

1. **Why build `<HistoryPane>` fresh instead of reusing `<PreviousRxSection>`?** `<PreviousRxSection>` is bound to the `PatientChartPanel`'s SectionWrapper layout (header, "+ Add", count badge). The HistoryPane needs a different layout (compact cards, click-to-expand, no add button). Reusing would require enough conditional rendering to make a fresh build cheaper.

2. **Why build `<HistoryPane>` fresh instead of reusing `<PatientVisitsTimeline>`?** Per DL-2, that component lives in `frontend/components/patients/` which `pr-14` will delete in the patients-redesign batch. Using it would create a deletion-coupling. Building fresh costs ~1h; untangling the deletion costs days.

3. **What about appointments without a corresponding Rx (no-show, cancelled)?** Source plan §R-CHART says "past visit summaries" — but this batch maps "visit" to "prescription." Visits without an Rx (no-shows, cancellations) don't appear in the History list. Document this in the JSDoc + capture-inbox: future enhancement to merge appointments + Rxs into a unified visit list.

4. **What about pagination / load-more?** v1 fetches all past Rxs and renders them in a virtualised scrollable list (or just a regular list if Rx count is < ~50 per patient). For very large patient histories (rare), pagination is a Phase 3 follow-up.

5. **What if a Rx record is missing fields** (e.g., older Rxs created before migration 103 added `vitals_structured` / `examination_findings`)? Render the missing fields as "—". Don't crash. The DL-24 fields have defaults at the DB level (likely NULL → render as "—").

6. **Why open the side sheet via `useSideSheet().open(...)` rather than render it inline next to the History pane?** The side sheet is a shell-scoped overlay (cce-01) that floats above ALL panes, not just the History one. Rendering inline would constrain it to the History pane's column width (~25%). The shell-scoped overlay gives 480px regardless.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [plan-cockpit-v2.md § R-CHART](../../../../Product%20plans/plan-cockpit-v2.md), [plan-cockpit-chart-extraction-batch.md § DL-2, DL-5](../plan-cockpit-chart-extraction-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-chart-extraction.md` § Wave 2 gate](./EXECUTION-ORDER-cockpit-chart-extraction.md#wave-2-gate-after-cce-02--cce-03).
- **Predecessor:** [`task-cce-01-side-sheet-host-primitive.md`](./task-cce-01-side-sheet-host-primitive.md) — the side-sheet framework this task consumes.
- **Sibling lane:** [`task-cce-02-snapshot-pane.md`](./task-cce-02-snapshot-pane.md) — runs in parallel.
- **Successor:** [`task-cce-04-wire-snapshot-history-into-templates.md`](./task-cce-04-wire-snapshot-history-into-templates.md) — wires the components into production.

---

**Owner:** TBD
**Created:** 2026-05-20
**Status:** Pending