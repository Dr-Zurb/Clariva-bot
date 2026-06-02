# Task cv3x-04: Rewrite COCKPIT.md to v3 + close out the program

> **Filename:** `task-cv3x-04-docs-and-program-closeout.md` in `cockpit-v3/p4-cutover/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

With the old shell deleted, make the docs tell the truth: rewrite `COCKPIT.md` so v3 is the documented live cockpit, mark the product plan **Shipped** (tick R-CUTOVER), and close out the program (inbox + program README). Doc-only; no code.

**Program / Phase:** cockpit-v3 · Phase 4 (cutover)
**Batch:** [`plan-p4-cockpit-v3-cutover-batch.md`](../plan-p4-cockpit-v3-cutover-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-cockpit-v3-cutover.md`](./EXECUTION-ORDER-p4-cockpit-v3-cutover.md)
**Estimated Time:** ~1 hour
**Status:** ✅ **DONE**
**Completed:** 2026-06-02

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Rewrite docs to match the shipped v3; follow the doc-drift guard

**Current State:** (checked against the codebase)
- ✅ **What exists:** `docs/Reference/product/cockpit/COCKPIT.md` documents v3 as the live model. `plan-cockpit-v3.md` is **Shipped** with R-CUTOVER ticked and Phases 4–5 gates marked done. Program README and inbox close-out lines landed.
- ❌ **What's missing:** —
- ⚠️ **Notes:** Shipped immediately after cv3x-03 (same session).

**Scope Guard:**
- Expected files touched: ≤ 4 (`COCKPIT.md`, product plan, inbox, program README).
- No code changes; any code edit belongs in cv3x-03.

**Reference Documentation:**
- [AI_AGENT_RULES.md](../../../../../../../Reference/engineering/development/AI_AGENT_RULES.md) — "Doc Drift Guard" (docs match shipped behaviour).
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §docs — keep reference docs current with the change.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Rewrite COCKPIT.md → v3 as the live model (P4-DL-5)
- [x] 1.1 Describe the live cockpit as v3: editor-group renderer, pane palette, always-on tabs, Cursor-style drag/drop, anchored safety chrome (strip + send footer), per-doctor persistence, mobile flat fallback. — **Completed: 2026-06-02**
- [x] 1.2 **Remove** the customize-mode narrative (customize bar, 5-zone overlay, fixed template pre-fill) — it no longer exists. — **Completed: 2026-06-02** (moved to §Retired only)
- [x] 1.3 Reconcile any cross-references in the doc that pointed at the old shell. — **Completed: 2026-06-02**

### 2. Mark the product plan Shipped
- [x] 2.1 Tick R-CUTOVER's `Decision:` and note the promotion to this batch. — **Completed: 2026-06-02** (was already `[x]`; status → Shipped)
- [x] 2.2 Set the plan status to **Shipped**; mark Phase 4 done in the §Sequencing phase ladder. — **Completed: 2026-06-02**

### 3. Program close-out
- [x] 3.1 Add a `docs/Work/capture/inbox.md` line: Cockpit v3 shipped (v3 is the live cockpit; old shell deleted) + the deferred fast-follows (V3-Q1 seed, per-consult-type persistence, preset CRUD UI). — **Completed: 2026-06-02**
- [x] 3.2 Update `cockpit-v3/README.md`: mark Phase 4 complete / program Shipped. — **Completed: 2026-06-02**

### 4. Verification
- [x] 4.1 No doc references a deleted symbol (`PatientProfileShell`, customize mode, `PaneDropOverlay`) as if it were live. — **Completed: 2026-06-02** (`COCKPIT.md` mentions retired symbols only in §Retired)
- [x] 4.2 All edited relative links resolve. — **Completed: 2026-06-02**
- [x] 4.3 `COCKPIT.md` reads coherently as a v3-only document. — **Completed: 2026-06-02**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: docs/Reference/product/cockpit/COCKPIT.md             ← v3 live model; customize-mode narrative removed
UPDATE: docs/Work/Product plans/plan-cockpit-v3.md            ← R-CUTOVER ticked; status → Shipped; Phase 4 done
UPDATE: docs/Work/capture/inbox.md                            ← program close-out + deferred fast-follows
UPDATE: .../cockpit-v3/README.md                              ← Phase 4 complete / program Shipped
```

**Existing Code Status:**
- ✅ `docs/Reference/product/cockpit/COCKPIT.md` — rewritten to v3 (2026-06-02).
- ✅ `docs/Work/Product plans/plan-cockpit-v3.md` — Shipped.
- ✅ `docs/Work/capture/inbox.md` · `cockpit-v3/README.md` — close-out edits done.

**When updating existing code:** N/A for code — doc-only. Apply the doc step of [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) (reference docs current with the change).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Docs match shipped reality** ([AI_AGENT_RULES.md](../../../../../../../Reference/engineering/development/AI_AGENT_RULES.md) doc-drift guard): after cv3x-03, the old model is gone, so no doc may present it as live.
- **Doc-only.** No code edits; this task touches Markdown.
- **Don't bury the deferred work.** The close-out must list the fast-follows (V3-Q1 seed, per-consult-type persistence, preset CRUD UI) so they aren't lost when the program closes.
- Ship **with or right after** cv3x-03 (P4-DL-5) — never let the doc lag the deletion.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — documentation only.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `COCKPIT.md` describes v3 as the live cockpit; the customize-mode narrative is removed (P4-DL-5).
- [x] `plan-cockpit-v3.md` is marked **Shipped**, R-CUTOVER ticked, Phase 4 done in the ladder.
- [x] `inbox.md` has a close-out line listing the deferred fast-follows; the program README marks Phase 4 / Shipped.
- [x] No doc presents a deleted symbol as live; all edited relative links resolve.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** None — cv3x-03 landed in the same session; docs updated immediately after deletion.
**Solution:** N/A.

---

## 📝 Notes

- This was the last task of the Cockpit v3 program. The program folder is fully shipped and `COCKPIT.md` is again the single source of truth for the cockpit.

---

## 🔗 Related Tasks

- [`task-cv3x-03-delete-old-shell.md`](./task-cv3x-03-delete-old-shell.md) — the deletion this documents.
- [`task-cv3x-01-parity-matrix.md`](./task-cv3x-01-parity-matrix.md) · [`task-cv3x-02-flag-flip-and-kill-switch.md`](./task-cv3x-02-flag-flip-and-kill-switch.md).
- [Prior phase — p3-platform](../../p3-platform/) — whose inbox line noted "COCKPIT.md updates at the Phase 4 cutover" (this task).

---

**Last Updated:** 2026-06-02
**Completed:** 2026-06-02
**Pattern:** Doc cutover + program close-out (doc-drift guard).
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `Reference/engineering/development/AI_AGENT_RULES.md`
