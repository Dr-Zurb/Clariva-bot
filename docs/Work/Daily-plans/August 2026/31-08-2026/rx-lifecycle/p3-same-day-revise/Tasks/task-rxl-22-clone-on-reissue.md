# Task rxl-22: Clone parent + children on re-issue

> **Model:** executed on Grok 4.6 at owner override 2026-09-10 (Opus gate waived).

---

## 📋 Task Overview

When a finished same-day note is re-issued, create a **new** `prescriptions` row that is a copy of the working payload, link it to the issued row, bump `version`, and mark the previous row superseded. The doctor never sees two forms; they opened the slip and fixed it.

Content lives on the parent row plus `prescription_medicines` and `prescription_attachments` (migration `026`). Clone is a parent-row copy plus insert-many on both children.

**Program / Phase:** rx-lifecycle · Phase 3-B
**Batch:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../plan-p3-rx-lifecycle-same-day-revise-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
**Estimated Time:** ~6 hours
**Status:** ✅ **IMPLEMENTED** 2026-09-10
**Completed:** 2026-09-10

**Change Type:**
- [x] **New feature** — clone path; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Scope Guard:** Service + types. No migration. No write-guard rewrite (`rxl-23`). No cockpit strip (`rxl-25`). No PDF footer / filename.

**Attachments (RXL-Q10):** copy rows, share `file_path`. Erasure residual flagged on `deletePrescriptionAttachment` — behaviour unchanged.

**Reference:** RXL-DL-9, DL-10, DL-12, DL-13, Q10

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 `231` file landed. Apply on dev still operator (needed before dogfood, not before unit tests).
- [x] 1.2 Inventory in batch Recon §2. Clone list is `PRESCRIPTION_CLONE_CLINICAL_COLUMNS`.

### 2. Clone
- [x] 2.1 Entry point is `reissuePrescriptionAsRevision` — not `updatePrescription` / autosave. Send / Print / Finish wired in `rxl-25`.
- [x] 2.2 Same `appointment_id`, `patient_id`, `doctor_id`, `episode_id`.
- [x] 2.3 `version = (previous ?? 1) + 1`. Source null version becomes 1 when marked superseded.
- [x] 2.4 `supersedes_id` on the new row; `superseded_by_id` on the old row. Optimistic `.is('superseded_by_id', null)`; race deletes the orphan.
- [x] 2.5 Medicines + attachments copied. Attachment `file_path` shared.
- [x] 2.6 `revision_reason` required; presets in `REVISION_REASONS`.

### 3. Verification
- [x] 3.1 Builder test: every clinical column copied; identity / delivery stamps not blind-copied.
- [x] 3.2 V1 id unchanged; V2 is a new id (PDF path therefore new). No PDF write in this task.
- [x] 3.3 One re-issue → Version 2 (`nextRevisionVersion(null) === 2`).
- [x] 3.4 `tsc` + lint + `prescription-revision-clone` suite.

---

## 📁 Files

```
CREATE: backend/src/services/prescription-revision-service.ts
CREATE: backend/tests/unit/services/prescription-revision-clone.test.ts
UPDATE: backend/src/types/prescription.ts
UPDATE: frontend/types/prescription.ts
UPDATE: backend/src/services/prescription-attachment-service.ts  (RXL-Q10 comment only)
```

---

**Not this task:** relaxing `assertPrescriptionContentWritable`; load decision; UI; hooking send/print/finish.

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10
