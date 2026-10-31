# Task soc-34: The Making badge

## 📋 Task Overview

A Making card that has been handed over shows who has it. That column can show only those cards. The other columns do not change.

**Program / Phase:** social-assist · Phase 12 (review)
**Batch:** [`plan-p12-social-assist-review-batch.md`](../plan-p12-social-assist-review-batch.md)
**Execution order:** [`EXECUTION-ORDER-p12-social-assist-review.md`](./EXECUTION-ORDER-p12-social-assist-review.md)
**Estimated Time:** 2 hours
**Status:** ⏳ **PENDING**

**Change Type:**
- [x] **Update existing** — Making cards already show a topic, a file, and a link

**Current State:**
- ✅ **What exists:** `CardMarks` in `SocialBoard.tsx`. Each column already has its own filter.
- ❌ **What's missing:** A mark for the handoff, and a way to see only those Making cards.
- ⚠️ **Notes:** There is no “back from the editor” state in this phase. Do not draw an empty one.

**Scope Guard:**
- Expected files touched: ≤ 3
- Do not add a column
- Do not filter Ideas, Chosen, or Ready by this handoff

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** N — reads the handoff `soc-31` already returns
- [ ] **RLS verified?** Y — no new policy
- [ ] **Any PHI in logs?** No
- [ ] **External API or AI call?** N
- [ ] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Mark
- [ ] 1.1 A handed Making card shows “With” and the name
- [ ] 1.2 A Making card that has not been handed over shows no such mark
- [ ] 1.3 Ideas, Chosen, and Ready do not show it

### 2. Filter
- [ ] 2.1 Making can be limited to cards that have been handed over
- [ ] 2.2 Clearing that limit shows the column as it did before
- [ ] 2.3 The filter lasts for the sitting, the same way the topic filter does

### 3. Verification
- [ ] 3.1 A test renders the name on a handed Making card and not on a thought
- [ ] 3.2 A test shows the filter hides a Making card that was not handed over

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialBoard.tsx`
- ⚠️ The social board test that already covers card marks

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- ED-1.
- The mark is a label. It does not move the card.

---

**Last Updated:** 2026-10-31
**Status:** ⏳ PENDING
