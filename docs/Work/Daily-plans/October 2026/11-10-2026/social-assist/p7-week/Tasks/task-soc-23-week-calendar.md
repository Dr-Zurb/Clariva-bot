# Task soc-23: The week of timed cards

## 📋 Task Overview

Schedule shows the week that contains today. Each timed Ready card is a chip on its day.

**Program / Phase:** social-assist · Phase 7 (week)
**Batch:** [`plan-p7-social-assist-week-batch.md`](../plan-p7-social-assist-week-batch.md)
**Execution order:** [`EXECUTION-ORDER-p7-social-assist-week.md`](./EXECUTION-ORDER-p7-social-assist-week.md)
**Estimated Time:** 3 hours
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — the day list from `soc-08`

**Current State:**
- ✅ **What exists:** a time on a Ready card (`soc-07`). A day list (`soc-08`) in `SocialSchedule.tsx`. Opening a row returns to that card.
- ✅ **What's missing:** Nothing for this task. The signed-in walk is `soc-24`, recorded 2026-10-15.
- ⚠️ **Notes:** A file preview on the chip is later. The sender is the next phase.

**Scope Guard:**
- Expected files touched: ≤ 4
- Do not call Instagram
- Do not add an hour grid, a media grid, a list toggle, or “+ New”

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — reads the time from `soc-07`
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Week
- [x] ✅ 1.1 Schedule opens on the week that contains today - **Completed: 2026-10-13**
- [x] ✅ 1.2 Previous, next, and Today move that week - **Completed: 2026-10-13**
- [x] ✅ 1.3 A chip shows the time, the format, and the title, in time order - **Completed: 2026-10-13**
- [x] ✅ 1.4 A day with no timed card stays blank. There is no “+ New” slot. - **Completed: 2026-10-13**
- [x] ✅ 1.5 Opening a chip returns to the same card - **Completed: 2026-10-13**
- [x] ✅ 1.6 When nothing is timed, the tab still says so - **Completed: 2026-10-13**

### 2. Verification
- [x] ✅ 2.1 Tests: two times in the current week land on those days - **Completed: 2026-10-13**
- [x] ✅ 2.2 Clearing the time removes the chip and leaves the day - **Completed: 2026-10-13**
- [x] ✅ 2.3 Signed-in walk — owned by `soc-24` - **Completed: 2026-10-15**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialSchedule.tsx`
- ⚠️ The schedule cases in `SocialClient.test.tsx`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Seven days, Sunday through Saturday. Chips sit at the top of the day.
- The time stays on the Ready card.
- No publish control on this page.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
