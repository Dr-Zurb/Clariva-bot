# Task rxl-28: History shows versions

> **Model:** executed on Grok 4.6 at owner override 2026-09-10.

---

## 📋 Task Overview

Visit history must list versions of a note: Version 1 marked superseded, Version 2 current, both reprintable. This is where a doctor (and later the share link, RXL-Q9) confirms the old paper is stale.

**Depends on `rxl-09`** (history lists notes, not visits) — implemented in the same sitting.

**Program / Phase:** rx-lifecycle · Phase 3-C
**Batch:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../plan-p3-rx-lifecycle-same-day-revise-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
**Estimated Time:** ~3 hours
**Status:** ✅ **IMPLEMENTED** 2026-09-10
**Completed:** 2026-09-10

**Change Type:**
- [x] **Update existing** — history rows only

**Scope Guard:** History surface. No inline field-level diff (RXL-Q5 — compare on demand, later). No share-link work (out of program; Q9 is a recommendation only). Opening a superseded row is read-only and must not adopt it as the live form.

**Reference:** RXL-DL-12, Q5, Q9 · `rxl-09`

---

## ✅ Task Breakdown

- [x] 1. `rxl-09` merged. Else **STOP**.
- [x] 2. Two versions under one appointment render as two dated rows with version + superseded state.
- [x] 3. Reprint of Version 1 still returns Version 1's bytes.
- [x] 4. Opening Version 1 from history does not make the cockpit writable.
- [x] 5. `tsc` + lint + history suites.

---

## 📁 Files

```
CREATE: frontend/components/patient-profile/historyNoteMeta.ts
CREATE: frontend/components/patient-profile/panes/__tests__/HistoryPane.notes.test.tsx
UPDATE: frontend/components/patient-profile/panes/HistoryPane.tsx
UPDATE: frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx
UPDATE: frontend/components/patient-profile/side-sheets/__tests__/VisitDetailSideSheet.test.tsx
```

Reprint stays `getPrescriptionPdfUrl(rxId)` — storage key is per prescription id, so Version 1's button asks for Version 1.

---

**Not this task:** `lvc` past-visit strip; share-link chrome.

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10
