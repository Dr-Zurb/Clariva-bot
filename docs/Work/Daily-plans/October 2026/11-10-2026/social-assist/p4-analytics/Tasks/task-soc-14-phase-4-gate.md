# Task soc-14: Phase 4 gate

## 📋 Task Overview

Walk the Phase 4 gate with a dummy booking. Fix only what fails that gate.

**Program / Phase:** social-assist · Phase 4 (analytics)
**Batch:** [`plan-p4-social-assist-analytics-batch.md`](../plan-p4-social-assist-analytics-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-social-assist-analytics.md`](./EXECUTION-ORDER-p4-social-assist-analytics.md)
**Estimated Time:** 2 hours
**Status:** ✅ **COMPLETED** — recorded 2026-10-11 from the card tests and a dummy checkout. The live browser booking is still open on `soc-12`.

**Change Type:**
- [x] **Update existing** — only if the gate fails

**Current State:**
- ✅ **What exists:** the link, the posted list, the visit count, and Use again, after `soc-12` and `soc-13`.
- ❌ **What's missing:** a recorded pass.
- ⚠️ **Notes:** Dummy patient only. Do not use a real chart.

**Scope Guard:**
- Do not add reach or an Instagram read to make Analytics look fuller

**Reference Documentation:**
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — one dummy booking, only if you walk `soc-12` in the browser
- [x] **RLS verified?** Y — inherited
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Walk the gate
- [x] ✅ 1.1 A timed card shows `/d/:slug` plus a code, and the code still opens the next day - **Completed: 2026-10-11**
- [x] ✅ 1.2 Pasting an Instagram URL moves the card to Analytics and off Schedule - **Completed: 2026-10-11**
- [x] ✅ 1.3 A dummy booking from that link adds one visit. A booking without the code does not. - **Completed: 2026-10-11**
- [x] ✅ 1.4 The card row has no patient name or phone - **Completed: 2026-10-11**
- [x] ✅ 1.5 Use again lands a new card in Thoughts and ideas and does not post - **Completed: 2026-10-11**
- [x] ✅ 1.6 Insights post funnel still loads. A one-hour chat code still expires. - **Completed: 2026-10-11**
- [x] ✅ 1.7 Check the Phase 4 boxes in the batch plan, with the date - **Completed: 2026-10-11**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Dummy name and phone only, and they stay on the appointment, not on the card.

---

**Last Updated:** 2026-10-11
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
