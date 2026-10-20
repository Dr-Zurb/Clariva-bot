# Task soc-27: Words survive a format change

## 📋 Task Overview

Switching Post, Reel, or Story and saving keeps the words of the formats that are now hidden. A caption may be 2200 characters.

**Program / Phase:** social-assist · Phase 8 (studio)
**Batch:** [`plan-p8-social-assist-studio-batch.md`](../plan-p8-social-assist-studio-batch.md)
**Execution order:** [`EXECUTION-ORDER-p8-social-assist-studio.md`](./EXECUTION-ORDER-p8-social-assist-studio.md)
**Estimated Time:** 2 hours
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — a save currently keeps only the current format’s fields

**Current State:**
- ✅ **What exists:** Words for every format, plus the note, on the same card. The note already survives a format save.
- ❌ **What's missing:** Nothing for this task. A save keeps every format’s words. A caption may be 2200 characters.
- ⚠️ **Notes:** Ready still posts the fields of the current format. Hidden words are kept, not shown as the post.

**Scope Guard:**
- Expected files touched: ≤ 4
- Do not add a new words key
- Do not change what Ready is allowed to publish

**Reference Documentation:**
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — `words` on the doctor’s card
- [x] **RLS verified?** Y — the existing doctor scope stays
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Save
- [x] ✅ 1.1 Saving a format keeps the other format’s words already on the card - **Completed: 2026-10-15**
- [x] ✅ 1.2 The note still stays - **Completed: 2026-10-15**
- [x] ✅ 1.3 A caption of 2200 characters is accepted. 2201 is refused - **Completed: 2026-10-15**
- [x] ✅ 1.4 The contract states the 2200 limit - **Completed: 2026-10-15**

### 2. Verification
- [x] ✅ 2.1 A test writes a reel, switches to Post, saves, switches back, and the hook is still there - **Completed: 2026-10-15**
- [x] ✅ 2.2 Unknown words keys are still rejected - **Completed: 2026-10-15**

---

## 📁 Files to Create/Update

- ⚠️ `backend/src/controllers/social-card-controller.ts`
- ⚠️ `frontend/components/dashboard/social/SocialCardPanel.tsx`
- ⚠️ `docs/Reference/engineering/architecture/CONTRACTS.md`
- ⚠️ The social card tests that cover a format save

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No new column and no new words key.
- Validate the length in the controller before the service.
- Do not log the caption or the note.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
