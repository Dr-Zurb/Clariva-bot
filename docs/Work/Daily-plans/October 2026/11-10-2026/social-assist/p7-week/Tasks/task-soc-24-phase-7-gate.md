# Task soc-24: Phase 7 gate

## 📋 Task Overview

A signed-in walk of the week. Dummy titles only.

**Program / Phase:** social-assist · Phase 7 (week)
**Batch:** [`plan-p7-social-assist-week-batch.md`](../plan-p7-social-assist-week-batch.md)
**Execution order:** [`EXECUTION-ORDER-p7-social-assist-week.md`](./EXECUTION-ORDER-p7-social-assist-week.md)
**Estimated Time:** 1 hour
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — confirm the week from `soc-23`

**Current State:**
- ✅ **What exists:** the week view and its tests.
- ✅ **What's missing:** Nothing for this task. A signed-in walk on 2026-10-15 set two times in the current week, then deleted those cards. Nothing was sent.
- ⚠️ **Notes:** Do not mark this done from unit tests alone.

**Scope Guard:**
- Expected files touched: ≤ 2
- Do not call Instagram
- Do not log a title

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Walk
- [x] ✅ 1.1 Set two times on Ready cards in the current week. Each chip sits on its day. - **Completed: 2026-10-15**
- [x] ✅ 1.2 Previous week hides them. Today brings them back. - **Completed: 2026-10-15**
- [x] ✅ 1.3 Opening a chip opens that card. Clearing the time removes the chip. The day stays. - **Completed: 2026-10-15**
- [x] ✅ 1.4 There is no “+ New”. Clearing a time does not leave a placeholder. - **Completed: 2026-10-15**
- [x] ✅ 1.5 Nothing is sent to Instagram. - **Completed: 2026-10-15**

### 2. Record
- [x] ✅ 2.1 Check the batch gate with the date of the walk - **Completed: 2026-10-15**
- [x] ✅ 2.2 `soc-02`, `soc-19`, and `soc-22` were walked the same day - **Completed: 2026-10-15**

---

## 📁 Files to Create/Update

- ⚠️ This task and the batch gate, after the walk

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Dummy titles. No patient name.
- The sender is not part of this gate.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
