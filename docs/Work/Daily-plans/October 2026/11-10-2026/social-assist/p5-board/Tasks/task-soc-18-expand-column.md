# Task soc-18: Open a column wide

## 📋 Task Overview

A control on every column header opens that column over the board. The wide view groups by topic and uses that column’s filter and sort.

**Program / Phase:** social-assist · Phase 5 (board)
**Batch:** [`plan-p5-social-assist-board-batch.md`](../plan-p5-social-assist-board-batch.md)
**Execution order:** [`EXECUTION-ORDER-p5-social-assist-board.md`](./EXECUTION-ORDER-p5-social-assist-board.md)
**Estimated Time:** 3 hours
**Status:** ✅ **COMPLETED** — 2026-10-12.

**Change Type:**
- [x] **Update existing** — the board from `soc-17`

**Current State:**
- ✅ **What exists:** Four columns, each with a filter and a sort after `soc-17`. Opening a card shows `SocialCardPanel` above the columns.
- ❌ **What's missing:** Expand, and topic groups.
- ⚠️ **Notes:** The narrow column stays a flat list. Groups are only in the wide view.

**Scope Guard:**
- Expected files touched: ≤ 4, the board and its tests
- Do not add a fifth column
- The wide view is the same cards, not a second copy to edit apart from the board

**Reference Documentation:**
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-17

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — a view of cards already loaded
- [x] **RLS verified?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Wide view
- [x] ✅ 1.1 Each column header has expand, including an empty column - **Completed: 2026-10-12**
- [x] ✅ 1.2 Expand opens that column over the board and names the column - **Completed: 2026-10-12**
- [x] ✅ 1.3 Cards are in folded groups with a count. **No topic** is first. Then topics in A to Z order. A group opens on its own - **Completed: 2026-10-12**
- [x] ✅ 1.4 Cards inside a group follow that column’s sort. The wide view uses that column’s tag filter - **Completed: 2026-10-12**
- [x] ✅ 1.5 Closing returns to the four columns. Opening a card there opens the same panel as on the board - **Completed: 2026-10-12**

### 2. Verification
- [x] ✅ 2.1 A test: three thoughts, two topics, expand shows **No topic** and the two topics folded - **Completed: 2026-10-12**
- [x] ✅ 2.2 A test: a tag chosen on the column is the tag in the wide view - **Completed: 2026-10-12**
- [x] ✅ 2.3 Typecheck and lint the touched files - **Completed: 2026-10-12**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialBoard.tsx`
- ⚠️ The Social client tests

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- One column open wide at a time.
- Do not group the narrow column.
- No AI in the wide view.

---

**Last Updated:** 2026-10-12
**Completed:** 2026-10-12
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
