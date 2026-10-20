# Task soc-13: Use again

## 📋 Task Overview

On a posted card, Use again creates a new card in Thoughts and ideas with the same words and tags. It does not post.

**Program / Phase:** social-assist · Phase 4 (analytics)
**Batch:** [`plan-p4-social-assist-analytics-batch.md`](../plan-p4-social-assist-analytics-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-social-assist-analytics.md`](./EXECUTION-ORDER-p4-social-assist-analytics.md)
**Estimated Time:** 2 hours
**Status:** ✅ **COMPLETED** — 2026-10-11. Use again is on a posted card. The logged-in click is still the browser check.

**Change Type:**
- [x] **New feature** — a copy from a posted card

**Current State:**
- ✅ **What exists:** posted cards, after `soc-11`. Create-card from `soc-03`.
- ❌ **What's missing:** the copy action.
- ⚠️ **Notes:** Does not wait on the visit count (`soc-12`).

**Scope Guard:**
- Expected files touched: ≤ 4
- Do not copy the file, the Instagram URL, the time, or the visit count
- Do not schedule or publish the new card

**Reference Documentation:**
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-11

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — a new card for the same doctor
- [x] **RLS verified?** Y — inherited
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Copy
- [x] ✅ 1.1 Analytics offers Use again on a posted card - **Completed: 2026-10-11**
- [x] ✅ 1.2 The new card is in Thoughts and ideas and has the same title, format, topic, and words - **Completed: 2026-10-11**
- [x] ✅ 1.3 The new card has no file, no time, no Instagram URL, and no visit count - **Completed: 2026-10-11**
- [x] ✅ 1.4 The posted card is unchanged - **Completed: 2026-10-11**

### 2. Verification
- [x] ✅ 2.1 Test: the copy is a different card; the original URL is not on the copy - **Completed: 2026-10-11**
- [ ] 2.2 Browser: Use again, then open Content and see the new card in Thoughts and ideas
- [x] ✅ 2.3 Typecheck and lint the touched files - **Completed: 2026-10-11**

---

## 📁 Files to Create/Update

- ⚠️ Analytics row from `soc-11`
- ⚠️ Card create from `soc-03`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The doctor chooses. There is no seasonal auto-repost.
- The new card is not in Ready and not on Schedule.

---

**Last Updated:** 2026-10-11
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
