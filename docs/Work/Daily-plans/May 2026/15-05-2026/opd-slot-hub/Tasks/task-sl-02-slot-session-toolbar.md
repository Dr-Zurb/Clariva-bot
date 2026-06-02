# Task sl-02: Slot session toolbar (with shared popover extraction)

## 15 May 2026 — Batch [OPD Slot Hub](../plan-opd-slot-hub-batch.md) — Wave 2, Lane α step 0 — **M, ~3h**

---

## Task overview

Build the slot-mode session toolbar — the slot variant of `OpdQueueSessionToolbar.tsx`. Same chrome (date picker + Slot pill + popover buttons + freshness + manual refresh), slot-specific resolvers for the popover targets.

**Critical sub-step: extract the popovers.** `OpdQueueSessionToolbar.tsx` currently inlines `BroadcastDelayPopover` and `OfferEarlyJoinPopover` (~330 LOC of the file). Both popovers are mode-agnostic — same trigger button, same form, same telemetry, same backend calls. Extract them to shared modules under `frontend/components/opd/shared/` and re-import from both toolbars. This prevents the slot/queue toolbars from drifting apart over time and keeps the diff size manageable.

**Mounts** under the slot branch of `OpdTodayClient.tsx` (lines 437–486 today), replacing the placeholder card's date band and the placeholder card itself (the toolbar takes over the date+pill role; sl-04 fills the body).

**Estimated time:** ~3h (1h popover extraction with queue-test verification, 1.5h new slot toolbar + slot-specific resolvers, 0.5h mount + verification).

**Status:** Pending.

**Hard deps:** sl-01 (slot session snapshot endpoint must exist; this task consumes its `SlotSessionRow[]` type and its `entries` to compute the popover targets).

