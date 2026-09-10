# Task rxl-26: Slip footer replaces-line

> **Model:** executed on Grok 4.6 at owner override 2026-09-10.

---

## 📋 Task Overview

A pharmacist holding two papers needs to know which one is current. System text in the PDF footer, beside the existing short id (RXL-DL-11), never inside the doctor-configurable letterhead footer.

**Copy (paper, not engineer-speak):**

> Revised 6:40 PM, 9 Sep 2026 — replaces the slip issued 10:15 AM. Version 2.

Not `Edited h:mm a · Rev N`.

**Program / Phase:** rx-lifecycle · Phase 3-C
**Batch:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../plan-p3-rx-lifecycle-same-day-revise-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
**Estimated Time:** ~2 hours
**Status:** ✅ **IMPLEMENTED** 2026-09-10
**Completed:** 2026-09-10

**Change Type:**
- [x] **Update existing** — PDF footer only

**Scope Guard:** Footer renderer + tests. Must survive a custom letterhead footer and `hideHaloCredit`. No filename (`rxl-27`). No history UI (`rxl-28`).

**Reference:** RXL-DL-11, DL-12

---

## ✅ Task Breakdown

- [x] 1. Version 1 (never revised) has no replaces-line.
- [x] 2. Version N≥2 renders the line with the previous issue time and the new version.
- [x] 3. Letterhead / `hideHaloCredit` cannot suppress it. Preprinted still prints the system line.
- [x] 4. Targeted jest + eslint + `tsc`.

---

## 📁 Files

```
CREATE: backend/src/utils/prescription-replaces-line.ts
CREATE: backend/tests/unit/utils/prescription-replaces-line.test.ts
CREATE: backend/tests/unit/templates/prescription-pdf-footer.test.ts
UPDATE: backend/src/templates/prescription-pdf/Footer.tsx
UPDATE: backend/src/templates/prescription-pdf/types.ts
UPDATE: backend/src/services/prescription-pdf-service.ts
```

---

**Not this task:** `Content-Disposition` filename.

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10
