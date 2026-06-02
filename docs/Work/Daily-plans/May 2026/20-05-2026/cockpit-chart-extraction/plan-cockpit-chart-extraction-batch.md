# Cockpit chart extraction — R-CHART — 20 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **zero Opus tasks** — none of the five tasks meet the hard-rules thresholds (no PHI columns added, no RLS redesign, no novel security, no new architectural primitive — the side-sheet primitive is a small implementation of a contract cv2-09 already designed). Three tasks are Auto; two are Composer 2 Fast (cce-04 the templates wiring, cce-05 the verification close-out).
>
> **Source plan:** [`Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) §R-CHART (line ~283). R-CHART is one of five Phase-2 R-items deferred from the [`cockpit-shell-flip`](../../19-05-2026/cockpit-shell-flip/) batch. Filling the History `<PanePlaceholder>` is the highest-leverage next step per the [execution roadmap](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) §5.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip](../../19-05-2026/cockpit-shell-flip/) — the production cutover. **Must be merged before cce-04 starts.** csf-03 leaves the `history` leaf as `<PanePlaceholder title="History" futureRItem="R-CHART (Snapshot/History split deferred)" />` and the `snapshot` leaf as `<PatientChartPane>`; this batch replaces both.
> - [Daily-plans/May 2026/17-05-2026/cockpit-v2](../../17-05-2026/cockpit-v2/) — cv2-09 designed the auxiliary-surface contracts in `frontend/lib/patient-profile/aux-surfaces.ts`. R-CHART is the **first real user** of the side-sheet contract (`useSideSheet` + `<SideSheetHost>`).
> - [backend/migrations/087_patient_chart_context.sql](../../../../../backend/migrations/) — the schema that `patient-chart-controller.ts` reads. **No new migrations** in this batch.
> - [backend/src/services/patient-chart-service.ts](../../../../../backend/src/services/patient-chart-service.ts) — existing aggregator; `listAllergies` / `listChronicConditions` / `listVitals` / `getProblemList` already cover Snapshot's needs.
> - [frontend/components/ehr/PatientChartPanel.tsx](../../../../../frontend/components/ehr/PatientChartPanel.tsx) — the existing 5-section panel (Allergies, Chronic, Problem List, Vitals, Previous Rx). **Reused verbatim by `<SnapshotPane>`** with a section subset.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-chart-extraction.md`](./Tasks/EXECUTION-ORDER-cockpit-chart-extraction.md).

---

## Why this batch

