# Task soc-17: Filter and sort on each column

## 📋 Task Overview

Every column gets its own tag filter and its own sort. The narrow column stays a flat list.

**Program / Phase:** social-assist · Phase 5 (board)
**Batch:** [`plan-p5-social-assist-board-batch.md`](../plan-p5-social-assist-board-batch.md)
**Execution order:** [`EXECUTION-ORDER-p5-social-assist-board.md`](./EXECUTION-ORDER-p5-social-assist-board.md)
**Estimated Time:** 3 hours
**Status:** ✅ **COMPLETED** — 2026-10-12.

**Change Type:**
- [x] **Update existing** — the board from `soc-15`

**Current State:**
- ✅ **What exists:** The board loads the doctor’s cards and splits them by the four columns. A card has a topic and, from Chosen onward, a format.
- ❌ **What's missing:** A filter and a sort on each column.
- ⚠️ **Notes:** Buffer’s Tags control is one menu for the whole Create page. This board’s filter belongs to the column. Do not save the choice on the server.

**Scope Guard:**
- Expected files touched: ≤ 4, the board and its tests
- Do not build the wide view (`soc-18`)
- Do not add this week, parked, or seasonal

**Reference Documentation:**
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-16

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — the cards are already loaded. Filter and sort are for this sitting.
- [x] **RLS verified?** N — no new read or write
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Filter and sort
- [x] ✅ 1.1 Each column header has Tags and Sort, including an empty column - **Completed: 2026-10-12**
- [x] ✅ 1.2 Tags lists **All**, then each topic on a card in that column. **Post**, **Reel**, and **Story** appear when a card in that column has that format - **Completed: 2026-10-12**
- [x] ✅ 1.3 Choosing a tag hides the other cards in that column only. The header count is the number still on screen - **Completed: 2026-10-12**
- [x] ✅ 1.4 Sort is **Latest** by default, then **A to Z** by title - **Completed: 2026-10-12**
- [x] ✅ 1.5 Opening the page again starts every column on **All** and **Latest** - **Completed: 2026-10-12**

### 2. Verification
- [x] ✅ 2.1 A test with two topics in Thoughts and one of those topics in Making: filtering Thoughts leaves the Making card visible - **Completed: 2026-10-12**
- [x] ✅ 2.2 A test: A to Z orders titles in that column, and Latest puts the newest update first - **Completed: 2026-10-12**
- [x] ✅ 2.3 Typecheck and lint the touched files - **Completed: 2026-10-12**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialBoard.tsx`
- ⚠️ The Social client tests

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- One column’s filter does not change another column.
- The tag list is built from cards in that column, not from a catalog.
- No search box in this task.

---

**Last Updated:** 2026-10-12
**Completed:** 2026-10-12
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
