# Task soc-16: A topic on any card

## 📋 Task Overview

A thought can carry a topic the doctor types. The format still waits until Chosen.

**Program / Phase:** social-assist · Phase 5 (board)
**Batch:** [`plan-p5-social-assist-board-batch.md`](../plan-p5-social-assist-board-batch.md)
**Execution order:** [`EXECUTION-ORDER-p5-social-assist-board.md`](./EXECUTION-ORDER-p5-social-assist-board.md)
**Estimated Time:** 2 hours
**Status:** ✅ **COMPLETED** — 2026-10-12.

**Change Type:**
- [x] **Update existing** — the card panel from `soc-05`

**Current State:**
- ✅ **What exists:** The card record stores a topic of 1–80 characters on any column. Create and update already accept it. The panel shows format, topic, and the words only after the card leaves Thoughts and ideas.
- ❌ **What's missing:** A topic field on a thought.
- ⚠️ **Notes:** Fees and Dengue in older notes are examples a doctor might type. They are not built-in labels.

**Scope Guard:**
- Expected files touched: ≤ 3, the panel and its tests
- Do not add a filter yet (`soc-17`)
- Do not show the format, the words, or the file on a thought

**Reference Documentation:**
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-5, DL-6

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — a topic string the doctor types, on the existing card. No new column.
- [x] **RLS verified?** Y — inherited.
- [x] **Any PHI in logs?** No. Do not log the topic.
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Topic
- [x] ✅ 1.1 Opening a thought shows a topic field and the title - **Completed: 2026-10-12**
- [x] ✅ 1.2 Saving a topic keeps the card in Thoughts and ideas - **Completed: 2026-10-12**
- [x] ✅ 1.3 A thought still has no format field and no word fields - **Completed: 2026-10-12**
- [x] ✅ 1.4 Chosen still asks for the format, the topic, and the words for that format - **Completed: 2026-10-12**

### 2. Verification
- [x] ✅ 2.1 A test saves a topic on a thought and does not show Post, Reel, or Story there - **Completed: 2026-10-12**
- [x] ✅ 2.2 Typecheck and lint the touched files - **Completed: 2026-10-12**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialCardPanel.tsx` — topic on a thought
- ⚠️ The Social client tests that open a thought

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The topic is free text the doctor types. Do not ship a fixed list.
- Clearing the topic leaves the card where it is.
- No AI suggestion for the topic.

---

**Last Updated:** 2026-10-12
**Completed:** 2026-10-12
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
