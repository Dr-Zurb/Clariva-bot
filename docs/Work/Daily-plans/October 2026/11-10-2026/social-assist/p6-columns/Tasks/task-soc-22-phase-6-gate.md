# Task soc-22: Phase 6 gate

## 📋 Task Overview

Walk a dummy card across the four columns. Check the phase gate. Ready still needs a file. Schedule and Analytics keep their meaning.

**Program / Phase:** social-assist · Phase 6 (card drag)
**Batch:** [`plan-p6-social-assist-columns-batch.md`](../plan-p6-social-assist-columns-batch.md)
**Execution order:** [`EXECUTION-ORDER-p6-social-assist-columns.md`](./EXECUTION-ORDER-p6-social-assist-columns.md)
**Estimated Time:** 2 hours
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — verification of `soc-20` and `soc-21`

**Current State:**
- ✅ **What exists:** The four columns and card drag, once the board change lands.
- ✅ **What's missing:** Nothing for this task. A signed-in drag on 2026-10-15 moved a dummy title, then the walk deleted it.
- ⚠️ **Notes:** Use a dummy title. No patient name. Do not add a column.

**Scope Guard:**
- Do not start the AI layer
- Do not change the public booking page

**Reference Documentation:**
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) phase 6 gate, via the batch plan

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — a dummy card in the logged-in app.
- [x] **RLS verified?** Y — the signed-in doctor only
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Walk
- [x] ✅ 1.1 The board still opens on the four columns, with Ready last. There is no add-column control - **Completed: 2026-10-15**
- [x] ✅ 1.2 Drag a dummy title from Thoughts and ideas to Chosen. Refresh. It is still in Chosen - **Completed: 2026-10-15**
- [x] ✅ 1.3 Drag a card with no file onto Ready. It stays put, and the board says Ready needs a file - **Completed: 2026-10-15**
- [x] ✅ 1.4 A click still opens the card. Filter, sort, and expand still work - **Completed: 2026-10-15**
- [x] ✅ 1.5 A posted dummy card is still on Analytics. A timed Ready card is still on Schedule - **Completed: 2026-10-15**
- [x] ✅ 1.6 No AI control - **Completed: 2026-10-15**

### 2. Record
- [x] ✅ 2.1 Check the phase 6 gate in the batch plan, with the date - **Completed: 2026-10-15**
- [x] ✅ 2.2 A posted dummy card is still on Analytics - **Completed: 2026-10-15**
- [x] ✅ 2.3 Typecheck and lint were already green on `soc-21`. Re-run if this task edits a test - **Completed: 2026-10-15** (this walk edited no test)

---

## 📁 Files to Create/Update

- ⚠️ The phase 6 batch plan — gate checkboxes, only after the walk

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Record what was actually clicked.
- Dummy file only.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
