# Task soc-29: Mark ready and schedule

## 📋 Task Overview

The composer footer lists what is still missing. **Mark ready** uses the same rule as a drag onto Ready. On Ready, **Schedule** sets the time the week already shows.

**Program / Phase:** social-assist · Phase 8 (studio)
**Batch:** [`plan-p8-social-assist-studio-batch.md`](../plan-p8-social-assist-studio-batch.md)
**Execution order:** [`EXECUTION-ORDER-p8-social-assist-studio.md`](./EXECUTION-ORDER-p8-social-assist-studio.md)
**Estimated Time:** 3 hours
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — the Ready rule and the time already exist

**Current State:**
- ✅ **What exists:** A drag onto Ready refuses a missing file, a file that cannot post, or a missing format. A time on a Ready card. Removing the Ready file sends the card back to Making.
- ✅ **What's missing:** Nothing for this task. The footer checklist, **Mark ready**, and **Schedule** landed 2026-10-15.
- ⚠️ **Notes:** The week calendar does not change. The button and the drag must agree.

**Scope Guard:**
- Expected files touched: ≤ 4
- Do not send the file
- Do not add a second definition of what Ready accepts

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — stage and the existing time
- [x] **RLS verified?** Y — the existing doctor scope stays
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Making
- [x] ✅ 1.1 The footer names what is still missing: a format, a file, or a file that cannot post - **Completed: 2026-10-15**
- [x] ✅ 1.2 **Mark ready** stays off until a drag onto Ready would succeed - **Completed: 2026-10-15**
- [x] ✅ 1.3 **Mark ready** moves the card to Ready - **Completed: 2026-10-15**
- [x] ✅ 1.4 The stage request sends the stage only - **Completed: 2026-10-15**

### 2. Ready
- [x] ✅ 2.1 **Schedule** sets the time the week already shows - **Completed: 2026-10-15**
- [x] ✅ 2.2 Clearing the time leaves the card on Ready - **Completed: 2026-10-15**
- [x] ✅ 2.3 Removing the file still sends the card back to Making - **Completed: 2026-10-15**

### 3. Verification
- [x] ✅ 3.1 A test keeps **Mark ready** off when the file cannot post, and on when it can - **Completed: 2026-10-15**
- [x] ✅ 3.2 A test sets a time from the composer and the week shows it - **Completed: 2026-10-15**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialCardPanel.tsx`
- ⚠️ `frontend/components/dashboard/social/__tests__/SocialClient.test.tsx`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- One forward action. Making moves to Ready. Ready sets the time.
- No publish control.
- Do not log the title or the time as part of a caption.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
