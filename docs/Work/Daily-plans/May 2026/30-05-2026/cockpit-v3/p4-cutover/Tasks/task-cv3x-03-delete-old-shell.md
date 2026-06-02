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
**Status:** ✅ **DONE (core)** — implemented 2026-06-02 under an explicit **product-owner override** ("the new cockpit v3 is good, delete the old — override"), which **waived** the Phase-5-green + release-window-soak gate (P4-DL-3 / P5-DL-5). Core deletion + unconditional v3 mount shipped and verified green. **Expanded-scope items deferred** (still live for v3 — see Issues): `templates.tsx` column factories, `InvestigationsAutoMerge.tsx`, the `middle-bottom` container-query wrapper.
**Completed:** 2026-06-02 (core); expanded-scope cleanup deferred

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
- [x] 1.1 Enumerate every consumer of `PatientProfileShell` / `PatientProfileShellHandle` (imports, refs, the page branch, stories, tests). — **Completed: 2026-06-02**
  - [x] 1.1.1 Confirm the only live render path is the kill-switch-off branch in `PatientProfilePage.tsx`. — **Found a second live consumer (`patients-v2/PatientV2Shell.tsx`); see Issues.** — **Completed: 2026-06-02**
- [x] 1.2 Enumerate every consumer of `customize-mode-context`, `CustomizeBar`, and `PaneDropOverlay`. — **Completed: 2026-06-02**
- [x] 1.3 Enumerate every reader of the template pre-fill path and `cockpitV3Enabled()` / the kill-switch. — **Completed: 2026-06-02**
- [x] 1.4 Cross-check against "What stays": confirm none of the deletion set is *also* imported by kept engine/foundation/v3 code. — **`templates.tsx` column factories + `InvestigationsAutoMerge.tsx` are STILL imported by kept v3 fixtures/glue → hidden dependency → deferred, not deleted (see Issues).** — **Completed: 2026-06-02**

### 2. Remove the flag branch (mount v3 unconditionally)
- [x] 2.1 Replace the `cockpitV3Enabled() ? <CockpitV3Shell> : <PatientProfileShell>` branch with an unconditional `<CockpitV3Shell>` mount. — **Completed: 2026-06-02** (`PatientProfilePage.tsx` L339)
- [x] 2.2 Remove `flags.ts` (`cockpitV3Enabled()`) + the kill-switch + the `NEXT_PUBLIC_COCKPIT_V3` env/config. (Doc copy belongs to cv3x-04.) — **Completed: 2026-06-02**

### 3. Delete the old-model files
- [x] 3.1 Delete `Shell.tsx`, `PaneDropOverlay.tsx`, `CustomizeBar.tsx`, `customize-mode-context.tsx`. **Template pre-fill path deferred** (still v3-live — see Issues). — **Completed: 2026-06-02**
- [x] 3.2 Delete the superseded tests (`CustomizeBar.test.tsx` + old-shell/preset/customize/hotkey suites surfaced in step 1; removed the obsolete header Layout-dropdown block). — **Completed: 2026-06-02**
- [x] 3.3 Fix every dangling import / type reference revealed by the deletions (only at the old-model call-sites; never by editing kept engine code). — **Completed: 2026-06-02**

### 4. Prove zero references
- [x] 4.1 `PatientProfileShell` → zero **live** refs (remaining hits = negative test assertions + explanatory comments in kept files). — **Completed: 2026-06-02**
- [x] 4.2 `PaneDropOverlay` → zero live refs (remaining = anti-goal test regexes + kept-file comments). — **Completed: 2026-06-02**
- [x] 4.3 `customize-mode-context` + `CustomizeBar` → zero live refs (remaining = anti-goal test regexes + kept-file comments). — **Completed: 2026-06-02**
- [x] 4.4 `cockpitV3Enabled` → zero live refs (remaining = 3 negative assertions); `NEXT_PUBLIC_COCKPIT_V3` → **literally zero**. — **Completed: 2026-06-02**

