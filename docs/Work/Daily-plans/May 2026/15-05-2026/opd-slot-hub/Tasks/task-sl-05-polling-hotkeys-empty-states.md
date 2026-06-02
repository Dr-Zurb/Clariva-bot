# Task sl-05: Polling, hotkeys, empty / error / stale states, telemetry, Wave 2 close

## 15 May 2026 — Batch [OPD Slot Hub](../plan-opd-slot-hub-batch.md) — Wave 2, Lane α step 3 — **S, ~2h**

---

## Task overview

Wire the cross-cutting plumbing the slot-mode hub needs to ship: 30-second polling with `visibilitychange` pause, the existing keyboard hotkey hook (J/K/Enter/S/`/`), empty / error / stale-while-revalidate states, and the `opd_slot.*` telemetry event family. **This task closes the Wave 2 acceptance gate** — by the end of sl-05, the slot hub is feature-complete and ready to merge.

Mostly a wiring task: each piece has an exact queue-mode precedent (in `OpdTodayClient.tsx` lines ~152–340 for queue's polling block, `useOpdQueueHotkeys.ts` for hotkeys, `opdQueueEmptyState.ts` for empty states, `opdQueueTelemetry.ts` for events).

**Estimated time:** ~2h (0.5h polling + visibility-pause for slot, 0.25h hotkey hook reuse + focus state, 0.5h empty/error/stale states + helper, 0.25h telemetry events + wire-up, 0.5h Wave 2 cross-cutting gate verification).

**Status:** Pending.

**Hard deps:** sl-04 (list rendered; row focus state needs the rendered rows to attach to).

**Source:** [plan-opd-slot-hub-batch.md § Wave 2](../plan-opd-slot-hub-batch.md#wave-2--hub-ui-4-tasks-9h-single-sequential-lane) + `S1.5` and `DL-9` in [Product plans/plan-opd-slot-hub.md](../../../../Product%20plans/plan-opd-slot-hub.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 — Auto is the execution default. The polling block is a near-copy of the queue block at `OpdTodayClient.tsx` lines 152–182; the hotkey hook is reused as-is (SL-Q6); empty state mirrors queue. **Not on the hard-rules list.**

**Per-message escalation rule:** if Auto stalls on the cross-cutting acceptance gate verification (the most judgement-heavy part of the task), escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**Optional Opus 4.7 Extra High close-gate review (highly recommended):** after sl-05 ships, open **one** fresh Opus chat with the full Wave 1 + Wave 2 diff and ask it to grade against the cross-cutting acceptance gate in [`plan-opd-slot-hub-batch.md`](../plan-opd-slot-hub-batch.md). This is the **only** Opus turn budgeted for the entire batch, per the guide's "Sub-batch close-gate review" pattern (Tier 1, Pattern A.4). One careful Opus review beats four mediocre Auto reviews.

**New chat?** **Yes** — fresh chat.

Pre-load:

- This task file.
- `frontend/components/opd/OpdTodayClient.tsx` (post-sl-04 — particularly the queue-mode polling block at lines ~152–340, the freshness handling, and the queue branch's hotkey wiring near the bottom).
- `frontend/hooks/useOpdQueueHotkeys.ts` (the entire file — sl-05 reuses as-is per SL-Q6).
- `frontend/components/opd/opdQueueEmptyState.ts` (the empty-state derivation precedent — sl-05 ports for slot semantics).
- `frontend/components/opd/opdQueueTelemetry.ts` (event types — sl-05 extends with `opd_slot.*` events).
- `frontend/components/opd/OpdQueueStaleBanner.tsx` (stale-while-revalidate banner if it exists; otherwise the inline pattern in `OpdTodayClient.tsx`).
- The cross-cutting acceptance gate in [`plan-opd-slot-hub-batch.md`](../plan-opd-slot-hub-batch.md#cross-cutting-acceptance-gate-whole-batch) — sl-05 verifies every box.
- Source plan §DL-9, §SL-Q7.

**Estimated turns:** 3–4 turns (1 turn polling + visibility, 1 turn hotkeys + focus state, 1 turn empty/error/telemetry, 1 turn the Wave 2 gate verification + paused-state failure log).

---

## Acceptance criteria

### Step 1 — 30-second polling with visibility-pause

- [ ] In `OpdTodayClient.tsx`, **add a slot-mode polling block** that mirrors the queue-mode block. Locate the queue block (likely around lines 152–340) and copy its structure:

  ```tsx
  // ── Slot-mode polling (sl-05) ──────────────────────────────────────────
  const [slotIsLoading, setSlotIsLoading] = useState(false);
  const [slotError, setSlotError] = useState<Error | null>(null);
  const slotIsMountedRef = useRef(true);

  useEffect(() => {
    slotIsMountedRef.current = true;
    return () => {
      slotIsMountedRef.current = false;
    };
  }, []);

  const fetchSlotSnapshot = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opdMode !== "slot") return;
      if (!opts?.silent) setSlotIsLoading(true);
      try {
        const res = await getDoctorOpdSlotSession(token, sessionDate);
        if (!slotIsMountedRef.current) return;
        setSlotEntries(res.data.entries);
        setSlotCounts(res.data.counts);
        setSlotLastUpdatedAt(Date.now());
        setSlotError(null);
      } catch (e) {
        if (!slotIsMountedRef.current) return;
        setSlotError(e instanceof Error ? e : new Error("Snapshot fetch failed"));
        // Do NOT clear entries — stale-while-revalidate keeps last good data visible.
      } finally {
        if (!opts?.silent && slotIsMountedRef.current) setSlotIsLoading(false);
      }
    },
    [opdMode, sessionDate, token]
  );

  useEffect(() => {
    if (opdMode !== "slot") return undefined;
    void fetchSlotSnapshot();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchSlotSnapshot({ silent: true });
    }, 30_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchSlotSnapshot({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [opdMode, fetchSlotSnapshot]);

  // Replace the sl-02 one-shot handleSlotRefresh with this:
  const handleSlotRefresh = fetchSlotSnapshot;
  ```

- [ ] **Replace** the one-shot fetch + the basic `handleSlotRefresh` callback that sl-02 introduced. The polling block above is the canonical slot-mode data flow from this task forward.

- [ ] Make sure the queue branch's polling and the slot branch's polling are **mutually exclusive**. The `if (opdMode !== "slot") return;` guard at the top of `fetchSlotSnapshot` and the polling effect ensures slot polling only fires when the slot branch is rendered. The queue precedent has the symmetric guard.

### Step 2 — Hotkeys + row focus state

- [ ] Add slot-mode hotkey wiring near the existing queue hotkey wiring. Reuse `useOpdQueueHotkeys` as-is (per SL-Q6):

  ```tsx
  // ── Slot-mode hotkeys (sl-05) ──────────────────────────────────────────
  const [slotFocusedRowId, setSlotFocusedRowId] = useState<string | null>(null);
  const [slotOverflowOpenId, setSlotOverflowOpenId] = useState<string | null>(null);
  const slotSearchInputRef = useRef<HTMLInputElement | null>(null);

  // Build the row-id list from the *visible-after-filter* entries. The hook
  // moves J/K through this list, so the focus follows what the doctor sees.
  const slotVisibleRowIds = useMemo(() => {
    let rows = slotEntries;
    if (slotStatusFilter !== "all") rows = rows.filter((r) => r.slotStatus === slotStatusFilter);
    if (slotSearchQuery.trim()) rows = rows.filter((r) => matchesOpdSearch(r, slotSearchQuery));
    return rows.map((r) => r.appointmentId);
  }, [slotEntries, slotStatusFilter, slotSearchQuery]);

  useOpdQueueHotkeys({
    enabled: opdMode === "slot",
    rowIds: slotVisibleRowIds,
    focusedRowId: slotFocusedRowId,
    onFocusChange: setSlotFocusedRowId,
    onOpenRow: (rowId) => {
      router.push(`/dashboard/appointments/${rowId}`);
      trackOpdSlotEvent({
        event: "opd_slot.row_clicked",
        kind: "hotkey_enter",
        entryId: rowId,
      });
    },
    onOpenOverflow: (rowId) => setSlotOverflowOpenId(rowId),
    onFocusSearch: () => slotSearchInputRef.current?.focus(),
  });
  ```

- [ ] Pass `focusedRowId={slotFocusedRowId}` and `onFocusChange={setSlotFocusedRowId}` to `OpdSlotList` and `OpdSlotMobileList` so they can apply a focus ring + scroll the focused row into view (mirror queue precedent).

- [ ] Wire `overflowOpenId` into each `OpdSlotRowActions`:
  ```tsx
  <OpdSlotRowActions
    entry={entry}
    overflowOpen={slotOverflowOpenId === entry.appointmentId}
    onOverflowOpenChange={(open) => setSlotOverflowOpenId(open ? entry.appointmentId : null)}
    /* ...other props... */
  />
  ```

- [ ] Wire `slotSearchInputRef` into `OpdQueueSearchBox` (it likely accepts a `ref` prop or supports `forwardRef`; verify).

- [ ] **`useOpdQueueHotkeys` shape — does it match what we're passing?** Pre-load the hook and verify the callback names + `rowIds` shape. If the hook expects `entries` (the full row objects) instead of just IDs, pass `slotEntries.filter(visible)` and adapt callback args. The precedent file is canonical — match it.

### Step 3 — Empty / error / stale-while-revalidate states

- [ ] Create `frontend/components/opd/opdSlotEmptyState.ts` mirroring `opdQueueEmptyState.ts`. Returns a discriminated union for the parent to render:

  ```ts
  import type { SlotSessionRow, SlotStatus } from "@/types/opd-doctor";

  export type SlotEmptyState =
    | { kind: "no-data" }                        // entries.length === 0 AND no filter applied
    | { kind: "filtered-empty"; filter: SlotStatus | "search" } // filter dropped all rows
    | { kind: "all-completed" }                  // every row's slotStatus === 'completed'
    | { kind: "none" };                          // entries exist; nothing to show

  export function deriveSlotEmptyState(args: {
    entries: SlotSessionRow[];
    filteredCount: number;          // entries after status + search filter
    statusFilter: string;
    searchQuery: string;
  }): SlotEmptyState {
    if (args.entries.length === 0) return { kind: "no-data" };
    if (args.entries.every((r) => r.slotStatus === "completed")) return { kind: "all-completed" };
    if (args.filteredCount === 0) {
      if (args.searchQuery.trim()) return { kind: "filtered-empty", filter: "search" };
      return { kind: "filtered-empty", filter: args.statusFilter as SlotStatus };
    }
    return { kind: "none" };
  }
  ```

- [ ] Render the empty state inside `OpdSlotList` (and the mobile variant) when `kind !== "none"`. Copy:
  - `no-data`: "No slots booked for this date" + small CTA `<Link href="/dashboard/appointments">Open availability</Link>` (or whatever the booking flow entry is).
  - `all-completed`: "All slots done for today. Have a break ✦" (or similar — check copy patterns in the queue precedent).
  - `filtered-empty` + `search`: "No slot matches your search." + clear-search button.
  - `filtered-empty` + status: `"No `${chipLabel}` slots."` + clear-filter button.

- [ ] **Stale-while-revalidate banner.** When `slotError` is non-null AND `slotEntries.length > 0`, render a banner above the list:

  ```tsx
  {slotError && slotEntries.length > 0 && (
    <div
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      Could not refresh. Showing last update {timeAgo(slotLastUpdatedAt ?? Date.now())}. {" "}
      <button type="button" className="underline" onClick={() => fetchSlotSnapshot()}>
        Retry
      </button>
    </div>
  )}
  ```

  *(Mirror the queue precedent's exact copy + class set if `OpdQueueStaleBanner.tsx` exists.)*

- [ ] **Initial-load skeleton.** When `slotIsLoading && slotEntries.length === 0` (first ever load, no cached data), render the same skeleton sl-02 + sl-03 mounted as placeholders. After data arrives once, the banner pattern takes over.

### Step 4 — Telemetry events

- [ ] Extend `frontend/components/opd/opdQueueTelemetry.ts` — add the slot-mode event types alongside the queue ones:

  ```ts
  export type OpdSlotEventName =
    | "opd_slot.viewed"
    | "opd_slot.action"
    | "opd_slot.filter_changed"
    | "opd_slot.row_clicked";

  export interface OpdSlotEvent {
    event: OpdSlotEventName;
    kind?: string;            // sub-action label (e.g. "mark_no_show", "early_join", "hotkey_enter")
    entryId?: string;
    slotStatus?: string;      // for action / row_clicked events
    statusValue?: string;     // for filter_changed
    queryLength?: number | null; // for filter_changed (search)
    counts?: Record<string, number>; // for viewed
  }

  export function trackOpdSlotEvent(payload: OpdSlotEvent): void {
    /* same body as trackOpdQueueEvent — emit to whatever sink the queue version uses
       (window.analytics, console.debug in dev, etc). PHI-free by contract. */
  }
  ```

  **If sl-04 already added a minimal `trackOpdSlotEvent` + partial type:** widen `OpdSlotEventName` / `OpdSlotEvent` to the union above and ensure the function body stays a single shared implementation (do not duplicate sinks).

- [ ] **`opd_slot.viewed`** — fire **once per distinct session-date load**. After the first successful fetch, emit:

  ```tsx
  const slotViewedFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (opdMode !== "slot") return;
    if (slotEntries.length === 0 && !slotCounts) return;
    if (slotViewedFiredRef.current === sessionDate) return;
    slotViewedFiredRef.current = sessionDate;
    trackOpdSlotEvent({
      event: "opd_slot.viewed",
      counts: slotCounts ?? undefined,
    });
  }, [opdMode, sessionDate, slotEntries.length, slotCounts]);
  ```

  Reset the ref when `sessionDate` changes (already implicit — we compare against the date).

- [ ] **`opd_slot.row_clicked`** — fired by `onRowClick` and by hotkey-Enter (already wired above).

- [ ] **`opd_slot.action`** — `OpdSlotRowActions` should already call `trackOpdSlotEvent` from sl-04. **Verify** payloads include `kind`, `entryId`, and `slotStatus` where applicable. **`rg 'trackOpdQueueEvent\([^)]*opd_slot' frontend/` → zero results** (no slot events through the queue tracker). Leave any queue-toolbar-shared popover calls as `trackOpdQueueEvent` with the explicit `telemetryPrefix` prop — those go through the shared popovers' own routing.

- [ ] **`opd_slot.filter_changed`** — sl-03's `OpdSlotStatusFilter` and the search box should already be emitting; verify they use `trackOpdSlotEvent` after this task.

- [ ] **PHI-free contract.** All slot-mode telemetry events carry `entryId` (a UUID, not PHI), `slotStatus` (an enum), `kind` (a string label), `counts` (numbers). **No patient names, no phone numbers, no MRNs.** Mirror queue precedent.

### Step 5 — Wave 2 cross-cutting gate verification

- [ ] Run the cross-cutting acceptance gate from [`plan-opd-slot-hub-batch.md`](../plan-opd-slot-hub-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick each box in this task's "Failure log" section as you confirm. Any red box → STOP, fix in the appropriate sl-NN task (sl-01 for backend, sl-02 toolbar, sl-03 filter, sl-04 list/rows; sl-05 for polling/hotkeys/empty/telemetry).

- [ ] Mechanical (run first; fastest):
  - [ ] `pnpm --filter frontend tsc --noEmit` clean.
  - [ ] `pnpm --filter backend tsc --noEmit` clean.
  - [ ] `pnpm --filter frontend lint` clean.
  - [ ] `pnpm --filter backend lint` clean.
  - [ ] `pnpm --filter frontend test` — all previously-green stays green.
  - [ ] `pnpm --filter backend test` — sl-01 tests green; previous green stays green.
  - [ ] `rg "BroadcastDelayPopover|OfferEarlyJoinPopover" frontend/components/opd/OpdQueueSessionToolbar.tsx` → import statements only.
  - [ ] `rg "from .*opdQueueMatcher" frontend/` → zero results.
  - [ ] `rg "<DoctorOpdSlotActions>" frontend/` → one match (the per-appointment usage).
  - [ ] `git status backend/migrations/` → no new files belonging to this batch.
  - [ ] **Test files exist (batch gate — catches “green suite but missing tests”):** `rg "deriveSlotStatus" backend/tests/` → ≥1 hit. `rg "OpdSlotStatusFilter" frontend -g "*.test.*" -g "*.spec.*" -g "!node_modules"` → ≥1 hit (sl-03); if zero, add sl-03 tests before ship. `rg "deriveSlotEmptyState|opdSlotEmptyState" frontend -g "*.test.*" -g "*.spec.*" -g "!node_modules"` → ≥1 hit after this task's unit tests land.
  - [ ] `rg 'trackOpdQueueEvent\([^)]*opd_slot' frontend/` → zero results.

- [ ] HTTP:
  - [ ] **Doctor token:** reuse the same JWT you use for other local doctor API checks (e.g. log in as a doctor in the app → Application → Local Storage / session cookie flow your dev setup documents; or a seeded doctor token from `docs/` / `.env.example` if the repo documents one). Replace `<doctor-token>` in the curl below.
  - [ ] `curl -H "Authorization: Bearer <doctor-token>" "http://localhost:3001/api/v1/opd/slot-session?date=$(date -I)"` → 200 with the expected payload shape.
  - [ ] Cross-doctor probe → 200 with empty entries.

- [ ] Visual smoke (logged in as a slot-mode doctor; seed dev DB to have at least one row per status if possible):
  - [ ] `/dashboard/opd-today` renders toolbar + filter strip + list (no placeholder card).
  - [ ] Polling visible: leave the page open for 30s without interaction; the freshness label updates ("Last updated 30s ago"). Open DevTools Network tab to confirm the poll fires.
  - [ ] Switch tab away for 60s, switch back: poll fires immediately on visibility-return; no requests fire while hidden.
  - [ ] Hotkeys: focus the page (click somewhere harmless), press `J` — focus moves to first row. `K` — back up. `Enter` — opens appointment detail. `S` — overflow opens for focused row. `/` — focus moves to search box.
  - [ ] Stale banner: kill the backend (`pnpm --filter backend stop` or just stop the dev server). After ≤ 30s the slot branch shows the amber "Could not refresh" banner; existing rows stay visible.
  - [ ] Restart backend, click "Retry" in the banner → snapshot refreshes, banner disappears.
  - [ ] Clear all the day's appointments in dev DB → "No slots booked for this date" empty state with the booking link.
  - [ ] Mark every row `completed` → "All slots done for today" empty state.
  - [ ] Click `Late` chip with no late rows → "No `Late` slots." empty state with clear-filter button.
  - [ ] Search "zzzzz" → "No slot matches your search." with clear-search button.
  - [ ] Telemetry (DevTools console — assuming dev sink is `console.debug`): `opd_slot.viewed` fires once on first load with `counts`. `opd_slot.row_clicked` fires on each row click. `opd_slot.action` fires on each overflow-menu invocation. `opd_slot.filter_changed` fires on chip / search change.

- [ ] Backwards-compat (logged in as a queue-mode doctor):
  - [ ] `/dashboard/opd-today` renders the queue branch byte-identically to before. Toolbar / chips / table / row actions / hotkeys / polling all behave the same.
  - [ ] If `OpdQueueSearchBox` gained `forwardRef` in this task: press `/` on the queue hub — focus moves to the **queue** search input (same as before); slot-mode `/` still focuses the slot strip's search when in slot mode.
  - [ ] `opd_queue.*` telemetry still fires.

- [ ] Per-appointment slot actions:
  - [ ] `/dashboard/appointments/[id]` for a slot-mode appointment still renders `<DoctorOpdSlotActions>` with Invite early join / Set delay / Clear delay buttons. Behaviour unchanged.

---

## Failure log

> Format: `[YYYY-MM-DD] Cell <ID>: <one-line description>. Reopened: sl-NN. Resolved: <YYYY-MM-DD or pending>.`

(Empty until verification reveals a failure.)

---

## Out of scope

- **AddSlotDialog** — Wave 3, sl-06.
- **Section collapse / expand for "Completed" / "Missed" / "Overflow"** — defer.
- **Optimistic updates on row actions** — current pattern is "API call → refetch snapshot → re-render". Optimistic UI is a follow-up if doctors complain about the perceived latency.
- **Calendar / hour-rail visualisation** — out of scope, captured as follow-up.
- **Reactivity to other doctors' actions in the same session** (e.g., a receptionist marks a row no-show in another tab) — covered by the 30s poll. Real-time WebSocket updates are out of scope.
- **`useOpdHotkeys` rename** — SL-Q6 deferred.

---

## Files expected to touch

**New:**

- `frontend/components/opd/opdSlotEmptyState.ts` (~70 LOC).

**Modified:**

- `frontend/components/opd/OpdTodayClient.tsx` (~120 LOC delta — add slot polling block + visibility handler + hotkey wiring + empty-state mount + stale banner + `opd_slot.viewed` effect; replace sl-02's one-shot fetch with the polling block).
- `frontend/components/opd/opdQueueTelemetry.ts` (~20–40 LOC delta — extend sl-04's minimal `OpdSlotEvent` / `trackOpdSlotEvent` to the full `OpdSlotEventName` union + payloads; keep a **single** sink implementation shared with `trackOpdQueueEvent`).
- `frontend/components/opd/OpdSlotList.tsx` (~30 LOC delta — render empty state when applicable; honor `focusedRowId` + `onFocusChange` props).
- `frontend/components/opd/OpdSlotMobileList.tsx` (~20 LOC delta — same pattern as desktop list).
- `frontend/components/opd/OpdSlotRowActions.tsx` (~0–15 LOC delta — align `trackOpdSlotEvent` payloads with the widened type if sl-04 used a minimal stub only).
- `frontend/components/opd/OpdSlotStatusFilter.tsx` (~5 LOC delta — convert telemetry call to `trackOpdSlotEvent`).
- `frontend/components/opd/OpdQueueSearchBox.tsx` (~3 LOC delta — `forwardRef` to expose the input ref to the parent for the `/` hotkey, **only if it doesn't already**; verify).

**Tests:** new unit tests for `deriveSlotEmptyState` covering the four `kind` cases. Existing queue tests stay green.

---

## Notes / open decisions

1. **Why one task instead of splitting polling / hotkeys / empty-states / telemetry into four?** Each piece is < 30 LOC of incremental wiring. Four tasks would create four small PRs and quadruple the chat-context overhead. One task with a clear acceptance gate at the end is the right grain.
2. **Why does the polling block live in `OpdTodayClient.tsx` and not a custom hook?** The queue precedent doesn't extract one either — the polling is tightly coupled to the page's mode-switching + freshness state. Extraction is a follow-up; not worth doing in sl-05.
3. **Hotkey hook reuse — what if `useOpdQueueHotkeys`'s callback shape doesn't match?** Pre-load the hook. Two options if shapes differ: (a) thin adapter inline in `OpdTodayClient` for slot-mode; (b) widen the hook's callback signatures. Prefer (a) for sl-05 to avoid touching the hook's queue contract.
4. **Why fire `opd_slot.viewed` once per session-date and not once per mount?** A single page session may switch dates multiple times (date picker); each date is a distinct "viewed" semantically. Once per `sessionDate` matches the queue precedent.
5. **Why include `counts` in the `opd_slot.viewed` payload?** Analytics on session shape ("how many doctors have > 30 slots/day", "how often does a session end with all `completed`") without joining DB tables. PHI-free by construction.
6. **What if the doctor leaves the tab in background for hours?** Polling pauses (visibility-pause). On return, one immediate refresh fires; then the 30s cycle resumes. Cost: zero requests in background.
7. **What if backend goes down for 5 minutes?** Stale banner shows immediately on first failure. Last-good entries stay visible. Polling continues to retry every 30s; on first success the banner disappears + entries refresh. No state corruption.
8. **`opd_slot.row_clicked` vs `opd_slot.action` — when does each fire?** `row_clicked` = whole-row click (or hotkey-Enter) → opens appointment detail. `action` = overflow-menu item invocation. Distinct semantics.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `frontend/hooks/useOpdQueueHotkeys.ts` — reused as-is.
  - All queue-mode polling / empty-state precedents.
- **Source decisions:** [Product plans/plan-opd-slot-hub.md § DL-9, SL-Q6, SL-Q7](../../../../Product%20plans/plan-opd-slot-hub.md).
- **Wave gate:** sl-05 IS the Wave 2 gate verification — every cell ticked here closes the wave.
- **Previous task:** [`task-sl-04-slot-session-list-and-row-actions.md`](./task-sl-04-slot-session-list-and-row-actions.md) — must be merged or green on the same branch.
- **Next task:** [`task-sl-06-add-slot-overflow-dialog.md`](./task-sl-06-add-slot-overflow-dialog.md) — Wave 3, optional. Can ship same-day or N+1.

---

**Owner:** TBD
**Created:** 2026-05-15
**Status:** Pending
