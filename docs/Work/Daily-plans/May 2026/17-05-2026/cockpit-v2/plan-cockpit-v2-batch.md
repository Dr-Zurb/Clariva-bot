# Cockpit v2 — Phase 1 foundation — 17 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **two Opus tasks**, one per wave per the EXECUTION-ORDER guidelines §8 cap: `cv2-01` (recursive shell rewrite — structural refactor, ≥ 5 files) and `cv2-04` (backend migration on PHI columns — hard-rules list rules #2 and #3). The remaining seven tasks default to **Auto**; the final 3-mount-surface verification can be **Composer 2 Fast**.
>
> **Source plan:** [`Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md). Decision locks `DL-1..DL-25`, R-items `R-SHELL`, `R-RX-FORM`, `R-FUTURE-PROOFING`, `R-MOD`, `R-CHART`, `R-RIBBON`, `R-MIDDLE`, `R-HISTORY`, `R-RX-POLISH`, `R-LAYOUT-UX`, deferred items in §"Out of scope (deferred)". This batch implements only **R-SHELL + R-RX-FORM + R-FUTURE-PROOFING** (Phase 1 of three phases in the source plan). The other six R-items are explicitly out of scope.
>
> **Upstream cockpit-shell precedent:** [`Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild.md`](../../13-05-2026/patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild.md) — the ppr batch shipped the flat three-column `<PatientProfileShell>` + `PaneDefinition` contract this batch extends. Specifically: DL-5 from that plan ("`children?: PaneDefinition[]` reserved for future vertical splits; v1 ignores this field") is the field this batch finally activates.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild](../../13-05-2026/patient-profile-shell-rebuild/) — the shell foundation this batch extends. Must be on the same branch (or merged to main) before cv2-01 starts.
> - [Daily-plans/May 2026/10-05-2026/cockpit-customization](../../10-05-2026/cockpit-customization/) — preset / layout-presets backend that Phase 2 will integrate with. Not modified in Phase 1.
> - [Daily-plans/May 2026/09-05-2026/cockpit-polish](../../09-05-2026/cockpit-polish/) and [cockpit-shell-redesign](../../09-05-2026/cockpit-shell-redesign/) — the earlier shell-evolution batches whose decisions this plan supersedes for the patient-profile shell only (the legacy `frontend/components/consultation/ConsultationCockpit.tsx` is untouched until R-MIDDLE in Phase 2).
> - [backend/migrations/026_prescriptions.sql](../../../../../backend/migrations/026_prescriptions.sql) — the `prescriptions` table this batch extends with the SOAP field expansion (DL-28 in the source plan).
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-v2.md`](./Tasks/EXECUTION-ORDER-cockpit-v2.md).

---

## Why this batch

The cockpit shell that ppr-03 shipped is a flat horizontal `<ResizablePanelGroup>` with one panel per pane definition. It supports `N` panes, ESLint-zoned content-agnosticism, drag-to-reorder, collapse, presets, hotkeys — but every pane is a **single full-height column**. The shell can't express "the middle column contains a top half and a bottom half, and the bottom half is further split into a left investigations zone and a right plan zone." DL-5 from the ppr plan ("`children?: PaneDefinition[]` reserved for future vertical splits") was deliberately stubbed — the type exists, the renderer ignores it.

