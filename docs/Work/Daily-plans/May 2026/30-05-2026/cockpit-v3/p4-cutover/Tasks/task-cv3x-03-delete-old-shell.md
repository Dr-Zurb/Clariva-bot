# Task cv3x-03: Delete the old shell, customize mode, the 5-zone overlay + the flag

> **Filename:** `task-cv3x-03-delete-old-shell.md` in `cockpit-v3/p4-cutover/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

After the soak proves the flip safe, remove the retired interaction model: the old `PatientProfileShell`, customize mode, the 5-zone `PaneDropOverlay`, the fixed template pre-fill, and the flag + kill-switch — and mount `CockpitV3Shell` unconditionally. This is an **audited deletion** of consult-critical, live code; it is the riskiest diff in the program. Every removed symbol must end at zero references.

**Program / Phase:** cockpit-v3 · Phase 4 (cutover)
**Batch:** [`plan-p4-cockpit-v3-cutover-batch.md`](../plan-p4-cockpit-v3-cutover-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-cockpit-v3-cutover.md`](./EXECUTION-ORDER-p4-cockpit-v3-cutover.md)
**Estimated Time:** ~4–5 hours
**Status:** ⏳ **PENDING** (blocked on **Phase 5 — tab model** ([`p5-tab-model/`](../../p5-tab-model/plan-p5-cockpit-v3-tab-model-batch.md), cv3t-01..03) landing green, **then** the post-cv3x-02 release-window soak — P4-DL-3 / P5-DL-5)
**Completed:** —

> **Re-sequenced 2026-05-31:** Phase 5 (tab model) was inserted between cv3x-02 and the soak because the flip exposed an unbuildable v3 canvas. Two consequences for this task: (1) it cannot start until cv3t-03 re-proves parity on the flat-tab structure and the soak then passes clean; (2) its **deletion set grows** — once v3 mounts the flat registry (cv3t-01), `templates.tsx`'s column factories, `InvestigationsAutoMerge.tsx`, and the `middle-bottom` container-query wrapper become **legacy-only** and must be audited + removed here too (they were the v3 path's old glue; the legacy `PatientProfileShell` is their last consumer).

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) (audit → impact → remove → tests → docs)

**Current State:** (checked against the codebase)
- ✅ **What exists (the deletion set):** `frontend/components/patient-profile/Shell.tsx` (`PatientProfileShell` + `PatientProfileShellHandle`), `PaneDropOverlay.tsx` (5-zone overlay), `CustomizeBar.tsx`, `customize-mode-context.tsx`, `frontend/components/patient-profile/__tests__/CustomizeBar.test.tsx`, the template pre-fill path, and `frontend/lib/patient-profile/v3/flags.ts` (`cockpitV3Enabled()` + kill-switch) consumed by the `PatientProfilePage.tsx` branch (~L1126).
- ✅ **What stays (NOT in the deletion set):** `CockpitV3Shell` + all of `v3/`, `PaneTreeNode` / `layout-tree*.ts`, `useShellLayout`, the panes registry, `foundation.ts`, migration 112, `PlanActionFooter` / `SafetyStickyStrip` (reused by v3).
- ❌ **What's missing:** An unconditional v3 mount (the branch still exists); a codebase free of old-shell / customize-mode references.
- ⚠️ **Notes:** `PatientProfileShell` and the customize pieces may have **non-obvious consumers** (other routes, stories, tests, the `ref`/`PatientProfileShellHandle` API). The audit (step 1) is the heart of this task — do not delete before it is complete.

