# 19 May 2026 — Daily plans

One batch lands (or is landing) on this day, filed in a self-contained subfolder with its own plan + `Tasks/` tree.

| Folder | Batch | Status | What it covers |
|---|---|---|---|
| [`cockpit-shell-flip/`](./cockpit-shell-flip/) | **Cockpit shell flip — Phase 2 foothold** (csf-01 … csf-06) | Drafted 2026-05-19 (active) | The smallest possible Phase 2 increment of [`Product plans/plan-cockpit-v2.md`](../../Product%20plans/plan-cockpit-v2.md) — flips the production appointment-detail mount (`/dashboard/appointments/[id]`) from the legacy 3-pane chart/body/rx layout to the **8-pane Telemed-Video tree** that cockpit-v2 Phase 1 scaffolded but never wired into production. Lifts `<RxFormProvider>` above the shell so `<SubjectiveSection>` / `<ObjectiveSection>` / `<AssessmentSection>` / `<PlanSection>` (shipped by cv2-05 + cv2-06) can mount in their own panes; converts `frontend/lib/patient-profile/templates.tsx` from a literal `PaneDefinition[]` to a `getTelemedVideoTemplate(ctx)` factory; wires real content into the leaves where Phase 1 components already exist (Snapshot ← `<PatientChartPane>`, Body ← `<ConsultationBodyPane>`, Plan ← existing `<RxPane>` / `<RxWorkspace>`, Subjective ← `<SubjectiveSection>`, Objective ← `<ObjectiveSection>`); leaves synthetic `<PanePlaceholder>` in the **two leaves** whose content extraction is genuinely deferred (History → R-CHART; Investigations → R-MIDDLE bottom-left); ships a `?v1=1` URL kill-switch matching the ppr / cv2 strangler-fig pattern. **No new migrations.** **Zero Opus tasks.** Modality auto-switch (R-MOD full), Snapshot/History split (R-CHART), patient ribbon (R-RIBBON), middle-column rebuild (R-MIDDLE), right-column rebuild (R-HISTORY) all promote to follow-up batches. **~5 dev-days, 6 tasks, 4 waves.** |

## Why this batch follows yesterday

The [17-05-2026 cockpit-v2](../17-05-2026/cockpit-v2/) batch closed Phase 1 — the recursive `<PatientProfileShell>`, the `<RxFormProvider>` + four-section composition root, the SOAP fields migration, the Cmd+K placeholder, and the `TELEMED_VIDEO_TEMPLATE` literal in `frontend/lib/patient-profile/templates.tsx`. The verification report noted that the production cockpit at `/dashboard/appointments/[id]` still renders the legacy 3-pane layout because the smoke-test route at `/v2-tree` was deliberately deleted in cv2-08; **no production mount consumes the new template**.

That decision was correct for Phase 1 (structural primitives only, no content extraction). But the user-facing artifact of cockpit-v2 — the 8-pane structure — is invisible to doctors today. This batch is the **minimum viable flip** that makes it visible without forcing a 3-week R-MIDDLE / R-HISTORY / R-CHART content rebuild first.

The trick: most of the content the 8 leaves want **already exists** as standalone components after cv2-05 + cv2-06.

- `<SubjectiveSection>` / `<ObjectiveSection>` / `<AssessmentSection>` / `<PlanSection>` ship as separately-importable components consuming `useRxForm()` (verified — `frontend/components/cockpit/rx/sections/`).
- `<PatientChartPane>` and `<ConsultationBodyPane>` already exist as the "chart" and "body" leaves of the legacy 3-pane layout.
- `<RxPane>` / `<RxWorkspace>` already orchestrates the prescription form's heavyweight props (medicineInstanceIds, drugMasterIndex, allergies, ddiInteractions).

The blocker was that `<RxFormProvider>` is mounted **inside** `PrescriptionForm.tsx`, so siblings of the Plan pane can't `useRxForm()`. csf-01 lifts the provider above the shell, unlocking content distribution across panes for the rest of the batch.

The Snapshot/History split, the Investigations chip extraction from PlanSection, the Assessment sticky strip above the bottom row, the patient ribbon strip — all defer to dedicated follow-up batches per the source plan's `Out-of-scope` table. csf-06 captures them in `docs/Work/capture/inbox.md` for promotion.

## How to start

If you're picking up `cockpit-shell-flip`:

