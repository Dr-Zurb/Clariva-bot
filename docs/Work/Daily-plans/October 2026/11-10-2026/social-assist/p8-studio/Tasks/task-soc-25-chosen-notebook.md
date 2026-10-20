# Task soc-25: Chosen uses the notebook

## 📋 Task Overview

Chosen opens the same notebook as a thought. **Start making** asks Post, Reel, or Story, then moves the card. Thoughts gains **Choose**, which moves the card to Chosen.

**Program / Phase:** social-assist · Phase 8 (studio)
**Batch:** [`plan-p8-social-assist-studio-batch.md`](../plan-p8-social-assist-studio-batch.md)
**Execution order:** [`EXECUTION-ORDER-p8-social-assist-studio.md`](./EXECUTION-ORDER-p8-social-assist-studio.md)
**Estimated Time:** 3 hours
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — Chosen currently opens the older editor

**Current State:**
- ✅ **What exists:** The notebook on Thoughts and on a custom column. A stage move that sends the stage only. Tags and the resources bar.
- ❌ **What's missing:** Chosen does not open that notebook. There is no **Choose** or **Start making**.
- ⚠️ **Notes:** The format is not asked on Thoughts. It is asked when the card leaves Chosen.

**Scope Guard:**
- Expected files touched: ≤ 5
- Do not build the composer in this task
- Do not change the notebook’s size or the resources bar

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — the card’s stage and format, already stored for this doctor
- [x] **RLS verified?** Y — the existing doctor scope stays
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Notebook
- [x] ✅ 1.1 A Chosen card opens the notebook: title, note, resources, and one tag - **Completed: 2026-10-15**
- [x] ✅ 1.2 Thoughts shows **Choose**. It moves the card to Chosen and does not ask for a format - **Completed: 2026-10-15**
- [x] ✅ 1.3 Chosen shows **Start making**. It asks Post, Reel, or Story, saves that format, and moves the card to Making - **Completed: 2026-10-15**
- [x] ✅ 1.4 Cancelling the format choice leaves the card in Chosen - **Completed: 2026-10-15**

### 2. Verification
- [x] ✅ 2.1 A test covers **Start making** moving a Chosen card to Making with a format - **Completed: 2026-10-15**
- [x] ✅ 2.2 The stage request sends the stage only - **Completed: 2026-10-15**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialCardPanel.tsx`
- ⚠️ `frontend/components/dashboard/social/SocialBoard.tsx`
- ⚠️ `frontend/components/dashboard/social/__tests__/SocialClient.test.tsx`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Reuse the notebook. Do not draw a second editor for Chosen.
- One forward step on each of these two columns.
- No caption, hook, or preview on this task.
- Do not log a title, a note, or a format name beyond what the board already logs as field names.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
