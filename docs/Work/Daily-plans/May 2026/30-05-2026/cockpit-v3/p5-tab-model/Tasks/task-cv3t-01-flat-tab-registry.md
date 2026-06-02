# Task cv3t-01: Flat tab registry — `buildCockpitTabs(ctx)`, Consult relabel, decoupled Plan/Investigations (by reference)

> **Filename:** `task-cv3t-01-flat-tab-registry.md` in `cockpit-v3/p5-tab-model/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Create the v3 **flat tab registry**: a single `buildCockpitTabs(ctx)` source that returns the **eight real leaf tabs** as uniform, self-contained entities, and switch the v3 mount in `PatientProfilePage` to consume it instead of the nested column template. Every tab is built **by reference** to its existing pane body — no body is rewritten. The body tab is relabeled **"Consult"** (live) / **"Visit summary"** (review) with a modality-driven icon; Plan and Investigations are mounted as **independent tabs** (no container-query auto-merge). The legacy column template is left untouched (the fallback still uses it).

**Program / Phase:** cockpit-v3 · Phase 5 (tab model)
**Batch:** [`plan-p5-cockpit-v3-tab-model-batch.md`](../plan-p5-cockpit-v3-tab-model-batch.md)
**Execution order:** [`EXECUTION-ORDER-p5-cockpit-v3-tab-model.md`](./EXECUTION-ORDER-p5-cockpit-v3-tab-model.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-05-31 — `buildCockpitTabs(ctx)` registry live; v3 mounts the eight flat leaf tabs (Consult/Visit-summary + decoupled Plan/Investigations); legacy column template untouched.

**Change Type:**
- [x] **New feature** — Adds a new registry module + a v3-only mount switch (no behaviour change to any pane body; legacy path unchanged).
- [ ] **Update existing**

**Current State:** (checked against the codebase)
- ✅ **What exists:** The eight leaf bodies, all self-contained and reading the shared providers — `SnapshotPane` (wrapped in `ChartRailWithEmptyState`), `HistoryPane`, `BodyZone` / `EndedConsultBody`, `AssessmentStrip`, `InvestigationsPane`, `RxPane`, `SubjectivePane`, `ObjectivePane`. The shared `RxFormProvider` / `RxSafetyProvider` / `RxFormActionsBridgeProvider` wrap the whole page **above** the shell. `CockpitV3Shell` already accepts a flat `panes` prop, the `consultActive` live-drag guard, and the anchored `safetyDock` / `actionDock`. `PANE_ICONS` / `BODY_VARIANT_ICONS` exist in `pane-icons.ts`. The icon set: Snapshot `Heart`, History `Clock`, Assessment `Stethoscope`, Investigations `Beaker`, Plan `Pill`, Subjective `Quote`, Objective `Activity`; body variants video `Video` / voice `Phone` / text `MessageSquare` / review `CheckCircle2`.
- ❌ **What's missing:** A flat registry that exposes the eight leaves as top-level tabs; a v3 mount that consumes it; the "Consult"/"Visit summary" label + modality icon on the body tab; a decoupled Investigations/Plan pairing (today they are welded by the `middle-bottom` container query).
- ⚠️ **Notes:** `templates.tsx` builds the leaves *inside* column factories (`makeLeftColumn` etc.) and is consumed by the **legacy** `PatientProfileShell`. Do **not** refactor `templates.tsx` to share leaf factories — that risks the legacy path (P0-DL-1). Construct the registry by referencing the pane components directly; accept temporary wiring duplication that dies with `templates.tsx` in cv3x-03 (P5-DL-3). The Plan tab's lifted-prop set is load-bearing (see Design Constraints).

**Scope Guard:**
- Expected files touched: ≤ 5 (new registry module + its unit test; the `PatientProfilePage` v3 mount switch; a small shared tab-descriptor type if needed; touch-ups to a v3 test fixture). Any expansion (especially editing a pane body or `templates.tsx`) requires explicit approval and is a bug.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — the v3 mount switch is an "update existing" edit; audit the branch + its consumers first.
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) — content-agnostic shell boundary (the registry imports panes; the shell does not).
- [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md) — pane-by-reference / context-threading patterns.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define the uniform tab descriptor + registry
- [x] ✅ 1.1 Add a `buildCockpitTabs(ctx)` registry (new module under `frontend/lib/patient-profile/v3/`) returning the eight leaf tabs in a stable order. — `cockpit-tabs.tsx`; order exported as `COCKPIT_TAB_ORDER`. **Completed: 2026-05-31**
  - [x] ✅ 1.1.1 Each tab carries: stable `id`, display `title`, `icon`, `render` (closes over `ctx`), and sizing hints (`naturalSizePct` / `minSizePx`) — a uniform shape, no `children` / `groupWrapper` / `direction`. — asserted in `cockpit-tabs.test.tsx`. **Completed: 2026-05-31**
  - [x] ✅ 1.1.2 Mount each `render` **by reference** to the existing pane component, threading the same `ctx` the template factories build today (`appointment`, `token`, `state`, `launcherRef`, `onRxSent`, `onFinishVisit`, `onMarkNoShow`, `onMedicineCountChange`, `finishBusy`). — same components/props as `templates.tsx`. **Completed: 2026-05-31**
- [x] ✅ 1.2 Keep ids stable for the six already-clean tabs: `snapshot`, `history`, `assessment`, `subjective`, `objective`, plus `investigations-orders`. **Completed: 2026-05-31**

### 2. The Consult (body) tab — context-adaptive, single entity
- [x] ✅ 2.1 Keep the id `body`; compute the `title` from `ctx.state` — **"Consult"** for live (video/voice/text), **"Visit summary"** for review/ended/terminal. — driven by the dispatched template id (`bodyVariantFor`), with a `ctx`-derived default via `mapStateToTemplate`. **Completed: 2026-05-31**
- [x] ✅ 2.2 Compute the `icon` from modality/state (video → camera, voice → phone, text → chat, review → check-circle). — `BODY_VARIANT_ICONS[variant]`. **Completed: 2026-05-31**
- [x] ✅ 2.3 Branch the `render` internally: `BodyZone` for live variants, `EndedConsultBody` for review — one tab, internal switch (no second tab). **Completed: 2026-05-31**
- [x] ✅ 2.4 Preserve the live-drag guard: the `body` tab is not draggable while `consultActive` (the shell already keys this off id `body`). — id `body` preserved across modality + review. **Completed: 2026-05-31**

### 3. Decoupled Plan + Investigations tabs (P5-DL-4)
- [x] ✅ 3.1 Investigations tab: render `InvestigationsPane` standalone — **no** `@[720px]/middle-bottom` gating, **no** `InvestigationsAutoMerge`. **Completed: 2026-05-31**
- [x] ✅ 3.2 Plan tab: render `RxPane` alone, transplanting its lifted props **verbatim** (see Design Constraints) — **no** `InvestigationsAutoMerge`, no bundling `<div>`. — all 9 lifted props (`hideHeader`, `actionsInFooter`, `dxLifted`, `safetyLifted`, `subjectiveLifted`, `objectiveLifted`, `entryModeLifted`, `photoLifted`, `cockpitMode`) copied verbatim. **Completed: 2026-05-31**
- [x] ✅ 3.3 Confirm (by reading, not editing) that both write the same shared `investigationsOrders` field, so the decouple cannot split state. — both read/write `useRxForm().investigationsOrders` (no local state). **Completed: 2026-05-31**

### 4. Switch the v3 mount (legacy untouched)
- [x] ✅ 4.1 In `PatientProfilePage`, pass `buildCockpitTabs(ctx)` to `CockpitV3Shell` (v3 branch only); keep the legacy `PatientProfileShell` branch on the existing column template (`panes`). — v3 arm now `panes={v3Panes}`; legacy arm `panes={panes}` unchanged. **Completed: 2026-05-31**
- [x] ✅ 4.2 Preserve the walk-in subset path: the registry/mount supports the 2-tab (`body` + `plan`) walk-in case the page already derives. — `buildWalkInCockpitTabs` + `!showChart` branch. **Completed: 2026-05-31**
- [x] ✅ 4.3 Keep `safetyDock` / `actionDock` / `consultActive` / `storageKey` wiring intact (v3-DL-6 anchored chrome). — untouched. **Completed: 2026-05-31**

### 5. Verification & Testing
- [x] ✅ 5.1 New unit test for `buildCockpitTabs`: returns 8 top-level leaf tabs (no `children`); ids + titles + icons correct; body title flips Consult↔Visit-summary by state; walk-in subset = `[body, plan]`. — `cockpit-tabs.test.tsx` (18 cases). **Completed: 2026-05-31**
- [x] ✅ 5.2 `cd frontend; npx tsc --noEmit` clean. **Completed: 2026-05-31**
- [x] ✅ 5.3 `cd frontend; npm run lint` clean (warnings only). — `eslint` clean on all changed files. **Completed: 2026-05-31**
- [x] ✅ 5.4 Existing v3 + page suites green; flag-off path unchanged (legacy still mounts the column template). — v3 + templates + registry + live-consult-guard = 179 tests green (see Issues for a pre-existing guard-test pin). **Completed: 2026-05-31**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/patient-profile/v3/cockpit-tabs.tsx          ← buildCockpitTabs(ctx): the 8 uniform leaf tabs, by reference
CREATE: frontend/lib/patient-profile/v3/__tests__/cockpit-tabs.test.tsx   ← shape + labels + walk-in subset
UPDATE: frontend/components/patient-profile/PatientProfilePage.tsx ← v3 branch consumes buildCockpitTabs(ctx); legacy branch unchanged
(maybe) UPDATE: a v3 test fixture/helper if a shared tab type is introduced
DO NOT TOUCH: templates.tsx, RxPane.tsx, RxWorkspace, InvestigationsPane.tsx, any pane body, InvestigationsAutoMerge.tsx
```

