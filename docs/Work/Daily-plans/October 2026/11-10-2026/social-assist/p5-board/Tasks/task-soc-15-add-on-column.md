# Task soc-15: Add a card from the column

## 📋 Task Overview

Take the add bar off the top of Content. Each column gets a **+** that creates a card in that column. **+** on Ready asks for the file.

**Program / Phase:** social-assist · Phase 5 (board)
**Batch:** [`plan-p5-social-assist-board-batch.md`](../plan-p5-social-assist-board-batch.md)
**Execution order:** [`EXECUTION-ORDER-p5-social-assist-board.md`](./EXECUTION-ORDER-p5-social-assist-board.md)
**Estimated Time:** 3 hours
**Status:** ✅ **COMPLETED** — 2026-10-12. The logged-in click is the phase 5 gate (`soc-19`).

**Change Type:**
- [x] **Update existing** — the Content board from `soc-04` and `soc-05`

**Current State:**
- ✅ **What exists:** `SocialBoard.tsx` has a title field, a file field labeled “File already made”, and Add. A file creates a Ready card. No file creates a Thoughts and ideas card. Create already accepts a column.
- ❌ **What's missing:** **+** on each column. The top bar removed.
- ⚠️ **Notes:** Filter, sort, expand, and a topic on a thought are later tasks in this phase. Do not add them here.

**Scope Guard:**
- Expected files touched: ≤ 4, the board and its tests
- Do not add a named-column control
- Do not change Schedule or Analytics

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-4, DL-7, DL-18

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — through the existing card API. No new table.
- [x] **RLS verified?** Y — inherited. This task does not add a policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Add
- [x] ✅ 1.1 The title field and the file field above the columns are gone - **Completed: 2026-10-12**
- [x] ✅ 1.2 **+** on Thoughts and ideas, Chosen, and Making asks for a title and creates the card in that column - **Completed: 2026-10-12**
- [x] ✅ 1.3 **+** on Ready asks for a title and a file, and creates a Ready card - **Completed: 2026-10-12**
- [x] ✅ 1.4 An empty column still says it is empty. It does not offer AI - **Completed: 2026-10-12**

### 2. Verification
- [x] ✅ 2.1 Tests: a title added from Chosen is not in Thoughts and ideas; a Ready add without a file does not create a card - **Completed: 2026-10-12**
- [x] ✅ 2.2 The old “New idea” bar is not on the page - **Completed: 2026-10-12**
- [x] ✅ 2.3 Typecheck and lint the touched files - **Completed: 2026-10-12**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialBoard.tsx` — add moves onto the columns
- ⚠️ `frontend/components/dashboard/social/__tests__/SocialClient.test.tsx` — the add test targets the top bar

**When updating existing code:**
- [x] Audit the add path and the tests that type into “New idea”
- [x] Remove the top bar
- [x] Update those tests

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Ready still means the file is on the card.
- Move stays a select.
- No publish button and no AI button.

---

**Last Updated:** 2026-10-12
**Completed:** 2026-10-12
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
