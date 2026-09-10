# Task rxl-27: Versioned PDF filename

> **Model:** executed on Grok 4.6 at owner override 2026-09-10.

---

## 📋 Task Overview

`getPrescriptionPdfHandler` today sets a static name:

```
Content-Disposition: inline; filename="prescription.pdf"
```

Two sends then look identical on WhatsApp. Change it to carry the clinic-local date and version, e.g. `prescription-9sep2026-v2.pdf`.

**Program / Phase:** rx-lifecycle · Phase 3-C
**Batch:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../plan-p3-rx-lifecycle-same-day-revise-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
**Estimated Time:** ~1 hour
**Status:** ✅ **IMPLEMENTED** 2026-09-10
**Completed:** 2026-09-10

**Change Type:**
- [x] **Update existing** — response header + send-attachment filename

**Scope Guard:** Filename on print GET and on send. Do not change the storage path (`${doctorId}/${prescriptionId}.pdf`). Do not change footer copy.

**Reference:** RXL-DL-11

---

## ✅ Task Breakdown

- [x] 1. Print and send use the same pattern.
- [x] 2. Two sends of Version 1 vs Version 2 produce distinguishable names.
- [x] 3. Unversioned historical rows still get a date-bearing name (no fabricated `v1` unless `version` is set).
- [x] 4. `tsc` + lint + handler tests.

---

## 📁 Files

```
CREATE: backend/src/utils/prescription-pdf-filename.ts
CREATE: backend/tests/unit/utils/prescription-pdf-filename.test.ts
UPDATE: backend/src/controllers/prescription-controller.ts
UPDATE: backend/src/services/notification-service.ts
UPDATE: backend/tests/unit/controllers/prescription-pdf-url-handler.test.ts
UPDATE: frontend/lib/api.ts
UPDATE: frontend/components/cockpit/rx/useRxCommitActions.ts
UPDATE: frontend/components/cockpit/rx/__tests__/useRxCommitActions.test.tsx
```

Instagram/WhatsApp file send still uses the storage key (unchanged). Email + print GET share `prescriptionPdfFilenameFromRow`. Cockpit download reads `Content-Disposition` from GET `/pdf`.

---

**Not this task:** footer text; storage key.

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10