**Existing Code Status:**
- ❌ `frontend/lib/patient-profile/v3/cockpit-tabs.tsx` — MISSING (create).
- ⚠️ `frontend/components/patient-profile/PatientProfilePage.tsx` — EXISTS; v3 mount branch needs to consume the registry (legacy branch untouched).
- ✅ Referenced unchanged: all pane bodies, `pane-icons.ts`, `CockpitV3Shell.tsx`, the shared providers, `templates.tsx` (legacy-only now).

**When updating existing code:** (the `PatientProfilePage` v3 mount switch)
- [x] ✅ Audit the `cockpitV3Enabled() ? <CockpitV3Shell> : <PatientProfileShell>` branch and what `panes` feeds each. — both arms shared `panes` (the nested column template) at ~L1144/L1159; that mismatch is the canvas defect this fixes.
- [x] ✅ Change only the v3 arm to pass `buildCockpitTabs(ctx)`; leave the legacy arm's `panes` exactly as-is. — new `v3Panes` memo feeds only `CockpitV3Shell`; `PatientProfileShell` still gets `panes`.
- [x] ✅ No obsolete code removed here (the column template is still legacy's — removal is cv3x-03). — `templates.tsx` / `panes` / `panesToMount` untouched.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Port by reference; never rewrite a body (P5-DL-2).** The registry imports and mounts the existing pane components unchanged. `RxWorkspace` / `PrescriptionForm` (the prescribe → safety → send engine) must not be edited.
- **The Plan tab's lifted props are a fixed contract — transplant verbatim.** The set is `hideHeader`, `actionsInFooter`, `dxLifted`, `safetyLifted`, `subjectiveLifted`, `objectiveLifted`, `entryModeLifted`, `photoLifted`, `cockpitMode`. Dropping any one is a clinical bug: missing `safetyLifted` → safety banners render twice (strip + plan); missing `dxLifted` → Dx/DDx duplicated; missing `actionsInFooter` → two "Send Rx & finish" buttons (inline + the anchored footer dock). Match today's template wiring exactly.
- **Uniform, self-contained tabs (v3-DL-2 / P5-DL-1).** Every tab has the same descriptor shape; no tab references a sibling; cross-tab data flows only through the shared providers above the shell. A tab that needs responsive behaviour carries its **own** container — never a named parent container (`middle-bottom` is gone from the v3 path).
- **Legacy stays byte-identical (P5-DL-3 / P0-DL-1).** Do not edit `templates.tsx` or any legacy-only file. Accept temporary duplication of pane wiring; it dies in cv3x-03.
- **Anchored safety chrome is not a tab (v3-DL-6).** The safety strip + "Send Rx & finish" footer remain the shell's `safetyDock` / `actionDock`; they are never registry entries.
- **Content-agnostic shell boundary.** The shell imports nothing about pane content; the registry is the only place pane components are referenced for v3. No import of `Shell.tsx` / `customize-mode-context` / old `PaneDropOverlay` (P0-DL-4).

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — UI layout/registry only; no patient/Rx schema or access change. Same data paths (the shared providers are unchanged).
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No** — the send pipeline is reused by reference, not re-implemented.
- [x] **Retention / deletion impact?** **No** — no persisted-layout key change here (the `useShellLayout` key is untouched; seed/palette wiring is cv3t-02).

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] ✅ `buildCockpitTabs(ctx)` returns the eight leaf tabs as **top-level** uniform descriptors (no `children`), in a stable order, each rendering its real body by reference.
- [x] ✅ The body tab is id `body`, titled **"Consult"** (live) / **"Visit summary"** (review), with a modality/state icon, internally branching `BodyZone` ↔ `EndedConsultBody`, and is non-draggable while live.
- [x] ✅ Investigations and Plan are **independent** tabs (no `InvestigationsAutoMerge`, no `@[720px]/middle-bottom` gating in v3); both still edit the same `investigationsOrders` field.
- [x] ✅ The v3 mount consumes the registry; the legacy mount is byte-identical (still the column template); the walk-in 2-tab subset is preserved.
- [x] ✅ No pane body / `RxWorkspace` / `templates.tsx` edited (the registry references them; only `cockpit-tabs.tsx` + its test + the `PatientProfilePage` v3 arm + one pre-existing test pin changed — P5-DL-2/3).
- [x] ✅ `npx tsc --noEmit` + `npm run lint` clean; the new registry test + existing v3/page suites green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** Body variant can't be derived from `ctx` alone without re-implementing `mapStateToTemplate` (the doctor template-override lives outside `TelemedVideoContext`).
**Solution:** `buildCockpitTabs(ctx, templateId?)` takes the already-resolved `selectedTemplateId` as an optional second arg — the faithful mirror of the page's `dispatchedTemplate` switch. When omitted it falls back to `mapStateToTemplate(ctx.state, consultation_type, null)`, so the single-arg `buildCockpitTabs(ctx)` contract still holds for tests/callers. No divergence from the page's dispatch.