When cockpit-shell-flip lands, doctors opening any telemed appointment see the new 8-pane Telemed-Video layout. Five leaves render real content; two render `<PanePlaceholder>` panels labeled with their owning R-item. **The History placeholder is the more visible regression** — the legacy 3-pane layout had patient history accessible inside the chart pane (via `<PatientChartPanel>`'s "Previous prescriptions" section), and the new layout temporarily hides that surface behind a "Coming soon — R-CHART deferred" placeholder.

R-CHART closes that gap. It also splits the chart pane vertically per the source plan's §R-CHART (line 283): Snapshot (top, ~45%) for at-a-glance safety-critical context, History (bottom, ~55%) for past-visit deep dive. The split mirrors how doctors actually scan a chart — quick safety-glance at allergies/chronic/vitals, then deeper read of recent visits when the case warrants.

The architectural unlock: **R-CHART is the first batch that exercises the side-sheet contract from cv2-09.** Clicking a History visit-card opens the visit detail (full SOAP + medicines + investigations from that historical Rx) in a side sheet that slides in from the right edge of the shell. cv2-09 designed the `SideSheetDefinition` interface but didn't ship a host; this batch ships `<SideSheetHost>` + `useSideSheet()` as the framework, then makes the visit-detail sheet the framework's first real consumer. The same primitive will host the Previous-Rx side sheet (R-RX-POLISH/4.x) in Phase 3 with zero rework.

The clinical justification for click-to-expand visit cards (rather than always-expanded) is density: a year of regular follow-ups is 12-24 visits. An always-expanded list would dominate the History pane vertically, pushing the most recent visit (the one the doctor cares about 90% of the time) below the fold. The card-with-click pattern keeps the most recent N visits scannable while the side sheet handles the deep dive.

This batch closes R-CHART with **5 tasks across 4 waves**, **~5h-8h wall-clock with parallelism in Wave 2** (~12h sequential equivalent), **zero new migrations**, and **zero Opus tasks**. The visible artifact at the close-gate is `/dashboard/appointments/[id]` rendering Snapshot + History as separate scrollable panes in the left column, with click-to-expand visit detail flowing into the new side-sheet host.

---

## Decision lock (frozen for batch duration)

These match the planning conversation locked 2026-05-20. Re-opening any belongs in a new batch.

**DL-1: Snapshot is a section subset of `<PatientChartPanel>`, not a new component tree.** `<SnapshotPane>` reuses the existing `PatientChartPanel` infrastructure with a `mode` discriminator restricting the section list to `Allergies`, `ChronicConditions`, `ProblemList`, `Vitals` (last 3 readings only). Per source plan §R-CHART: "Snapshot = allergies, chronic conditions, current medications, recent vitals trend." Source plan also says "current medications" — this batch maps that to a thin slice of `PreviousRxSection` filtered to active prescriptions only (gate: most recent Rx; future R-MIDDLE may extract a dedicated `<CurrentMedicationsSection>`). Building from `PatientChartPanel` rather than from scratch saves ~2 days of section reimplementation.

**DL-2: History is past-Rx-as-visit-cards, not a new appointment timeline.** `<HistoryPane>` lists past prescriptions for the patient (each Rx = one visit) most-recent-first, displayed as compact cards (date, chief complaint, working dx, medicines count). Click → visit-detail side sheet. We don't reuse `PatientVisitsTimeline.tsx` from `frontend/components/patients/` because that component is bound to the legacy patient-detail page that pr-14 will delete; using it would create deletion-coupling between this batch and the patients-redesign batch. Building a fresh `<HistoryPane>` is cheaper than untangling that.

**DL-3: One side-sheet host per page, mounted by `<PatientProfileShell>`.** `<SideSheetHost>` lives inside the shell (sibling to the pane grid), not inside `PatientProfilePage`. Reasons: (a) the shell is the natural owner of overlay UI that floats over panes, (b) any pane can register a sheet through `useSideSheet()` without prop-drilling, (c) the host's z-index management belongs near the pane chrome.

**DL-4: Side sheets are right-edge slide-in, fixed-width 480px, dismissable via `Esc` / backdrop / explicit close button.** No multi-sheet stacking in this batch (the source-plan contract reserves it for the future; for now `useSideSheet().open(definition)` replaces the current sheet if one is already open). No drag-to-resize. No docking. The cv2-09 contract's `canDock: boolean` field is honored at the type level but the host always behaves as `canDock: false` in this batch — docking is a Phase 3 follow-up captured in `docs/Work/capture/inbox.md` by cce-05.

**DL-5: Visit-detail content is read-only.** The side sheet renders the historical Rx's fields (CC, HOPI, Vitals, Examination, Provisional Dx, Differential Dx, Investigations Orders, Medicines, Advice, Follow-up, Test Results) as labeled read-only blocks. No re-edit affordance. Doctors who want to amend a past Rx use the existing edit-prescription flow from a separate route. (R-RX-POLISH/4.x's "Apply previous Rx to current draft" button is a separate side-sheet variant — not built here.)

**DL-6: No new backend endpoints, no new migrations.** History uses the existing `GET /api/v1/patients/:patientId/prescriptions` endpoint (or whatever lists prescriptions per patient — task discovers). Visit detail uses the existing `GET /api/v1/prescriptions/:id` endpoint. Snapshot reuses `GET /api/v1/patients/:patientId/chart/{allergies,conditions,vitals,problems}` from the existing chart controller. Zero schema changes.

**DL-7: Walk-in fallback unchanged.** Walk-in appointments (`patient_id == null`) still mount the legacy 2-pane horizontal body+rx layout per cockpit-shell-flip's DL-5. The Snapshot + History panes are not reachable for walk-ins because the chart leaf is filtered out of the template. No-op for walk-ins.

**DL-8: Zero Opus tasks.** Side-sheet host is a small implementation of an existing contract (~80 LOC); SnapshotPane is configuration of an existing component (~60 LOC); HistoryPane is composition over an existing API (~150 LOC). None reaches the L-size structural-refactor threshold. Per-message escalation to Opus on cce-01 only if Auto stalls on the `useSideSheet` registry pattern (it shouldn't — React Context + a queue).

---

## Phases

### Wave 1 — Side-sheet primitive (1 task, ~3h, single sequential lane)

The dependency cliff per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 1](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). cce-01 ships the `<SideSheetHost>` + `useSideSheet()` framework. Both Wave 2 tasks consume it (HistoryPane needs it to open visit-detail; SnapshotPane optionally uses it for click-to-expand-allergy if scope allows but stays out for this batch).