1. Read the [source product plan](../../Product%20plans/plan-cockpit-v2.md) once for context — DLs 13–25 explain the *why* behind the 8-pane default, the 5 escape hatches, and the strangler-fig flip pattern. Phase 2 in the source plan = R-MOD + R-CHART + R-RIBBON + R-MIDDLE + R-HISTORY (~14–17 dev-days). **This batch only lands the production flip; the 5 R-items proper promote to follow-up batches.**
2. Read [`cockpit-shell-flip/plan-cockpit-shell-flip-batch.md`](./cockpit-shell-flip/plan-cockpit-shell-flip-batch.md) for the per-task breakdown and the cross-cutting acceptance gate (which mandates byte-for-byte autosave parity with cv2-08's verification baseline).
3. Open [`cockpit-shell-flip/Tasks/EXECUTION-ORDER-cockpit-shell-flip.md`](./cockpit-shell-flip/Tasks/EXECUTION-ORDER-cockpit-shell-flip.md) for the wave / lane matrix and model picks. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 (**plan with Opus, execute with Auto, polish with Composer**), this batch has **zero Opus tasks** (no PHI columns added, no RLS redesign, no novel security — every task either lifts existing primitives, refactors a literal into a factory, wires existing components into existing leaves, or runs a verification matrix). Five tasks are Auto; one is Composer 2 Fast.
4. **Pre-load the cv2 artefacts aggressively.** `frontend/lib/patient-profile/templates.tsx` (the literal csf-02 refactors), `frontend/components/patient-profile/PanePlaceholder.tsx` (the synthetic leaf csf-03 keeps for deferred slots), `frontend/components/cockpit/rx/RxFormContext.tsx` + `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` (the provider being lifted in csf-01), `frontend/components/consultation/PrescriptionForm.tsx` (the consumer that currently owns the provider), `frontend/components/patient-profile/PatientProfilePage.tsx` (the consumer that csf-04 swaps from `builtInPanes` to the telemed factory), `frontend/components/patient-profile/panes/RxPane.tsx` (the canonical Rx pane the Plan leaf reuses), `frontend/components/patient-profile/panes/PatientChartPane.tsx` + `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx` (the existing legacy panes whose render functions are reused as-is in the new tree leaves).
5. **Phase 2 R-items proper are out of scope.** Do NOT extract `<SnapshotPanel>` / `<HistoryPanel>` / `<BodyZone>` / `<AssessmentStrip>` / `<InvestigationsZone>` / `<PlanZone>` / `<SubjectiveZone>` / `<ObjectiveZone>` in this batch. Do NOT add a patient ribbon. Do NOT add modality auto-switch (R-MOD's `mapStateToTemplate` + doctor-settings override). Do NOT add the narrow-monitor container query. Each is a follow-up batch named in the [source plan's `Out-of-scope` table](../../Product%20plans/plan-cockpit-v2.md#9-deferred--explicitly-out-of-scope-for-this-plan). Doing them here violates the "minimum viable flip" promise that lets this batch ship in 5 days instead of 17.

## Cross-day predecessors

- [Daily-plans/May 2026/17-05-2026/cockpit-v2/](../17-05-2026/cockpit-v2/) — the foundation this batch flips into production. **Must be merged before csf-01 starts.** The four section components, the recursive shell, the layout-tree v3→v4 migration, the `TELEMED_VIDEO_TEMPLATE` literal, the `<PanePlaceholder>` component, the `<RxFormProvider>` — every primitive csf-01..csf-06 consumes ships from cv2.
- [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/](../13-05-2026/patient-profile-shell-rebuild/) — the `<PatientProfileShell>` + `PaneDefinition` contract (ppr-03). The 8-pane tree the shell renders walks this contract recursively (cv2-01 lifted `children?: PaneDefinition[]` from "reserved" to "rendered").
- [Daily-plans/May 2026/10-05-2026/cockpit-customization/](../10-05-2026/cockpit-customization/) — the preset / layout-presets backend. csf-04's production flip preserves the cc-08 `doctor_cockpit_layout_presets` shape; doctors with saved presets continue to apply them via `<CockpitHeader>`'s preset dropdown. Phase 2's full R-LAYOUT-UX (per-modality presets, save layout, template hotkeys) is out of scope and lands in a follow-up batch.
- [backend/migrations/](../../../../backend/migrations/) — **no new migrations** in this batch.

## Concurrent batches

### Within the day (2026-05-19)

Single batch on this day — no parallel scheduling needed.

### Cross-day

- `cockpit-v2/` (17-05-2026) and this batch touch overlapping file trees (`frontend/lib/patient-profile/templates.tsx`, `frontend/components/cockpit/rx/RxFormContext.tsx`, `frontend/components/consultation/PrescriptionForm.tsx`, `frontend/components/patient-profile/PatientProfilePage.tsx`). cv2 must be merged before this batch starts.
- `patients-redesign/` (18-05-2026) and this batch touch **disjoint file trees** — patients-redesign lives under `frontend/components/patients-v2/**` and `frontend/app/dashboard/patients-v2/**`. Both batches consume the same `<PatientProfileShell>` + `PaneDefinition` contract but neither extends it. Safe to run in parallel.
- The follow-up batches named in this batch's `docs/Work/capture/inbox.md` lines (R-MOD-full, R-CHART, R-RIBBON, R-MIDDLE, R-HISTORY) all stack on this batch's merged `feature/cockpit-shell-flip` branch.
