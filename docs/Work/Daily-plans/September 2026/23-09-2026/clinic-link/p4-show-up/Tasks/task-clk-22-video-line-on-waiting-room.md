# Task clk-22: Video line beside the existing mic check

## 📋 Task Overview

The video waiting room shows the video arrival sentence next to the camera and mic check that is already there. A failed or skipped check stays on that page and does not cancel the visit.

**Program / Phase:** clinic-link · Phase 4 (show up ready)
**Batch:** [`plan-p4-clinic-link-show-up-batch.md`](../plan-p4-clinic-link-show-up-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-clinic-link-show-up.md`](./EXECUTION-ORDER-p4-clinic-link-show-up.md)
**Estimated Time:** 2 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **Update existing** — one sentence on `PatientVideoWaitingRoom`

**Current State:**
- ✅ **What exists:** `PatientVideoWaitingRoom` renders `VideoConsultPreCall` while the visit is still a lobby. Continue and “Skip mic check” cache a camera and mic choice. Denied permissions stay on the check. No Twilio room is created by the check. `PatientVideoWaitingRoom.test.tsx` already renders that check.
- ❌ **What's missing:** the video arrival sentence on this page.
- ⚠️ **Notes:** Waits on clk-20 for the sentence module. Do not rebuild the check.

**Scope Guard:**
- Expected files touched: ≤ 3 (the waiting room, its test, and the import of the clk-20 copy)
- Do not add `getUserMedia` anywhere new
- Do not cancel the appointment from Continue, Skip, or a denied permission
- Do not add a mic check to the prep page or to the voice lobby

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **RLS verified?** Y — no new read
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. The sentence
- [ ] 1.1 The waiting room shows the video sentence from the clk-20 module, both before the check is finished and after it.
- [ ] 1.2 Voice and in-clinic sentences are not shown here. This page is the video room.

### 2. The check stays
- [ ] 2.1 Continue, “Skip mic check”, and a denied permission do not call an appointment cancel.
- [ ] 2.2 The existing pre-call component stays the one that acquires the devices.

### 3. Verification
- [ ] 3.1 Extend the waiting-room test: the video sentence is present, and neither Continue nor Skip calls a cancel
- [ ] 3.2 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/consultation/PatientVideoWaitingRoom.tsx` — EXISTS
- ⚠️ `frontend/components/consultation/__tests__/PatientVideoWaitingRoom.test.tsx` — EXISTS
- ⚠️ Arrival-line module from clk-20 — EXISTS once that task lands

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Import the sentence. Do not copy it into this file.
- Failure stays on this page. The appointment status is unchanged.
- No PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [ ] A video dummy patient can see the video sentence and the mic check on the waiting room
- [ ] Skip and a denied device leave the appointment uncancelled

---

## 📝 Notes

The check itself shipped with consult-room check-in. This task only places the sentence and locks the “does not cancel” rule.

---

## 🔗 Related Tasks

- [`task-clk-20-arrival-lines.md`](./task-clk-20-arrival-lines.md)
- [`task-clk-24-phase-4-gate.md`](./task-clk-24-phase-4-gate.md)

**Last Updated:** 2026-09-27
