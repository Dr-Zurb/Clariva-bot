# Task soc-21: Add, rename, and remove a column

## 📋 Task Overview

**+** at the right of the board adds a column the doctor names, just before Ready. They can rename it or delete it. The phase 5 header controls work on it.

**Program / Phase:** social-assist · Phase 6 (columns)
**Batch:** [`plan-p6-social-assist-columns-batch.md`](../plan-p6-social-assist-columns-batch.md)
**Execution order:** [`EXECUTION-ORDER-p6-social-assist-columns.md`](./EXECUTION-ORDER-p6-social-assist-columns.md)
**Estimated Time:** 4 hours
**Status:** ✅ **COMPLETED** — 2026-10-12.

**Change Type:**
- [x] **Update existing** — the board from phase 5, on the `soc-20` API

**Current State:**
- ✅ **What exists:** Four columns with **+**, a tag filter, a sort, and expand, after phase 5. Move is a select of the other three columns.
- ❌ **What's missing:** The control that adds a column, and Move including that column.
- ⚠️ **Notes:** There is no cap and no upgrade wall.

**Scope Guard:**
- Expected files touched: ≤ 5, the board and its tests
- Do not drag cards or columns
- Do not add a file field or a time field on the named column

**Reference Documentation:**
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-3, DL-12, DL-16, DL-17, DL-18
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — through the `soc-20` API. No new table in this task.
- [x] **RLS verified?** Y — inherited from `soc-20`.
- [x] **Any PHI in logs?** No. Do not log the column name.
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** Y — delete moves that column’s cards to Thoughts and ideas. It does not delete the cards.

---

## ✅ Task Breakdown

### 1. Column
- [x] 1.1 **+** at the right asks for a name and adds the column immediately before Ready
- [x] 1.2 A second named column also lands immediately before Ready, so the earlier one stays to its left
- [x] 1.3 The doctor can rename a named column. The four opening names stay
- [x] 1.4 Delete is offered on a named column only. Its cards return to Thoughts and ideas. The column is gone after refresh
- [x] 1.5 **+**, Tags, Sort, and expand on the named column behave as they do on the four. Move can place a card there. **+** on it asks for a title only

### 2. Verification
- [x] 2.1 Tests: two named columns sit before Ready, in the order they were added; delete returns a card to Thoughts and ideas; the four opening columns have no delete
- [x] 2.2 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialBoard.tsx`
- ⚠️ The Social client tests
- ⚠️ The card API helper, if Move does not yet accept a named column

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Ready stays the last column.
- A named column does not ask for a file.
- No paywall and no AI.

---

**Last Updated:** 2026-10-12
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
