# cockpit-v2 — Phase 1 — execution order

> Sibling document of [`plan-cockpit-v2-batch.md`](../plan-cockpit-v2-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

**Wave / lane / shape conventions:** [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md)

---

## Wave plan (4 waves)

```
Wave 1 (Recursive shell primitive — ~8h, single lane sequential):
  Lane α  ──── cv2-01 (L, Opus 4.7)

Wave 2 (Migration + future-proofing contracts — ~5h, 2 parallel lanes after cv2-01):
  Lane α  ──── cv2-04 (XS, Opus 4.7)                                          [backend]
  Lane β  ──── (waits on cv2-01) ──> cv2-09 (S, Auto)                          [frontend contracts]

Wave 3 (Shell tree + Rx form refactor — ~16h, 2 parallel lanes after Wave 2):
  Lane α  ──── cv2-02 (S, Auto) ──> cv2-03 (S, Auto)                          [frontend shell]
  Lane β  ──── (waits on cv2-04) ──> cv2-05 (S, Auto) ──> cv2-06 (M, Auto)    [frontend Rx form]

Wave 4 (SOAP fields wired + 3-mount-surface verification — ~8h, single lane sequential):
  Lane α  ──── cv2-07 (M, Auto) ──> cv2-08 (XS, Composer 2)
```

**Total wall-clock with parallelism:** ~37h (~5 dev-days with two engineers running Waves 2 & 3 in parallel chats / branches).

**Total agent-time (sequential equivalent):** ~48h (~6.5 dev-days for one engineer running every lane back-to-back).

The bottleneck is **Wave 3 (~16h parallel / ~24h sequential)** — Lane β (cv2-05 → cv2-06) is the slower of the two lanes because the Rx form refactor mechanically moves more LOC than the shell-tree continuation. Lane α (cv2-02 → cv2-03) finishes ahead; the dev on Lane α has spare cycles to start reading cv2-07's spec for Wave 4.

**Why Shape B (parallel) lanes in Waves 2 and 3 are legitimate:**

- **Wave 2:** Lane α (cv2-04 — backend migration on `prescriptions` table) and Lane β (cv2-09 — frontend type / contract extensions in `frontend/lib/patient-profile/aux-surfaces.ts` + `CommandBar.tsx`) touch fully disjoint files (`backend/migrations/103_*.sql` + `backend/src/types/database.ts` vs `frontend/lib/patient-profile/*.ts` + `frontend/components/patient-profile/CommandBar.tsx`). Both lanes wait on cv2-01 (the recursive shell types must land first — cv2-09 extends those types, cv2-04 is bound to the same release for review packaging). Once cv2-01 ships, neither lane consumes the other's WIP. The §5 lane gate passes all six points.
- **Wave 3:** Lane α (shell tree — `frontend/lib/patient-profile/layout-tree.ts`, `templates.ts`, `frontend/app/dashboard/appointments/[id]/v2-tree/page.tsx`, `PanePlaceholder.tsx`) and Lane β (Rx form refactor — `frontend/components/cockpit/rx/RxFormContext.tsx`, four section components, composition root, the `PrescriptionForm.tsx` re-export shim) touch disjoint files. Lane β waits on cv2-04 (the backend migration whose types it consumes); Lane α has no dependency on cv2-04 (the shell tree carries no PHI). After Wave 2 ships, both lanes proceed truly in parallel. Neither lane consumes the other's WIP during the wave. §5 lane gate passes.

**Why Wave 1 is single-lane (no parallelism):** Wave 1 has one task. cv2-01 is the structural Opus task; nothing in this batch can run in parallel with it because every downstream lane reads either the new `PaneDefinition.children` field (cv2-09) or the new recursive renderer (cv2-02, cv2-03) — both of which cv2-01 lands.

**Why Wave 4 is single-lane (no parallelism):** cv2-08 verifies cv2-07's outputs across the three mount surfaces; it is a textbook convergence task. Per the EXECUTION-ORDER-GUIDELINES §1, convergence tasks live in their own waiting lane — here, the next step of the same lane. Splitting Wave 4 into two waves (Wave 4a = cv2-07, Wave 4b = cv2-08) would be mechanically equivalent and adds noise; collapsed to one wave per the guidelines' "default Shape A" bias.

---

## Lane-by-lane details

### Wave 1 — Recursive shell primitive (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cv2-01](./task-cv2-01-recursive-shell-render.md) | L | **Opus 4.7** | `frontend/components/patient-profile/Shell.tsx` (750 LOC; the file being recursively refactored), `frontend/lib/patient-profile/types.ts` (the `PaneDefinition.children?` field this task activates), `frontend/lib/patient-profile/useShellLayout.ts` (the flat layout hook this task keeps unchanged in v1; cv2-02 rewrites for v4), `frontend/components/patient-profile/CascadeHandle.tsx` (the cross-pane resize algorithm; must work at every nesting depth), `frontend/components/patient-profile/PatientProfilePage.tsx` (the consumer that supplies the panes array), `frontend/.eslintrc.json` (the existing content-agnosticism zone that gains the new `<ResizablePanelGroup>` ban), source plan §DL-1..DL-5, §DL-22, ppr-03 batch acceptance gate. | Pure structural refactor. Extends `PaneDefinition` with `direction?: 'horizontal' \| 'vertical'`. `DesktopShell` walks the tree via a new `renderPaneSubtree(node, depth, parentOrientation, …)` helper; each level gets its own `groupRef`, size snapshot, cascade handles, rebalance gate. Flat shape still drives the renderer in this task via a `paneTreeToFlat(node)` stub; cv2-02 lifts the state model to v4. **Opus per hard-rules list rule #5 (cross-cutting refactor, 5+ files, new primitive).** |

**Branch suggestion:** `feature/cockpit-v2-recursive-shell`. cv2-01 is a separately reviewable Opus commit; everything downstream stacks on it.

### Wave 2 — Migration + future-proofing contracts (2 parallel lanes after cv2-01)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [cv2-04](./task-cv2-04-soap-fields-migration.md) | XS | **Opus 4.7** | `backend/migrations/026_prescriptions.sql` (the table this migration extends; columns + RLS policy), `backend/migrations/090_prescription_medicines_structured.sql` (precedent for a prescription-table extension), `backend/src/types/database.ts` (the file regenerated after migration), `backend/src/services/prescription-service.ts` (callers of the `investigations` field that need rename-aware fallbacks), source plan §DL-28. | New migration `103_prescription_soap_fields_expansion.sql`. Adds seven structured vitals columns + `examination_findings` + `differential_diagnosis TEXT[]` + `advice` + `follow_up_value` + `follow_up_unit` (with CHECK) + `referral` + `test_results`. Renames `investigations` → `investigations_orders`. Adds compatibility view `prescriptions_legacy_v` exposing the old `investigations` column for the deprecation window. **Opus per hard-rules list rules #2 (PHI columns) and #3 (new migration).** |
| 0 (Lane β) | [cv2-09](./task-cv2-09-future-proofing-contracts.md) | S | Auto | `frontend/lib/patient-profile/types.ts` (post-cv2-01 — the `PaneDefinition` interface this task extends), `frontend/components/patient-profile/PatientProfilePage.tsx` (where the `<CommandBar>` mounts), `frontend/components/ui/dialog.tsx` (shadcn dialog primitive for the Cmd+K placeholder), `frontend/hooks/` (look for an existing useHotkey hook — task identifies; otherwise build inline), source plan §R-FUTURE-PROOFING / §DL-19..DL-21. | Adds `tabs?: PaneTabDefinition[]`, `aiSummarySlot?: SlotRenderer`, `aiAssistButtonSlot?: SlotRenderer` to `PaneDefinition`. New `aux-surfaces.ts` with 5 contract exports (tabs, side-sheet, dock, modal, command). New `CommandBar.tsx` — Cmd+K opens a placeholder `<Dialog>`. **No runtime renderers**; types and a single keyboard handler only. **Waits on cv2-01** so the new fields extend the same `PaneDefinition` shape cv2-01 leaves stable. |

**Branch suggestion:** `feature/cockpit-v2-migration` (Lane α) and `feature/cockpit-v2-contracts` (Lane β), both stacked on `feature/cockpit-v2-recursive-shell`. Or one merged branch if a single engineer runs both lanes back-to-back.

### Wave 3 — Shell tree + Rx form refactor (2 parallel lanes after Wave 2)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [cv2-02](./task-cv2-02-layout-tree-state-and-persistence.md) | S | Auto | `frontend/lib/patient-profile/types.ts` (post-cv2-01 + cv2-09), `frontend/lib/patient-profile/useShellLayout.ts` (the hook gaining `setLeafSize` + `setGroupSizes`), `frontend/components/patient-profile/Shell.tsx` (post-cv2-01 — the `paneTreeToFlat` stub this task replaces with real serialisation), source plan §DL-22. | New `frontend/lib/patient-profile/layout-tree.ts` with `PaneTreeNode` recursive type + serialise / deserialise / validators + flat ↔ tree adapters. Bumps `PatientProfileLayout` to `version: 4`. `validateLayout` learns v3 → v4 migration. `useShellLayout` exposes new tree-aware setters. New storage key `patient-profile/v4-tree-layout`; v3 key untouched. |
| 1 (Lane α) | [cv2-03](./task-cv2-03-telemed-video-template-and-v2-tree-route.md) | S | Auto | `frontend/lib/patient-profile/layout-tree.ts` (post-cv2-02), `frontend/components/patient-profile/Shell.tsx` (post-cv2-01), `frontend/components/patient-profile/PatientProfilePage.tsx` (mount pattern from ppr-07), `frontend/app/dashboard/appointments/[id]/v2/page.tsx` (the existing flat-shell route — copy this file structure to `/v2-tree/page.tsx`), source plan § "The 8-pane default layout" sketch. | New `frontend/lib/patient-profile/templates.ts` with `TELEMED_VIDEO_TEMPLATE: PaneTreeNode` (8 leaves under outer-horizontal / column-vertical / bottom-horizontal structure). New `frontend/components/patient-profile/PanePlaceholder.tsx` (the synthetic leaf). New `frontend/app/dashboard/appointments/[id]/v2-tree/page.tsx` mounting `<PatientProfilePage>` with the template. The existing `/v2` route is unchanged (regression-safe rollback path stays live). |
| 0 (Lane β) | [cv2-05](./task-cv2-05-rx-form-context.md) | S | Auto | `frontend/components/consultation/PrescriptionForm.tsx` (the 1,717-LOC file being refactored — the state-owning sections at the top of the file), `backend/src/types/database.ts` (post-cv2-04 — the new prescription column types), `frontend/lib/api/prescriptions.ts` (the autosave POST/PUT caller; task identifies if it's elsewhere), source plan §DL-26..DL-27. | New `frontend/components/cockpit/rx/RxFormContext.tsx` (~250 LOC) with reducer + autosave debounce hook + `useRxForm()` consumer. Extracts state from `PrescriptionForm.tsx`; no JSX change in this task. Composition stays monolithic; cv2-06 splits it. Form state surface includes the new SOAP fields (cv2-04 backend types) but no UI for them yet. **Waits on cv2-04** so the form-state typed surface aligns with the new prescription columns. |
| 1 (Lane β) | [cv2-06](./task-cv2-06-section-component-extractions.md) | M | Auto | `frontend/components/consultation/PrescriptionForm.tsx` (post-cv2-05 — now provider-wrapped), `frontend/components/cockpit/rx/RxFormContext.tsx` (post-cv2-05), `frontend/components/consultation/MedicineRow.tsx` (consumed by `<PlanSection>`; not modified here, just imported), source plan §DL-26 + the SOAP layout sketch in the source plan. | Extracts `<SubjectiveSection>`, `<ObjectiveSection>`, `<AssessmentSection>`, `<PlanSection>` into `frontend/components/cockpit/rx/`. New `PrescriptionFormCompositionRoot.tsx` (~200 LOC) renders all four sections inline (single column). `PrescriptionForm.tsx` becomes a 30-LOC re-export shim. **Behaviour change == zero**; visual diff vs pre-refactor is zero modulo whitespace. |

**Branch suggestion:** `feature/cockpit-v2-shell-tree` (Lane α) and `feature/cockpit-v2-rx-form-strangler` (Lane β), both stacked on Wave 2's merged branches. Lane α and Lane β merge to `feature/cockpit-v2-main` at the wave gate; Wave 4 stacks on the merged branch.

### Wave 4 — SOAP fields wired + 3-mount-surface verification (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cv2-07](./task-cv2-07-soap-fields-wired-end-to-end.md) | M | Auto | `frontend/components/cockpit/rx/SubjectiveSection.tsx` / `ObjectiveSection.tsx` / `AssessmentSection.tsx` / `PlanSection.tsx` (post-cv2-06), `frontend/components/cockpit/rx/RxFormContext.tsx` (post-cv2-05), `backend/src/types/database.ts` (post-cv2-04 — the new column types), `frontend/components/ui/` (shadcn primitives for the new inputs — `Input`, `Textarea`, `Select`, plus a numeric-input pattern from elsewhere in the app for vitals), source plan §DL-28..DL-29. | Adds new SOAP-field inputs to the appropriate section components. Structured vitals UI in `<ObjectiveSection>` (replacing the legacy free-text vitals tracker — keep the old component available for a deprecation flag), examination findings textarea in `<ObjectiveSection>`, DDx list-builder in `<AssessmentSection>`, advice / follow-up (value + unit) / referral / test-results inputs in `<PlanSection>`. Form state in `<RxFormContext>` already carries the typed fields from cv2-05; this task adds the inputs that mutate them. Autosave round-trips verified manually. `investigations` → `investigations_orders` rename completes the form-side migration (read-fallback handles drafts created pre-rename). |
| 1 | [cv2-08](./task-cv2-08-three-mount-surface-verification.md) | XS | **Composer 2 Fast** | `frontend/app/dashboard/appointments/[id]/page.tsx` (appointment-detail mount), `frontend/components/consultation/ConsultationCockpit.tsx` (in-call mini-panel mount), `frontend/components/appointment-wrapup/` (post-call summary mount — task identifies the right file), `docs/Reference/` (the COCKPIT.md doc this task creates), source plan §DL-30. | Mechanical verification matrix. Renders each of the three mount surfaces, fills all SOAP sections, triggers autosave, refreshes, verifies round-trip. Writes `docs/Reference/product/cockpit/COCKPIT.md` with the composition-root architecture diagram. Emits `cockpit_v2.phase1_close_gate_smoke_passed` telemetry once on appointment-detail. `rg "PrescriptionForm" frontend/components` confirms all three mounts still import from the same path. |

**Branch suggestion:** `feature/cockpit-v2-soap-wiring` stacked on the Wave 3 merge. cv2-08 is a thin commit on top of cv2-07.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cv2-01 | L | **Opus 4.7 Extra High** | Structural refactor of a 750-LOC primitive used by every patient-profile mount; new ESLint rule + new shell rendering algorithm + cascade-handle compatibility at every nesting depth. Squarely on the hard-rules list per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § "When to escalate to Opus"](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules) (rule #5: cross-cutting refactors touching ≥ 5 files). |
| cv2-02 | S | Auto | Type module + adapter + state-hook extension. Well-spec'd by precedent (ppr-02's `useShellLayout` is the model). Bounded; no security or PHI concerns. |
| cv2-03 | S | Auto | One literal export (the 8-pane template tree) + one placeholder leaf component + one new page route. Mechanical wiring; the layout sketch in the source plan dictates every leaf's id + title + icon. |
| cv2-04 | XS | **Opus 4.7 Extra High** | New migration adding PHI columns (vitals, diagnosis, clinical notes-adjacent fields like advice / examination findings) + a rename + a compatibility view. On the hard-rules list per rules #2 ("touches PHI columns") and #3 ("new migration file"). Cost of getting the rename wrong is high (silent data loss on old drafts); cost of getting the CHECK constraint wrong is also high (production write failure). |
| cv2-05 | S | Auto | State / hook extraction from one file into one new file. No JSX change. The hardest decision (where the autosave hook lives) is locked in DL-27. |
| cv2-06 | M | Auto | Mechanical refactor — JSX block in `PrescriptionForm.tsx` becomes JSX block in `SubjectiveSection.tsx` etc. The "zero visual diff" acceptance criterion means the agent has a clear ground-truth check (open both pre and post and verify). Bounded. |
| cv2-07 | M | Auto | Form input additions + autosave round-trip. The hardest part — the structured vitals UI — has shadcn primitives + numeric-input patterns elsewhere in the app to copy. Per-message escalation to Opus if Auto stalls on the DDx list-builder pattern (similar to medicine list patterns). |
| cv2-08 | XS | **Composer 2 Fast** | Manual rendering + a doc write + an `rg` smoke. Composer's sweet spot. |
| cv2-09 | S | Auto | Type-only extensions + one Cmd+K keyboard handler + a placeholder Dialog. Standard patterns; the contracts list is enumerated in the source plan. |

**Opus caps:** ≤ 1 per wave (Wave 1: cv2-01; Wave 2: cv2-04, with cv2-09 on a separate lane and Auto) — at the cap. ≤ 2 per batch (cv2-01 + cv2-04) — at the cap. Cannot add a third Opus task without rescoping. The natural escalation candidates (cv2-06's section extraction, cv2-07's vitals UI) have non-novel implementations per their task specs; Auto with per-message escalation is the right call.

---

## Acceptance gates per wave

### Wave 1 gate (after cv2-01)

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `PaneDefinition` now carries `children?: PaneDefinition[]` (still optional, preserves backwards-compat) AND `direction?: 'horizontal' | 'vertical'` (new in cv2-01).
- [ ] `Shell.tsx`'s `DesktopShell` renders ≥ 2 levels of nesting when given a fixture tree (a smoke test fixture in `Shell.test.tsx` or a manual page at `/dev/shell-tree-smoke` — task picks one). Cascade handles work at every depth.
- [ ] **No regression on the flat shape** — `/dashboard/appointments/[id]/v2` renders identically to pre-batch. Manual smoke: open the page, resize / collapse / reorder all three panes, all gestures work. (cv2-01 keeps the flat shape working via the `paneTreeToFlat` stub.)
- [ ] **New ESLint rule active** — `rg "<ResizablePanelGroup" frontend/components --files-with-matches` returns only `Shell.tsx`. A deliberately-bad fixture file (`tools/eslint-fixtures/bad-resizable.tsx`) triggers the rule under `pnpm --filter frontend lint`.
- [ ] **Mobile branch unchanged** — `MobileShell` flattens the tree and renders all leaves stacked. Verified with viewport < 1024px on the smoke fixture.

### Wave 2 gate (after cv2-04 + cv2-09)

- [ ] All Wave 1 gates still green.
- [ ] Migration `103_prescription_soap_fields_expansion.sql` applies cleanly on a fresh database and on a database with existing `prescriptions` rows. Rollback SQL documented in the migration's downgrade comment.
- [ ] `pnpm --filter backend tsc --noEmit` clean after `backend/src/types/database.ts` regeneration.
- [ ] `psql` smoke: `INSERT INTO prescriptions (...) VALUES (... bp_systolic, bp_diastolic, ...)` succeeds with new columns; `SELECT investigations FROM prescriptions_legacy_v` returns the migrated values.
- [ ] **`PaneDefinition.tabs?` / `aiSummarySlot?` / `aiAssistButtonSlot?` typed but unused at runtime.** `rg "\.tabs\b\|aiSummarySlot\|aiAssistButtonSlot" frontend/components` returns zero callers (Phase 2 adds the consumers).
- [ ] **`frontend/lib/patient-profile/aux-surfaces.ts` exists** with 5 contract exports. Each export has a JSDoc block naming which Phase 2 / 3 R-item will consume it.
- [ ] **`CommandBar.tsx` keyboard handler works** — Cmd+K (Mac) / Ctrl+K (Win/Linux) on `/v2` and `/v2-tree` opens a placeholder dialog. ESC closes. No console errors. Tested on both routes.

### Wave 3 gate (after cv2-02 + cv2-03 + cv2-05 + cv2-06)

- [ ] All Wave 2 gates still green.
- [ ] `pnpm --filter frontend tsc --noEmit` clean (new types in `layout-tree.ts` + `templates.ts` + `aux-surfaces.ts` + the four section components compile clean).
- [ ] `pnpm --filter frontend lint` clean.
- [ ] **`/v2-tree` route renders the 8-pane Telemed-Video template** with synthetic placeholders in every leaf. Each placeholder shows its pane title + icon. No console errors. Drag-to-reorder works at each nesting level. Resize handles work at each level. Cascade handles respect per-leaf `minSizePct` + `minSizePx`.
- [ ] **`/v2` route still renders identically to pre-batch** (regression-safe path active). Visual diff: zero modulo dynamic content (timestamps).
- [ ] **localStorage migration smoke** — paste a pre-batch v3 payload into `localStorage` under the v3 key, mount `/v2-tree` for the first time, verify the v4 key gets populated AND the new tree layout reflects the v3 sizes (root horizontal group inherits the three column widths).
- [ ] **`PrescriptionForm.tsx` is now a 30-LOC re-export shim.** `rg "useState\|useReducer" frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` returns zero. All state lives in `<RxFormProvider>`.
- [ ] **Four section components live under `frontend/components/cockpit/rx/`** and are independently importable. `<SubjectiveSection />`, `<ObjectiveSection />`, `<AssessmentSection />`, `<PlanSection />` all consume `useRxForm()` and render the same JSX they used to render inside `PrescriptionForm.tsx`.
- [ ] **Zero behaviour change verification** — open `/dashboard/appointments/[id]` (appointment-detail mount, still single-column composition root), fill all fields including the legacy free-text vitals, save → reload → all fields populate correctly. Same as today.

### Wave 4 gate (after cv2-07 + cv2-08) — batch close-gate

- [ ] All Wave 3 gates still green.
- [ ] **Cross-cutting acceptance gate** (from [`plan-cockpit-v2-batch.md` § Cross-cutting acceptance gate](../plan-cockpit-v2-batch.md#cross-cutting-acceptance-gate-whole-batch)) all green. Specifically:
  - Structural: side-by-side parity, recursive shell, single recursion primitive, localStorage migration.
  - Backend: migration applies, types regenerated, RLS enforced, legacy view exists.
  - Frontend: `PrescriptionForm` re-export shim, three mount surfaces unchanged, `<RxFormContext>` single owner, new SOAP fields autosave round-trip on all three mount surfaces.
  - Auxiliary: 5 aux contracts exist, Cmd+K placeholder works, three optional fields typed but unused.
  - Quality: tsc clean, lint clean, no new Sentry errors, telemetry fires.
  - Docs: source plan tagged `[SHIPPED]`, COCKPIT.md created.
- [ ] **New SOAP-field UI works on all three mount surfaces** — appointment-detail / in-call / post-call. Each surface: fill structured vitals + examination findings + DDx (≥ 2 entries) + advice + follow-up value+unit + referral + test-results → autosave → refresh → all populated.
- [ ] **`docs/Reference/product/cockpit/COCKPIT.md` exists** with the composition-root diagram + the three-mount-surface mount points enumerated.
- [ ] **Telemetry** — `cockpit_v2.phase1_close_gate_smoke_passed` event fires exactly once during cv2-08's manual round-trip on the appointment-detail page.
- [ ] **Optional Opus close-gate review** — one fresh Opus 4.7 Extra High chat with the full Wave 1–4 diff grading against the cross-cutting gate. Skip if every deterministic check above passes cleanly.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv2-01 | 0/1 | 0/1 | 1/1 | ~8h |
| Wave 2 | cv2-04, cv2-09 | 1/2 | 0/2 | 1/2 | ~5h (parallel) / ~8h (sequential) |
| Wave 3 | cv2-02, cv2-03, cv2-05, cv2-06 | 4/4 | 0/4 | 0/4 | ~16h (parallel) / ~24h (sequential) |
| Wave 4 | cv2-07, cv2-08 | 1/2 | 1/2 | 0/2 | ~8h |
| **Total** | **9** | **6** | **1** | **2** | **~37h (parallel) / ~48h (sequential)** |

Token estimate (rough, per [`plan-cockpit-v2-batch.md` § Cost estimate](../plan-cockpit-v2-batch.md#cost-estimate)): ~600k input / ~450k output across the batch. Two Opus tasks draw from the API pool (~$15–25 per Opus chat at ~50k–100k tokens each); the other seven draw from the Auto+Composer pool ($1.25 in / $6.00 out per M for Auto, $0.50 in / $2.50 out per M for Composer). Total batch spend: ~$60–80 excluding the optional close-gate review.

**One optional Opus close-gate turn after cv2-08** budgeted on top of the 2 in-batch Opus tasks. Skip if the deterministic gates pass cleanly.

---

## References

- [plan-cockpit-v2-batch.md](../plan-cockpit-v2-batch.md) — the *what / why* sibling.
- [Product plans/plan-cockpit-v2.md](../../../../Product%20plans/plan-cockpit-v2.md) — source product plan with full R-item / DL set across all three phases.
- [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md](../../../13-05-2026/patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md) — predecessor exec-order from the ppr batch this one builds on.
- [Daily-plans/May 2026/17-05-2026/opd-per-day-mode/Tasks/EXECUTION-ORDER-opd-per-day-mode.md](../../opd-per-day-mode/Tasks/EXECUTION-ORDER-opd-per-day-mode.md) — sibling exec-order from the same day (same conventions, same ASCII shape).
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; the hard-rules list that drives cv2-01 + cv2-04 → Opus.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft this doc.
