# Task cp-01: Fix `useDoctorDayPipeline` queue sort so the just-completed patient doesn't kill auto-advance

## 09 May 2026 — Batch [Cockpit polish](../plan-cockpit-polish-batch.md) — Phase 1, Lane α step 0 — **XS, ~1h**

---

## Task overview

`frontend/hooks/useDoctorDayPipeline.ts` builds `queueEntries` by **bucketing** the OPD snapshot:

```ts
const sortedActive = [...opdSnap.active].sort(
  (a, b) => (a.tokenNumber ?? 0) - (b.tokenNumber ?? 0),
);
const allRows = [...sortedActive, ...opdSnap.done, ...opdSnap.missed];
```

This is a clinical-impact bug. The moment the current patient (token `#3`) flips to `completed`, they jump from `opdSnap.active` into `opdSnap.done`, which is concatenated **after** the active bucket. So a queue that yesterday looked like:

```
active = [#1 done-ish (waiting marker), #2 in-progress, #3 wrap-up, #4 waiting, #5 waiting]
```

becomes — after token `#3` finishes:

```
queueEntries = [#4 waiting, #5 waiting, ..., #1 done, #2 done, #3 just-done]
                ↑                                           ↑
                supposed to be the next                     the row useNextAppointmentRoute is
                                                            looking at (currentIndex+1 of #3 in
                                                            the OLD ordering), which is now
                                                            past the end of active rows.
```

`useNextAppointmentRoute` does `currentIndex + 1` and gets `null` because the now-completed `#3` lives at the bottom of the array — past every active row. The cockpit immediately renders `EndOfDayCard` ("You're done for today!") even though tokens `#4` and `#5` are still waiting.

**The fix is one line of logic:** merge all three buckets first, then sort the whole thing by `tokenNumber` ASC. Token order is the canonical patient-flow order in OPD queue mode; status is incidental for sorting purposes.

**Estimated time:** ~1h (5 min code, the rest is tests + verification on the actual auto-advance flow).

**Status:** Pending.

**Hard deps:** none.

