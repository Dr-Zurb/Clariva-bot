# cockpit-shell-flip — Phase 2 foothold — execution order

> Sibling document of [`plan-cockpit-shell-flip-batch.md`](../plan-cockpit-shell-flip-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

**Wave / lane / shape conventions:** [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md)

**Execution playbook:** [EXECUTION-ORDER-GUIDELINES.md §13.5 — Operating playbook](../../../../../EXECUTION-ORDER-GUIDELINES.md#135-operating-playbook-how-to-execute-a-batch-from-these-docs)

---

## Wave plan (4 waves)

```
Wave 1 (Provider lift + factory refactor — ~3h, single lane sequential):
  Lane α  ──── csf-01 (S, Auto) ──> csf-02 (S, Auto)

Wave 2 (Wire real content into leaves — ~5h, single lane sequential):
  Lane α  ──── csf-03 (M, Auto)

Wave 3 (Production cutover + kill-switch — ~3h, single lane sequential):
  Lane α  ──── csf-04 (S, Auto) ──> csf-05 (XS, Composer 2 Fast)

Wave 4 (Verification + close-out — ~2h, single lane sequential):
  Lane α  ──── csf-06 (XS, Composer 2 Fast)
```

**Total wall-clock:** ~13h (~2 dev-days for one engineer running every lane back-to-back).

**Total agent-time (sequential equivalent):** ~13h — every wave is single-lane (Shape A) so parallel and sequential equivalents match.

The bottleneck is **Wave 2 — single-lane sequential because csf-03 alone wires five content swaps across one factory file plus two new pane wrapper components, and the §5 lane gate fails point #2 (the file overlap is non-trivial).**

**Why every wave is single-lane (Shape A):** The dependency DAG is linear — csf-01's provider lift unlocks csf-03's content wiring (Subjective/Objective panes need the lifted provider); csf-02's factory refactor unlocks csf-03's content injection through the `ctx` parameter; csf-04 consumes both csf-03's wired template and the existing layout machinery; csf-05 stacks on csf-04's flipped default; csf-06 verifies the whole stack. No two tasks pass the §5 lane gate as fully independent in any wave. Per the EXECUTION-ORDER-GUIDELINES §7 default-to-sequential bias, single-lane is the right call.

**Why no Opus in this batch:** None of the six tasks are on the AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list — no PHI columns added (no migration), no RLS redesign, no novel security, no new primitive (everything reuses cv2-shipped primitives). csf-01 (provider lift) is the closest call but the change pattern is well-established (existing `<RxFormProvider>` already exposes `value` props for nested mounts; csf-01 just hoists where it mounts). Auto with per-message escalation is the right call.

---

## Lane-by-lane details

### Wave 1 — Provider lift + factory refactor (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [csf-01](./task-csf-01-rxform-provider-lift.md) | S | Auto | `frontend/components/cockpit/rx/RxFormContext.tsx` (the provider being lifted), `frontend/components/consultation/PrescriptionForm.tsx` (the current owner of the provider, lines around 263 and 315), `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` (the consumer that reads `useRxForm`), `frontend/components/cockpit/rx/sections/SubjectiveSection.tsx` + `ObjectiveSection.tsx` + `AssessmentSection.tsx` + `PlanSection.tsx` (the four sections that will mount in different panes post-lift), `frontend/components/patient-profile/PatientProfilePage.tsx` (the new mount point), source plan §DL-27. | Hoist `<RxFormProvider>` from inside `PrescriptionForm.tsx` to wrap `<PatientProfileShell>` inside `PatientProfilePage.tsx`. PrescriptionForm becomes provider-aware via a new `useExistingProviderOrMount` helper (or simply: read context; if undefined, mount its own provider). The in-call mini-panel and post-call summary mounts (which use PrescriptionForm standalone, NOT inside `PatientProfilePage`) keep working because PrescriptionForm self-mounts a provider when no parent provider exists. Three mount surfaces (DL-30 from cv2) preserved. |
| 1 | [csf-02](./task-csf-02-templates-factory-refactor.md) | S | Auto | `frontend/lib/patient-profile/templates.tsx` (the literal being refactored — keep the leaf structure identical), `frontend/lib/patient-profile/types.ts` (`PaneDefinition` shape — unchanged), `frontend/components/patient-profile/PanePlaceholder.tsx` (the synthetic leaf, unchanged), source plan §DL-15, §"The 8-pane default layout". | Convert `export const TELEMED_VIDEO_TEMPLATE: PaneDefinition[]` to `export function getTelemedVideoTemplate(ctx: TelemedVideoContext): PaneDefinition[]`. Add `TelemedVideoContext` type with `{ appointment, token, state, launcherRef?, hideHeader?, onRxSent?, onMarkNoShow?, onFinishVisit?, onMedicineCountChange?, finishBusy? }`. The leaves still render `<PanePlaceholder>` in this task — content injection is csf-03's job. Behavior identical to pre-refactor; smoke: render the factory output with a fixture context, assert tree depth + leaf ids match the pre-refactor literal. |

**Branch suggestion:** `feature/cockpit-shell-flip-foundation`. Single PR for csf-01 + csf-02.

### Wave 2 — Wire real content into leaves (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [csf-03](./task-csf-03-wire-real-content-into-leaves.md) | M | Auto | post-csf-02 — `frontend/lib/patient-profile/templates.tsx` (the factory this task fills), post-csf-01 — `frontend/components/patient-profile/PatientProfilePage.tsx` (the provider mount point), `frontend/components/patient-profile/panes/PatientChartPane.tsx` + `ConsultationBodyPane.tsx` + `RxPane.tsx` (the existing leaf renderers that drop into the new factory), `frontend/components/cockpit/rx/sections/SubjectiveSection.tsx` + `ObjectiveSection.tsx` (the small wrapper components for the right column), `frontend/components/patient-profile/PanePlaceholder.tsx` (still used for History + Investigations leaves), source plan §"The 8-pane default layout" and §DL-19..DL-22. | Inside `getTelemedVideoTemplate(ctx)`: Snapshot leaf renders `<PatientChartPane appointment hideHeader />`, History leaf keeps `<PanePlaceholder futureRItem="R-CHART (split deferred)" />`, Body leaf renders `<ConsultationBodyPane state appointment token launcherRef onRxSent onMarkNoShow hideHeader />`, Plan leaf renders `<RxPane appointment token state onRxSent onFinishVisit onMedicineCountChange hideHeader />`, Subjective leaf renders new `<SubjectivePane>` (thin wrapper over `<SubjectiveSection heading={null} />`, ~20 LOC), Objective leaf renders new `<ObjectivePane>` (thin wrapper over `<ObjectiveSection heading={null} />`, ~20 LOC), Investigations leaf keeps `<PanePlaceholder futureRItem="R-MIDDLE bottom-left (Investigations extraction deferred)" />`. The Subjective and Objective leaves CAN read RxFormContext now because csf-01 lifted the provider above the shell. Visual smoke: walk-through against the source plan layout sketch — every cell of the 3x3 grid maps. |

**Branch suggestion:** `feature/cockpit-shell-flip-content-wiring` stacked on Wave 1's branch.

### Wave 3 — Production cutover + kill-switch (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [csf-04](./task-csf-04-production-cutover.md) | S | Auto | post-csf-03 — `frontend/lib/patient-profile/templates.tsx` (the wired factory), `frontend/components/patient-profile/PatientProfilePage.tsx` (the consumer being switched from `builtInPanes` to the factory — read lines 292–360 carefully), `frontend/lib/patient-profile/types.ts` (`flattenPaneDefinitions` + `PaneDefinition` recursion contract from cv2-01), `frontend/lib/patient-profile/layout-tree.ts` (the v3→v4 migrator from cv2-02), `frontend/components/patient-profile/PaneToggleBar.tsx` (consumer of `toggleBarPanes` — already walks the tree post-cv2), source plan §DL-15, §"Phase 2 gate" and DL-12 (mobile preserved). | In `PatientProfilePage`, replace `builtInPanes` with a new `useTelemedVideoTemplate(ctx)` hook that wraps `getTelemedVideoTemplate(ctx)` in a `useMemo`. `defaultLeafPaneOrder`, `toggleBarPanes`, and the seed effect already use `flattenPaneDefinitions` (cv2-02), so they walk the new tree without changes. Walk-in branch (`!showChart`) keeps a 2-pane horizontal fallback for now (telemed-video assumes a chart pane; in-clinic + walk-in templates are R-MOD-full / Phase 2-followup). Storage namespace changes from `patient-profile:v1:layout` to `patient-profile:v2:telemed-video-layout` — old v3/v4 keys are read on first mount via the existing seed loader (so doctors keep their column widths where applicable; ignored for the new tree shape). MobilePillBar (`<lg`) is unchanged (DL-12 from cv2). |
| 1 | [csf-05](./task-csf-05-v1-kill-switch.md) | XS | **Composer 2 Fast** | `frontend/app/dashboard/appointments/[id]/page.tsx` (the route that gains the `?v1=1` reader), `frontend/components/patient-profile/PatientProfilePage.tsx` (the consumer that gains the `legacyShape?: boolean` prop), source plan §"Decommission plan" + ppr-14's `?v1=1` precedent (predecessor pattern). | Server component reads `searchParams.v1`; if `'1'`, passes `legacyShape={true}` to `<PatientProfilePage>`. Inside the component, when `legacyShape === true`, the factory hook is short-circuited and the legacy 3-pane `builtInPanes` (kept around as `legacyBuiltInPanes` after csf-04 — the array literal stays in the file but unused unless the kill-switch fires) is mounted instead. 4-week kill-switch window matches the ppr / cv2 strangler-fig pattern. Append `docs/Work/capture/inbox.md` line for "Phase 3 close-out: delete `legacyBuiltInPanes` and the `?v1=1` reader after the 4-week soak". |

**Branch suggestion:** `feature/cockpit-shell-flip-cutover` stacked on Wave 2's branch.

### Wave 4 — Verification + close-out (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [csf-06](./task-csf-06-verification-and-close-out.md) | XS | **Composer 2 Fast** | All Wave 1–3 task files, `docs/Reference/product/cockpit/COCKPIT.md` (the doc this task updates — created by cv2-08), `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/cv2-08-verification-report.md` (the verification baseline this task compares against), `frontend/app/dashboard/appointments/[id]/page.tsx` + `frontend/components/patient-profile/PatientProfilePage.tsx` (the production surfaces being verified). | Smoke matrix: empty appointment, autosave + reload, full send, modality-state transitions (waiting → live → wrap-up), kill-switch (`?v1=1` round-trip both ways), walk-in fallback. tsc/lint/build sweep. Update `docs/Reference/product/cockpit/COCKPIT.md` with the new production tree-mount diagram. Append "Status (post-csf-06)" section to `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/plan-cockpit-v2-batch.md` linking this batch as Phase 2 foothold. Telemetry event `cockpit_v2.phase2_shell_flipped` fires once on first appointment-detail mount post-flip (verify in network tab). Capture `docs/Work/capture/inbox.md` follow-ups for R-MOD-full, R-CHART, R-RIBBON, R-MIDDLE, R-HISTORY (each one-line, pointing at the source plan's R-item). |

**Branch suggestion:** Wave 4 stacks on Wave 3's branch and is the final commit on `feature/cockpit-shell-flip-main` before merge.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| csf-01 | S | Auto | Provider hoist with a self-mount fallback. Pattern is well-established in the React ecosystem; `<RxFormProvider>` already exposes the value-prop shape needed. Three mount surface preservation (DL-30) is mechanical. |
| csf-02 | S | Auto | Convert one literal to one factory function. Add one type. Behaviour-preserving by construction. |
| csf-03 | M | Auto | Wire five existing components into five existing leaves; create two thin wrapper components (`<SubjectivePane>`, `<ObjectivePane>`) that are 20 LOC each. Scope is bounded by the source plan's layout sketch. |
| csf-04 | S | Auto | Replace `builtInPanes` with the factory hook. Storage namespace change. Walk-in fallback preserved. The hardest decision (Walk-in template) is locked: kept as 2-pane horizontal fallback; full template promotes to R-MOD-full. |
| csf-05 | XS | **Composer 2 Fast** | Server component reads one query param; component gains one boolean prop; one short-circuit in the factory hook. Three small file edits — Composer's sweet spot. |
| csf-06 | XS | **Composer 2 Fast** | Manual smoke matrix + doc updates + telemetry + inbox lines. Composer's sweet spot per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § Tier 4](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#tier-4--composer-2-fast-use-heavily-15-25-of-turns). |

**Opus caps:** ≤ 1 per wave (zero — under the cap on every wave). ≤ 2 per batch (zero — well under the cap). The natural escalation candidate (csf-01 if the provider hoist surfaces an unforeseen autosave race) has a clean self-mount fallback path; per-message escalation to Opus on csf-01 only if Auto stalls on the provider-aware pattern.

---

## Acceptance gates per wave

### Wave 1 gate (after csf-01 + csf-02)

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `<RxFormProvider>` is mounted inside `PatientProfilePage.tsx` above `<PatientProfileShell>`. `rg "<RxFormProvider" frontend/components` returns ≥ 2 matches: one in `PatientProfilePage.tsx` (the new mount) and one in `PrescriptionForm.tsx` (the self-mount fallback). The fallback is gated by a context-existence check.
- [ ] **Three mount surfaces (DL-30 from cv2) preserved** — appointment-detail page, in-call mini-panel, post-call summary. Open each (or render in a smoke-test component); fill all SOAP sections; autosave round-trips; refresh; fields populate. Same as cv2-08's verification baseline.
- [ ] `getTelemedVideoTemplate(fixtureCtx)` returns a tree with the same leaf ids and the same depth as the pre-refactor `TELEMED_VIDEO_TEMPLATE` literal. (Smoke against a fixture; e.g., assert `flattenPaneDefinitions(getTelemedVideoTemplate(fixture)).paneOrder` equals the literal's flattened order.)
- [ ] `TelemedVideoContext` is exported from `frontend/lib/patient-profile/templates.tsx` and has the field set listed in csf-02's task file.

### Wave 2 gate (after csf-03)

- [ ] All Wave 1 gates still green.
- [ ] `getTelemedVideoTemplate(ctx)`'s leaves render real content per csf-03's mapping table: Snapshot=PatientChartPane, Body=ConsultationBodyPane, Plan=RxPane, Subjective=SubjectivePane (over SubjectiveSection), Objective=ObjectivePane (over ObjectiveSection). History + Investigations remain `<PanePlaceholder>` (R-CHART + R-MIDDLE deferred).
- [ ] **Smoke render at a dev-only route** (or a Storybook entry; task picks): mount `<PatientProfilePage panes={getTelemedVideoTemplate(fixtureCtx)}>` in a fixture page; verify the 8-pane layout renders, all sections compute their `useRxForm()` reads cleanly (no "must be inside RxFormProvider" errors), and the autosave debounce timer is the same single timer instance as the legacy mount (verifiable via React DevTools — only one `<RxFormProvider>` in the tree).
- [ ] **Two new wrapper components exist:** `frontend/components/patient-profile/panes/SubjectivePane.tsx` + `ObjectivePane.tsx`. Each is ≤ 30 LOC and re-exports the corresponding `<*Section>` component with `heading={null}`.
- [ ] `<PanePlaceholder>` is referenced from `templates.tsx` for exactly the History and Investigations leaves; History uses `futureRItem="R-CHART"`, Investigations uses `futureRItem="R-MIDDLE"`. (Verifiable via `rg "<PanePlaceholder" frontend/lib/patient-profile/templates.tsx` returns 2 matches.)

### Wave 3 gate (after csf-04 + csf-05)

- [ ] All Wave 2 gates still green.
- [ ] `/dashboard/appointments/[id]` renders the 8-pane layout by default (no query string). Doctors see Snapshot / Body / Subjective on top row of left/middle/right columns; Body splits into top + bottom; bottom splits into Investigations placeholder + Plan; right column splits into Subjective + Objective.
- [ ] Drag handles work at every nesting level (cv2-01 already proved this on the deleted `/v2-tree`; this gate confirms it survives in production). Cascade handles respect each leaf's `minSizePct` + `minSizePx`.
- [ ] Layout persists across reloads under the new storage key `patient-profile:v2:telemed-video-layout`. Old `patient-profile:v1:layout` key is unread (silently retired; no migration is required for the new tree shape).
- [ ] **Walk-in fallback preserved** — open an appointment with `patient_id = null` (walk-in slot); the 2-pane horizontal layout (body + rx) still renders. (Telemed-video template's chart pane requires a patient_id; walk-in keeps the legacy 2-pane layout until R-MOD-full ships an in-clinic template.)
- [ ] **Kill-switch works:** navigate to `/dashboard/appointments/[id]?v1=1`; the legacy 3-pane chart/body/rx layout renders. Removing the query param and refreshing returns to the 8-pane default. No console errors.
- [ ] `pnpm --filter frontend tsc --noEmit` + `pnpm --filter frontend lint` + `pnpm --filter frontend build` all clean.

### Wave 4 gate — batch close-gate (after csf-06)

- [ ] All Wave 3 gates still green.
- [ ] **Cross-cutting acceptance gate** (from [`plan-cockpit-shell-flip-batch.md` § Cross-cutting acceptance gate](../plan-cockpit-shell-flip-batch.md#cross-cutting-acceptance-gate-whole-batch)) all green. Specifically:
  - Structural: 8-pane default at production appointment-detail; kill-switch works; storage migration silent.
  - Form parity: autosave round-trip on all four SOAP sections (Subjective, Objective, Assessment, Plan) — single `<RxFormProvider>` in the tree, single autosave timer.
  - Three mount surfaces (DL-30) unchanged: appointment-detail, in-call mini-panel, post-call summary all functional.
  - Quality: tsc clean, lint clean, build clean, no new Sentry errors in 5-min smoke session.
  - Docs: COCKPIT.md updated with the new production tree-mount diagram; cv2 plan's Status section appended; capture-inbox lines for R-MOD-full / R-CHART / R-RIBBON / R-MIDDLE / R-HISTORY.
- [ ] **Telemetry event** `cockpit_v2.phase2_shell_flipped` fires exactly once during csf-06's first appointment-detail mount post-flip.
- [ ] **`docs/Work/capture/inbox.md` updated** with five follow-up lines (one per deferred R-item).
- [ ] **Optional Opus close-gate review** — one fresh Opus 4.7 Extra High chat with the full Wave 1–4 diff grading against the cross-cutting gate. Skip if every deterministic check above passes cleanly.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | csf-01, csf-02 | 2/2 | 0/2 | 0/2 | ~3h |
| Wave 2 | csf-03 | 1/1 | 0/1 | 0/1 | ~5h |
| Wave 3 | csf-04, csf-05 | 1/2 | 1/2 | 0/2 | ~3h |
| Wave 4 | csf-06 | 0/1 | 1/1 | 0/1 | ~2h |
| **Total** | **6** | **4** | **2** | **0** | **~13h (single-lane sequential everywhere)** |

Token estimate (rough): ~250k input / ~150k output across the batch. Zero Opus tasks (the cheapest cockpit-v2-aligned batch in the Phase-2 chain). Total batch spend (excluding optional close-gate review): ~$10–15.

**One optional Opus close-gate turn after csf-06** budgeted on top. Skip if the deterministic gates pass cleanly.

---

## References

- [plan-cockpit-shell-flip-batch.md](../plan-cockpit-shell-flip-batch.md) — the *what / why* sibling.
- [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md) — source product plan; this batch is the smallest possible Phase 2 increment.
- [Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/EXECUTION-ORDER-cockpit-v2.md](../../../17-05-2026/cockpit-v2/Tasks/EXECUTION-ORDER-cockpit-v2.md) — predecessor exec-order; the foundation this batch flips into production.
- [Daily-plans/May 2026/18-05-2026/patients-redesign/Tasks/EXECUTION-ORDER-patients-redesign.md](../../../18-05-2026/patients-redesign/Tasks/EXECUTION-ORDER-patients-redesign.md) — adjacent-day exec-order; same conventions, same ASCII shape.
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; the hard-rules list (which this batch sits entirely below — no Opus tasks).
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft this doc.
