# Task soc-08: Schedule list by day

## 📋 Task Overview

The Schedule tab lists cards that have a time, grouped by day.

**Program / Phase:** social-assist · Phase 3 (schedule)
**Batch:** [`plan-p3-social-assist-schedule-batch.md`](../plan-p3-social-assist-schedule-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-social-assist-schedule.md`](./EXECUTION-ORDER-p3-social-assist-schedule.md)
**Estimated Time:** 3 hours
**Status:** ✅ **COMPLETED** — day list recorded 2026-10-11. Refresh Schedule after migration 248.

**Change Type:**
- [x] **Update existing** — the empty Schedule tab from `soc-01`

**Current State:**
- ✅ **What exists:** an empty Schedule tab. Cards with a time, after `soc-07`.
- ❌ **What's missing:** the day list.
- ⚠️ **Notes:** Buffer’s queue shows empty future slots. v1 does not.

**Scope Guard:**
- Expected files touched: ≤ 4
- Do not generate empty slots
- Do not add Approvals or Sent

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — reads the time from `soc-07`
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. List
- [x] ✅ 1.1 Schedule shows cards that have a time, grouped by day - **Completed: 2026-10-11**
- [x] ✅ 1.2 Each row shows the title, the format, and the time - **Completed: 2026-10-11**
- [x] ✅ 1.3 Opening a row returns to the same card - **Completed: 2026-10-11**
- [x] ✅ 1.4 A day with no timed card is absent. There is no “+ New” empty slot. - **Completed: 2026-10-11**
- [x] ✅ 1.5 When nothing is timed, the tab says so - **Completed: 2026-10-11**

### 2. Verification
- [x] ✅ 2.1 Browser: two times on different days land under those days - **Completed: 2026-10-11**
- [x] ✅ 2.2 Clearing the time on the card removes it from Schedule - **Completed: 2026-10-11**
- [x] ✅ 2.3 Typecheck and lint the touched files - **Completed: 2026-10-11**

---

## 📁 Files to Create/Update

- ⚠️ Schedule tab from `soc-01`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- This is a list, not a second board.
- No calendar grid is required.
- No publish control.

---

**Last Updated:** 2026-10-11
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
