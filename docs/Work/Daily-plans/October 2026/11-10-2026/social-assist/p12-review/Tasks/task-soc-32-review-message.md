# Task soc-32: A message about a moment or a stretch

## 📋 Task Overview

The doctor can save one instruction on a handed Making card. The instruction can name a moment in the video, or a start and an end, and it can point at one file already on Resources.

**Program / Phase:** social-assist · Phase 12 (review)
**Batch:** [`plan-p12-social-assist-review-batch.md`](../plan-p12-social-assist-review-batch.md)
**Execution order:** [`EXECUTION-ORDER-p12-social-assist-review.md`](./EXECUTION-ORDER-p12-social-assist-review.md)
**Estimated Time:** 4 hours
**Status:** ⏳ **PENDING**

**Change Type:**
- [x] **New feature** — the card has no review thread

**Current State:**
- ✅ **What exists:** The handoff from `soc-31`. Resources (scraps) and the file that posts, each with a signed read URL for this doctor.
- ❌ **What's missing:** A message the doctor can save against that card.
- ⚠️ **Notes:** This does not change the video. Pointing at a Resource does not make it the file that posts.

**Scope Guard:**
- Expected files touched: ≤ 8
- No player and no composer (`soc-33`)
- No upload from this task. The Resource must already be on the card.
- Do not log the instruction

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** Y — the doctor’s own instruction. A doctor might type a patient detail, so the text is sensitive even though the table is not a patient record.
- [ ] **RLS verified?** Y — required. Same owner as the card.
- [ ] **Any PHI in logs?** No
- [ ] **External API or AI call?** N
- [ ] **Retention / deletion impact?** Y — deleting the card deletes its messages. Leaving Making clears the handoff and its messages.

---

## ✅ Task Breakdown

### 1. Message
- [ ] 1.1 A handed Making card can store a line from the doctor, in order
- [ ] 1.2 The line may name one moment, or a start and an end, on the file that will be in the player
- [ ] 1.3 The line may point at one Resource already on that card. A missing Resource is refused
- [ ] 1.4 A line with an end before its start is refused. A line with neither a moment nor a stretch is still allowed
- [ ] 1.5 The file that posts is unchanged

### 2. Access
- [ ] 2.1 Only that doctor can read and write the lines
- [ ] 2.2 The line is not logged
- [ ] 2.3 Clearing the handoff removes the lines

### 3. Verification
- [ ] 3.1 A test saves “shorten this” from one time to a later time and reads it back in order
- [ ] 3.2 A test points a line at a Resource on the card and refuses a Resource from another card
- [ ] 3.3 A test shows the posting file is the same after the line is saved

---

## 📁 Files to Create/Update

- ⚠️ The migration that follows `soc-31`, or the same migration if `soc-31` has not been applied yet. Do not fork two styles.
- ⚠️ `backend/src/services/social-card-service.ts`
- ⚠️ `backend/src/controllers/social-card-controller.ts`
- ⚠️ `backend/src/routes/api/v1/social-cards.ts`
- ⚠️ [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)
- ⚠️ [DB_SCHEMA.md](../../../../../../../Reference/engineering/architecture/DB_SCHEMA.md)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- ED-2, ED-3, ED-4.
- The moment and the stretch describe the file under review. They do not create a new cut.
- “Add this” is a Resource pointer plus words. It is not an edit.

---

**Last Updated:** 2026-10-31
**Status:** ⏳ PENDING