The source product plan ([`plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md)) settled on a telemed-first 8-pane default layout that *requires* nested splits:

```
┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
│ Snapshot            [⌃] │ Body              [⌃]   │ Subjective         [⌃]  │
│ (chronic, allergies)    │ (video / voice / text)  │ (CC + HOPI live)        │
│                         │                         │                         │
├─────────────────────────┼─────────────────────────┼─────────────────────────┤
│ History             [⌃] │ Assessment (sticky)     │ Objective         [⌃]   │
│ (past Rx, vitals)       │ ────────────────────────│ (vitals, exam findings) │
│                         │ Investigations │  Plan  │                         │
│                         │      orders    │  (Rx)  │                         │
└─────────────────────────┴────────────────┴────────┴─────────────────────────┘
   Left column (split   )   Middle column (top + bottom, bottom split LR)    Right column (split)
```

(See [`plan-cockpit-v2.md` § The 8-pane default layout](../../../Product%20plans/plan-cockpit-v2.md#the-8-pane-default-layout) for the full layout sketch with sizes and Assessment-strip behaviour.)

To deliver any of this in Phase 2 (R-CHART, R-MIDDLE, R-HISTORY content extraction) or Phase 3 (R-RX-POLISH densification + R-LAYOUT-UX presets per modality), the shell **first** has to learn to render a nested tree. Without that primitive, Phase 2 has nowhere to mount the 8 sub-panes.

Phase 1 also handles two adjacent prerequisites that Phase 2 depends on:

1. **`PrescriptionForm.tsx` (1,717 LOC) must become four section components.** The middle column's bottom-right "Plan" zone in the layout above and the right column's "Subjective" + "Objective" panes are all driven by the **same** form state — they're just different *sections* of the SOAP form rendered in different panes. The monolithic component has to be broken into `<SubjectiveSection>`, `<ObjectiveSection>`, `<AssessmentSection>`, `<PlanSection>`, all subscribing to a shared `RxFormContext`, before R-MIDDLE / R-CHART / R-HISTORY can mount them in the right zones. This is a Strangler Fig refactor — the existing single-pane mounts (appointment-detail, in-call mini-panel, post-call summary) keep working via a thin composition root that renders all four sections inline.
2. **The contracts that govern future auxiliary content** (tabs-in-panes, side sheets, floating docks, modals, Cmd+K) need to exist as TypeScript surfaces *now* so Phase 2 / 3 surfaces don't grow ad-hoc patterns. R-FUTURE-PROOFING is two days of type-and-stub work — it adds the `tabs?` / `aiSummarySlot?` / `aiAssistButtonSlot?` fields to `PaneDefinition`, the `aux-surfaces.ts` registry for side sheets and dock panels, and a Cmd+K placeholder bar that wires no commands yet but reserves the keyboard handler.

This batch closes Phase 1 with **9 tasks across 4 waves**, **~12–13 dev-days wall-clock with two parallel lanes in Waves 2–3, ~16 dev-days sequential equivalent**, **1 new migration** (`103_prescription_soap_fields_expansion.sql`), and **2 Opus tasks** (cv2-01 + cv2-04 — one per wave per the cap). The visible artifact at the close-gate is the side-by-side `/v2-tree` route rendering the 8-pane Telemed-Video template with synthetic placeholder content in every sub-pane, while the legacy `/v2` route remains untouched. **No Phase 2 / 3 content extraction happens here** — the placeholders prove the shell tree, the form refactor proves the section primitives, the contracts prove the surfaces. Phases 2 and 3 promote to their own dated batches once this gate ticks green.

---

## Decision lock (Phase 1 subset of source plan, frozen for batch duration)

These match the Phase-1-relevant subset of `DL-1..DL-25` in [`plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md). Re-opening any of them belongs in a new batch.

**R-SHELL locks:**

- **DL-1: Telemed-first.** Default layout assumes a video / voice / text consult is in progress. In-clinic adaptations are deferred (PD-D6 in source plan).
- **DL-2: 8-pane default, but the shell supports arbitrary `N`.** The number 8 is *one* template's choice; the shell is N-pane like ppr.
- **DL-3: Nested splits — vertical inside columns, horizontal inside vertical halves.** Two levels of nesting is the cap for Phase 1 (the source plan reserves arbitrary depth as a Phase 4 stretch — out of scope here).
- **DL-4: One `<ResizablePanelGroup>` per nesting level.** Outer horizontal, inner vertical, inner horizontal (when needed). Each group gets its own `groupRef` and independent layout state.
- **DL-5: `PaneDefinition.children?: PaneDefinition[]` is the recursion primitive.** Activates ppr DL-5. When present, the shell renders the children as a nested group whose orientation alternates from the parent: horizontal parent → vertical children → horizontal grandchildren.
- **DL-22: `PatientProfileLayout` schema bumps to `version: 4`.** New shape carries the recursive tree (`paneTree: PaneTreeNode`) instead of the flat `paneOrder: string[] + paneState: Record<string, PaneRuntimeState>`. v3 is migrated on read by the loader; v2 / v1 are still migrated via ppr-08 / ppr-15a (chained).

**R-RX-FORM locks:**

- **DL-26: Strangler Fig refactor.** `PrescriptionForm.tsx` is not deleted in this batch; a thin composition root (`PrescriptionFormCompositionRoot.tsx`, ~200 LOC) is what its existing mounts continue to import. The composition root renders all four section components inline (single column) so behaviour is identical to today.
- **DL-27: `<RxFormContext>` owns form state.** Section components subscribe via `useContext`; the composition root is the provider. Autosave logic moves with the context.
- **DL-28: New SOAP fields.** `vitals_bp_systolic INTEGER`, `vitals_bp_diastolic INTEGER`, `vitals_hr INTEGER`, `vitals_temp_c NUMERIC(4,1)`, `vitals_spo2 INTEGER`, `vitals_wt_kg NUMERIC(5,2)`, `vitals_ht_cm NUMERIC(5,1)`, `examination_findings TEXT`, `differential_diagnosis TEXT[]`, `advice TEXT`, `follow_up_value INTEGER`, `follow_up_unit TEXT CHECK (... 'days','weeks','months','as_needed')`, `referral TEXT`, `test_results TEXT`. The existing free-text `follow_up TEXT` column stays for backwards-compat — populated as the rendered "value + unit" string on send for the deprecation window. Rename: `prescriptions.investigations` → `prescriptions.investigations_orders` (the legacy column name conflates orders with results; the new field name aligns with R-MIDDLE's Investigations-orders zone). Schema-equivalent additions to `prescription_drafts` IF that table exists (cv2-04 verifies and either extends or skips).
- **DL-29: New SOAP fields are typed as optional everywhere.** Sections render input affordances; nothing forces the doctor to fill them. The PDF template (Phase 2's R-RX-POLISH problem) decides whether to print blanks or skip.
- **DL-30: Three mount surfaces continue to work unchanged.** (a) appointment-detail standalone view, (b) in-call mini-panel inside the active-consult cockpit, (c) post-call summary in the appointment-wrapup flow. Section extraction must not break these; cv2-08 is the verification task.

**R-FUTURE-PROOFING locks:**

- **DL-19: 5 auxiliary surface patterns.** Tabs-in-panes, side sheets (dockable drawer right-aligned), floating dockable panels, modal dialogs, Cmd+K command bar. All five get TypeScript contracts in `aux-surfaces.ts`; only Cmd+K gets a keyboard-handler stub wired in this batch (no commands yet). The others stay as type surfaces that Phase 2 / 3 consume.
- **DL-20: Aux content is content-aware; the shell stays content-agnostic.** The ESLint zone shipped by ppr-03 stays in place — `Shell.tsx` cannot import from `@/components/consultation/**`. Aux contracts are typed in `frontend/lib/patient-profile/aux-surfaces.ts` (allowed import path) and consumed by content components.
- **DL-21: No backend changes for aux contracts.** Cmd+K commands are client-only in Phase 1; the registry of commands lives in a static TS file. Phase 3 will revisit if any command needs server state.

Decisions explicitly **not** in scope for this batch (deferred to later phases / batches):

- **R-MOD (modality-aware templates beyond Telemed-Video)** — Phase 2. cv2-03 ships the Telemed-Video template literal; the picker / Telemed-Voice / Telemed-Text / In-Clinic templates wait.
- **R-CHART (Snapshot + History extraction)** — Phase 2. cv2-03 renders synthetic placeholders for both.
- **R-RIBBON (always-visible patient strip)** — Phase 2. The placeholder mount point exists in cv2-03's template; the component does not.
- **R-MIDDLE (Body, Assessment, Investigations-orders, Plan zone content)** — Phase 2 + Phase 3. cv2-03 renders synthetic placeholders for all four.
- **R-HISTORY (past Rx + vitals timeline content)** — Phase 2. Synthetic placeholder.
- **R-RX-POLISH (densification, MedicineRow summary-mode, PDF template, AI-assist)** — Phase 3. Out of scope.
- **R-LAYOUT-UX (presets per modality, save layout, hotkeys for templates)** — Phase 3. Out of scope.
- Removing the legacy `/v2` route or the `frontend/components/consultation/ConsultationCockpit.tsx` paths — deferred. Both stay live throughout Phase 1; the close-gate compares `/v2` vs `/v2-tree` for structural parity.
- Removing the unmaterialised `PaneDefinition.children` stub if Phase 1 fails its gate — explicitly NOT a rollback path; `cv2-01` lands `children?` as a fully functional field, not an opt-in.

---

## Phases

### Wave 1 — Recursive shell primitive (1 task, ~8h, single sequential lane)

The dependency cliff per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 1](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). Every downstream task — backend migration, form refactor, contracts — can proceed in parallel only **after** the shell can render `PaneDefinition.children`. The structural refactor of `Shell.tsx` is the single hardest piece of this batch; it is the only Opus task in Wave 1.

- [`task-cv2-01-recursive-shell-render.md`](./Tasks/task-cv2-01-recursive-shell-render.md) — **L, Opus 4.7** — Extend `frontend/lib/patient-profile/types.ts` so `PaneDefinition.children` carries a `direction?: 'horizontal' | 'vertical'` field (default: orientation flips from parent). Rewrite `frontend/components/patient-profile/Shell.tsx`'s `DesktopShell` to walk the recursive tree: at each node, if `children?.length > 0`, render a nested `<ResizablePanelGroup>` with the alternated orientation; otherwise render the leaf using the existing `<PaneHeader>` + `pane.render()`. Each nesting level gets its own `groupRef` + size snapshot + cascade handles + rebalance gate (the same machinery the flat shell uses; factored into a `renderPaneSubtree(node, depth, parentOrientation, ...)` helper). Mobile branch stays unchanged: `MobileShell` flattens the tree and stacks every leaf vertically. `useShellLayout` is **not** rewritten in this task (cv2-02 owns the state model rewrite); cv2-01 keeps using the flat shape but with a stub `paneTreeToFlat(node)` adapter so the existing flat layout still drives the renderer. New ESLint rule banning `<ResizablePanelGroup>` outside `Shell.tsx` (so future code can't bypass the shell to add ad-hoc splits). **Opus per hard-rules:** structural refactor of a 750-LOC primitive, ≥ 5 files touched (types, Shell, MobileShell, eslintrc, Shell tests).

### Wave 2 — Backend migration + future-proofing contracts (2 tasks, ~5h, 2 parallel lanes after cv2-01 ships)

Cut 2 — artifact change: the doctor's data model gains the new SOAP fields, and the type-only contracts that govern Phase 2's auxiliary surfaces land. The two lanes are fully independent (different stacks, disjoint files).

- [`task-cv2-04-soap-fields-migration.md`](./Tasks/task-cv2-04-soap-fields-migration.md) — **XS, Opus 4.7** — New migration `103_prescription_soap_fields_expansion.sql`. Adds the seven structured vitals columns + `examination_findings TEXT` + `differential_diagnosis TEXT[]` + `advice TEXT` + `follow_up_value INTEGER` + `follow_up_unit TEXT` (with CHECK) + `referral TEXT` + `test_results TEXT` to `prescriptions`. Renames `prescriptions.investigations` → `prescriptions.investigations_orders`. Backfill of the rename in the same migration via `UPDATE prescriptions SET investigations_orders = investigations` would be a no-op (the rename preserves data), but the migration adds a **read-time compatibility view** `prescriptions_legacy_v` that exposes the old `investigations` column name for any client still on the previous shape. RLS unchanged (the `prescriptions` table's RLS already covers all columns). Regenerate `backend/src/types/database.ts`. **Opus per hard-rules list rules #2 (touches PHI columns — vitals, diagnosis, clinical advice) and #3 (new migration file).**
- [`task-cv2-09-future-proofing-contracts.md`](./Tasks/task-cv2-09-future-proofing-contracts.md) — **S, Auto** — Extend `frontend/lib/patient-profile/types.ts` with the aux-surface fields on `PaneDefinition` (`tabs?: PaneTabDefinition[]`, `aiSummarySlot?: SlotRenderer`, `aiAssistButtonSlot?: SlotRenderer`). New `frontend/lib/patient-profile/aux-surfaces.ts` with five contract exports (tabs registry shape, side-sheet anchor, floating-dock dragger, modal helpers, command-bar command shape) — types only, no runtime. New `frontend/components/patient-profile/CommandBar.tsx` shell — renders nothing in Phase 1; binds `Cmd+K` (Mac) / `Ctrl+K` (Win/Linux) to log "Cmd+K opened (no commands registered yet)" + open a placeholder `<Dialog>` with a static "Coming soon" message. Mount the keyboard handler in `PatientProfilePage.tsx` for both `/v2` and `/v2-tree` routes. No ESLint zone for `aux-surfaces.ts` callers yet (Phase 2 will add).

### Wave 3 — Shell continuation + Rx form refactor (4 tasks, ~24h with parallelism, 2 parallel lanes after Wave 2 ships)

Cut 2 — second artifact change: the side-by-side `/v2-tree` route renders the 8-pane tree, and `PrescriptionForm.tsx` becomes four section components driven by `<RxFormContext>`. The two lanes are independent (frontend shell tree vs frontend Rx form refactor). Wave 3's outputs together feed cv2-07 in Wave 4 (the convergence task — wire the new SOAP fields through both the section components and the autosave persistence path).

**Lane α — Shell tree (continues from cv2-01):**

- [`task-cv2-02-layout-tree-state-and-persistence.md`](./Tasks/task-cv2-02-layout-tree-state-and-persistence.md) — **S, Auto** — New `frontend/lib/patient-profile/layout-tree.ts` module: `PaneTreeNode` recursive type, `serialiseTree(node)` / `deserialiseTree(json)`, validators, and the `paneTreeToFlat(node)` / `flatToPaneTree(layout)` adapters cv2-01 stubbed. Bump `PatientProfileLayout` to `version: 4` with `paneTree: PaneTreeNode` (replacing `paneOrder + paneState`). `validateLayout` learns v3 → v4 migration (a flat layout becomes a single horizontal root with N leaf children). `useShellLayout` is extended to expose `setLeafSize(nodeId, pct)` + `setGroupSizes(groupId, sizes[])` while keeping the flat `setPaneSize` working for v3 callers (delegates internally). New storage key `patient-profile/v4-tree-layout`; old v3 storage key stays in place (Phase 2 will retire it).
- [`task-cv2-03-telemed-video-template-and-v2-tree-route.md`](./Tasks/task-cv2-03-telemed-video-template-and-v2-tree-route.md) — **S, Auto** — New `frontend/lib/patient-profile/templates.ts` with one export: `TELEMED_VIDEO_TEMPLATE: PaneTreeNode` — the 8-pane default layout sketch (left column vertical-split into Snapshot + History; middle column vertical-split into Body and a bottom region; the bottom region horizontal-split into Investigations-orders + Plan with an Assessment sticky strip mounted as a separate render slot above the horizontal split; right column vertical-split into Subjective + Objective). Each of the 8 leaves renders a `<PanePlaceholder>` (~20 LOC) with the pane title + a "Phase 2 will mount real content here" line + the icon from `PaneDefinition.icon`. New page route `frontend/app/dashboard/appointments/[id]/v2-tree/page.tsx` mounting `<PatientProfilePage>` with the new template via the `<PatientProfileShell>` recursive renderer + the new v4 storage key. Existing `/v2` route remains untouched (renders the flat ppr shell exactly as today). New module `frontend/components/patient-profile/PanePlaceholder.tsx` (the placeholder leaf).

**Lane β — Rx form refactor (continues from cv2-04):**

- [`task-cv2-05-rx-form-context.md`](./Tasks/task-cv2-05-rx-form-context.md) — **S, Auto** — New `frontend/components/cockpit/rx/RxFormContext.tsx` (~250 LOC) housing the form-state reducer, autosave debounce hook, and `useRxForm()` consumer hook. Extracts state from `PrescriptionForm.tsx` (currently held in local `useState` / `useReducer` blocks within that file) without yet changing what JSX renders — the existing `<PrescriptionForm>` becomes a thin shell that mounts `<RxFormProvider>` and continues to render its current monolithic JSX. The provider's reducer / autosave behaviour is byte-identical to today; only the *ownership* changes. The cv2-04 backend types are wired here (the form's typed state surface gains the new SOAP fields, but no UI inputs yet).
- [`task-cv2-06-section-component-extractions.md`](./Tasks/task-cv2-06-section-component-extractions.md) — **M, Auto** — Extract four section components from `PrescriptionForm.tsx`'s existing JSX: `<SubjectiveSection>` (CC, HOPI), `<ObjectiveSection>` (vitals — using the existing free-text vitals UI for now; new structured vitals UI is cv2-07), `<AssessmentSection>` (provisional diagnosis, DDx textarea using existing structure), `<PlanSection>` (medicines, advice, follow-up, investigations-orders, patient education, clinical notes). Each section consumes `useRxForm()` for state. New thin composition root `PrescriptionFormCompositionRoot.tsx` (~200 LOC) replaces `PrescriptionForm.tsx`'s body — renders `<SubjectiveSection /> <ObjectiveSection /> <AssessmentSection /> <PlanSection />` inline (single column, identical visual layout to today). `PrescriptionForm.tsx` becomes a 30-LOC re-export shim of the composition root so existing imports keep working. **No behaviour change** in this task — visual diff between pre-refactor and post-refactor should be zero.

### Wave 4 — SOAP field wiring + cross-mount verification (2 tasks, ~8h, single sequential lane)

Cut 1 + Cut 2 combined — convergence: cv2-07 wires the new SOAP fields through both Wave 2's migration and Wave 3's section components; cv2-08 verifies the refactor across all three mount surfaces and ticks the Phase 1 close-gate.

- [`task-cv2-07-soap-fields-wired-end-to-end.md`](./Tasks/task-cv2-07-soap-fields-wired-end-to-end.md) — **M, Auto** — Add the new SOAP-field inputs to the appropriate section components: structured vitals UI (replacing the free-text vitals tracker) in `<ObjectiveSection>`, examination findings textarea in `<ObjectiveSection>`, DDx list-builder in `<AssessmentSection>`, advice / follow-up (value + unit) / referral / test-results inputs in `<PlanSection>`. Wire the inputs through `<RxFormContext>` to the autosave path and the send-Rx submission path. The existing `investigations` field renames to `investigations_orders` everywhere in the form (matches the DB rename in cv2-04); a temporary read-fallback handles drafts created pre-rename. Autosave round-trips every new field (insert → save → reload → fields populated). The composition root's single-column layout still renders correctly — visual diff vs Wave 3's "no behaviour change" baseline is now intentional: the new inputs appear.
- [`task-cv2-08-three-mount-surface-verification.md`](./Tasks/task-cv2-08-three-mount-surface-verification.md) — **XS, Composer 2 Fast** — Mechanical verification that the refactor preserves all three mount surfaces (DL-30): (a) appointment-detail standalone view (`/dashboard/appointments/[id]`), (b) in-call mini-panel inside `<ConsultationCockpit>`, (c) post-call summary in the appointment-wrapup flow. For each, render the page, fill all SOAP sections including the new fields, trigger autosave, refresh, verify all fields round-trip. Update [docs/Reference/product/cockpit/COCKPIT.md](../../../../Reference/product/cockpit/COCKPIT.md) (or create) with the new composition-root architecture diagram. `rg` checks confirm `PrescriptionForm` callsites are unchanged (all three mounts still import from `frontend/components/consultation/PrescriptionForm.tsx`; the file is now a re-export shim). Telemetry event `cockpit_v2.phase1_close_gate_smoke_passed` emitted once on the appointment-detail page after the round-trip succeeds.

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed. They span waves and surface the batch-level invariants the wave gates can't individually verify.

### Structural

- [ ] **Side-by-side parity** — both `/dashboard/appointments/[id]/v2` (the flat shell from ppr) and `/dashboard/appointments/[id]/v2-tree` (the new recursive shell with the Telemed-Video template) render without console errors on Chrome / Safari / Firefox latest. The `/v2` route renders identically to pre-batch (no regression).
- [ ] **Recursive shell** — `Shell.tsx`'s `DesktopShell` walks the tree to ≥ 2 levels of nesting in the Telemed-Video template (outer horizontal → middle column vertical → middle column bottom horizontal). No layout-shift on mount. Resize handles work at every level. Cascade-handle algorithm respects per-leaf `minSizePct` + `minSizePx` floors at every depth.
- [ ] **`PaneDefinition.children` is the only recursion primitive** — `rg "<ResizablePanelGroup" frontend/components` returns only `Shell.tsx` matches. The new ESLint rule fires if anyone tries to use the library directly elsewhere.
- [ ] **localStorage migration** — manually re-mount with a stored v3 payload from before this batch → loads cleanly into the v4 tree shape on first read; no data loss; next persist writes v4. (Verification: paste the v3 JSON into `localStorage` under the v3 key, mount `/v2-tree`, observe the v4 key gets populated and the layout reflects the v3 sizes.)

### Backend (PHI-touching)

- [ ] **Migration 103 applies cleanly** on a fresh database and on a database with existing `prescriptions` rows (rename does not lose data; new columns default to NULL). Reverse migration documented in the migration file as a downgrade comment (out-of-scope for this batch to ship the rollback migration; documenting the SQL is enough).
- [ ] **Types regenerated** — `backend/src/types/database.ts` reflects the new columns and the rename. `pnpm --filter backend tsc --noEmit` clean.
- [ ] **RLS still enforced on `prescriptions`** — a doctor's JWT can read / write only their own rows post-migration. (Spot-check via `psql` with a probe JWT.)
- [ ] **`prescriptions_legacy_v` view exists** and exposes the old `investigations` column name for the deprecation window (cv2-04 ships this view; Phase 2 / 3 retires it).

### Frontend (Rx form refactor)

- [ ] **`PrescriptionForm.tsx` is a 30-LOC re-export shim.** All four section components (`SubjectiveSection`, `ObjectiveSection`, `AssessmentSection`, `PlanSection`) live under `frontend/components/cockpit/rx/` and are independently importable. Composition root is `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx`.
- [ ] **Three mount surfaces unchanged** — appointment-detail / in-call / post-call all import `PrescriptionForm` from the same path as today; visual diff between pre-refactor and post-Wave-3 (before cv2-07's new inputs land) is zero modulo timestamps.
- [ ] **`<RxFormContext>` is the single state owner.** `rg "useState\|useReducer" frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` returns zero; all state lives in the context provider.
- [ ] **New SOAP fields round-trip through autosave** — fill structured vitals (BP, HR, SpO2), examination findings, DDx (≥ 2 entries), advice, follow-up value + unit, referral, test results in any open draft → wait for autosave → reload page → all fields populated. Verified on all three mount surfaces.

### Auxiliary contracts

- [ ] **All five aux contracts exist** in `frontend/lib/patient-profile/aux-surfaces.ts` as exported types. None are imported by runtime code outside the file itself (verifiable via `rg "from \"@/lib/patient-profile/aux-surfaces\"" frontend`).
- [ ] **Cmd+K opens the placeholder dialog** on both `/v2` and `/v2-tree`. Ctrl+K on non-Mac. ESC closes. No commands wired (the placeholder says "Coming soon"). No console errors.
- [ ] **`PaneDefinition.tabs?` / `aiSummarySlot?` / `aiAssistButtonSlot?` typed but unused.** The shell ignores all three fields in Phase 1 (Phase 2 wires the renderers).

### Quality

- [ ] **`pnpm --filter frontend tsc --noEmit` clean.** `pnpm --filter backend tsc --noEmit` clean.
- [ ] **`pnpm --filter frontend lint` clean.** `pnpm --filter backend lint` clean.
- [ ] **No new test files required** — Phase 1 ships structural primitives; behavioural tests for the new content panes are Phase 2's responsibility. Existing tests for `PrescriptionForm` (if any) still pass after the re-export-shim refactor.
- [ ] **No new Sentry errors** in a 5-min manual smoke session opening / resizing / collapsing / reordering panes on `/v2-tree` against a fixture appointment.
- [ ] **Telemetry event** `cockpit_v2.phase1_close_gate_smoke_passed` fires exactly once during cv2-08's manual round-trip.

### Documentation

- [ ] **[plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md) updated** — R-SHELL, R-RX-FORM, R-FUTURE-PROOFING tagged `[SHIPPED 2026-05-XX]` with batch back-link.
- [ ] **docs/Reference/product/cockpit/COCKPIT.md** (create if not present) — composition-root diagram showing how the four sections wire through `<RxFormContext>` + the three mount surfaces.
- [ ] **No update to [docs/Reference/engineering/architecture/CONTRACTS.md](../../../../Reference/engineering/architecture/CONTRACTS.md)** — the new `103_*` migration is internal to the prescriptions table; no new public API contracts (everything in this batch is frontend-only modulo the migration). cv2-04 documents the schema delta in the migration file's header comment instead.

---

## Sequencing notes (the why behind the waves)

The 4-wave shape falls out of the EXECUTION-ORDER-GUIDELINES §0.5 cuts:

- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without recursive `Shell.tsx`, the new ESLint zone and the type extensions in cv2-09 reference fields the renderer can't honour, and cv2-04's migration is independent but conceptually unsplittable from the structural change for review purposes.
- **Wave 2 → Wave 3 is a Cut 2 (artifact change).** End of Wave 2: the schema and aux contracts are live but invisible. End of Wave 3: the `/v2-tree` route renders the 8-pane tree with placeholders, and the form lives as four section components. Two qualitatively different artifacts; reviewer mindset shifts.
- **Wave 3 → Wave 4 is a Cut 3 + Cut 2 combined (kind-of-work + artifact change).** Wave 4 = wiring + verification, not building. cv2-07 connects pieces that already exist; cv2-08 runs a manual matrix. Different mindset.

The bottleneck is **Wave 3 (~24h with parallelism, 2 engineers).** Lane β (cv2-05 + cv2-06) is the slower lane (Rx form refactor of a 1,717-LOC component is mechanically more work than the shell-tree continuation). Single-engineer execution runs Lane α and Lane β sequentially → Wave 3 grows to ~32h sequential.

**Why no Shape B parallel lanes in Waves 1 and 4?** Wave 1 has a single task. Wave 4's two tasks have a strict dependency (cv2-08 verifies cv2-07's output across three mount surfaces). Both correctly Shape A per the guidelines.

**Why two Opus tasks in this batch?** cv2-01 is a structural refactor of a 750-LOC primitive (rules #5 of the hard-rules list). cv2-04 is a new migration touching PHI columns (rules #2 and #3). Both genuinely require thinking, not typing. Per the guidelines cap "at most two per batch", we're at the cap; no third Opus task is added even where one might be defensible (cv2-05's autosave extraction is bounded enough for Auto with one Opus escalation if needed).

---

## Out-of-scope (rolled forward to future batches)

These items appear in the source [`plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) but are explicitly **not** delivered by this batch. Each gets a future batch named in the source plan.

| Out-of-scope item | Source plan section | Where it lands |
|---|---|---|
| **Modality template chooser** (Telemed-Voice, Telemed-Text, In-Clinic variants) | R-MOD | Phase 2 batch — `templates-r-mod` |
| **Snapshot + History extraction from `AppointmentChartRail`** | R-CHART | Phase 2 batch — `cockpit-chart-extraction` |
| **Patient ribbon strip component** | R-RIBBON | Phase 2 batch — `cockpit-ribbon` |
| **Body, Assessment, Investigations-orders, Plan zone content** | R-MIDDLE | Phase 2 batch (or split into two — `cockpit-middle-top` + `cockpit-middle-bottom`) |
| **Past Rx + vitals timeline content** | R-HISTORY | Phase 2 batch — `cockpit-history-pane` |
| **MedicineRow densification, AI-assist, PDF template tuning** | R-RX-POLISH | Phase 3 batch — `rx-polish-densification` |
| **Per-modality layout presets + save layout + template hotkeys** | R-LAYOUT-UX | Phase 3 batch — `cockpit-layout-presets-modality` |
| **Removing legacy `/v2` route and `ConsultationCockpit.tsx`** | Source plan §"Decommission plan" | Phase 4 — explicit release-window pause batch |
| **Tabs, side sheets, floating docks, modals — runtime renderers** | R-FUTURE-PROOFING (Phase 1 = contracts only) | Phase 2 — first surface that needs each renderer pays the implementation cost |
| **Cmd+K commands registry** | DL-21 | Phase 3 — `cockpit-command-bar` |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv2-01 | 0/1 | 0/1 | 1/1 | ~8h |
| Wave 2 | cv2-04, cv2-09 | 1/2 | 0/2 | 1/2 | ~5h (parallel; sequential ~8h) |
| Wave 3 | cv2-02, cv2-03, cv2-05, cv2-06 | 4/4 | 0/4 | 0/4 | ~16h (parallel; sequential ~24h) |
| Wave 4 | cv2-07, cv2-08 | 1/2 | 1/2 | 0/2 | ~8h |
| **Total** | **9** | **6** | **1** | **2** | **~37h (parallel) / ~48h (sequential)** |

Token estimate (rough): ~600k input / ~450k output across the batch. The two Opus tasks draw from the API pool (~$15–25 per Opus chat at ~50k–100k tokens each, so ~$30–50 total Opus spend); the other seven draw from the Auto+Composer pool ($1.25 in / $6.00 out per M for Auto, $0.50 in / $2.50 out per M for Composer). Total batch spend (excluding optional close-gate): ~$60–80.

**One optional Opus close-gate turn after cv2-08** budgeted on top of the 2 in-batch Opus tasks. Use if any of the cross-cutting gates above stay ambiguous after the deterministic checks pass; skip if every check green.

---

## Status (post-cv2-08)

- Phase 1: **closed 2026-05-18** (implementation + scaffold removal; human smoke on Rx mounts still required before prod cut).
- Verification report: [cv2-08-verification-report.md](./Tasks/cv2-08-verification-report.md).
- Phase 2 (cockpit-shell-rebuild + R-RX-PDF + R-PRESETS) — schedule separately.
- Phase 3 (rx-polish-densification + AI-ASSIST) — schedule separately.

## Status (post-csf-06)

Phase 1 closed cleanly per cv2-08 (2026-05-17). Phase 2 foothold shipped via the [cockpit-shell-flip batch](../../19-05-2026/cockpit-shell-flip/) (2026-05-19) — `/dashboard/appointments/[id]` now renders the 8-pane Telemed-Video layout by default. **R-MOD-full** / **R-CHART** / **R-RIBBON** / **R-MIDDLE** / **R-HISTORY** remain out-of-scope and are tracked in `docs/Work/capture/inbox.md` for follow-up batches. Phase 3 close-out (delete kill-switch + legacy array) scheduled after the 4-week soak. Architecture reference: [`docs/Reference/product/cockpit/COCKPIT.md`](../../../../Reference/product/cockpit/COCKPIT.md).

---

## References

- [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md) — source product plan with full R-item / DL set across all three phases.
- [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/](../../13-05-2026/patient-profile-shell-rebuild/) — the foundation shell batch this one extends; ppr-03 is the source of `<PatientProfileShell>` and ppr DL-5 reserved `PaneDefinition.children`.
- [Daily-plans/May 2026/10-05-2026/cockpit-customization/](../../10-05-2026/cockpit-customization/) — preset / layout-presets backend Phase 2 will integrate with.
- [docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules driving cv2-01 + cv2-04 → Opus, everything else → Auto / Composer.
- [docs/Work/process/EXECUTION-ORDER-GUIDELINES.md](../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft the sibling EXECUTION-ORDER doc.
- Sibling: [`Tasks/EXECUTION-ORDER-cockpit-v2.md`](./Tasks/EXECUTION-ORDER-cockpit-v2.md) — wave / lane matrix + model picks + acceptance gates per wave + cost estimate.