**Issue:** `PatientProfilePage.live-consult-guard.test.tsx` was **already red before this task** (6 failures): post-cutover (cv3x-02) `cockpitV3Enabled()` is default-on, so the page mounted `CockpitV3Shell` → `useCockpitV3Layout` → `useShellLayout`, but that suite stubs `useShellLayout` with only `validateLayout`. Proven pre-existing by reverting the mount line to `panes={panes}` — identical 6 failures (the crash is at `useCockpitV3Layout`, before `panes` is read).
**Solution:** Pinned the suite to the legacy path it was written for (it mocks `Shell` and asserts on the legacy shell's `setPaneHidden`) by adding a `vi.mock` of `@/lib/patient-profile/v3/flags` returning `cockpitV3Enabled: () => false`. The v3 `consultActive` drag-guard is covered separately by the `CockpitV3Shell` suite. All 6 now pass; test-only, no production change. (Unrelated pre-existing reds remain in `PatientProfileHeader.test.tsx` / `PatientProfileQueueRail.test.tsx` / `Shell.test.tsx` — text/snapshot drift with no import path to this task; out of scope.)

---

## 📝 Notes

- This is the structural keystone: it converts "what tabs exist" into a flat, uniform registry while leaving "how they're arranged" (the deferred V3-Q1 seed) as a separate, later concern. cv3t-02 then points the palette + blank-seed at this registry (the canvas-usability fix); cv3t-03 re-proves parity.
- Opus is warranted because this re-mounts the prescribe surface — the lifted-props-verbatim hazard is the genuine risk, not the registry mechanics.

---

## 🔗 Related Tasks

- [`task-cv3t-02-palette-and-blank-seed-on-leaves.md`](./task-cv3t-02-palette-and-blank-seed-on-leaves.md) — consumes this registry to fix the build-up canvas.
- [`task-cv3t-03-integration-parity-reverify-and-gate.md`](./task-cv3t-03-integration-parity-reverify-and-gate.md) — re-proves parity against the flat structure.
- [`../../p4-cutover/Tasks/task-cv3x-03-delete-old-shell.md`](../../p4-cutover/Tasks/task-cv3x-03-delete-old-shell.md) — inherits the column factories + `InvestigationsAutoMerge` + `middle-bottom` into its deletion set once v3 stops using them.
- [Prior phase — p4-cutover](../../p4-cutover/) — the flip this corrects.

---

**Last Updated:** 2026-05-31
**Completed:** 2026-05-31 — flat registry `cockpit-tabs.tsx` (+ test) live; v3 mount switched to `buildCockpitTabs(ctx)`; legacy column template untouched. Next: cv3t-02 points the palette + blank-seed at this registry.
**Pattern:** Strangler-fig port-by-reference (new flat registry beside the legacy template; legacy untouched until the cutover delete).
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
