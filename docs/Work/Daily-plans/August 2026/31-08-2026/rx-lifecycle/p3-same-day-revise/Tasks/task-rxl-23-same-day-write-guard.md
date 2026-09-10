# Task rxl-23: Same-day write guard

> **Model:** executed on Grok 4.6 at owner override 2026-09-10 (Opus gate waived).

---

## 📋 Task Overview

Replace the condition in `assertPrescriptionContentWritable` with one sentence:

> Writable iff **not superseded** AND (**not yet issued** OR **issued today**).

"Today" is the clinic-local day (RXL-DL-14). Boundary is RXL-Q7 — **06:00 next morning** in `getDoctorTimezone` (fallback `Asia/Kolkata`). `localDayUtcRange` (desk midnight) is not reused.

Day clock: `issued_at`, else `attested_at`. Finish still only stamps `attested_at`; a requisition `printed_at` does not lock a draft.

**Program / Phase:** rx-lifecycle · Phase 3-B
**Batch:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../plan-p3-rx-lifecycle-same-day-revise-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
**Status:** ✅ **IMPLEMENTED** 2026-09-10
**Completed:** 2026-09-10

**Change Type:**
- [x] **Update existing** — service-layer guard

**Scope Guard:** Guard + its tests + audited readers. No clone logic. No cockpit copy. No new migration.

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 Q7 implemented as 06:00 (recommended default).
- [x] 1.2 Readers: this guard changed; `rxLoadDecision` left for `rxl-24`; combo service left.

### 2. Guard
- [x] 2.1 Server clock + doctor TZ. Timezone loaded only when a stamp exists (draft autosave unchanged).
- [x] 2.2 Superseded refuses even if issued today.
- [x] 2.3 Previous clinic day refuses regardless of client clock.
- [x] 2.4 Unissued draft on an open visit stays writable.
- [x] 2.5 Same-day attested + `completed` is writable.

### 3. Verification
- [x] 3.1 Unit cases: draft · issued-today · issued-yesterday · superseded · 06:00 cutoff · cancelled.
- [x] 3.2 `tsc` + lint + targeted suites.

---

## 📁 Files

```
CREATE: backend/src/utils/clinic-visit-day.ts
CREATE: backend/src/services/prescription-write-guard.ts
CREATE: backend/tests/unit/utils/clinic-visit-day.test.ts
CREATE: backend/tests/unit/services/prescription-write-guard.test.ts
UPDATE: backend/src/services/prescription-service.ts
UPDATE: backend/tests/unit/services/prescription-attest-guard.test.ts
```

---

**Not this task:** load-decision flip (`rxl-24`); UI strip.

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10
