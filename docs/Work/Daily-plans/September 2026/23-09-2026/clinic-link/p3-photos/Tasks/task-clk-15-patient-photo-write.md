# Task clk-15: Patient photo write

## 📋 Task Overview

A valid history-form token can store one photo or PDF on the visit. The file uses the patient path and does not go through the desk upload.

**Program / Phase:** clinic-link · Phase 3 (photos)
**Batch:** [`plan-p3-clinic-link-photos-batch.md`](../plan-p3-clinic-link-photos-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-clinic-link-photos.md`](./EXECUTION-ORDER-p3-clinic-link-photos.md)
**Estimated Time:** 6 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **New feature** — public patient upload

**Current State:**
- ✅ **What exists:** `visit_documents` already allows `source = patient`. Desk writes `{doctor_id}/desk/{appointment_id}/` and refuses the upload until check-in. The history-form token verifies kind, expiry, and a cancelled visit. Migration `243` already documents `patients.id` on `actor_id`.
- ❌ **What's missing:** a token-scoped write that stores `{doctor_id}/patient/{appointment_id}/…` before check-in.
- ⚠️ **Notes:** This is the file write. Read `COMPLIANCE.md` first. Do not add a migration.

**Scope Guard:**
- Expected files touched: ≤ 6 (validation, controller, a patient upload beside the desk service, the route, `CONTRACTS.md`, one test)
- Do not call `loadWritableAppointment` or the desk create
- Do not write a `…/desk/…` path or a new bucket
- Do not call extract or promote
- Do not log the filename, the bytes, or the token

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — one `visit_documents` row, one page, one private object. PHI: the image.
- [x] **RLS verified?** Y — service-role write, scoped to the appointment the token resolved. No patient JWT insert policy.
- [x] **Any PHI in logs?** No — appointment id and a count only
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** Y — the object lives until a later delete (`clk-16`) or the appointment cleanup the desk already uses. No new retention rule.

---

## ✅ Task Breakdown

### 1. Token, then bytes
- [x] 1.1 Verify the history-form token before any storage call. A booking token, a join token, an expired token, or a cancelled visit stores nothing.
- [x] 1.2 One file per request. Allowed types match the desk list: jpeg, png, webp, pdf. Reject a body over 10 MB.
- [x] 1.3 Insert `source = patient`, `actor_id = patients.id`, `ordered_by = outside`. A medicine strip is `document_type = other`. The other five existing types stay available. Do not add a type.
- [x] 1.4 Object path is `{doctor_id}/patient/{appointment_id}/{uuid}-{safe name}` in `prescription-attachments`. The stored name is not the raw client filename.

### 2. Cap
- [x] 2.1 At most five `visit_documents` rows with `source = patient` on that appointment. The sixth is 409. Desk pages do not count toward the five.
- [x] 2.2 Check-in is not required. A checked-in visit may still receive a patient file until the token window ends.

### 3. Verification
- [x] 3.1 Unit test: path prefix, source, ordered_by, actor id, the sixth file, a booking token, and that the desk create is not called
- [x] 3.2 Typecheck and lint the touched files
- [x] 3.3 Contract note for the patient upload

---

## 📁 Files to Create/Update

- ⚠️ Desk `visit-documents-service.ts` — EXISTS, do not call its check-in gate from this path
- ❌ Patient upload — MISSING
- ⚠️ `CONTRACTS.md` — EXISTS

**When updating existing code:**
- [x] Leave `assertDeskPath` and the 24-page desk ceiling as they are
- [x] Add no RLS policy

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Zod before the service. The controller does not talk to storage.
- Service-role write. Typed `AppError` only.
- No PHI in logs. Audit metadata is ids and a count.

---

## ✅ Acceptance & Verification Criteria

- [x] One dummy file is stored on the patient prefix before check-in
- [x] Desk rows and desk paths are unchanged
- [x] A sixth patient file and a bad token do not store an object

---

## 📝 Notes

CLK-DL-11, CLK-DL-12, CLK-DL-10. The public list and delete are `clk-16`. The page is `clk-17`.

---

## 🔗 Related Tasks

- [`task-clk-16-patient-photo-read-delete.md`](./task-clk-16-patient-photo-read-delete.md)
- [`task-clk-18-doctor-patient-group.md`](./task-clk-18-doctor-patient-group.md)

**Last Updated:** 2026-09-27