**Source:** [plan-opd-slot-hub-batch.md § Wave 2](../plan-opd-slot-hub-batch.md#wave-2--hub-ui-4-tasks-9h-single-sequential-lane) + `S1.2` and `DL-5` in [Product plans/plan-opd-slot-hub.md](../../../../Product%20plans/plan-opd-slot-hub.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 — Auto is the execution default for well-spec'd frontend work. The hardest decision here is "extract the popovers without breaking queue tests" — a mechanical refactor with a clear extraction boundary. **Not on the hard-rules list:** no security primitives, no PHI handling, no migration. Auto handles this cleanly with the queue toolbar pre-loaded.

**Per-message escalation rule:** if Auto stalls (e.g., on the popover-extraction boundary), escalate that **one message** to Opus 4.7 Extra High; don't switch the whole chat.

**Manual-Sonnet fallback:** only if you want to A/B-test or pin the model for a bug repro.

**New chat?** **Yes** — fresh chat. Do NOT carry sl-01's chat into this one (different package, different concerns).

Pre-load:

- This task file.
- `frontend/components/opd/OpdQueueSessionToolbar.tsx` (the entire ~625 LOC — the precedent for the slot toolbar AND the source of `BroadcastDelayPopover` + `OfferEarlyJoinPopover` extractions).
- `frontend/components/opd/OpdTodayClient.tsx` (lines 437–486 — the slot branch we mount under; lines 349–435 — the queue branch's toolbar mount for reference).
- `frontend/types/opd-doctor.ts` (post-sl-01 — `SlotSessionRow` shape).
- `frontend/lib/api.ts` lines 460–540 (`postDoctorSessionDelay`, `postDoctorOfferEarlyJoin`, `getDoctorOpdSlotSession` — sl-02 only consumes; doesn't add new endpoints).
- `frontend/components/opd/opdQueueTelemetry.ts` (the telemetry event shape — extend in sl-05; sl-02 just emits using existing event names with `opd_slot.*` prefix where appropriate).
- Source plan §DL-5 (toolbar shape + popover behavior) + §SL-Q1 (per-appointment delay scope) + §SL-Q2 (strict early-join policy).

**Estimated turns:** 4–6 turns (1 turn extract `BroadcastDelayPopover`, 1 turn extract `OfferEarlyJoinPopover`, 1–2 turns slot toolbar + resolvers, 1 turn `OpdTodayClient` mount, 1 turn verification).

---

## Acceptance criteria

### Step 1 — Extract `BroadcastDelayPopover` to shared

- [ ] Create `frontend/components/opd/shared/BroadcastDelayPopover.tsx`. Move the entire `BroadcastDelayPopover` component (currently in `OpdQueueSessionToolbar.tsx` lines ~119–346) verbatim, with these props:

  ```tsx
  export interface BroadcastDelayPopoverProps {
    token: string;
    /**
     * The appointment to attach the delay to. Resolver lives in the parent
     * (queue or slot toolbar). Pass `null` to disable the trigger with a
     * tooltip.
     */
    target: {
      appointmentId: string;
      patientName: string;
      tokenNumber?: number | null; // queue only; slot mode passes undefined
      scheduledAt?: string;        // slot mode passes ISO; queue passes undefined
    } | null;
    onSuccess: () => void;
    /**
     * Optional copy override for the popover header. Default is "Set running-late delay".
     * Slot mode may override to "Delay (next/current): …" for clarity.
     */
    headerLabel?: string;
  }
  ```

- [ ] Inside the popover body's "Applies to:" line, branch on whether `target.tokenNumber` is present:
  - Queue mode: `"Asha M. (token #5)"`.
  - Slot mode: `"Asha M. (10:30)"` (uses `formatTimeShort(target.scheduledAt)` — add a small helper from `frontend/lib/format-date.ts` if one doesn't exist).

- [ ] **Telemetry event prefix.** Today the popover emits `opd_queue.action`. Make this configurable:

  ```tsx
  export interface BroadcastDelayPopoverProps {
    /* ... */
    telemetryPrefix?: 'opd_queue' | 'opd_slot';  // default 'opd_queue' for backward compat
  }
  ```

  Pass `telemetryPrefix='opd_slot'` from the slot toolbar; queue toolbar uses the default.

- [ ] **Update `OpdQueueSessionToolbar.tsx`** to import the popover from the new path:
  ```tsx
  import { BroadcastDelayPopover } from "./shared/BroadcastDelayPopover";
  ```
  Delete the inline definition. Pass props with `tokenNumber: target.tokenNumber` and no `headerLabel` / no `telemetryPrefix` (defaults preserved).

### Step 2 — Extract `OfferEarlyJoinPopover` to shared

- [ ] Same extraction pattern. Move `OfferEarlyJoinPopover` (currently `OpdQueueSessionToolbar.tsx` lines ~358–500) to `frontend/components/opd/shared/OfferEarlyJoinPopover.tsx`. Props:

  ```tsx
  export interface OfferEarlyJoinPopoverProps {
    token: string;
    target: {
      appointmentId: string;
      patientName: string;
      tokenNumber?: number | null;
      scheduledAt?: string;
    } | null;
    onSuccess: () => void;
    /** Disabled-state tooltip copy. Default: "No eligible upcoming patient to invite." */
    disabledTooltip?: string;
    telemetryPrefix?: 'opd_queue' | 'opd_slot';
  }
  ```

- [ ] Slot mode disabled-state tooltip is more informative: `"No upcoming patient whose preceding slot is completed. Early invite respects slot order (DL-5 / §5.1b)."`

- [ ] Same import-substitution in `OpdQueueSessionToolbar.tsx`.

### Step 3 — Slot-specific resolvers

- [ ] Create `frontend/components/opd/shared/opdToolbarResolvers.ts`:

  ```ts
  import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
  import type { SlotSessionRow } from "@/types/opd-doctor";

  // ── Queue-mode resolvers (extracted from OpdQueueSessionToolbar.tsx) ─────

  export function resolveQueueDelayTarget(active: DoctorQueueSessionRow[]): DoctorQueueSessionRow | null {
    return (
      active.find((r) => r.queueStatus === "in_consultation") ??
      active.find((r) => r.queueStatus === "waiting") ??
      null
    );
  }

  export function resolveQueueEarlyJoinTarget(active: DoctorQueueSessionRow[]): DoctorQueueSessionRow | null {
    return (
      active.find(
        (r) =>
          r.queueStatus === "waiting" &&
          (r.appointmentStatus === "pending" || r.appointmentStatus === "confirmed")
      ) ?? null
    );
  }

  // ── Slot-mode resolvers (sl-02) ─────────────────────────────────────────

  /**
   * Delay target for slot mode (DL-5):
   *   1. The in-consultation slot (if any)
   *   2. else the next upcoming slot (smallest scheduledAt >= now)
   *   3. else null (disable popover)
   */
  export function resolveSlotDelayTarget(
    entries: SlotSessionRow[],
    nowMs: number
  ): SlotSessionRow | null {
    const inConsult = entries.find((r) => r.slotStatus === "in_consultation");
    if (inConsult) return inConsult;

    const upcoming = entries
      .filter(
        (r) =>
          (r.slotStatus === "upcoming" || r.slotStatus === "grace") &&
          new Date(r.scheduledAt).getTime() >= nowMs
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );

    return upcoming[0] ?? null;
  }

  /**
   * Early-join target for slot mode (DL-5 / §5.1b strict policy):
   *   - The next pending|confirmed appointment whose **preceding slot** (by
   *     chronological position) is `completed`.
   *   - "Preceding slot" = the most recent entry whose scheduledAt < target.scheduledAt.
   *   - Empty preceding slot (no entry before target) ⇒ early-join eligible
   *     (nothing to wait on).
   *   - Returns null when no such target exists.
   */
  export function resolveSlotEarlyJoinTarget(
    entries: SlotSessionRow[]
  ): SlotSessionRow | null {
    // Sort once by scheduledAt ascending (snapshot already sorts by position).
    const sorted = [...entries].sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );

    for (let i = 0; i < sorted.length; i += 1) {
      const candidate = sorted[i];
      if (
        (candidate.slotStatus === "upcoming" || candidate.slotStatus === "grace") &&
        (candidate.appointmentStatus === "pending" ||
          candidate.appointmentStatus === "confirmed")
      ) {
        // Find the most recent preceding non-cancelled, non-overflow slot.
        const preceding = sorted
          .slice(0, i)
          .filter((r) => r.slotStatus !== "cancelled" && r.slotStatus !== "overflow")
          .pop();
        if (!preceding || preceding.slotStatus === "completed") {
          return candidate;
        }
        // Preceding slot is not completed → strict policy stops here; no eligible target.
        return null;
      }
    }
    return null;
  }
  ```

- [ ] **Why a separate resolvers module?** Both queue and slot toolbars need the resolvers; co-locating them with the shared popovers prevents toolbar files from owning row-shape logic. Easy to unit-test later (the strict-policy logic is non-trivial).

### Step 4 — `OpdSlotSessionToolbar.tsx`

- [ ] Create `frontend/components/opd/OpdSlotSessionToolbar.tsx`. Mirror `OpdQueueSessionToolbar.tsx`'s shell (the date input + Slot pill + popover row + freshness + refresh button on the right). Props:

  ```tsx
  export interface OpdSlotSessionToolbarProps {
    token: string;
    /** Snapshot rows used by resolvers + popover targets. */
    entries: SlotSessionRow[];
    /** Wall-clock of last successful poll (ms epoch); from the parent's polling block. */
    lastUpdatedAt: number | null;
    onRefresh: () => void;
    onMutationSuccess: () => void;
    sessionDate: string;
    onChangeSessionDate: (next: string) => void;
    /** Mode pill text — always "Slot" for this toolbar. Kept as a prop for symmetry with queue. */
    mode?: "slot";
    /**
     * Optional "Add slot" trigger — wired by sl-06 in Wave 3. sl-02 ships the slot for it
     * (a stable `<div data-slot="add-slot-trigger" />` placeholder that sl-06 fills).
     * Pass undefined for now.
     */
    addSlotTriggerSlot?: React.ReactNode;
  }
  ```

- [ ] Use `resolveSlotDelayTarget(entries, Date.now())` to compute the delay target. Use `resolveSlotEarlyJoinTarget(entries)` for early-join. Pass each target to the corresponding popover with the slot-shape `target` object:

  ```tsx
  const delayTarget = useMemo(
    () => resolveSlotDelayTarget(entries, Date.now()),
    [entries]
  );
  const earlyJoinTarget = useMemo(
    () => resolveSlotEarlyJoinTarget(entries),
    [entries]
  );

  // ...

  <BroadcastDelayPopover
    token={token}
    target={
      delayTarget
        ? {
            appointmentId: delayTarget.appointmentId,
            patientName: delayTarget.patientName,
            scheduledAt: delayTarget.scheduledAt,
          }
        : null
    }
    onSuccess={onMutationSuccess}
    headerLabel="Delay (next/current)"
    telemetryPrefix="opd_slot"
  />

  <OfferEarlyJoinPopover
    token={token}
    target={
      earlyJoinTarget
        ? {
            appointmentId: earlyJoinTarget.appointmentId,
            patientName: earlyJoinTarget.patientName,
            scheduledAt: earlyJoinTarget.scheduledAt,
          }
        : null
    }
    onSuccess={onMutationSuccess}
    disabledTooltip="No upcoming patient whose preceding slot is completed. Early invite respects slot order."
    telemetryPrefix="opd_slot"
  />
  ```

- [ ] Render the `addSlotTriggerSlot` prop **after** the popover row, **before** the freshness/refresh group on the right. sl-06 will fill it; until then it renders nothing.

- [ ] Mode pill always reads `"Slot"`. (Don't render a `Skeleton` like queue does — slot mode is fully resolved by the time this toolbar renders.)

- [ ] `lastUpdatedAt` + `onRefresh` work identically to queue: `timeAgo()` helper for the freshness label, manual refresh button with the same spinning animation.

### Step 5 — Mount in `OpdTodayClient.tsx`

- [ ] In `frontend/components/opd/OpdTodayClient.tsx`, inside the `else` branch (lines 437–486), **replace the entire placeholder structure** with:

  ```tsx
  ) : (
    <div className="flex flex-col gap-3">
      {/* Slot-mode session toolbar — sl-02. */}
      <OpdSlotSessionToolbar
        token={token}
        entries={slotEntries}
        lastUpdatedAt={slotLastUpdatedAt}
        onRefresh={handleSlotRefresh}
        onMutationSuccess={handleSlotRefresh}
        sessionDate={sessionDate}
        onChangeSessionDate={setSessionDate}
        mode="slot"
      />

      {/*
       * Sticky filter strip — sl-03 mounts <OpdSlotStatusFilter> + <OpdQueueSearchBox> here.
       * Until sl-03 lands, render a Skeleton placeholder so the layout doesn't shift
       * when the filter strip drops in.
       */}
      <Skeleton className="h-9 w-full rounded-md" data-testid="slot-filter-strip-placeholder" />

      {/*
       * List body — sl-04 mounts <OpdSlotList> / <OpdSlotMobileList> here.
       * Until sl-04 lands, render a Skeleton placeholder.
       */}
      <Skeleton className="h-64 w-full rounded-lg" data-testid="slot-list-placeholder" />
    </div>
  )}
  ```

- [ ] Add new state at the top of `OpdTodayClient`:

  ```tsx
  // ── Slot-mode snapshot state (sl-02; full polling lands in sl-05) ────────
  const [slotEntries, setSlotEntries] = useState<SlotSessionRow[]>([]);
  const [slotLastUpdatedAt, setSlotLastUpdatedAt] = useState<number | null>(null);

  const handleSlotRefresh = useCallback(async () => {
    try {
      const res = await getDoctorOpdSlotSession(token, sessionDate);
      setSlotEntries(res.data.entries);
      setSlotLastUpdatedAt(Date.now());
    } catch {
      // sl-05 wires the proper error/stale-while-revalidate banner. sl-02 just swallows here.
    }
  }, [token, sessionDate]);
  ```

- [ ] Add a one-shot fetch in a `useEffect` so the toolbar has data on first render:

  ```tsx
  useEffect(() => {
    if (opdMode !== "slot") return;
    void handleSlotRefresh();
  }, [opdMode, handleSlotRefresh]);
  ```

  **Note:** sl-05 will replace this with the proper 30s polling block + visibility-pause. sl-02 ships the one-shot fetch so the toolbar has something to render today.

- [ ] **Delete** the local `slotDateInputRef` + `handleSlotDateClick` machinery (lines 96–102 today). The toolbar owns its own date input + `showPicker()` handling internally (mirror queue toolbar's pattern).

### Step 6 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] **Queue regression check.** Run all existing queue-mode tests + the queue-toolbar snapshot test (if any). The queue toolbar's behaviour must be **identical** to before — only its imports changed (popovers now from `shared/`).
  - `pnpm --filter frontend test -- OpdQueueSessionToolbar` all green (or update snapshot if its rendered tree shows the import path — visually verify only structural identity).
- [ ] `rg "BroadcastDelayPopover|OfferEarlyJoinPopover" frontend/components/opd/OpdQueueSessionToolbar.tsx` returns **import statements only** — zero inline definitions.
- [ ] `rg "BroadcastDelayPopover|OfferEarlyJoinPopover" frontend/components/opd/shared/` returns the new component files.
- [ ] Visual smoke (logged in as a doctor with `opd_mode = 'slot'`):
  - Visit `/dashboard/opd-today`. The page renders the Slot pill + delay + early-join + freshness + refresh in the new toolbar.
  - The placeholder card ("Open an appointment to offer early join...") is **gone**.
  - Below the toolbar: two `<Skeleton>` placeholders for the filter strip and the list (sl-03 + sl-04 will fill them).
  - Click the date picker. Calendar pop opens (`showPicker()`). Pick a different date — toolbar re-fetches.
  - With at least one upcoming appointment in the day's snapshot, the **Broadcast delay** button is enabled. Click → popover opens with the target's name + scheduled time.
  - With no eligible upcoming/in-consult appointment (e.g., all done or cancelled), Broadcast delay button is disabled with the slot tooltip.
  - With at least one pending/confirmed appointment whose preceding slot is `completed`, **Offer early join** button is enabled. Click → popover opens.
  - Otherwise Offer early join is disabled with the new slot-specific tooltip.
- [ ] Visual smoke (logged in as a doctor with `opd_mode = 'queue'`): the queue branch at `/dashboard/opd-today` looks **identical** to before — same toolbar, same chrome, same behaviour. (Confirms the popover extraction is non-breaking.)
- [ ] `rg "<DoctorOpdSlotActions>" frontend/` still returns one match (the per-appointment usage at `frontend/app/dashboard/appointments/[id]/page.tsx`). Untouched by sl-02.

---

## Out of scope

- **Filter strip + chips + search** — that's sl-03. sl-02 mounts a `<Skeleton>` placeholder where they'll go.
- **List / dense rows / mobile cards / row actions** — that's sl-04. sl-02 mounts a `<Skeleton>` placeholder.
- **Polling + hotkeys + telemetry events `opd_slot.viewed`** — that's sl-05. sl-02 ships a one-shot fetch on mount + on date change + on refresh; the 30s `setInterval` block lands in sl-05.
- **"Add slot" button wiring** — that's sl-06. sl-02 only ships the `addSlotTriggerSlot` prop slot; until sl-06 fills it, it renders nothing.
- **Telemetry event renaming for queue mode** — queue keeps its `opd_queue.*` prefix. Only slot mode emits `opd_slot.*`. The shared popovers route via the `telemetryPrefix` prop.
- **`useOpdHotkeys` rename** — SL-Q6 deferred; not this batch.
- **Refactoring `getDoctorOpdQueueSession` to share scaffolding with `getDoctorOpdSlotSession`** — not worth it for two helpers; defer until ≥ 3 helpers exist.

---

## Files expected to touch

**New:**

- `frontend/components/opd/shared/BroadcastDelayPopover.tsx` (~230 LOC — moved from `OpdQueueSessionToolbar.tsx`).
- `frontend/components/opd/shared/OfferEarlyJoinPopover.tsx` (~155 LOC — moved from `OpdQueueSessionToolbar.tsx`).
- `frontend/components/opd/shared/opdToolbarResolvers.ts` (~80 LOC).
- `frontend/components/opd/OpdSlotSessionToolbar.tsx` (~180 LOC — slot variant of the queue toolbar shell).

**Modified:**

- `frontend/components/opd/OpdQueueSessionToolbar.tsx` (~390 LOC delta: delete inline popovers, import from `shared/`. Net: ~250 LOC remaining vs ~625 before).
- `frontend/components/opd/OpdTodayClient.tsx` (~70 LOC delta: replace placeholder branch with toolbar + skeleton placeholders, add slot snapshot state + one-shot fetch effect, delete obsolete date-ref state).
- `frontend/lib/format-date.ts` (potentially +5 LOC — add `formatTimeShort(iso) → "10:30"` helper if missing).

**Tests:** existing queue-mode snapshot tests may need regen (popover-import path changes); visually verify only the import is different. New slot-toolbar tests are deferred to sl-05's bigger test pass.

---

## Notes / open decisions

1. **Why extract the popovers in this task and not as a separate task?** The slot toolbar **must** consume them. Doing the extraction inside sl-02 keeps the diff coherent ("add slot toolbar" = "extract popovers + add slot toolbar"). Splitting into two tasks would create a half-broken intermediate state where the popover is in shared but only the queue consumes it — pure noise.
2. **What if the queue toolbar has subtle inline-only state I miss?** The popovers are ~330 LOC and self-contained (their state is local to themselves; their inputs are only the `target` + `token` + `onSuccess`). The risk is low. The visual smoke check on queue mode catches any regression.
3. **Why not rename `OpdQueueSessionToolbar` → `OpdSessionToolbar` and parameterise on mode?** Two reasons: (a) the slot resolvers + slot-only fields (no token number; scheduledAt instead) make the parametrised version uglier than two thin shells over the shared popovers; (b) the queue toolbar already has tests that pin its name — renaming spreads the diff. Ship two thin shells; merge later if the cost of two files becomes real.
4. **Why a one-shot fetch in sl-02 instead of waiting for sl-05?** Without it, the toolbar has no `entries` and both popovers render disabled. Doctors testing sl-02 in isolation would think the toolbar is broken. Sl-05 replaces the one-shot with proper polling.
5. **`telemetryPrefix` parameterisation — why a string union instead of a callback?** Keeps the popover bodies pure data emitters; the prefix is a one-line concat in the existing `trackOpdQueueEvent` shape. Refactoring telemetry to take a callback is a bigger change for a smaller gain.
6. **Why does `BroadcastDelayPopover` accept `tokenNumber?: number | null`?** Backward compatibility — the queue toolbar passes it; slot toolbar passes `undefined`. The popover renders `"(token #N)"` only when `tokenNumber != null`, else falls back to `"(scheduledAt)"`.
7. **What about slot-specific delay copy — "Patients see ~X min delay" vs "Patients see the running-late banner"?** The existing copy works for slot too — patients in slot mode see the delay banner the same way (per `frontend/components/opd/DelayBanner.tsx`). No copy change needed.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `frontend/lib/format-date.ts` (add `formatTimeShort` helper if missing — the only modify exception above is functionally read-then-add).
  - `frontend/components/opd/DelayBanner.tsx`, `EarlyInviteBanner.tsx` — for context on the patient-side surfaces these toolbar actions trigger.
- **Source decisions:** [Product plans/plan-opd-slot-hub.md § DL-5, SL-Q1, SL-Q2](../../../../Product%20plans/plan-opd-slot-hub.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-slot-hub.md` § Wave 2 gate](./EXECUTION-ORDER-opd-slot-hub.md#wave-2-gate-after-sl-05) — full gate ticked at sl-05's end.
- **Previous task:** [`task-sl-01-slot-session-snapshot-backend.md`](./task-sl-01-slot-session-snapshot-backend.md) — must be merged or green on the same branch.
- **Next task:** [`task-sl-03-slot-status-filter-and-search.md`](./task-sl-03-slot-status-filter-and-search.md) — fresh chat (different files; sticky filter strip only).

---

**Owner:** TBD
**Created:** 2026-05-15
**Status:** Pending
