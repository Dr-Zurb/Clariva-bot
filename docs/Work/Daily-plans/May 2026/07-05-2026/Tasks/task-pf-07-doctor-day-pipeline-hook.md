# Task pf-07: `useDoctorDayPipeline()` adapter

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 2, Lane γ step 1 — **S, ~3h**

---

## Task overview

A unified adapter that lets `<CockpitQueueRail>` and `<NextPatientCountdown>` consume one shape regardless of the doctor's mode (queue vs slot/telemed). Per **P-D5**: queue mode wraps `useOpdSnapshot` (post-pf-06), slot/telemed wraps `useTodaysAppointments`. Returns a unified `PipelineEntry[]` plus counts and the index of the currently-mounted appointment.

**Estimated time:** ~3h. Mostly normalising the two source shapes and writing the index-resolution logic.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-06](./task-pf-06-opd-snapshot-enum-fix.md) shipped (relies on the widened return shape).

**Source:** [plan-patient-seeing-flow.md § P2.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p22--usedoctordaypipeline-adapter).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A. The two sources are well-defined; this is a normalisation hook.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/hooks/useOpdSnapshot.ts` (post-pf-06 — verify the shape change has landed).
- `frontend/hooks/useTodaysAppointments.ts`.
- `frontend/types/appointment.ts`.

**Composer-OK sub-steps:** none.

**Estimated turns:** 2–3 Sonnet turns.

---

## Acceptance criteria

### Hook surface

- [ ] New file `frontend/hooks/useDoctorDayPipeline.ts` exporting:

  ```ts
  export interface PipelineEntry {
    id: string;                                // appointment.id (or queue entry → appointment_id)
    label: string;                              // patient short name (or "walk-in" / "Token #4")
    status: 'waiting' | 'called' | 'in_consultation' | 'completed' | 'missed' | 'skipped'
          | 'pending'  | 'confirmed' | 'cancelled' | 'no_show';
    position: number;                           // 1-indexed within the day's pipeline
    tokenNumber?: number | null;                // queue mode only
    href: string;                               // /dashboard/appointments/{id}
    isCurrent: boolean;                         // matches currentAppointmentId (prop)
  }

  export interface UseDoctorDayPipelineResult {
    entries: PipelineEntry[];
    currentIndex: number | null;
    doneCount: number;
    activeCount: number;
    missedCount: number;
    totalCount: number;
    source: 'queue' | 'schedule';
    isLoading: boolean;
    error: Error | null;
  }

  export function useDoctorDayPipeline(opts?: {
    currentAppointmentId?: string | null;
  }): UseDoctorDayPipelineResult;
  ```

### Source resolution

- [ ] Internally pick based on `doctor_settings.opd_mode`:
  - `'queue'` → wrap `useOpdSnapshot`. Map each queue entry to a `PipelineEntry` (status passes through verbatim, position from token order).
  - `'slot'` / `'telemed'` / unset → wrap `useTodaysAppointments`. Map each appointment to a `PipelineEntry` (status from `appointment.status`, position from chronological order).
- [ ] When `opd_mode` is unset (telemed-only practice), default to `'schedule'`.

### Sorting

- [ ] **Queue mode:** preserve OPD strip ordering — active entries by `tokenNumber`, then `done`, then `missed`. (Already roughly the order pf-06 returns.)
- [ ] **Schedule mode:** strict chronological by `appointment_date`.

### `currentIndex`

- [ ] Resolved by matching `entries[i].id === opts.currentAppointmentId`. `null` if no match.

### General

- [ ] Type-check + lint clean.
- [ ] Hook is **memoised** — passes a stable `entries` array reference when the underlying data hasn't changed (use `useMemo` keyed on raw data length + version).
- [ ] No new external dependencies.

---

## Out of scope

- **Component rendering** — pf-08 owns `<CockpitQueueRail>`.
- **Settings reads** — relies on the existing doctor-settings hook (search `useDoctorSettings` or equivalent in `frontend/hooks/`); no new endpoint.
- **Walk-in fast path** — pf-16 adds entries via the same source feeds; this hook surfaces them automatically.

---

## Files expected to touch

**New:**
- `frontend/hooks/useDoctorDayPipeline.ts` (~140 LOC)

**Modified:** none.
**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why one hook instead of conditional consumers.** Two callers (pf-08 queue rail, pf-10 next-route) both need the unified shape. Centralising here means the rail / countdown stay mode-agnostic.
2. **`isCurrent` flag in entries.** Lets the rail render the current token differently without recomputing the index in the component.
3. **Source label exposed.** pf-08 may render slightly differently in `'schedule'` mode (no token numbers). Better to surface the discriminator than inspect entries.
4. **`completed_at` vs `updated_at`.** Schedule mode falls back to `updated_at` filtered on `status = 'completed'` for done count if a dedicated column doesn't exist. Pre-confirm against the schema during impl; add a TODO if a `completed_at` column needs adding (not in this batch).

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P2.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p22--usedoctordaypipeline-adapter)
- **Dependency:** [task-pf-06-opd-snapshot-enum-fix.md](./task-pf-06-opd-snapshot-enum-fix.md) — provides the queue source.
- **Schedule source:** `frontend/hooks/useTodaysAppointments.ts`.
- **Downstream consumers:** [task-pf-08-cockpit-queue-rail.md](./task-pf-08-cockpit-queue-rail.md), [task-pf-10-next-appointment-route-hook.md](./task-pf-10-next-appointment-route-hook.md).

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
