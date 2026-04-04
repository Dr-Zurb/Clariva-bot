# e-task-doc-02: Capture inbox system (ideas & parked tasks)

## 2026-04-04

---

## 📋 Task Overview

Add a **low-friction capture** area in-repo so ideas, bugs, and “do later” items are not lost. Includes:

- **`docs/capture/README.md`** — workflow: inbox vs `notes/`, triage to Daily-plans / Taskmaster / GitHub.
- **`docs/capture/inbox.md`** — quick `- [ ]` bullets.
- **`docs/capture/TEMPLATE.md`** — longer structured dumps.
- **`docs/capture/notes/`** — optional dated notes (folder kept via `.gitkeep`).
- **`.cursor/rules/capture-inbox.mdc`** — agent appends to inbox when user says *capture / remember / park* (unless another path under `docs/capture/` is specified).

**Estimated Time:** 0.25 day (initial scaffold)  
**Status:** ✅ **DONE** (scaffold + rule shipped on `main`)

**Change Type:**
- [x] **New feature** — documentation + Cursor rule only (no booking logic)

**Current State:**
- ✅ Files live under `docs/capture/` and `.cursor/rules/capture-inbox.mdc`.
- ✅ Committed and pushed as part of **docs: add capture inbox system** commit.
- ❌ Optional: link from root `README.md` or `docs/README.md` to `docs/capture/README.md` for discoverability.

**Reference:**
- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

## ✅ Task Breakdown

### 1. Scaffold
- [x] 1.1 Create `docs/capture/` structure and README — **Completed: 2026-04-04**
- [x] 1.2 Add Cursor rule for capture requests — **Completed: 2026-04-04**

### 2. Optional follow-ups
- [ ] 2.1 Add one-line **Discover** link from top-level project README or `docs/index` to `docs/capture/README.md`.
- [ ] 2.2 During weekly triage, move items from `inbox.md` into this **Daily-plans** folder or Taskmaster.

---

## 📁 Files to Create/Update

- ✅ `docs/capture/README.md`
- ✅ `docs/capture/inbox.md`
- ✅ `docs/capture/TEMPLATE.md`
- ✅ `docs/capture/notes/.gitkeep`
- ✅ `.cursor/rules/capture-inbox.mdc`

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N (docs only)
- [x] **PHI in logs?** N/A — do not paste patient content into committed inbox without policy review

---

## ✅ Acceptance & Verification Criteria

- [x] New contributors can read `docs/capture/README.md` and know how to capture and triage.
- [ ] Optional discoverability link from primary README.

---

## 🔗 Related Tasks

- [e-task-dm-02-thread-aware-fee-catalog.md](./e-task-dm-02-thread-aware-fee-catalog.md) — example content to capture before implementation

---

**Last Updated:** 2026-04-04  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
