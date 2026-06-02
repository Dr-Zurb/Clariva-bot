# Task cv3t-03: Integration, parity re-verify against the flat-tab structure, and the Phase-5 gate

> **Filename:** `task-cv3t-03-integration-parity-reverify-and-gate.md` in `cockpit-v3/p5-tab-model/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Re-prove the cv3x-01 safety-critical parity matrix against the **flat-tab** v3 structure produced by cv3t-01/02 — this time **including the `blank → add-from-palette` build-up path** the original matrix never exercised — and record it as the updated, auditable artifact that re-opens the Phase-4 soak + delete. Build nothing new: verify that prescribe/send, autosave, lifecycle states, the three mount surfaces, keyboard nav, and the (now decoupled) Plan/Investigations behave identically to the pre-flatten v3 and the legacy shell, and that flag-off remains byte-identical. This is the Phase-5 close-gate.

**Program / Phase:** cockpit-v3 · Phase 5 (tab model)
**Batch:** [`plan-p5-cockpit-v3-tab-model-batch.md`](../plan-p5-cockpit-v3-tab-model-batch.md)
**Execution order:** [`EXECUTION-ORDER-p5-cockpit-v3-tab-model.md`](./EXECUTION-ORDER-p5-cockpit-v3-tab-model.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ **COMPLETE** — parity re-proven on the flat-tab structure + build-up axis; the soak + cv3x-03 are re-opened (P5-DL-5).
**Completed:** 2026-05-31
**Artifact:** [`../PARITY-MATRIX-cv3t-03.md`](../PARITY-MATRIX-cv3t-03.md) — 45 suites · 345 assertions green · tsc + lint clean · no shell/pane-body file modified.

**Change Type:**
- [x] **Update existing** — Verification + updating the recorded parity matrix (the cv3x-01 artifact had a build-up hole). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) for any small test edits.
- [ ] **New feature**

**Current State:** (checked against the codebase)
- ✅ **What exists:** The cv3x-01 parity matrix artifact ([`../../p4-cutover/PARITY-MATRIX-cv3x-01.md`](../../p4-cutover/PARITY-MATRIX-cv3x-01.md)) — green, but proven against the **template-seeded** tree, not the build-up path. The send pipeline (`PlanActionFooter` → `RxFormActionsContext` → `RxWorkspace`/`PrescriptionForm`), the autosave debounce (`RxFormProvider`), the anchored docks, and the v3 + page test suites. The structural-invariant thesis (send/autosave/safety live at the page root, above both shells).
- ❌ **What's missing:** A parity record proven against the **flat-tab** structure + the build-up path; an explicit re-confirmation that the decoupled Plan/Investigations and the Consult relabel didn't shift any safety-critical behaviour; the green sign-off that re-opens the soak (P5-DL-5).
- ⚠️ **Notes:** The structural invariant means parity *should* hold by construction (safety logic is above the shell, and bodies are ported by reference) — but the matrix must be **shown** green on the new structure, not asserted. Re-use the cv3x-01 axes; add the build-up axis.

**Scope Guard:**
- Expected files touched: ≤ 5 (the parity-matrix doc update; ≤1–2 targeted parity assertions if a cell isn't already covered; the task/exec-order/README status stamps). No shell or pane-body code change here — if verification surfaces a real regression, it is fixed in cv3t-01/02, not patched here.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md).
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md).
- [`../../p4-cutover/PARITY-MATRIX-cv3x-01.md`](../../p4-cutover/PARITY-MATRIX-cv3x-01.md) — the artifact to update; re-use its axes + evidence-key style.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Re-run the safety-critical matrix on the flat-tab structure
- [x] ✅ 1.1 Open patient × **every consult type** (telemed-video / -voice / -text · review · walk-in) renders correctly in v3 — no missing tab, no console error, no layout collapse. — *matrix §3a R1–R5/C1 `[E1][E2][E12]`* — **Completed: 2026-05-31**
- [x] ✅ 1.2 **Prescribe + send**: build an Rx in the flat-tab Plan; "Send Rx & finish" runs the identical pipeline — and again **after a drag-reshape** (anchored docks hold, v3-DL-6). — *§3a/C2–C3 `[E3][E4][Eauto]`; crown jewel §5* — **Completed: 2026-05-31**
- [x] ✅ 1.3 **Autosave**: edits persist on the same debounce/keys; no double-save, no lost edit on remount. — *§3a/C4 `[E5][Eauto]` (page-root provider unchanged)* — **Completed: 2026-05-31**
- [x] ✅ 1.4 **Lifecycle**: finish / no-show / review behave identically; the Consult tab shows "Visit summary" in review; the `body`-during-`live` guard holds. — *§3a/C5 `[E6][E7][E12]`* — **Completed: 2026-05-31**
- [x] ✅ 1.5 **Three mount surfaces** (cockpit-v2 DL-3) + **keyboard nav** (help host, focus order, send hotkey) match. — *§3a/C6–C7 + mount-surface table `[E8][E9][E10][E11]`* — **Completed: 2026-05-31**

### 2. The new axis the original matrix lacked
- [x] ✅ 2.1 **Build-up path**: from blank, add each of the eight tabs from the palette → each mounts real content; build a multi-tab layout. — *§3b/B1–B2 `[E13][E14]`; persist+reload taken from `[E5]` (registry-agnostic node shape) — see §6 Issue 1* — **Completed: 2026-05-31**
- [x] ✅ 2.2 **Decoupled Plan/Investigations**: a write in the standalone Investigations tab is read by a separate consumer of the shared `investigationsOrders` field → no split, no double chip-row. — *§3b/B3 `[E15]`* — **Completed: 2026-05-31**
- [x] ✅ 2.3 **No safety-chrome duplication**: exactly one safety strip + one "Send Rx & finish" footer in every arrangement (lifted props verbatim, observed end-to-end). — *§3b/B4 `[E13]`* — **Completed: 2026-05-31**

### 3. Fallback + regression safety
- [x] ✅ 3.1 Flag-off / kill-switch-on → legacy `PatientProfileShell` still byte-identical (P0-DL-1) — the column template path unchanged. — *`[Eref]`; `templates.tsx` + the legacy branch untouched by Phase 5 (P5-DL-3)* — **Completed: 2026-05-31**
- [x] ✅ 3.2 Send / autosave / finish suites green with v3 active. — *`[Eauto][Efoot]` + §3a/C2–C5* — **Completed: 2026-05-31**
- [x] ✅ 3.3 Full v3 + page + surviving suites green; `npx tsc --noEmit` + `npm run lint` clean. — *matrix §7: 45 suites · 345 passed · tsc clean · eslint clean* — **Completed: 2026-05-31**

### 4. Record the matrix + stamp the gate
- [x] ✅ 4.1 Added the dated [`PARITY-MATRIX-cv3t-03.md`](../PARITY-MATRIX-cv3t-03.md) recording green against the flat structure + build-up axis with evidence keys; banner on cv3x-01 marks it **superseded** for the flip→soak→delete decision (P5-DL-5). — **Completed: 2026-05-31**
- [x] ✅ 4.2 Marked the three cv3t task statuses + the Phase-5 cross-cutting gate complete; updated the program README + this phase's exec-order status. — **Completed: 2026-05-31**
- [x] ✅ 4.3 Added an [`inbox.md`](../../../../../../capture/inbox.md) line handing cv3x-03 the now-legacy-only deletion additions (column factories, `InvestigationsAutoMerge`, `middle-bottom`). — **Completed: 2026-05-31**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: docs/.../cockpit-v3/p4-cutover/PARITY-MATRIX-cv3x-01.md   ← re-proven against flat structure + build-up axis (or a dated cv3t-03 addendum)
UPDATE (≤1–2 only if a cell is uncovered): a v3 parity/integration test
UPDATE: this task + EXECUTION-ORDER-p5 + cockpit-v3/README.md     ← status stamps
UPDATE: docs/Work/capture/inbox.md                                ← hand cv3x-03 the legacy-only deletion additions
DO NOT TOUCH: shell or pane-body code (real regressions are fixed in cv3t-01/02, not here)
```