**Source:** [plan-cockpit-polish-batch.md § CP-D2](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability) and the post-`Send Rx & finish` flow that the WrapUpDialog elimination work shipped earlier today.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/hooks/useDoctorDayPipeline.ts` (the whole file — it's small, ~250 lines).
- `frontend/hooks/useNextAppointmentRoute.ts` (consumer — verify the fix is sound).
- `frontend/hooks/useOpdSnapshot.ts` (read-only — confirm what the three buckets contain).

**Estimated turns:** 1–2 turns (one for the impl + one for the test if not stitched).

---

## Acceptance criteria

### `queueEntries` merges + sorts globally

- [ ] In `useDoctorDayPipeline.ts § queueEntries`, replace the bucketed concatenation with:

  ```ts
  // CP-D2: token order is the canonical patient-flow order in OPD queue mode.
  // Don't pre-bucket by status — the moment the current patient flips to
  // `completed` they'd jump past the next active row, and useNextAppointmentRoute
  // would wrongly return null. Sort all three buckets together by tokenNumber ASC.
  const allRows = [
    ...opdSnap.active,
    ...opdSnap.done,
    ...opdSnap.missed,
  ].sort((a, b) => (a.tokenNumber ?? 0) - (b.tokenNumber ?? 0));
  ```

- [ ] The `useMemo` deps array stays `[isQueueMode, opdSnap.active, opdSnap.done, opdSnap.missed, currentAppointmentId]`.

- [ ] **Tie-breaker for null tokens.** Rows with `tokenNumber == null` (defensive — shouldn't happen in queue mode, but possible during a brief snapshot-stale window) sort to the **end**. Implementation:

  ```ts
  .sort((a, b) => {
    const ta = a.tokenNumber ?? Number.POSITIVE_INFINITY;
    const tb = b.tokenNumber ?? Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  ```

  This avoids the `null - null = 0` masking bug where two null-token rows would tie at position 0 and steal the front of the queue.

### Schedule pipeline untouched

- [ ] `scheduleEntries` (the `else` branch in the same hook) keeps its existing strict-chronological sort by `appointment_date`. **Do not refactor it** in this task — it's already correct.

### Tests

- [ ] **Add a new test** to the hook's test file (or create one if it doesn't exist) that exercises the regression:

  ```ts
  it('keeps the just-completed patient in token order so auto-advance can find the next active row', () => {
    // Fixture: 5 tokens; #3 just flipped from active → done.
    const snap: OpdSnapshot = {
      active: [
        { id: 'appt-1', tokenNumber: 1, ... },  // already-called
        { id: 'appt-2', tokenNumber: 2, ... },  // in-consult
        { id: 'appt-4', tokenNumber: 4, ... },  // waiting
        { id: 'appt-5', tokenNumber: 5, ... },  // waiting
      ],
      done: [
        { id: 'appt-3', tokenNumber: 3, ... },  // just-completed, the current
      ],
      missed: [],
      // ...
    };
    const { result } = renderHook(() =>
      useDoctorDayPipeline({ token: 'tok', currentAppointmentId: 'appt-3' }),
    );
    const ids = result.current.entries.map((e) => e.id);
    expect(ids).toEqual(['appt-1', 'appt-2', 'appt-3', 'appt-4', 'appt-5']);

    const currentIndex = result.current.currentIndex;
    expect(currentIndex).toBeGreaterThanOrEqual(0);
    expect(result.current.entries[currentIndex + 1]?.id).toBe('appt-4');
  });
  ```

  - The crucial assertion is the second one: `entries[currentIndex + 1]?.id === 'appt-4'`. That's exactly what `useNextAppointmentRoute` indexes into.
  - If a hook test infrastructure isn't set up for `useDoctorDayPipeline`, **mock `useOpdSnapshot` and `useTodaysAppointments`** directly via `vi.mock()` — see existing patterns in `frontend/__tests__/`.

- [ ] **Existing tests pass.** Type-check + lint clean.

### Manual verification

- [ ] In a dev environment with at least **3 active OPD patients in queue mode** (call them tokens `#1`, `#2`, `#3`), enter the cockpit for `#1`, click `Send Rx & finish`, and confirm:
  1. Appointment `#1`'s status flips to `completed`.
  2. The cockpit transitions to the `ended` state.
  3. `NextPatientCountdown` renders pointing at `#2` (NOT `EndOfDayCard`).
  4. The countdown completes and the cockpit auto-routes to `#2`'s appointment page.

  The previous bug breaks step 3 — `NextPatientCountdown` flashes briefly then `EndOfDayCard` takes over. After this fix, that flash is gone.

---

## Out of scope

- **Strip windowing** (the prev / now / next collapse) — that's `cp-02`. This task only fixes the data layer.
- **Schedule pipeline behaviour** — the schedule branch already sorts chronologically; don't touch it.
- **`useNextAppointmentRoute` itself** — the bug is upstream in the pipeline; the route hook is correct.
- **`OpdQueueStrip` (dashboard)** — uses `useOpdSnapshot` directly, not `useDoctorDayPipeline`. Out of scope.

---

## Files expected to touch

**New:**
- `frontend/hooks/__tests__/useDoctorDayPipeline.test.ts` — only if a hook test file doesn't already exist for this hook. (~80 LOC.)

**Modified:**
- `frontend/hooks/useDoctorDayPipeline.ts` (~10 LOC changed — single sort logic block)
- The hook test file if one exists.

**Tests:**
- One new `it(...)` block per the spec above.

---

## Notes / open decisions

1. **Why not sort by `appointment_date` even in queue mode?** Two reasons. First, OPD queue rows have `tokenNumber` as the canonical clinical order (patients arrive in token sequence, not in scheduled-date sequence — many walk through the door 30 min late). Second, queue rows can share the same `appointment_date` (back-to-back tokens minted within seconds of each other), so sort would be unstable.
2. **Why use `Number.POSITIVE_INFINITY` instead of falling back to insertion order?** JavaScript's `Array.prototype.sort` is stable per spec since ES2019, so insertion order **would** work — but only for ties. The `Number.POSITIVE_INFINITY` trick is explicit (any future engineer reading the code immediately knows null-token rows sort last) and robust against accidentally swapping the sort to an unstable algorithm.
3. **Tie-breaker for two rows with the same token number.** Practically impossible by DB constraint (`UNIQUE(doctor_id, opd_session_date, token_number)` per migration `046_opd_queue.sql`), but if it ever happens, stable sort keeps source order, which is `active → done → missed`. Acceptable — the user-visible effect is "active row wins the tie", which is what we want.
4. **No `mapQueueEntry` change required.** The position number it threads in (`i + 1`) is the row's *display position* (1-indexed). The display position is reused by the cockpit as a "you're patient #N of M" counter. Sorting upstream changes which `OpdRow` ends up at which display position; the mapping logic itself is unchanged.

---

## References

- **Buggy file:** `frontend/hooks/useDoctorDayPipeline.ts § queueEntries` (lines ~150–168 at the time of writing).
- **Consumer:** `frontend/hooks/useNextAppointmentRoute.ts` — uses `entries[currentIndex + 1]`.
- **OPD snapshot source:** `frontend/hooks/useOpdSnapshot.ts` (read-only — provides the three buckets).
- **Triggering flow:** `frontend/components/consultation/ConsultationCockpit.tsx § handleFinishVisit` calls `setAppt(updated)` which re-renders the cockpit; the `ended` branch then mounts `<EndedCard>` which consumes `useNextAppointmentRoute`.
- **Previous batch context:** [Daily-plans/May 2026/07-05-2026/Tasks/task-pf-11-next-patient-countdown.md](../../../07-05-2026/Tasks/task-pf-11-next-patient-countdown.md) — auto-advance flow this fix unblocks.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