- [`task-cce-01-side-sheet-host-primitive.md`](./Tasks/task-cce-01-side-sheet-host-primitive.md) — **S, Auto** — Implement `useSideSheet()` hook + `<SideSheetHost>` component honoring the cv2-09 `SideSheetDefinition` interface from `frontend/lib/patient-profile/aux-surfaces.ts`. Mount `<SideSheetHost>` inside `<PatientProfileShell>` (sibling to the pane grid). Right-edge slide-in (480px fixed width), `Esc` + backdrop + explicit close button to dismiss. Single-sheet-at-a-time semantic (replaces the current sheet if a new one opens). No docking in v1.

### Wave 2 — Snapshot + History panes (2 parallel lanes, Shape B, ~3-4h)

Two disjoint files; both consume cce-01's side-sheet primitive (HistoryPane uses it directly; SnapshotPane doesn't but lives next to it). The §5 lane gate passes all six points (see EXECUTION-ORDER doc).

- **Lane α** — [`task-cce-02-snapshot-pane.md`](./Tasks/task-cce-02-snapshot-pane.md) — **S, Auto** — New `frontend/components/patient-profile/panes/SnapshotPane.tsx`. Renders a section subset of `<PatientChartPanel>`: Allergies, Chronic conditions, Problem list, Vitals (limited to last 3 readings via the existing `?limit=3` query param on `listVitals`), Current medications (subset of `PreviousRxSection` showing only active Rxs from the most recent visit). Pane chrome: scrollable container; each section renders read-only when `mode="default"` (the existing `PatientChartPanel` mode). Mounts in the `snapshot` leaf via cce-04.
- **Lane β** — [`task-cce-03-history-pane-and-visit-detail-sheet.md`](./Tasks/task-cce-03-history-pane-and-visit-detail-sheet.md) — **M, Auto** — New `frontend/components/patient-profile/panes/HistoryPane.tsx` + new `frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx`. HistoryPane lists past prescriptions for the patient most-recent-first as compact cards (date, CC, working Dx, medicines count). Click → opens VisitDetailSideSheet via `useSideSheet().open({...})`. VisitDetailSideSheet fetches and renders the full Rx record read-only (CC, HOPI, Vitals, Exam, Dx, Inv Orders, Medicines, Advice, F/U, Test Results). Both consume the cce-01 framework.

### Wave 3 — Templates wiring (1 task, ~1h, single sequential lane)

Cut 2 (artifact change) per [EXECUTION-ORDER-GUIDELINES § 0.5](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). End of Wave 2: SnapshotPane + HistoryPane + VisitDetailSideSheet all exist and render correctly in a fixture. End of Wave 3: production page renders them in the correct leaves.

**Important:** This wave is gated on the cockpit-shell-flip batch (`csf-04` + `csf-05`) being merged. Until that lands, the `snapshot` and `history` leaves of `getTelemedVideoTemplate` aren't mounted at the production page. cce-04 modifies `templates.tsx` which csf-02 + csf-03 also write — running concurrently would cause merge conflicts. Wave 3 of this batch should stack on the merged `cockpit-shell-flip-cutover` branch.

