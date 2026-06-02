# Task oq-06: Wire `/dashboard/opd-today` to `useOpdSnapshot`

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 2, Lane δ step 0 — **XS, ~2h**

---

## Task overview

Replace the bespoke `setInterval(load, 15s)` polling inside `frontend/components/opd/DoctorQueueBoard.tsx` with the canonical `useOpdSnapshot` hook (already used by the cockpit OPD strip and queue rail). After this task:

- The page and the cockpit strip share **one source of truth** — no drift.
- Polling is **visibility-aware** (pauses when the tab is hidden), driven from `useOpdSnapshot`.
- Stale-while-revalidate behavior is consistent across surfaces.
- The "last updated" relative-time can be surfaced uniformly on this page (the toolbar from `oq-11` will use it).
- `DoctorQueueBoard.tsx` collapses to either a thin re-export or is deleted entirely.

**Estimated time:** ~2h. Mostly mechanical — swap the data-source, delete the bespoke interval, verify the `<OpdQueueTable>` props still wire cleanly.

**Status:** Drafted.

**Hard deps:** [oq-04](./task-oq-04-table-shell-grouping.md) shipped (the table shell exists and is mounted).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D6](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (or Composer if you're confident — pure plumbing).

**New chat?** **Yes** — fresh chat (or stitch into the tail of `oq-04`'s chat if context budget allows). Pre-load:
- This task file.
- `frontend/hooks/useOpdSnapshot.ts` (read fully — understand `active / done / missed` lists vs. the deprecated `entries` alias).
- `frontend/components/opd/OpdQueueTable.tsx` (post-oq-04).
- `frontend/components/opd/OpdTodayClient.tsx` (post-oq-04).
- `frontend/components/opd/DoctorQueueBoard.tsx` (post-oq-04 — currently a thin wrapper).

**Composer-OK sub-steps:** the `DoctorQueueBoard.tsx` deletion + import audit at the end can be Composer.

**Estimated turns:** 1–2 Sonnet turns + 1 Composer turn for cleanup.

---

## Acceptance criteria

### Hook integration

- [ ] `frontend/components/opd/OpdTodayClient.tsx` is the new owner of the data fetch:
  - Imports `useOpdSnapshot` from `@/hooks/useOpdSnapshot`.
  - Calls `useOpdSnapshot(token)` once.
  - Passes `entries: [...active, ...done, ...missed]` (in that order) into `<OpdQueueTable>`. The table re-groups internally — but pre-flattening here is fine because grouping is cheap.
  - Passes `isLoading`, `error`, `retry` to `<OpdQueueTable>`.
  - Drops the `sessionDate` state ownership of polling (keep the date input — `useOpdSnapshot` only fetches today's date currently; see Notes #2).
- [ ] **`useOpdSnapshot` extension (if needed):** the hook today defaults to `today.toISOString().split('T')[0]`. If the page lets the doctor pick a non-today session date, extend the hook to accept an optional `dateOverride` parameter. **Pattern:**

  ```ts
  export function useOpdSnapshot(token: string, dateOverride?: string): OpdSnapshotState
  ```

  When `dateOverride` differs from today, polling continues but the 30 s cadence stays. Document in the hook JSDoc.
  - **If you change `useOpdSnapshot`'s signature**, also update its other callers (`OpdQueueStrip`, `CockpitQueueRail`) — they pass nothing today, which still works because the param is optional.

### Bespoke polling removal

- [ ] `frontend/components/opd/DoctorQueueBoard.tsx`:
  - **Option A — delete the file** (preferred):
    - Move any remaining logic into `OpdTodayClient` directly.
    - Delete `DoctorQueueBoard.tsx`.
    - Delete its `__tests__` if any.
    - Run `cd frontend && rg -l "DoctorQueueBoard" → 0 hits`.
  - **Option B — collapse to a thin re-export** (only if a test or external import still references it; the cockpit batch precedent leans on Option A):

    ```ts
    export { OpdQueueTable as DoctorQueueBoard } from "./OpdQueueTable";
    ```

  - **Pick A unless you find a real consumer.** Search the whole repo for `DoctorQueueBoard` before deleting.
- [ ] The `setInterval(() => void load(), pollSeconds * 1000)` block is **gone**.
- [ ] The `pollSeconds` prop on the old component is **gone**.

### Last-updated indicator (extend the hook)

- [ ] Extend `useOpdSnapshot` to expose `lastUpdatedAt: number | null` (a `Date.now()` timestamp set after each successful fetch). Hook returns it alongside the existing fields:

  ```ts
  export interface OpdSnapshotState {
    // ... existing
    lastUpdatedAt: number | null;
  }
  ```

  - Set `lastUpdatedAt = Date.now()` at the end of `fetchQueue()` (after `setError(null)`).
  - This unblocks `oq-11`'s "Updated 12 s ago" indicator and `oq-04`'s stale-banner.
  - **No change** to existing consumers (additive field).

### Action handlers wired through `OpdTodayClient`

- [ ] `OpdTodayClient` accepts the action callbacks from `<OpdQueueTable>` (`onOpenRow`, `renderActions`):
  - `onOpenRow` calls `patchDoctorQueueEntry(token, entryId, "called")` (idempotent — no-op when already called) and then `router.push(/dashboard/appointments/${entry.appointmentId})`. **The Open behavior is the placeholder version of `oq-10`.**
  - `renderActions` returns a placeholder `Open` chevron only. `oq-10` later replaces this with the full `<OpdQueueRowActions>` component.

### Type-check + lint + smoke

- [ ] `cd frontend && npx tsc --noEmit && npx next lint` clean.
- [ ] **Smoke test:** open `/dashboard/opd-today` with a real token; queue rows appear; data refreshes after switching to another tab and back; data does NOT refresh while the tab is hidden (verify via dev console no-network on hidden tab).

---

## Out of scope

- **Filter / search wiring** — `oq-07`, `oq-08`.
- **Action menu contents** — `oq-10`. This task ships a placeholder Open chevron only.
- **Toolbar** — `oq-11`.
- **Density / mobile** — `oq-12`.
- **Telemetry** — `oq-14`.

---

## Files expected to touch

**New:** none.

**Modified:**
- `frontend/components/opd/OpdTodayClient.tsx` (~30 LOC — adopt `useOpdSnapshot`, wire props)
- `frontend/hooks/useOpdSnapshot.ts` (~10 LOC — optional `dateOverride` arg + `lastUpdatedAt` field)

**Deleted (preferred):**
- `frontend/components/opd/DoctorQueueBoard.tsx` (file)

---

## Notes / open decisions

1. **Why fold this in the same batch and not earlier.** `useOpdSnapshot` only got the widened (`active`/`done`/`missed`) shape in the patient-flow batch (`pf-06`). Moving `/dashboard/opd-today` to it before that would have been premature.
2. **Why a `dateOverride` param vs. dropping the date picker.** Doctors occasionally want to peek at yesterday's queue (audit / no-show review). Keeping the date selector is cheap; making `useOpdSnapshot` date-aware is one parameter.
3. **`lastUpdatedAt` placement.** On the hook, not the component, because the cockpit strip and queue rail both want the same indicator. Adding it on the hook is the single right place.
4. **Visibility pause is already in `useOpdSnapshot`.** No new logic needed — the `visibilitychange` listener exists at lines ~180–192 of the hook. We just inherit it by switching to the hook.

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D6](../plan-opd-queue-redesign-batch.md)
- **Hook:** `frontend/hooks/useOpdSnapshot.ts`
- **Mount surface:** `frontend/components/opd/OpdTodayClient.tsx`
- **Other consumers (must remain compatible):** `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx`, `frontend/components/consultation/cockpit/CockpitQueueRail.tsx`

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
