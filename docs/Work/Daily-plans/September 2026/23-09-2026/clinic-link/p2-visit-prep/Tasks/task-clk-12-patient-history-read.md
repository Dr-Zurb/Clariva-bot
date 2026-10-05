# Task clk-12: Public history read

## 📋 Task Overview

The prep page loads an empty form. It never receives the chart. After the patient has sent the lists, the same link is read-only. A desk row hides the three lists and still shows the chips.

**Program / Phase:** clinic-link · Phase 2 (visit-prep)
**Batch:** [`plan-p2-clinic-link-visit-prep-batch.md`](../plan-p2-clinic-link-visit-prep-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-clinic-link-visit-prep.md`](./EXECUTION-ORDER-p2-clinic-link-visit-prep.md)
**Estimated Time:** 4 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **New feature** — public read of prep state

**Current State:**
- ✅ **What exists:** Doctor and desk reads of the sidecar. Chart tables for allergies, medicines, and conditions. clk-11 will own the patient POST.
- ❌ **What's missing:** a token-scoped GET that does not select those chart tables.
- ⚠️ **Notes:** Waits on clk-11. Rate-limit this route the way other public patient routes are limited.

**Scope Guard:**
- Expected files touched: ≤ 5 (route, controller, the read next to clk-11, `CONTRACTS.md`, one test)
- Do not return chart rows, patient name, phone, or age
- Do not let a booking token or a join token open this read
- Do not change the desk history screen

**Reference Documentation:**
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — read of the sidecar and the chip column only
- [x] **RLS verified?** Y — service role, scoped to the appointment on the token. No chart-table read.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Empty until they send
- [x] 1.1 No sidecar row: the three lists are empty. Do not query the chart.
- [x] 1.2 A patient row already stored: the response is read-only (“already sent”), not an editor
- [x] 1.3 A `front_desk` or `assistant` row: the three lists are omitted. Chips remain readable and still writable by clk-11

### 2. Closed door
- [x] 2.1 Wrong kind, bad signature, expired, and cancelled do not return list data
- [x] 2.2 Note the read in `CONTRACTS.md`

### 3. Verification
- [x] 3.1 Unit test: chart tables are not read; desk row omits the lists; booking token fails
- [x] 3.2 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ Public history route — MISSING until clk-11, then extend
- ⚠️ `CONTRACTS.md` — EXISTS
- ❌ Read test — MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Zod on the query before the service.
- Response uses the canonical success helper.
- HL-DL-8: a leaked link must not dump the allergy list from the chart.
- No PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [x] First open is an empty form
- [x] After a patient submit, the link does not accept another list edit
- [x] A desk row hides medicines, allergies, and conditions
- [x] A booking token gets no lists

---

## 📝 Notes

The screen that calls this read is `clk-13`.

---

## 🔗 Related Tasks

- [`task-clk-11-patient-history-write.md`](./task-clk-11-patient-history-write.md)
- [`task-clk-13-prep-screen-and-sms.md`](./task-clk-13-prep-screen-and-sms.md)

**Last Updated:** 2026-09-23