- [`task-cce-04-wire-snapshot-history-into-templates.md`](./Tasks/task-cce-04-wire-snapshot-history-into-templates.md) — **XS, Composer 2 Fast** — In `frontend/lib/patient-profile/templates.tsx`'s `getTelemedVideoTemplate(ctx)`: replace the `snapshot` leaf's `<PatientChartPane>` render with `<SnapshotPane appointment={ctx.appointment} token={ctx.token} hideHeader />`; replace the `history` leaf's `<PanePlaceholder>` with `<HistoryPane appointment={ctx.appointment} token={ctx.token} hideHeader />`. Update the file's top-of-file JSDoc and the pane-id → R-item mapping (history is no longer "deferred"; it's "real").

### Wave 4 — Verification + close-out (1 task, ~1h, single sequential lane)

- [`task-cce-05-verification-and-close-out.md`](./Tasks/task-cce-05-verification-and-close-out.md) — **XS, Composer 2 Fast** — Smoke matrix: open a real telemed appointment with several past Rxs; verify Snapshot renders Allergies + Chronic + Problems + Vitals (last 3) + Current meds; verify History lists past Rxs; click a card → side sheet slides in with full read-only detail; `Esc` dismisses; backdrop dismisses. tsc + lint + build sweep. Update `docs/Reference/product/cockpit/COCKPIT.md` with the new chart-pane structure + side-sheet host. Update [`plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md): R-CHART status → ✅ DONE; batch ledger entry; recommended-ordering pointer to next batch (cockpit-ribbon). Telemetry event `cockpit_v2.r_chart_landed` fires once on first appointment-detail mount post-merge. Capture-inbox follow-ups for: side-sheet docking (Phase 3 enhancement), Previous-Rx side sheet (R-RX-POLISH/4.x — second user of side-sheet host), History pane filter chips (visit type, date range — Phase 3 polish).

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed. They span waves and surface the batch-level invariants the per-wave gates can't individually verify.

### Structural

- [ ] **Snapshot leaf renders real content** — `/dashboard/appointments/[id]` (post-csf-* + post-this-batch) shows Allergies / Chronic / Problems / Vitals (last 3) / Current medications inside the `snapshot` leaf. No `<PanePlaceholder>` visible.
- [ ] **History leaf renders real content** — same page shows a list of past visit cards (most recent first) inside the `history` leaf. Cards show date, CC, working Dx, and medicines count.
- [ ] **Click-to-expand opens side sheet** — clicking any history card opens `<VisitDetailSideSheet>` from the right edge with the full read-only Rx fields. `Esc` dismisses. Clicking the backdrop dismisses. Explicit close button dismisses. No console errors on any path.
- [ ] **Single side-sheet semantic** — opening a second visit's detail while one is already open replaces the first (not stacks). React DevTools shows exactly one `<SideSheetHost>` rendering one sheet at a time.
- [ ] **Walk-in unchanged** — open a walk-in appointment (`patient_id == null`); the 2-pane horizontal body+rx layout still renders. Snapshot + History don't appear (chart pane filtered out by walk-in fallback).
- [ ] **Mobile branch unchanged (DL-12 from cv2)** — `<lg` viewport renders the existing `MobilePillBar` flow. No side sheet on mobile.

### Form parity (the lifted `<RxFormProvider>` sanity)

- [ ] **Side sheets don't break the provider tree** — the side-sheet host mounts inside `<PatientProfileShell>` via React Portal (or absolute-positioned overlay). React DevTools confirms exactly one `<RxFormProvider>` in the tree; opening a side sheet doesn't add a second.
- [ ] **No autosave timer interference** — fill the Plan pane medicine row, open a history side sheet, dismiss it; verify the autosave debounce still fires once and saves the medicine row.

### Quality

- [ ] **`pnpm --filter frontend tsc --noEmit` clean.** `pnpm --filter frontend lint` clean. `pnpm --filter frontend build` succeeds.
- [ ] **No new Sentry errors** in a 5-min smoke session opening / closing side sheets, scrolling Snapshot, scrolling History, switching between appointments.
- [ ] **Telemetry** — `cockpit_v2.r_chart_landed` fires exactly once during cce-05's smoke pass.
- [ ] **Performance** — opening a side sheet on a patient with 50+ past Rxs (one of the test fixtures) shows the sheet within 300ms after click; backdrop fade-in within 150ms. (Manual check with DevTools Performance tab; not a blocker unless > 1s.)

### Documentation

- [ ] **`docs/Reference/product/cockpit/COCKPIT.md` updated** with the new chart-pane structure (Snapshot + History as separate leaves) and the side-sheet host diagram.
- [ ] **`plan-cockpit-v2-execution-roadmap.md` updated** with R-CHART status → ✅ DONE, batch ledger entry, and the next-batch pointer (cockpit-ribbon — runner-up by §5 decision rules).
- [ ] **Capture-inbox follow-ups** — three lines for side-sheet docking (Phase 3 enhancement), Previous-Rx side sheet R-RX-POLISH/4.x (second user), History pane filter chips.

---

## Out-of-scope (rolled forward to follow-up batches)

These items are intentionally **not** delivered by this batch. Each gets a future batch named in the source plan or roadmap.

| Out-of-scope item | Source | Where it lands |
|---|---|---|
| **Side-sheet docking** (`canDock: true` honored as actual docking, not just type-level) | cv2-09 contract | Phase 3 polish batch |
| **Previous-Rx side sheet** (R-RX-POLISH/4.x — apply prev Rx to current draft with diff vs. current) | source plan §R-RX-POLISH/4.x | `rx-polish-side-sheet` follow-up batch |
| **History pane filter chips** (visit type, date range, modality) | not in source plan; planning-time enhancement | Phase 3 polish batch |
| **Snapshot edit affordances** (inline edit allergies/chronic from the snapshot pane) | not in source plan | Future R-CHART/2 if doctor feedback warrants |
| **Visit-detail "Reopen / Edit" button** (jump from a historical Rx to an editable copy) | not in source plan | Future polish batch |
| **Multi-sheet stacking** | cv2-09 contract reserves it but doesn't require it | Phase 3 if any consumer needs it |
| **Backend pagination on the prescriptions list** for History | not flagged today; OK at current data volumes | Future if patient counts grow large |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock (parallelism) | Wall-clock (sequential) |
|---|---|---|---|---|---|---|
| Wave 1 | cce-01 | 1/1 | 0/1 | 0/1 | ~3h | ~3h |
| Wave 2 | cce-02 + cce-03 | 2/2 | 0/2 | 0/2 | **~4h (parallel — Shape B)** | ~7h |
| Wave 3 | cce-04 | 0/1 | 1/1 | 0/1 | ~1h | ~1h |
| Wave 4 | cce-05 | 0/1 | 1/1 | 0/1 | ~1h | ~1h |
| **Total** | **5** | **3** | **2** | **0** | **~9h (~1.5 dev-days, two engineers in Wave 2)** | **~12h (~1.5 dev-days, one engineer)** |

Token estimate (rough): ~150k input / ~100k output across the batch. Zero Opus tasks. Total batch spend (excluding optional close-gate review): ~$8-12.

---

## Sequencing notes (the why behind the waves)

The 4-wave shape:

- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without cce-01's side-sheet primitive, cce-03 can't open the visit-detail sheet. cce-02 doesn't strictly need it, but Wave 1 still gates Wave 2 because Lane β needs the framework.
- **Wave 2 is Shape B parallel.** Lane α (SnapshotPane) and Lane β (HistoryPane + VisitDetailSideSheet) live in disjoint files and don't consume each other's WIP mid-wave. Both consume Wave 1's framework. The §5 lane gate passes all six points; per the EXECUTION-ORDER-GUIDELINES bias, parallel is justified here because the two lanes are big enough to amortize the chat-startup overhead and small enough that splitting doesn't fragment context too much.
- **Wave 2 → Wave 3 is a Cut 2 (artifact change).** End of Wave 2: components exist and render in fixtures. End of Wave 3: production page mounts them.
- **Wave 3 → Wave 4 is a Cut 3 (kind-of-work change).** Wave 3 = Build (templates wiring). Wave 4 = QA + Docs (smoke matrix, doc updates, telemetry, capture-inbox, roadmap update).

**Why no Opus tasks?** Per the AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list, Opus is reserved for L-size structural refactors, PHI migrations, RLS redesigns, novel security, or new architectural primitives. cce-01 is the closest call (a new shell-level primitive — the side-sheet host), but it's a small implementation (~80 LOC) of a contract cv2-09 already designed. Per-message escalation to Opus only if Auto stalls on the `useSideSheet` registry pattern.

**Cross-batch dependency:** Wave 3 (cce-04) is gated on `cockpit-shell-flip` being merged. Wave 1 (cce-01), Wave 2 (cce-02 + cce-03), and parts of Wave 4 prep can run **in parallel** with the in-flight csf-* tasks because they modify disjoint files. Practical scheduling: start Wave 1 + Wave 2 on a fresh branch from `main`; rebase onto `cockpit-shell-flip-cutover` once that's merged; run Wave 3 + Wave 4.

---

## References

- [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md) §R-CHART (line 283).
- [Product plans/plan-cockpit-v2-execution-roadmap.md](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) — master tracker; §5 explains why R-CHART is recommended next.
- [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip/](../../19-05-2026/cockpit-shell-flip/) — predecessor batch; csf-03 leaves the placeholders this batch fills.
- [Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/task-cv2-09-aux-surface-contracts.md](../../17-05-2026/cockpit-v2/Tasks/task-cv2-09-aux-surface-contracts.md) — the side-sheet contract this batch makes real.
- [docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; this batch sits entirely below the hard-rules list (no Opus tasks).
- [docs/Work/process/EXECUTION-ORDER-GUIDELINES.md](../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft the sibling EXECUTION-ORDER doc.
- Sibling: [`Tasks/EXECUTION-ORDER-cockpit-chart-extraction.md`](./Tasks/EXECUTION-ORDER-cockpit-chart-extraction.md) — wave / lane matrix + model picks + acceptance gates per wave.
