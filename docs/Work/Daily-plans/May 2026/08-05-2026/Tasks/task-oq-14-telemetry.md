# Task oq-14: PHI-free telemetry events

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 5, Lane ζ step 3 — **XS, ~2h**

---

## Task overview

Add four PHI-free telemetry events from the OPD queue page so we can answer:

- How often is `/dashboard/opd-today` actually opened? (`opd_queue.viewed`)
- Which rows do doctors click? (`opd_queue.row_clicked` — counts only, no IDs)
- Which filters do they use? (`opd_queue.filter_changed`)
- Which actions actually fire from the overflow? (`opd_queue.action`)

All payloads are **counts and enums only** — no patient IDs, no names, no MRNs, no phone numbers. Match the convention used by the cockpit batch's strip telemetry (`cockpit.opd_strip.viewed` in `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` lines ~247–260).

**Estimated time:** ~2h. Pure plumbing — call sites already exist after `oq-04`, `oq-07`, `oq-10` ship.

**Status:** Drafted.

**Hard deps:** [oq-04](./task-oq-04-table-shell-grouping.md), [oq-07](./task-oq-07-status-filter.md), [oq-10](./task-oq-10-row-actions-overflow.md) all shipped.

**Source:** [plan-opd-queue-redesign-batch.md § Phase 5](../plan-opd-queue-redesign-batch.md#phase-5--session-controls--density--polish-4-tasks--1-dev-day).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (or **Composer** — telemetry plumbing is exactly the kind of trivial work Composer handles well).

**New chat?** **Yes** (or stitch onto the tail of `oq-13`'s chat). Pre-load:
- This task file.
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` § telemetry block (the precedent — copy the shape exactly).
- The codebase's analytics primitive (search `rg "trackEvent|analytics\.track|console\.debug.*event:" frontend/`); the cockpit pattern uses `console.debug` with a structured payload, which is fine for v1.

**Composer-OK sub-steps:** the entire task.

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Helper

- [ ] New file `frontend/components/opd/opdQueueTelemetry.ts`:

  ```ts
  /**
   * PHI-free telemetry helper for the OPD queue page.
   * Match the pattern in OpdQueueStrip's `cockpit.opd_strip.viewed` event:
   * structured payload, no patient identifiers, count-only.
   */

  type OpdQueueEvent =
    | {
        event: 'opd_queue.viewed';
        density: 'compact' | 'default';
        totalActive: number;
        totalDone: number;
        totalMissed: number;
      }
    | {
        event: 'opd_queue.row_clicked';
        statusOfClickedRow: string;       // queue status enum value
        viaKeyboard: boolean;
        viaSearch: boolean;
      }
    | {
        event: 'opd_queue.filter_changed';
        kind: 'status' | 'search';
        statusValue: string | null;       // when kind === 'status'
        queryLength: number | null;       // when kind === 'search' — LENGTH ONLY, not the query string
      }
    | {
        event: 'opd_queue.action';
        action:
          | 'open'
          | 'mark_called_silently'
          | 'requeue_after_current'
          | 'send_to_end'
          | 'mark_no_show'
          | 'broadcast_delay_set'
          | 'broadcast_delay_cleared'
          | 'offer_early_join_sent';
        statusOfTargetRow: string | null; // queue status before the action
        outcome: 'success' | 'error';
      };

  export function trackOpdQueueEvent(payload: OpdQueueEvent): void;
  ```

  - Implementation in v1: `console.debug('[opd_queue]', payload)` wrapped in a try/catch (telemetry must never break the UI).
  - Future enhancement: route to a real analytics SDK; the helper is the single place to swap that wiring.

### Call sites

- [ ] **`opd_queue.viewed`** — fire once per mount (after `isLoading === false` for the first time) from `OpdTodayClient`. Match the cockpit strip's pattern (one-shot effect with stable deps).
- [ ] **`opd_queue.row_clicked`** — fire from `handleOpenRow` in `OpdTodayClient` (the same handler used by both row-click and chevron-click). `viaKeyboard` is true when the trigger came from the keyboard hotkey (`Enter`); `viaSearch` is true when `q !== ''` at the time of the click.
- [ ] **`opd_queue.filter_changed`**:
  - From `useOpdQueueFilters.setStatus` — wrap with telemetry (or fire from the parent on each change). `kind: 'status'`, `statusValue: next`.
  - From the search input's debounced commit — `kind: 'search'`, `queryLength: q.length`. **Do not log the query string itself.** The length proxy is sufficient to track adoption + length distribution.
- [ ] **`opd_queue.action`** — fire from each menu item's success/error branches in `<OpdQueueRowActions>` (and from `<OpdQueueSessionToolbar>` for `broadcast_delay_*` and `offer_early_join_sent`). Outcome reflects whether the api call succeeded.

### Privacy guard

- [ ] **Hard rule:** the helper takes a typed union, so adding a free-form string field is impossible without a code review. Guard against accidental PHI by never accepting `patientName`, `appointmentId`, `entryId`, `phoneNumber`, etc., as fields.
- [ ] Add a comment block at the top of the helper file explicitly stating: `"All telemetry payloads MUST be PHI-free. Counts and enums only. Reviewer: reject any PR that adds string fields to this file's payload type."`

### Tests

- [ ] Unit-test the helper (~20 LOC) — assert `console.debug` is called with the right shape; assert errors in the underlying call don't propagate.

### Type-check + lint

- [ ] Clean.

---

## Out of scope

- **Backend audit log entries** — separate concern; the existing `audit_logs` table catches state changes server-side.
- **Routing telemetry to a real analytics SDK** (Mixpanel / PostHog / Segment) — out of batch; the helper is a one-line swap when ready.
- **Sampling / rate-limiting** — telemetry call rates are bounded by user actions; no debouncing needed in v1 except the search-input debounce that already exists in `oq-08`.

---

## Files expected to touch

**New:**
- `frontend/components/opd/opdQueueTelemetry.ts` (~70 LOC)
- `frontend/__tests__/components/opd/opdQueueTelemetry.test.ts` (~40 LOC)

**Modified:**
- `frontend/components/opd/OpdTodayClient.tsx` (~10 LOC — fire `viewed` + `row_clicked`)
- `frontend/components/opd/OpdQueueRowActions.tsx` (~5 LOC — fire `action`)
- `frontend/components/opd/OpdQueueStatusFilter.tsx` (~3 LOC — fire `filter_changed`, kind=status)
- `frontend/components/opd/OpdQueueSearchBox.tsx` (~3 LOC — fire `filter_changed`, kind=search)
- `frontend/components/opd/OpdQueueSessionToolbar.tsx` (~5 LOC — fire toolbar `action` events)

---

## Notes / open decisions

1. **`queryLength` not query string.** Even though "ravi" doesn't look like PHI, log discipline is binary: never log query strings on a PHI surface.
2. **`viewed` deduplication.** Same as cockpit strip: fire once per mount, gated by `isLoading === false` and a useEffect with stable deps.
3. **`action.outcome === 'error'` payloads.** Don't log error.message — error messages can include patient identifiers in URL paths from `fetch`. Outcome enum is enough.
4. **Cockpit batch precedent.** The cockpit strip's `cockpit.opd_strip.viewed` gives us a working pattern + naming convention. Stick close to it.

---

## References

- **Cockpit precedent:** `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` lines ~247–260 (`cockpit.opd_strip.viewed`).
- **Source plan:** [plan-opd-queue-redesign-batch.md § Phase 5](../plan-opd-queue-redesign-batch.md)
- **Privacy contract:** [plan-opd-queue-redesign-batch.md § OQ-D7](../plan-opd-queue-redesign-batch.md)

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