**Scope Guard:**
- Expected files touched: **> 5 — this is the explicit exception.** A clean deletion of the old model spans the deletion set above plus their import sites. The expansion is *inherent to the task* and pre-approved **only** for removing the enumerated old-model surface; touching anything in "What stays" requires explicit approval and is a bug.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — **the governing doc**: audit current implementation, map impact, remove obsolete code + config + tests + docs.
- [ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/ARCHITECTURE.md) · [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) — confirm the kept boundary (engine/foundation) the deletion must not cross.
- [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) — which suites are superseded vs which must still pass.
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit before deletion (CODE_CHANGE_RULES — do this first, do not skip)
- [ ] 1.1 Enumerate every consumer of `PatientProfileShell` / `PatientProfileShellHandle` (imports, refs, the page branch, stories, tests).
  - [ ] 1.1.1 Confirm the only live render path is the kill-switch-off branch in `PatientProfilePage.tsx`.
- [ ] 1.2 Enumerate every consumer of `customize-mode-context`, `CustomizeBar`, and `PaneDropOverlay`.
- [ ] 1.3 Enumerate every reader of the template pre-fill path and `cockpitV3Enabled()` / the kill-switch.
- [ ] 1.4 Cross-check against "What stays": confirm none of the deletion set is *also* imported by kept engine/foundation/v3 code. If it is, STOP and raise it — that is a hidden dependency, not a delete.

### 2. Remove the flag branch (mount v3 unconditionally)
- [ ] 2.1 Replace the `cockpitV3Enabled() ? <CockpitV3Shell> : <PatientProfileShell>` branch with an unconditional `<CockpitV3Shell>` mount.
- [ ] 2.2 Remove `flags.ts` (`cockpitV3Enabled()`) + the kill-switch + the `NEXT_PUBLIC_COCKPIT_V3` env/config and its docs.

### 3. Delete the old-model files
- [ ] 3.1 Delete `Shell.tsx`, `PaneDropOverlay.tsx`, `CustomizeBar.tsx`, `customize-mode-context.tsx`, the template pre-fill path.
- [ ] 3.2 Delete the superseded tests (`CustomizeBar.test.tsx` and any old-shell-only suites surfaced in step 1).
- [ ] 3.3 Fix every dangling import / type reference revealed by the deletions (only at the old-model call-sites; never by editing kept engine code).

### 4. Prove zero references
- [ ] 4.1 `rg "PatientProfileShell" frontend/` → zero (live code).
- [ ] 4.2 `rg "PaneDropOverlay" frontend/` → zero.
- [ ] 4.3 `rg "customize-mode-context" frontend/` and `rg "CustomizeBar" frontend/` → zero.
- [ ] 4.4 `rg "cockpitV3Enabled" frontend/` and `rg "NEXT_PUBLIC_COCKPIT_V3" frontend/` → zero.

