# Task rxl-08: Carry-forward must see a same-appointment sibling

> **Model:** executed on Grok 4.6 at owner override 2026-09-10.

---

## 📋 Task Overview

The subjective carry-forward query deliberately excludes the current **appointment** so a visit does not seed itself. Once a continuation note lives under that same appointment, that exclusion filters out the very note the doctor wants to carry from — the one they wrote an hour ago. Change the exclusion from appointment-scoped to prescription-scoped.

> **Re-scope 2026-09-10 (same-day revise):** resolve to the current **non-superseded** version of the last visit. Same-day labs-and-return is the same draft — carry is for a sibling / later encounter, not for revising today's slip.

**Program / Phase:** rx-lifecycle · Phase 2 (append notes)
**Batch:** [`plan-p2-rx-lifecycle-append-notes-batch.md`](../plan-p2-rx-lifecycle-append-notes-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md`](./EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md)
**Estimated Time:** ~2 hours
**Status:** ✅ **IMPLEMENTED** 2026-09-10
**Completed:** 2026-09-10

**Change Type:**
- [x] **Update existing** — changes one query predicate and its callers' contract; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Scope Guard:** ≤ 5 files. Do not change what fields carry forward, the ordering, the limit, or the "has usable subjective" predicate. Do not change the frontend affordances. This is an exclusion-key change and nothing else.

**Reference:** product plan RXL-DL-3, RXL-DL-6 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 `rxl-07` merged, so a same-appointment sibling can actually exist.
- [x] 1.2 Both self-seed exclusions: `getLastSubjectiveForPatient` and `getLastPrescriptionInEpisode`. `getLastVisitSummary` stays appointment-scoped (`lvc`).
- [x] 1.3 Callers pass the current prescription id when the form has one; null widens.

### 2. Change the exclusion
- [x] 2.1 Exclude the current prescription rather than the current appointment.
- [x] 2.2 Null-id does not add an `id` predicate.
- [x] 2.3 Both queries skip `superseded_by_id IS NOT NULL`. Zod query params: `excludePrescriptionId`.

### 3. Verification
- [x] 3.1 Sibling under the same appointment is visible once the working note is excluded by id.
- [x] 3.2 A note never seeds from itself when `excludePrescriptionId` is set.
- [x] 3.3 Cross-visit carry still works (newest non-superseded other note).
- [x] 3.4 Both controls use the same exclude key.
- [x] 3.5 Targeted jest + vitest + `tsc` + eslint on touched src (validation.ts has pre-existing unused-var reds, not this task).

---

## 📁 Files

```
UPDATE: backend/src/services/prescription-service.ts
UPDATE: backend/src/utils/validation.ts
UPDATE: backend/src/controllers/prescription-controller.ts
UPDATE: frontend/lib/api.ts
UPDATE: frontend/lib/api/last-subjective.ts
UPDATE: frontend/components/cockpit/rx/subjective/CarryForwardButton.tsx
UPDATE: frontend/components/consultation/PrescriptionForm.tsx
CREATE: backend/tests/unit/services/prescription-last-in-episode.test.ts
UPDATE: backend/tests/unit/services/prescription-last-subjective.test.ts
UPDATE: frontend/components/cockpit/rx/subjective/__tests__/CarryForwardButton.test.tsx
```

`getLastVisitSummary` (`lvc-01`) still excludes by appointment. Desk last-visit vitals prefetch still omits `excludePrescriptionId` (no working id yet).

---

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10
