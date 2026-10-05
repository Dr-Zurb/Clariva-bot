# Task clk-24: Phase 4 gate

## 📋 Task Overview

Walk the Phase 4 acceptance gate on dummy visits. Record what passed. Do not add behavior.

**Program / Phase:** clinic-link · Phase 4 (show up ready)
**Batch:** [`plan-p4-clinic-link-show-up-batch.md`](../plan-p4-clinic-link-show-up-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-clinic-link-show-up.md`](./EXECUTION-ORDER-p4-clinic-link-show-up.md)
**Estimated Time:** 3 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **Update existing** — check the gate and the task boxes

**Current State:**
- ✅ **What exists:** clk-20 through clk-23, once they are done.
- ❌ **What's missing:** a recorded pass of the batch gate.
- ⚠️ **Notes:** Dummy visits only. Cancel them afterward. Do not configure Twilio.

**Scope Guard:**
- Expected files touched: the batch plan gate checkboxes and a short note of commands
- Do not add a feature to make the gate pass
- If a box fails, stop and name the task that owns the fix

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — dummy appointments, then cancelled
- [x] **RLS verified?** Y — same tokens as clk-20 and clk-21
- [x] **Any PHI in logs?** No — confirm logs have no token, name, phone, or prep URL
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N — cancel the dummy visits when the walk is done

---

## ✅ Task Breakdown

### 1. Walk the gate
- [x] 1.1 A video dummy visit shows the video sentence on the prep page, on `/my-visit`, and on the waiting room. The mic check is the existing one. Skip does not cancel.
- [x] 1.2 A voice visit shows only the voice sentence. An in-clinic visit shows only the papers sentence. A text visit shows none.
- [x] 1.3 Share from the prep page and from the hub produces `/book/prep?t=`. The join URL is not shared. A snapshot response has no prep token.
- [x] 1.4 A follow-up whose desk list would show an open test still sees no label. Reminder copy is unchanged.
- [x] 1.5 Logs have no token, name, phone, or prep URL.

### 2. Record
- [x] 2.1 Check the batch gate boxes with the date
- [x] 2.2 Note the typecheck, lint, and test commands that ran

---

## 📁 Files to Create/Update

- ⚠️ [`plan-p4-clinic-link-show-up-batch.md`](../plan-p4-clinic-link-show-up-batch.md) — gate checkboxes

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No new routes, columns, or copy in this task.
- Dummy data only.
- No PHI in the gate note.

---

## ✅ Acceptance & Verification Criteria

- [x] Every batch gate box is checked or a blocking task is named
- [x] Commands are recorded

---

## 📝 Notes

Walked 2026-09-27. Dummy visits were cancelled afterward. Commands are on the batch plan.

This is the last tasked phase of the clinic-link program. The order list stays a later task, after the desk pending list is a patient-safe read. Live SMS stays open because Twilio is not configured.

---

## 🔗 Related Tasks

- [`task-clk-21-share-prep-url.md`](./task-clk-21-share-prep-url.md)
- [`task-clk-22-video-line-on-waiting-room.md`](./task-clk-22-video-line-on-waiting-room.md)
- [`task-clk-23-order-list-stays-dark.md`](./task-clk-23-order-list-stays-dark.md)

**Last Updated:** 2026-09-27
