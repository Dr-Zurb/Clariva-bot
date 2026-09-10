# Task rxl-24: Load today's issued note

> **Model:** executed on Grok 4.6 at owner override 2026-09-10 (Opus gate waived).

---

## 📋 Task Overview

`resolveRxLoadDecision` (`rxl-07`) returned `continue` (fresh empty form + subjective carry) whenever the newest note was attested. Under same-day revise that is wrong for **today's** note: the doctor is still on the same slip.

Adopt today's note even when it is issued. A later clinic day, a superseded row, or a cancelled / no-show visit is **review** (read-only), not a Phase 2 continuation. Fresh empty form only when this appointment has no note. Front-desk re-check-in is a different appointment (RXL-DL-15).

**Program / Phase:** rx-lifecycle · Phase 3-B
**Batch:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../plan-p3-rx-lifecycle-same-day-revise-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
**Estimated Time:** ~3 hours
**Status:** ✅ **IMPLEMENTED** 2026-09-10
**Completed:** 2026-09-10

**Change Type:**
- [x] **Update existing** — load decision only

**Current State:**
- ✅ `rxl-07` / `noteClosed` continuation path exists.
- ✅ Phase 3-A (`rxl-19`) stopped visit-status from re-locking a continuation.
- ✅ `rxl-23` write guard already allows same-day edits of an issued, not-superseded row.
- ✅ Same-day issued newest → `adopt` with `noteClosed: false`. Later day / superseded → `review` with `noteClosed: true`. Opening does not mint.

**Scope Guard:** `rxLoadDecision` + its tests + the provider that consumes it. Do not change the write guard. Do not build the revise strip (`rxl-25`). Cross-day past-visit UI is `lvc`, not this task.

**Reference:** RXL-DL-4, DL-6 (narrowed to the no-clock leftover), DL-14, DL-15

---

## ✅ Task Breakdown

### 1. Decision table
- [x] 1.1 Same day, draft → adopt (already).
- [x] 1.2 Same day, issued, not superseded → adopt, `noteClosed: false`.
- [x] 1.3 Same day, viewing a superseded row → `review` (read-only).
- [x] 1.4 Later clinic day → `review` (read-only). Past-visit (`lvc`) still owns a dedicated surface.
- [x] 1.5 Front-desk new visit the same day → own appointment, own note. Load stays scoped to `appointment_id`.

### 2. Verification
- [x] 2.1 Unit cases for the table above + clinic-day helper + provider hook.
- [x] 2.2 Opening a finished chart from today writes nothing until the doctor edits (RXL-DL-4 — adopt is a read; no `createPrescription`).
- [x] 2.3 Targeted vitest + eslint on the touched files. Repo-wide `tsc` still has pre-existing reds outside this change.

---

## 📁 Files

```
CREATE: frontend/lib/clinic-visit-day.ts
CREATE: frontend/lib/__tests__/clinic-visit-day.test.ts
UPDATE: frontend/components/cockpit/rx/rxLoadDecision.ts
UPDATE: frontend/components/cockpit/rx/useRxFormProviderSetup.ts
UPDATE: frontend/components/cockpit/rx/__tests__/rxLoadDecision.test.ts
UPDATE: frontend/components/cockpit/rx/__tests__/useRxFormProviderSetup.rxl07.test.tsx
```

---

**Not this task:** clone, footer, filename, history list, revise strip.

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10
