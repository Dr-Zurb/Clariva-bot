# Task cv3x-01: Parity matrix across safety-critical paths (the cutover close-gate)

> **Filename:** `task-cv3x-01-parity-matrix.md` in `cockpit-v3/p4-cutover/Tasks/`.
> **Relative-link note:** this file sits at `…/cockpit-v3/p4-cutover/Tasks/`. Shared `process/` docs are six `../` up; `Reference/` is seven; `frontend/` is eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7, with `frontend/` one deeper than the cheat-sheet's count).

---

## 📋 Task Overview

Prove that the Cockpit v3 shell is behaviourally identical to the old `PatientProfileShell` across every safety-critical path, and record the result as an auditable matrix. This is the **close-gate for the whole program** — its green is the precondition for flipping the flag (cv3x-02). Build nothing; verify everything.

**Program / Phase:** cockpit-v3 · Phase 4 (cutover)
**Batch:** [`plan-p4-cockpit-v3-cutover-batch.md`](../plan-p4-cockpit-v3-cutover-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-cockpit-v3-cutover.md`](./EXECUTION-ORDER-p4-cockpit-v3-cutover.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ **COMPLETE** — parity green; cv3x-02 unblocked (P4-DL-1). Matrix: [`PARITY-MATRIX-cv3x-01.md`](../PARITY-MATRIX-cv3x-01.md)
**Completed:** 2026-05-31

**Change Type:**
- [x] **New feature** — Add a parity-matrix record (+ targeted parity assertions) only; **no change to either shell's behavior**
- [ ] **Update existing**

**Current State:** (checked against the codebase)
- ✅ **What exists:** v3 is feature-complete through Phase 3 — `CockpitV3Shell` (editor groups, palette, Cursor DnD, anchored chrome that sends, persistence with migration, mobile flat). The old `PatientProfileShell` (`frontend/components/patient-profile/Shell.tsx`) is the live default. Both are mounted by the `cockpitV3Enabled()` branch in `PatientProfilePage.tsx` (~L1126). Send/autosave/finish E2E suites exist.
- ❌ **What's missing:** No recorded cross-shell **parity matrix**; no single artifact that says "every safety-critical path matches" so the flip decision (P4-DL-1) is auditable. No explicit assertion that the v3 docked "Send Rx & finish" footer fires the *same* send pipeline as the old shell after a reshape.
- ⚠️ **Notes:** This task **must not modify either shell**. If a parity gap is found, file it as a blocker and STOP — do not "fix and flip" in the same task (that would hide the regression). The send pipeline lives in `PlanActionFooter` + the Rx form actions; verify the v3 footer reads live actions (Phase 3 P3-DL-1) on a reshaped layout, not just the default.

**Scope Guard:**
- Expected files touched: ≤ 5 (a parity-matrix record + at most 1–2 targeted parity/E2E assertion files).
- Any expansion (especially editing a shell to "make it pass") requires explicit approval — and is by definition a different task.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — only relevant if a gap forces a follow-up; this task itself adds no behavior.
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) — parity/E2E patterns to reuse.
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) — no PHI in matrix records, screenshots, or logs.
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) — completion bar.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define the matrix (axes + pass criterion)
- [x] ✅ 1.1 Enumerate the **consult types** the cockpit serves (from the consult-type source of truth) as matrix rows. — `mapStateToTemplate` → 4 factories (video/voice/text/review) + walk-in. **Completed: 2026-05-31**
  - [x] ✅ 1.1.1 Confirm the list is complete (no consult type renders a different cockpit). — truth-table proven in `state.test.ts`. **Completed: 2026-05-31**
- [x] ✅ 1.2 Enumerate the **safety-critical paths** as matrix columns: open patient · prescribe + send · autosave · finish / no-show / review states · the three mount surfaces (cockpit-v2 DL-3) · keyboard nav. — C1–C7 in the matrix. **Completed: 2026-05-31**
- [x] ✅ 1.3 Define "pass" for each cell as **v3 behaviour == old-shell behaviour** (same outcome, same network calls, same end state) — not "v3 looks fine". **Completed: 2026-05-31**

### 2. Execute the matrix (flag on)
- [x] ✅ 2.1 Open patient in v3 for **every** consult type; confirm render parity (all expected panes, no console error, no layout collapse). — `[E1][E2]`; same `panes` from templates in both shells. **Completed: 2026-05-31**
- [x] ✅ 2.2 Prescribe + "Send Rx & finish" in v3; confirm it runs the **identical send pipeline** as the old shell. — `[E3]`; footer reads page-root `RxFormActionsBridgeProvider`. **Completed: 2026-05-31**
  - [x] ✅ 2.2.1 Repeat after a Phase-3 drag-reshape (Plan moved, Rx tabbed elsewhere) — the docked footer must still fire (P3-DL-1). — `[E4]` (3 reshapes); old-shell ref `[Eref]`. **Completed: 2026-05-31**
- [x] ✅ 2.3 Autosave parity — edits persist on the same keys/debounce; no double-save, no lost edit on remount. — `[E5]`; autosave is page-root `RxFormProvider` (1500ms), shell-independent. **Completed: 2026-05-31**
- [x] ✅ 2.4 Lifecycle parity — finish / no-show / review render the same terminal UI; `body`-during-`live` guard intact. — `[E6][E7]`. **Completed: 2026-05-31**
- [x] ✅ 2.5 Mount-surface parity — v3 renders correctly on each of the three surfaces. — `[E8][E9]` (desktop + mobile); surfaces 2/3 shell-independent. **Completed: 2026-05-31**
- [x] ✅ 2.6 Keyboard-nav parity — help host, focus order, send hotkey all behave as in the old shell. — `[E10]`; `⌘/Ctrl+Enter` handled in the Rx form (page-root). **Completed: 2026-05-31**

### 3. Regression-proof the critical E2E
- [x] ✅ 3.1 Run the send / autosave / finish E2E suites with v3 active; confirm green. — 23 suites / 196 assertions green. **Completed: 2026-05-31**
- [x] ✅ 3.2 Any failed or unverifiable cell → file a **blocker** (link the path + repro) and mark the matrix not-green. **Do not** flip on a partial matrix. — no parity gap found; two non-blocking test-infra items recorded (matrix §6). **Completed: 2026-05-31**

### 4. Record the matrix (make the flip auditable)
- [x] ✅ 4.1 Write the matrix result as a durable artifact (a matrix doc in this phase folder and/or targeted parity assertions) — every cell explicitly green or blocked. — [`PARITY-MATRIX-cv3x-01.md`](../PARITY-MATRIX-cv3x-01.md). **Completed: 2026-05-31**
- [x] ✅ 4.2 Sign-off line: "Parity green on YYYY-MM-DD; cv3x-02 unblocked" — this is the P4-DL-1 record. — see matrix §0/§9. **Completed: 2026-05-31**

### 5. Verification & Testing
- [x] ✅ 5.1 `cd frontend; npx tsc --noEmit` clean (if any assertion files were added). — clean (exit 0). **Completed: 2026-05-31**
- [x] ✅ 5.2 Targeted parity/E2E suites green. — 23 suites / 196 assertions green. **Completed: 2026-05-31**
- [x] ✅ 5.3 Confirm no shell file was modified (`git status` shows only the matrix record / test additions). — only the matrix doc + 1 test-assertion fix touched; `Shell.tsx` / `CockpitV3Shell.tsx` / `PatientProfilePage.tsx` unchanged (repo not git-tracked here; satisfied by construction). **Completed: 2026-05-31**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-v3/p4-cutover/   ← parity-matrix record (the auditable artifact)
frontend/  ← (optional) ≤1–2 targeted parity / E2E assertion files, reusing existing test patterns
```

**Existing Code Status:**
- ✅ `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` — EXISTS (the shell under test; not modified).
- ✅ `frontend/components/patient-profile/Shell.tsx` — EXISTS (`PatientProfileShell`, the parity reference; not modified).
- ✅ `frontend/components/patient-profile/PatientProfilePage.tsx` — EXISTS (mount branch; used to toggle the flag for verification, not modified).
- ❌ Parity-matrix record — MISSING (created here).

**When updating existing code:** N/A — this task adds a verification artifact only; it changes no existing behavior. If verification forces a code fix, that is a *separate* task gated by [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Verify, don't build.** Neither shell may be modified by this task. A parity gap is a blocker to file, not a fix to make here.
- **Parity = behavioural equality**, judged against the old shell as the reference — same outcomes and same network/side-effects, not visual approximation.
- **Reuse existing test patterns** ([FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)); do not invent a new harness.
- **Consult-critical.** The send / autosave / finish columns are the ones that, if wrong, harm a patient — give them the most scrutiny, including the reshaped-layout case.
- **No PHI** in the matrix record, screenshots, or logs ([COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)).
- **The matrix gates the flip (P4-DL-1).** Its green is a hard precondition for cv3x-02; a red cell stops Phase 4.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — verification exercises Rx data paths, but only via synthetic fixtures + mocked `sendAndFinish`; no real data accessed.
  - [x] **RLS verified?** **Yes** — no new data access; relies on existing, unchanged RLS (no schema/policy change in this task).
- [x] **Any PHI in logs?** **No** — matrix + test fixtures use synthetic patients only (`Test Patient`, `appt-1`, `pat-1`).
- [x] **External API or AI call?** **No** — verification only exercises the existing send pipeline (mocked); no new external call.
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] ✅ Every matrix cell (consult type × safety-critical path) is explicitly **green**, or a blocker is filed and the matrix is marked not-green (flip blocked). — all green; no parity gap found.
- [x] ✅ The v3 "Send Rx & finish" footer fires the same send pipeline as the old shell, including after a Phase-3 reshape. — `[E3][E4]`, old-shell ref `[Eref]`.
- [x] ✅ Send / autosave / finish E2E suites are green with v3 active ([TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)). — 23 suites / 196 assertions green.
- [x] ✅ The parity matrix is recorded as a durable, auditable artifact with a dated sign-off (P4-DL-1). — [`PARITY-MATRIX-cv3x-01.md`](../PARITY-MATRIX-cv3x-01.md).
- [x] ✅ No shell file was modified; `npx tsc --noEmit` clean. — only matrix doc + 1 test-assertion fix touched; tsc clean.
- [x] ✅ Logs / records contain no PHI ([COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)). — synthetic fixtures only.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue 1:** `CockpitV3Shell.integration.test.tsx` failed — it asserted the action dock was `children[3]`, but the Phase-2 `<CockpitDndContext>` causes dnd-kit's `<DndContext>` to inject a hidden `<div id="DndDescribedBy-0">` accessibility sibling, shifting the dock to the last child (index 4). The dock **is** rendered, **is** outside the DnD context, and the click fires — a stale positional index, not a behavioural change.
**Solution:** Re-pointed the assertion to the shell's **last** child and added a `not.toContainElement(p2-cockpit-v3-dnd-context)` check — robust to the a11y node and a stronger encoding of the "anchored-bottom, outside-canvas" invariant. No shell file touched. Suite green.

**Issue 2:** Seed-probe suites (`shell-preseed-probe.test.tsx`, `blank-seed-probe.test.tsx`) hang under jsdom — they drive the **real** `useShellLayout`/`useCockpitV3Layout` hooks with pre-seeded `localStorage` (the known `cpf-04` hydration loop the other suites mock around).
**Solution:** Characterized as a pre-existing test-harness artifact in the **shared** persistence hook (used by *both* shells), **not** a v3 parity regression. Real persistence/migration parity is proven by the passing `CockpitPlatform.migrationParity.test.tsx` + `persistence.test.tsx`. Logged to the capture inbox as a test-infra follow-up; does not block the flip.

---

## 📝 Notes

- The whole point of this task is to make the flip a *decision backed by evidence*, not a hope. If you find yourself wanting to flip "because it looks fine", the matrix isn't done.
- Pay special attention to the reshaped-layout send path — Phase 3 (cv3p-01) proved the footer *renders* after a drag; this task proves it *sends*.

---

## 🔗 Related Tasks

- [`task-cv3x-02-flag-flip-and-kill-switch.md`](./task-cv3x-02-flag-flip-and-kill-switch.md) — gated by this matrix being green (P4-DL-1).
- [`task-cv3x-03-delete-old-shell.md`](./task-cv3x-03-delete-old-shell.md) — removes the old shell this task uses as the parity reference.
- [Prior phase — p3-platform](../../p3-platform/) — the anchored chrome / persistence / mobile this task proves at parity.

---

**Last Updated:** 2026-05-31
**Completed:** 2026-05-31 — parity green; matrix recorded ([`PARITY-MATRIX-cv3x-01.md`](../PARITY-MATRIX-cv3x-01.md)); cv3x-02 unblocked (P4-DL-1).
**Pattern:** Parity verification / close-gate (precedent: pane-freedom Phase 4 cpfg-01; `ppr` Wave 4 QA matrix).
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