### 5. Verification & Testing
- [ ] 5.1 `cd frontend; npx tsc --noEmit` clean.
- [ ] 5.2 `cd frontend; npm run lint` clean (warnings only).
- [ ] 5.3 Surviving + v3 suites green; no test references a deleted symbol.
- [ ] 5.4 Confirm no kept-model / engine / `foundation.ts` / migration file changed (`git diff --stat` review — P4-DL-4 / v3-DL-1).
- [ ] 5.5 Smoke: open a consult → v3 renders unconditionally; send / autosave / finish still work.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
DELETE: frontend/components/patient-profile/Shell.tsx
DELETE: frontend/components/patient-profile/PaneDropOverlay.tsx
DELETE: frontend/components/patient-profile/CustomizeBar.tsx
DELETE: frontend/components/patient-profile/customize-mode-context.tsx
DELETE: frontend/components/patient-profile/__tests__/CustomizeBar.test.tsx
DELETE: frontend/lib/patient-profile/v3/flags.ts
DELETE: the template pre-fill path (in templates.tsx / its call-site, per the step-1 audit)
UPDATE: frontend/components/patient-profile/PatientProfilePage.tsx  ← unconditional <CockpitV3Shell> mount; drop the branch + flag import
UPDATE: import sites / env / config that referenced any deleted symbol
```

**Existing Code Status:**
- ⚠️ `PatientProfilePage.tsx` — EXISTS, needs update (drop the branch + flag, mount v3 unconditionally).
- ❌ `Shell.tsx`, `PaneDropOverlay.tsx`, `CustomizeBar.tsx`, `customize-mode-context.tsx`, `CustomizeBar.test.tsx`, `flags.ts` — to be DELETED.
- ✅ Kept (must not change): `v3/*`, `layout-tree*.ts`, `useShellLayout.ts`, panes registry, `foundation.ts`, migration 112, `PlanActionFooter` / `SafetyStickyStrip`.

**When updating existing code:** (MANDATORY — Change Type = "Update existing")
- [ ] Audit current implementation (files, callers, config/env, tests) — step 1 above ([CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)).
- [ ] Map desired change to concrete deletions + the one mount edit.
- [ ] Remove obsolete code **and** config (the `NEXT_PUBLIC_COCKPIT_V3` env, defaults, dead branches, superseded tests).
- [ ] Update tests and docs/env per CODE_CHANGE_RULES (the doc rewrite itself is cv3x-04).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Audit before you delete.** The first failure mode is removing something with a live consumer; the second is over-deleting into the kept engine. Step 1 is mandatory and gating.
- **Touch nothing in "What stays."** `PaneTreeNode` / `layout-tree*` / `useShellLayout` / panes / `foundation.ts` / migration 112 / `PlanActionFooter` / `SafetyStickyStrip` are the kept model (v3-DL-1) — v3 runs on them. Editing them here is a bug (P4-DL-4).
- **Deletion is gated on the soak** (P4-DL-3): do not start until the cv3x-02 kill-switch window elapsed clean.
- **Zero-reference is the bar**, not "looks removed": the `rg` checks in step 4 must all return zero live results.
- **No behaviour change for the doctor.** After this, v3 is what they already had during the soak — just without the dead path behind it.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** — this removes UI shell code; no patient/Rx data schema or access change (v3 keeps the same data paths).
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No** — code deletion only; no data deletion, no persisted-layout key change (the kept `useShellLayout` key is untouched).

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [ ] The release-window soak elapsed clean (P4-DL-3) and the audit (step 1) is complete.
- [ ] `CockpitV3Shell` mounts unconditionally; the flag branch + `flags.ts` + kill-switch + `NEXT_PUBLIC_COCKPIT_V3` env are gone.
- [ ] `rg` for `PatientProfileShell`, `PaneDropOverlay`, `customize-mode-context`, `CustomizeBar`, `cockpitV3Enabled`, `NEXT_PUBLIC_COCKPIT_V3` over `frontend/` each return **zero** live results.
- [ ] No kept-model / engine / `foundation.ts` / migration file changed (`git diff --stat` confirms — P4-DL-4 / v3-DL-1).
- [ ] `npx tsc --noEmit` + `npm run lint` clean; surviving + v3 suites green; consult smoke passes.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** {Description}
**Solution:** {How it was resolved}

---

## 📝 Notes

- This is one of the batch's two Opus tasks for a reason: the cost of a missed consumer or an over-deletion into the kept engine is high. Lean on the audit; review the diff as one atomic change.
- The doc rewrite (`COCKPIT.md`, product plan, README) is the **next** task (cv3x-04) — it describes the world this deletion creates.

---

## 🔗 Related Tasks

- [`task-cv3x-02-flag-flip-and-kill-switch.md`](./task-cv3x-02-flag-flip-and-kill-switch.md) — the flip + soak this deletion follows.
- [`task-cv3x-04-docs-and-program-closeout.md`](./task-cv3x-04-docs-and-program-closeout.md) — documents the post-deletion world.
- [`task-cv3x-01-parity-matrix.md`](./task-cv3x-01-parity-matrix.md) — the old shell removed here was the parity reference.
- [Prior phase — p3-platform](../../p3-platform/).

---

**Last Updated:** 2026-05-31
**Completed:** —
**Pattern:** Audited destructive cutover delete (CODE_CHANGE_RULES; precedent: `ppr` Wave 5 delete `OldName` → `rg` zero).
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
