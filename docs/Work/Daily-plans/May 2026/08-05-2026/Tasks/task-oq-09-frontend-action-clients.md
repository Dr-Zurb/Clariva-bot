# Task oq-09: Frontend api clients for `requeue` + `markNoShow`

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 4, Lane ε step 0 — **XS, ~1h**

---

## Task overview

Add two missing client functions to `frontend/lib/api.ts`. The corresponding backend routes already exist (`POST /api/v1/opd/queue-entries/:entryId/requeue` and `POST /api/v1/opd/appointments/:id/mark-no-show`) but no frontend client function consumes them. This task plugs that hole so `oq-10`'s overflow menu can wire the two missing actions without lane collisions.

**Estimated time:** ~1h. Pure boilerplate — clone the existing `postDoctorOfferEarlyJoin` / `patchDoctorQueueEntry` patterns.

**Status:** Done.

**Hard deps:** none. Backend routes already exist (`backend/src/routes/api/v1/opd.ts` lines 22–23).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D3](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (or **Composer** for the boilerplate clone — quality is fine for trivial work).

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/lib/api.ts` (search for `postDoctorOfferEarlyJoin` and `patchDoctorQueueEntry` — clone these patterns).
- `backend/src/controllers/opd-doctor-controller.ts` (read-only — confirm the response shape on `postRequeueQueueEntryHandler` and `postMarkNoShowHandler`).

**Composer-OK sub-steps:** the entire task can be Composer if the spec is clear (it is).

**Estimated turns:** 1 turn.

---

## Acceptance criteria

### Two new client functions in `frontend/lib/api.ts`

- [x] `postDoctorRequeueQueueEntry`:

  ```ts
  /**
   * OPD-08: requeue a queue entry whose patient missed their turn.
   *
   * Strategies:
   *  - 'after_current': insert immediately after the patient currently in_consultation.
   *    If nobody is in consultation, falls back to end-of-queue.
   *  - 'end_of_queue':  push to the end of the day's queue.
   *
   * Server route: POST /api/v1/opd/queue-entries/:entryId/requeue
   */
  export async function postDoctorRequeueQueueEntry(
    token: string,
    entryId: string,
    strategy: 'after_current' | 'end_of_queue'
  ): Promise<ApiSuccess<{ requeued: boolean; strategy: string }>>;
  ```

  - HTTP body: `{ strategy }`.
  - Match the error-handling shape used by `postDoctorOfferEarlyJoin` (`isApiError` check + `Error` with `.status`).

- [x] `postDoctorMarkNoShow`:

  ```ts
  /**
   * Mark an appointment as no-show. The backend updates appointment.status → 'no_show'
   * and syncs the queue entry to 'missed' when applicable.
   *
   * Server route: POST /api/v1/opd/appointments/:appointmentId/mark-no-show
   */
  export async function postDoctorMarkNoShow(
    token: string,
    appointmentId: string
  ): Promise<ApiSuccess<{ marked: boolean }>>;
  ```

  - HTTP body: `{}` (no payload required).
  - Same error-handling pattern.

### Placement

- [x] Add both functions in `frontend/lib/api.ts` adjacent to `patchDoctorQueueEntry` (near line 540). Group OPD doctor actions together; the order:
  1. `getDoctorOpdQueueSession`
  2. `postDoctorOfferEarlyJoin`
  3. `postDoctorSessionDelay`
  4. `patchDoctorQueueEntry`
  5. **`postDoctorRequeueQueueEntry`** (new)
  6. **`postDoctorMarkNoShow`** (new)

### Type-check + lint

- [x] Clean. (`tsc --noEmit` exit 0)

### Smoke

- [ ] Manual curl against staging if available, OR a one-off Vitest call mocking `fetch` to confirm the URL + body shape (~20 LOC).

---

## Out of scope

- **Backend changes** — routes already exist; do **not** touch backend in this task.
- **UI consumers** — `oq-10` wires the menu items.
- **Confirmation modals** — `oq-10` decides whether to confirm. This task ships pure data plumbing.

---

## Files expected to touch

**New:** none.

**Modified:**
- `frontend/lib/api.ts` (~50 LOC — two function additions)

**Tests:**
- Optional `frontend/__tests__/lib/api/opd-action-clients.test.ts` (~60 LOC) — `fetch` mocked.

---

## Notes / open decisions

1. **Why split this from `oq-10`.** Lane parallelism. `ε-9` (this task) runs from `T+0` in parallel with α (`oq-01`), so the api surface is ready when β finishes oq-03 and ε can start oq-10 immediately.
2. **Pattern alignment.** Both functions follow the existing `postDoctorOfferEarlyJoin` / `postDoctorSessionDelay` shape exactly — `Authorization: Bearer ${token}`, `cache: "no-store"`, structured `ApiError` handling.
3. **Why no PATCH for mark-no-show.** Backend uses POST (`/appointments/:id/mark-no-show`) because it has a side effect on both `appointments.status` and queue rows. Mirror the verb the route uses.

---

## References

- **Backend route file:** `backend/src/routes/api/v1/opd.ts`
- **Backend service:** `backend/src/services/opd-doctor-service.ts § doctorRequeueQueueEntry, doctorMarkAppointmentNoShow`
- **Pattern precedent:** `frontend/lib/api.ts § postDoctorOfferEarlyJoin` (lines 474–506)

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Done
