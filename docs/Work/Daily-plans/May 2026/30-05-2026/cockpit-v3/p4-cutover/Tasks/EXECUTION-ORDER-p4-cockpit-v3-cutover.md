# Cockpit v3 — Phase 4: cutover — execution order

> Sibling document of [`plan-p4-cockpit-v3-cutover-batch.md`](../plan-p4-cockpit-v3-cutover-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** all four tasks are single-lane (Shape A). Cutover is sequential and high-blast-radius — verify → flip → (soak) → delete → document. There is no honest second lane, so no parallelism is claimed ([`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §7: bias hard toward sequential for destructive / structural work).

---

## Wave plan (3 waves + 1 release-window pause)

```
Wave 1 (Parity matrix — QA / close-gate, ~3–4h, single lane sequential):
  Lane α  ──── **cv3x-01 (M, Opus 4.7)**

Wave 2 (Flag flip + kill-switch — ~1–2h, single lane sequential):
  Lane α  ──── cv3x-02 (S, Sonnet 4.6)

  [ release window ~1 week prod soak ]  ⏸   (kill-switch live; telemetry confirms v3 serving)

Wave 3 (Delete the old + close-out — ~4–5h, single lane sequential):
  Lane α  ──── **cv3x-03 (L, Opus 4.7)** ──> cv3x-04 (S, Composer 2 Fast)
```

**Total wall-clock with parallelism:** ~8–11h of agent-time **+ ~1 release (~1 week) of prod soak** between Wave 2 and Wave 3 (a wall-clock pause, not work).
**Total agent-time (sequential equivalent):** ~8–11h (no parallelism — every wave is single-lane).

The bottleneck is **Wave 3 — cv3x-03**, the deletion of the live old `PatientProfileShell` + customize mode. It is single-lane Opus because removing consult-critical code is the riskiest diff in the program and must be reviewed as one audited change (CODE_CHANGE_RULES). The soak before it is the true schedule driver.

---

## Lane-by-lane details

### Wave 1 — Parity matrix (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **cv3x-01** | M | **Opus 4.7** | `Shell.tsx` (old) + `v3/CockpitV3Shell.tsx` (new), the send pipeline (`PlanActionFooter` + Rx actions), `PatientProfilePage.tsx` mount branch, the consult-type list | The program close-gate. Build nothing; prove v3 == old shell across every safety-critical path and record the matrix so the flip (P4-DL-1) is auditable. Opus per the "close-gate review" hard-rule. |

### Wave 2 — Flag flip + kill-switch (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | cv3x-02 | S | Sonnet 4.6 | `v3/flags.ts` (`cockpitV3Enabled()`), `PatientProfilePage.tsx` mount branch | Waits on cv3x-01 green (P4-DL-1). Flip default-on; add a no-deploy kill-switch (P4-DL-2) + which-shell telemetry. `Update existing` → [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md). Keep the old branch alive — it is deleted in Wave 3, not here. |

### ⏸ Release window (~1 week prod soak — wall-clock pause, no agent task)

The kill-switch stays live; telemetry confirms v3 is actually serving and no rollback fired. Deletion (Wave 3) does not begin until this elapses clean (P4-DL-3).

### Wave 3 — Delete the old + close-out (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **cv3x-03** | L | **Opus 4.7** | `Shell.tsx`, `PaneDropOverlay.tsx`, `CustomizeBar.tsx`, `customize-mode-context.tsx`, `CustomizeBar.test.tsx`, `v3/flags.ts`, `PatientProfilePage.tsx`, the template pre-fill path | Waits on the soak (P4-DL-3). Audit every consumer first (CODE_CHANGE_RULES), then delete the old shell + customize mode + 5-zone overlay + pre-fill + flag; mount `CockpitV3Shell` unconditionally. `rg` for each removed symbol → zero. Touch no kept-model / engine / `foundation.ts` / migration file (P4-DL-4). Opus per "5+ files / consult-critical removal" hard-rule. |
| 1 | cv3x-04 | S | Composer 2 Fast | `docs/Reference/product/cockpit/COCKPIT.md`, `Product plans/plan-cockpit-v3.md`, `docs/Work/capture/inbox.md`, `cockpit-v3/README.md` | Waits on cv3x-03 (docs describe the post-deletion world). Rewrite `COCKPIT.md` → v3 live model (P4-DL-5); mark the product plan Shipped + tick R-CUTOVER; close-out inbox + program README. Doc-only. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cv3x-01 | M | **Opus 4.7** | Parity verification over consult-critical paths (send / autosave / finish) **is** the program close-gate — a hard-rule for Opus. One careful review beats four mediocre ones; a missed parity gap ships a regression to every doctor. |
| cv3x-02 | S | Sonnet 4.6 | A bounded config change: flip one default + add a runtime override + telemetry. Well-spec'd, small surface. Auto/Sonnet is the right tier; escalate a single message to Opus only if the kill-switch wiring fights the mount branch. |
| cv3x-03 | L | **Opus 4.7** | Deleting the live old shell + customize mode is a multi-file removal of consult-critical code (5+ files) — the guide's cross-cutting-refactor hard-rule. The risk is a dangling consumer or an over-deletion into the kept engine. Opus to audit + remove safely. |
| cv3x-04 | S | Composer 2 Fast | Pure doc rewrite + status sync (`COCKPIT.md`, product plan, inbox, README). Composer's strength; no judgment beyond accurate description of the shipped v3. |

**Caps check:** 2 Opus tasks in the batch (cv3x-01, cv3x-03) = the §8 max of two; ≤1 Opus per wave (Wave 1: cv3x-01; Wave 3: cv3x-03, with cv3x-04 on Composer). ✓

---

## Acceptance gates per wave

### Wave 1 gate — parity proven (cv3x-01)

- [ ] Open patient renders correctly in v3 for **every** consult type (matrix enumerated, every cell green).
- [ ] Prescribe + "Send Rx & finish" runs the identical send pipeline as the old shell — including after a Phase-3 drag-reshape.
- [ ] Autosave, finish / no-show / review states, the three mount surfaces (cockpit-v2 DL-3), and keyboard nav all match the old shell.
- [ ] Send / autosave / finish **E2E** suites green with v3 active.
- [ ] The parity matrix is recorded (doc or test) so the flip decision is auditable (P4-DL-1).

### Wave 2 gate — flipped + reversible (cv3x-02)

- [x] **All Wave 1 gates still green.**
- [x] `cockpitV3Enabled()` defaults to **on**; a fresh doctor with no override sees v3.
- [x] The kill-switch reverts the org to the old `PatientProfileShell` **without a redeploy** (P4-DL-2); flipping back restores v3.
- [x] Telemetry records which shell rendered.
- [x] `cd frontend; npx tsc --noEmit` clean; `npm run lint` clean (warnings only).

### Wave 3 gate — old code gone + documented (cv3x-03 → cv3x-04)

- [ ] **All Wave 1 + Wave 2 gates still green** (v3 path verified before the old path is removed).
- [ ] `rg "PatientProfileShell" frontend/`, `rg "PaneDropOverlay" frontend/`, `rg "customize-mode-context" frontend/`, `rg "CustomizeBar" frontend/`, `rg "cockpitV3Enabled" frontend/` each return **zero** (live code).
- [ ] `CockpitV3Shell` mounts unconditionally; no flag branch remains.
- [ ] No kept-model / engine / `foundation.ts` / migration file changed (P4-DL-4 / v3-DL-1); `npx tsc --noEmit` + `npm run lint` clean; surviving suites green.
- [ ] `COCKPIT.md` describes v3 as the live model; customize-mode narrative removed (P4-DL-5).
- [ ] Product plan marked **Shipped** + R-CUTOVER ticked; inbox close-out line added; program README marks Phase 4 done.

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3x-01 | 0 | 0 | 1 | ~3–4h |
| Wave 2 | cv3x-02 | 1 | 0 | 0 | ~1–2h |
| ⏸ soak | — | — | — | — | ~1 release (~1 week) |
| Wave 3 | cv3x-03, cv3x-04 | 0 | 1 | 1 | ~4–5h |
| **Total** | **4** | **1** | **1** | **2** | **~8–11h agent-time + ~1-week soak** |

Token estimate (rough): ~120k input / ~70k output, dominated by cv3x-01 (matrix) + cv3x-03 (deletion audit).

---

## References

- Plan: [`plan-p4-cockpit-v3-cutover-batch.md`](../plan-p4-cockpit-v3-cutover-batch.md).
- Source: [`Product plans/plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md) — R-CUTOVER, v3-DL-9, P0-DL-1.
- Prior-phase exec orders (siblings in the same program):
  - [`../../p3-platform/Tasks/EXECUTION-ORDER-p3-cockpit-v3-platform.md`](../../p3-platform/Tasks/EXECUTION-ORDER-p3-cockpit-v3-platform.md)
  - [`../../p2-dnd/Tasks/EXECUTION-ORDER-p2-cockpit-v3-dnd.md`](../../p2-dnd/Tasks/EXECUTION-ORDER-p2-cockpit-v3-dnd.md)
- Tasks: [`task-cv3x-01-parity-matrix.md`](./task-cv3x-01-parity-matrix.md) · [`task-cv3x-02-flag-flip-and-kill-switch.md`](./task-cv3x-02-flag-flip-and-kill-switch.md) · [`task-cv3x-03-delete-old-shell.md`](./task-cv3x-03-delete-old-shell.md) · [`task-cv3x-04-docs-and-program-closeout.md`](./task-cv3x-04-docs-and-program-closeout.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-05-31.  
**Status:** `Committed` — execute Wave 1 → 2 → (soak) → 3 top-to-bottom.
