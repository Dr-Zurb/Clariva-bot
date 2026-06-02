# Task pf-06: `useOpdSnapshot` enum drift fix + widen active set

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 2, Lane γ step 0 — **XS, ~2h**

---

## Task overview

Two fixes in one hook:

1. **Bug:** `frontend/hooks/useOpdSnapshot.ts` filters on `'in_progress'` (not in the DB enum). Migration 028 defines `opd_queue_entries.status` as `'waiting' | 'called' | 'in_consultation' | 'completed' | 'skipped' | 'missed' | 'cancelled'`. So `in_consultation` rows are silently misclassified as inactive — the doctor never sees a patient marked "in consult" in the strip.

2. **Widen:** also surface `completed`, `missed`, `skipped` rows so P4.2 (pf-12) can render the `3 done · 1 in consult · 8 waiting` summary and the `Done today (3) ▾` disclosure (per P-D6).

Independent of every other lane. Run from `T+0`.

**Estimated time:** ~2h. Hook edit + caller-impact audit + light test additions.

**Status:** Shipped (2026-05-08).

**Hard deps:** none.

**Source:** [plan-patient-seeing-flow.md § P4.1](../../../../Product%20plans/plan-patient-seeing-flow.md#p41--fix-useopdsnapshot-enum-drift-widen-active-set).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A — bounded edit, the bug surface and the spec are clear.

**Why not Opus:** the enum mismatch is mechanical (migration 028 is the source of truth); the widening is additive.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/hooks/useOpdSnapshot.ts`.
- `backend/migrations/028_opd_modes.sql` (the actual enum).
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` (the only caller today — verify the impact of the rename).

**Composer-OK sub-steps:** none. (The rename is non-trivial; one Sonnet pass is correct.)

**Estimated turns:** 2 Sonnet turns.

**Multi-chat coordination:** when this lands, **ping ε chat** (pf-12 owner) — the pf-12 component reads the new shape.

---

## Acceptance criteria

### Hook surface

- [ ] Replace the dead `'in_progress'` literal with `'in_consultation'` in `OPD_ACTIVE_STATUSES`.
- [ ] Refactor the hook to return three lists + counts:

  ```ts
  export interface OpdSnapshot {
    isOpdEnabled: boolean;
    active:  DoctorQueueSessionRow[];   // status ∈ {waiting, called, in_consultation}
    done:    DoctorQueueSessionRow[];   // status === 'completed' (today only)
    missed:  DoctorQueueSessionRow[];   // status ∈ {missed, skipped, cancelled} (today only)
    totalActive: number;
    totalDone:   number;
    totalMissed: number;
    isLoading: boolean;
    error: Error | null;
    retry: () => void;
  }
  ```

- [ ] "Today only" filter: `created_at >= startOfToday()` (or whatever the existing date-bucketing helper is — match the current OPD strip's conventions).
- [ ] Backwards-compat: keep an `entries` field that aliases `active` for one batch step (so pf-12 can migrate cleanly):

  ```ts
  /** @deprecated use `active`. Will be removed in pf-12 follow-up. */
  entries: DoctorQueueSessionRow[];
  ```

### Caller impact

- [ ] `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` still type-checks on the old `entries` field (deprecation alias), so this task does not have to refactor its caller.
- [ ] `useDoctorDayPipeline` (pf-07) will read `active` / `done` / `missed` directly.

### Tests

- [ ] If a test file exists for `useOpdSnapshot`, extend it. Otherwise:
  - **Don't** add a new test framework as part of this task. Flag in the chat and stop. The hook will be implicitly covered by pf-07 / pf-12 acceptance.

### General

- [ ] Type-check + lint clean.
- [ ] Verify the hook still emits the same Supabase-realtime subscription pattern (search for `channel`/`subscription` in the file; must not be touched).
- [ ] Add a JSDoc on the deprecated `entries` field linking to pf-12.

---

## Out of scope

- **Renaming `entries` everywhere it's consumed.** Deferred — keeps this task tight; the deprecation alias keeps the world working.
- **`OpdQueueStrip` UX changes.** pf-12 owns those.
- **Backend changes.** The DB enum is correct; only the frontend has drifted.

---

## Files expected to touch

**Modified:**
- `frontend/hooks/useOpdSnapshot.ts` (~50 LOC — refactor return shape, add the three filtered lists)

**New:** none.
**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why "today only" for `done` / `missed`?** Yesterday's no-show shouldn't pollute today's queue strip. The active list already filters by today implicitly via the realtime subscription scope.
2. **Why a deprecation alias instead of in-place rename?** Lets pf-12 land independently and lets us split the rename across two PRs if PR #1 (this hook) merges before PR #2 (pf-12). One-batch-step lifecycle on the alias is fine.
3. **`cancelled` rows.** Folded into `missed` here for UX parity (both render in the same group); the actual DB enum keeps them distinct in case product opinion changes.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P4.1](../../../../Product%20plans/plan-patient-seeing-flow.md#p41--fix-useopdsnapshot-enum-drift-widen-active-set)
- **DB enum source of truth:** `backend/migrations/028_opd_modes.sql`
- **Consumer that reads the deprecated field:** `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx`
- **Downstream consumer (will use new shape):** [task-pf-07-doctor-day-pipeline-hook.md](./task-pf-07-doctor-day-pipeline-hook.md), [task-pf-12-opd-strip-extension.md](./task-pf-12-opd-strip-extension.md)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
