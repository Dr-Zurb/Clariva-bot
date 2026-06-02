# Task oq-02: Frontend types + api client mapping

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 2, Lane β step 0 — **XS, ~1h**

---

## Task overview

Sync the frontend type to the widened backend payload shipped in `oq-01`. The frontend `DoctorQueueSessionRow` (in `frontend/types/opd-doctor.ts`) still references the dropped `patientLabel` field and is missing the eleven new fields. After this task, every consumer of the type compiles cleanly and has full PHI fields available; the actual *rendering* of those fields is `oq-03`.

**Estimated time:** ~1h. Pure type sync + a few-LOC mapping in `lib/api.ts`.

**Status:** Drafted.

**Hard deps:** [oq-01](./task-oq-01-backend-widen-queue-api.md) shipped (so the backend payload exists).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D1](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pure mechanical type sync.

**Why not Opus:** the type design was locked in `oq-01`'s Opus chat. This task just mirrors it on the frontend.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `backend/src/services/opd-doctor-service.ts` (post-oq-01 — to copy the type comment block verbatim into the frontend type).
- `frontend/types/opd-doctor.ts` (current).
- `frontend/lib/api.ts` (search for `getDoctorOpdQueueSession`).
- `frontend/hooks/useOpdSnapshot.ts` (read-only — verify no additional consumer-side mapping needed).

**Composer-OK sub-steps:** Composer can do the actual type rewrite if pre-loaded with the locked shape; the lib/api.ts mapping needs Sonnet for confidence.

**Estimated turns:** 1–2 Sonnet turns.

---

## Acceptance criteria

### `frontend/types/opd-doctor.ts`

- [ ] File rewrites `DoctorQueueSessionRow` to mirror the backend shape **including the privacy comment block** (copied verbatim from the backend type so the doctor-only contract is documented in both places):

  ```ts
  /**
   * Doctor-only OPD queue row.
   *
   * **Privacy contract (OQ-D1, OQ-D7):**
   * Mirrors backend/src/services/opd-doctor-service.ts § DoctorQueueSessionRow.
   * Returned ONLY for the authenticated doctor. The doctor is already authorized
   * to see full PHI on every adjacent surface; initials masking from e-task-opd-06
   * was a misapplied rule and is removed by OQ-D1.
   *
   * Any future patient-facing / receptionist / kiosk surface MUST consume a
   * different endpoint with its own filtered payload — DO NOT reuse this shape.
   */
  export interface DoctorQueueSessionRow {
    entryId: string;
    appointmentId: string;
    tokenNumber: number;
    position: number;
    queueStatus: string;
    sessionDate: string;
    queueCreatedAt: string;

    patientName: string;
    medicalRecordNumber: string | null;
    patientPhone: string;

    age: number | null;
    gender: string | null;

    appointmentStatus: string;
    scheduledAt: string;
    reasonForVisit: string | null;
    serviceLabel: string | null;
    catalogServiceKey: string | null;
    consultationType: string | null;

    episodeId: string | null;
    opdEventType: 'standard' | 'return_after_completed' | null;
  }
  ```

  **Removed from the type:** `patientLabel`, `appointmentDate`. **Added:** all the new fields above.

- [ ] No `patientLabel` references remain in `frontend/`. Verify with `cd frontend && rg -n "patientLabel" → 0 hits`.
- [ ] No `appointmentDate` references on `DoctorQueueSessionRow` remain — only on the hook's local variable names if they happen to coincide. Verify with `cd frontend && rg -n "\.appointmentDate" → checks unrelated`.

### `frontend/lib/api.ts`

- [ ] `getDoctorOpdQueueSession` keeps its current signature; the shape change is on `DoctorOpdQueueSessionData['entries']` which already references the now-widened `DoctorQueueSessionRow`. **No code changes expected** — this is a verification step.
- [ ] Add a one-line JSDoc above `getDoctorOpdQueueSession` linking to the privacy contract:

  ```ts
  /**
   * Doctor-only — returns the widened OQ-D1 payload (full PHI for the authenticated
   * doctor's session). See `frontend/types/opd-doctor.ts` for the privacy contract.
   */
  ```

### Type-check + lint

- [ ] `cd frontend && npx tsc --noEmit` passes — every consumer compiles against the new shape.
- [ ] **Expected fallout:** the existing `frontend/components/opd/DoctorQueueBoard.tsx` and `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` will type-error on the dropped `patientLabel` field. **DO NOT FIX** — those errors are a feature, not a bug. They'll be:
  - `DoctorQueueBoard.tsx` → deleted in `oq-04`.
  - `OpdQueueStrip.tsx` → patched in **the same PR as oq-02** with a one-line change: replace `entry.patientLabel` with `entry.patientName` (cockpit strip should also show full names per OQ-D1). Add a one-line truncate helper (already exists — `truncateLabel(text, 24)`) → `truncateLabel(entry.patientName, 24)`.
- [ ] After the cockpit strip patch, the codebase is type-clean again.

---

## Out of scope

- **Rendering the new fields** — `oq-03` (dense row) and `oq-04` (table shell).
- **Adding new fields not in `oq-01`** — if you find yourself adding a field that's not on the backend type, stop and update `oq-01` first.
- **Touching `OpdQueueStrip`'s grouping or behavior** — the only edit allowed in this task is the `patientLabel → patientName` substitution. The pf-12 strip stays as-is.
- **Migration of `useOpdSnapshot` itself** — it's already typed via `DoctorQueueSessionRow`; no changes needed.

---

## Files expected to touch

**New:** none.

**Modified:**
- `frontend/types/opd-doctor.ts` (~30 LOC delta — full rewrite of the interface)
- `frontend/lib/api.ts` (1 LOC — JSDoc only)
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` (1 LOC — `patientLabel → patientName` substitution)

**Deleted:** none.

---

## Notes / open decisions

1. **Why patch cockpit strip in this task and not in pf-12 follow-up.** Keeping the type-error window short is the priority. If we ship oq-02 without the strip patch, the codebase is broken. One line, same lane, same chat.
2. **`appointmentDate` rename collision.** A few cockpit / day-pipeline consumers grep for `appointmentDate`. Verify those are reading `Appointment.appointment_date` (the DB column on the appointments row) and not the queue row's renamed `scheduledAt`. Different objects, same name in some places — if you see ambiguity, rename only the queue row's field on consumers (this batch's surface).
3. **Type-only commit.** This task is type-only + a 1-line patch elsewhere; `oq-03` consumes it. Don't commit `useOpdSnapshot` changes — that's `oq-06`.

---

## References

- **Backend source:** [task-oq-01-backend-widen-queue-api.md](./task-oq-01-backend-widen-queue-api.md)
- **Cockpit strip (consumer to patch):** `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx`
- **Hook (no edits):** `frontend/hooks/useOpdSnapshot.ts`

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