### 5. Verification & Testing
- [x] 5.1 `npx tsc --noEmit` clean (production graph resolves after ~30 deletions; tests excluded by tsconfig, covered by vitest). — **Completed: 2026-06-02**
- [x] 5.2 `npm run lint` clean — exit 0, warnings only (all pre-existing, unrelated files). — **Completed: 2026-06-02**
- [x] 5.3 Surviving + v3 suites green: **616 passed / 55 files** (v3 + lib/patient-profile + hooks). No test imports a deleted symbol (grep + collection clean). Pre-existing reds (header 8: `formatDemographics(0)` + kebab Radix-event; consult 7: `ReadyCard`/`RxSectionNav` test-env) **confirmed identical at baseline** via stash round-trip. — **Completed: 2026-06-02**
- [x] 5.4 No kept-model / engine / `foundation.ts` / `layout-tree*` / `useShellLayout` / panes / migration / `PlanActionFooter` / `SafetyStickyStrip` **source** changed (`git diff --stat` empty for those globs; only their *tests* updated). — **Completed: 2026-06-02**
- [x] 5.5 Smoke: consult route compiles clean (`✓ Compiled`, no `⨯`); v3 mounts unconditionally (L339); v3 integration tests mount `PatientProfilePage` in jsdom and pass. — **Completed: 2026-06-02**

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

**Issue 1 — Hidden second consumer of `PatientProfileShell`.** The audit (step 1.1.1 assumed the page branch was the *only* live render path) found `frontend/components/patients-v2/PatientV2Shell.tsx` also mounted `PatientProfileShell`. Per the design constraint this is a "STOP and raise" condition.
**Solution:** Raised to the product owner, who issued an explicit override to proceed. `PatientV2Shell` was migrated off the old shell — it now renders its active tab content directly (`renderTabContent(activeTab)`), dropping the `PatientProfileShell` + `PaneDefinition` dependency. Verified green in the patients-v2 suite.

**Issue 2 — Expanded-scope deletions are still v3-live (audit step 1.4).** The 2026-05-31 re-sequence note assumed that once cv3t-01 mounts the flat registry, `templates.tsx`'s column factories, `InvestigationsAutoMerge.tsx`, and the `middle-bottom` container-query wrapper become legacy-only. The audit found they are **still imported by kept v3 code/fixtures** in the current tree — deleting them would break the kept engine (forbidden by P4-DL-4 / v3-DL-1).
**Solution:** **Deferred** these three from the deletion set rather than over-delete into "What stays." The formal acceptance rg-checks (the 6 named symbols) are unaffected and all return zero live refs. These should be removed in a follow-up once cv3t-01's flat registry fully displaces them (capture for the next review).

**Issue 3 — Pre-existing red tests in touched directories.** Running the affected suites surfaced 15 failing tests: `PatientProfileHeader.test.tsx` (8: `formatDemographics(0,null)` expects `"0 y"` but impl returns `"< 1 y"`; 7 "Mark no-show" kebab tests open a Radix menu with `fireEvent.click` instead of the required `pointerDown`) and `ReadyCard`/`RxSectionNav` (7: Radix modality dropdown + `IntersectionObserver is not a constructor` jsdom mock).
**Solution:** Confirmed **all 15 are pre-existing** (identical counts on a `git stash` baseline round-trip) and unrelated to this deletion (none import a deleted symbol; the files are not in the change set). Left untouched to keep the diff focused. The only header failures *caused* by this task were the 4 obsolete `Layout dropdown menu` tests (they exercised the removed customize/preset UI); those were deleted, returning the header suite to its baseline 8 pre-existing reds with zero net-new failures.

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

**Last Updated:** 2026-06-02
**Completed:** 2026-06-02 (core deletion + unconditional v3 mount; expanded-scope `templates`/`InvestigationsAutoMerge`/`middle-bottom` cleanup deferred — see Issues)
**Pattern:** Audited destructive cutover delete (CODE_CHANGE_RULES; precedent: `ppr` Wave 5 delete `OldName` → `rg` zero).
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
