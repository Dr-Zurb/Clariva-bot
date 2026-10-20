# Task soc-04: The four columns

## 📋 Task Overview

Replace the empty Content tab with the board: Thoughts and ideas, Chosen, Making, Ready. A card shows its title and can move.

**Program / Phase:** social-assist · Phase 2 (content)
**Batch:** [`plan-p2-social-assist-content-batch.md`](../plan-p2-social-assist-content-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-social-assist-content.md`](./EXECUTION-ORDER-p2-social-assist-content.md)
**Estimated Time:** 4 hours
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — the Content tab from `soc-01` is empty

**Current State:**
- ✅ **What exists:** `/dashboard/social` and the three tabs, after Phase 1. The card API, after `soc-03`.
- ✅ **What's missing:** Nothing for this task. A signed-in walk on 2026-10-15 added a dummy title, moved it, and refreshed.
- ⚠️ **Notes:** Words and the file are `soc-05`. This task can show a title only.

**Scope Guard:**
- Expected files touched: ≤ 5, under the Social page
- Do not build Schedule or Analytics content
- Do not add filters for this week, parked, or seasonal

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-3, DL-4

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — through the `soc-03` API only. No new table.
- [x] **RLS verified?** Y — inherited from `soc-03`. This task does not add a policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Board
- [x] ✅ 1.1 Content shows four columns in order: Thoughts and ideas, Chosen, Making, Ready - **Completed: 2026-10-11**
- [x] ✅ 1.2 New idea creates a card in Thoughts and ideas with a title - **Completed: 2026-10-11**
- [x] ✅ 1.3 Moving a card changes its column, including a jump to any column - **Completed: 2026-10-11**
- [x] ✅ 1.4 An empty column says it is empty. It does not offer AI or a template - **Completed: 2026-10-11**

### 2. Verification
- [x] ✅ 2.1 Two cards from the same doctor land in the columns they were given - **Completed: 2026-10-11**
- [x] ✅ 2.2 Refresh keeps the column - **Completed: 2026-10-11** (the board loads from the API on open)
- [x] ✅ 2.3 Typecheck and lint the touched files - **Completed: 2026-10-11**
- [x] ✅ 2.4 Browser: add a title, move it, refresh - **Completed: 2026-10-15**

---

## 📁 Files to Create/Update

- ⚠️ The Social page from `soc-01` — Content tab becomes the board
- ❌ Board components under the Social page — MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- One board. Tags are not columns.
- The clinic sidebar stays as Phase 1 left it.
- No publish button.

---

## 📝 Notes

A card opened for the full words is `soc-05`. Until then, the column card shows the title.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