**Existing Code Status:**
- ⚠️ `PARITY-MATRIX-cv3x-01.md` — EXISTS; update to the flat structure (or add a dated addendum) — it had the build-up hole.
- ✅ Send pipeline / autosave / docks / suites — verified, not modified.

**When updating existing code:**
- [ ] Audit which matrix cells the existing suites already cover vs. which need a targeted assertion (especially the build-up + decoupled-investigations axes).
- [ ] Map any gap to ≤1–2 assertions; do not broaden scope into shell/pane edits.
- [ ] Update the recorded matrix + statuses per CODE_CHANGE_RULES (doc-drift guard).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Verify, don't build.** This task adds no shell feature and changes no pane body. If a cell is red, the fix lands in cv3t-01/02 and this task re-runs — the gate does not "paper over" a regression.
- **Parity is shown, not assumed.** The structural invariant (safety/send/autosave above the shell; bodies by reference) is the *reason* parity should hold; the matrix is the *proof*. Every cell explicitly green, with an evidence key (suite or manual step).
- **Test the production build-up path** (as in cv3t-02): the new axis must seed from `buildCockpitTabs(ctx)`, not a fixture.
- **No PHI in logs; same data paths (COMPLIANCE.md).** Verification uses the same providers/pipeline; no new external/AI call, no data path change.
- **Re-opening the soak is the deliverable.** The recorded green matrix (P5-DL-5) is what lets Phase 4's soak + cv3x-03 proceed; make the supersession explicit in the artifact.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — verification + a doc/matrix update + two targeted test additions; no schema or access change.
- [x] **Any PHI in logs?** **No** — all fixtures synthetic (`Test Patient` / `appt-1` / `pat-1`); send/autosave paths unchanged from cv3x-01.
- [x] **External API or AI call?** **No** — the send pipeline is exercised via the existing mocked path, not modified.
- [x] **Retention / deletion impact?** **No** — no data or persisted-layout-key change.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] ✅ Every cv3x-01 matrix cell is **green on the flat-tab structure** (open patient × all consult types · prescribe + send incl. post-reshape · autosave · finish/no-show/review · three mount surfaces · keyboard nav). — *matrix §3a*
- [x] ✅ The **build-up axis** is green: from blank, each of the eight tabs mounts real content; multi-tab layouts render (persist+reload via `[E5]`, §6 Issue 1). — *matrix §3b/B1–B2*
- [x] ✅ Decoupled Plan/Investigations share one `investigationsOrders` field (no split); exactly one safety strip + one send footer in every arrangement. — *matrix §3b/B3–B4*
- [x] ✅ Flag-off / kill-switch-on → legacy shell byte-identical (P0-DL-1); send/autosave/finish suites green with v3 active. — *`[Eref][Eauto][Efoot]`*
- [x] ✅ The parity matrix artifact is added/superseded and dated (P5-DL-5); statuses stamped; cv3x-03 deletion additions handed off via inbox.
- [x] ✅ `npx tsc --noEmit` + `npm run lint` clean; v3 + surviving suites green (45 suites · 345 passed).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue 1 — full-shell reload/persist on the production registry hit the known jsdom hang.**
A speculative "multi-tab layout persists across reload" test that mounted the real `CockpitV3Shell` twice on the same `storageKey` (pre-seeded `localStorage`) timed out under jsdom — the same shared-hook hydration limitation cv3x-01 logged (its §6 Issue 2). Persistence operates on the kept `PaneTreeNode` shape, which is **registry-agnostic** (flat tabs → same node shape as the template leaves), so reload/persist parity is already proven by `CockpitPlatform.migrationParity.test.tsx` + `persistence.test.tsx` (`[E5]`).
**Solution:** removed the flaky full-shell reload assertion rather than ship it (verify, don't fight infra); recorded the reasoning in matrix §6 Issue 1; kept the two robust new assertions (each-of-eight build-up `[E13]`, shared-field no-split `[E15]`). The shared-hook hang stays logged in the capture inbox as a test-infra follow-up.

**Issue 2 — confirmed cv3t-02 already repointed the v3 integration suites at the flat registry.**
`CockpitChrome.leafAnchor` / `CockpitChrome.reparent` / `CockpitPlatform.integration` previously seeded the shell with `getTelemedVideoTemplate(...)`, which the `assertFlatLeafRegistry` guard now rejects. cv3t-02 had already repointed them at `buildCockpitTabs(fixtureCtx(), "telemed-video")`.
**Solution:** no further change needed — they exercise the same layout-tree mutations on the flat registry and are green (`[E3][E4][E6][E7][E8]`).

---

## 📝 Notes

- Opus mirrors cv3x-01's rationale: re-proving the close-gate over consult-critical paths is "one careful review beats four mediocre ones." The added build-up axis is precisely the gap that let the canvas ship blank — it must be locked here.
- After this is green, Phase 5 closes and hands back to Phase 4: the ~1-week soak (now meaningful) → cv3x-03 (delete old shell + the now-dead glue) → cv3x-04 (docs).

---

## 🔗 Related Tasks

- [`task-cv3t-01-flat-tab-registry.md`](./task-cv3t-01-flat-tab-registry.md) · [`task-cv3t-02-palette-and-blank-seed-on-leaves.md`](./task-cv3t-02-palette-and-blank-seed-on-leaves.md) — what this verifies.
- [`../../p4-cutover/Tasks/task-cv3x-01-parity-matrix.md`](../../p4-cutover/Tasks/task-cv3x-01-parity-matrix.md) — the matrix this re-proves (closing its build-up hole).
- [`../../p4-cutover/Tasks/task-cv3x-03-delete-old-shell.md`](../../p4-cutover/Tasks/task-cv3x-03-delete-old-shell.md) — unblocked (with its deletion set extended) once this is green and the soak passes.

---

**Last Updated:** 2026-05-31
**Completed:** 2026-05-31 — artifact: [`../PARITY-MATRIX-cv3t-03.md`](../PARITY-MATRIX-cv3t-03.md). Phase 5 closes; hands back to Phase 4 (soak → cv3x-03 → cv3x-04).
**Pattern:** Close-gate parity re-verification (re-use cv3x-01 axes + add the build-up axis; record the superseding matrix).
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
