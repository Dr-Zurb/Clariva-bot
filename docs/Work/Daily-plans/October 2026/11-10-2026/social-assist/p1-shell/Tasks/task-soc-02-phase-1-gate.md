# Task soc-02: Phase 1 gate

## 📋 Task Overview

Walk the Phase 1 gate in the browser. Fix only what fails that gate.

**Program / Phase:** social-assist · Phase 1 (shell)
**Batch:** [`plan-p1-social-assist-shell-batch.md`](../plan-p1-social-assist-shell-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-social-assist-shell.md`](./EXECUTION-ORDER-p1-social-assist-shell.md)
**Estimated Time:** 1 hour
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — only if the gate fails

**Current State:**
- ✅ **What exists:** the clinic sidebar and the five destinations, after `soc-01`.
- ✅ **What's missing:** Nothing for this task. A signed-in walk on 2026-10-15 passed the sidebar, the three tabs, the clinic pages, Integrations, and a narrow drawer.
- ⚠️ **Notes:** Use a test doctor. No patient records.

**Scope Guard:**
- Do not start the board, the clock, or Analytics data
- Expected files touched: only what the gate shows is wrong

**Reference Documentation:**
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Walk the gate
- [x] ✅ 1.1 Sidebar order is Today, OPD, Patients, Insights, Alerts, Social - **Completed: 2026-10-15**
- [x] ✅ 1.2 `/dashboard/social` shows Content, Schedule, Analytics, and Content is first - **Completed: 2026-10-15**
- [x] ✅ 1.3 Today, OPD, Patients, Insights, and Alerts still open - **Completed: 2026-10-15**
- [x] ✅ 1.4 Settings → Integrations still holds Instagram connect - **Completed: 2026-10-15**
- [x] ✅ 1.5 Check the Phase 1 boxes in the batch plan, with the date - **Completed: 2026-10-15**

### 2. Verification
- [x] ✅ 2.1 Narrow viewport: Social is still reachable in the drawer and the tabs still switch - **Completed: 2026-10-15**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- A failed check is fixed in the shell from `soc-01`. It is not a reason to add an API.

---

## 📝 Notes

Record the route and what you clicked. Do not record a patient name.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
