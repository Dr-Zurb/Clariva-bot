# Task pdm-11: OPD-tab mode pill dropdown shortcut + DL-14 soft nudge + telemetry

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 6, Lane α step 1 — **S, ~3h**

---

## Task overview

Wire the OPD-tab toolbar's mode pill (today a static `<OpdModeBadge>`) into the conversion dialog shipped by pdm-05. Ships:

1. **`<OpdSessionModePillDropdown>`** — replaces or wraps the existing `<OpdModeBadge>`. Renders the current mode as a clickable pill on today/future dates; renders the same pill **disabled with a DL-15 tooltip** on past dates.
2. **Click → conversion dialog (DL-12).** Clicking the pill opens `<SessionModeConversionDialog>` (pdm-05) pre-populated with `fromMode = <current>`, `toMode = <the other>`. The dialog's existing preview-then-confirm UX handles the rest.
3. **DL-14 soft nudge.** When the day's `change_count >= 2`, the dropdown's open state shows a one-line advisory at the top: *"You've changed this day's mode {n} times already — patients have been re-notified each time."* No block, just friction.
4. **Telemetry.** Fire `opd_session.mode_flipped` on confirm with `{ from, to, affected_count, overflow_count, source: 'opd_tab' | 'settings' }`. The `source` lets product distinguish quick OPD-tab flips from policy edits in settings.
5. **PD-Q7 single-pill shape preserved.** The toolbar today renders one pill; this task keeps that exact shape on single-mode days. The dropdown is just the pill made interactive; no list of sessions, no extra chrome.

**Estimated time:** ~3h (~30 min component scaffold + DL-15 disabled state, ~1h dialog wiring + DL-14 nudge fetch path, ~1h telemetry + tests, ~30 min mobile + a11y + verification).

**Status:** Pending.

**Hard deps:** pdm-05 (`<SessionModeConversionDialog>`), pdm-02 (the unified `/opd/session` endpoint already returns `mode` + `modeChangeCount`).

**Source:** [plan-opd-per-day-mode-batch.md § Wave 6](../plan-opd-per-day-mode-batch.md#wave-6--in-page-shortcut--polish-2-tasks-5h-single-sequential-lane) + `DL-12`, `DL-14`, `DL-15` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Small UI swap; the heavy logic lives in the dialog. **Not on the hard-rules list.**

**Per-message escalation rule:** if Auto picks the wrong mount point (the pill lives in either `OpdSlotSessionToolbar` or `OpdQueueSessionToolbar` — pdm-03 unified the data source but probably kept both toolbars as separate components), escalate the **one message** that does the mount to Opus 4.7 Extra High. Reason: getting two toolbars to share one component cleanly is fiddly.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **No — same chat as pdm-10 is fine** (Wave 5 → 6 is a continuous polish wave). Pre-load:

- This task file.
- `frontend/components/opd/OpdTodayClient.tsx` (post-pdm-03 + pdm-10 — find the pill mount).
- `frontend/components/opd/OpdModeBadge.tsx` (the current static pill).
- `frontend/components/opd/OpdSlotSessionToolbar.tsx` + `frontend/components/opd/OpdQueueSessionToolbar.tsx` (the per-mode toolbars where the pill is mounted).
- `frontend/components/opd/session-mode/SessionModeConversionDialog.tsx` (pdm-05's dialog).
- `frontend/lib/telemetry.ts` (or wherever `recordTelemetry` lives in the frontend).
- Source plan §DL-12, §DL-14, §DL-15, §PD-Q7.

**Estimated turns:** 3–4 turns (1 component, 1 dialog wiring + DL-14 + telemetry, 1 mobile + tests, 1 verification).

---

## Acceptance criteria

### Step 1 — `<OpdSessionModePillDropdown>` component

- [ ] Create `frontend/components/opd/session-mode/OpdSessionModePillDropdown.tsx`:

  ```tsx
  'use client';

  import { useState } from 'react';
  import { Badge } from '@/components/ui/badge';
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
  import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
  import { ChevronDown, AlertCircle } from 'lucide-react';
  import { SessionModeConversionDialog } from './SessionModeConversionDialog';
  import type { OpdMode } from '@/types/doctor-settings';

  export interface OpdSessionModePillDropdownProps {
    token: string;
    date: string;            // YYYY-MM-DD
    mode: OpdMode;           // currently-resolved mode for `date`
    modeChangeCount: number; // from unified /opd/session response
    isPastDate: boolean;     // computed in OpdTodayClient
    onConverted: () => void; // refetch the session payload
  }

  export function OpdSessionModePillDropdown({
    token,
    date,
    mode,
    modeChangeCount,
    isPastDate,
    onConverted,
  }: OpdSessionModePillDropdownProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [targetMode, setTargetMode] = useState<OpdMode | null>(null);

    const otherMode: OpdMode = mode === 'slot' ? 'queue' : 'slot';

    // DL-15: past dates are mode-pinned. Render the pill disabled with a tooltip.
    if (isPastDate) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Badge variant="outline" className="cursor-not-allowed opacity-60">
                {mode === 'slot' ? 'Slot mode' : 'Queue mode'}
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>Past dates can't be reconfigured.</TooltipContent>
        </Tooltip>
      );
    }

    const handleSelectMode = (target: OpdMode) => {
      if (target === mode) return;
      setTargetMode(target);
      setDialogOpen(true);
    };

    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80" role="button" tabIndex={0}>
              {mode === 'slot' ? 'Slot mode' : 'Queue mode'}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>Switch this day to…</DropdownMenuLabel>
            {modeChangeCount >= 2 && (
              <>
                <div className="mx-1 mt-0.5 mb-1 flex items-start gap-1.5 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs dark:border-amber-700 dark:bg-amber-950/30">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>You've changed this day's mode {modeChangeCount} time{modeChangeCount === 1 ? '' : 's'} already — patients have been re-notified each time.</span>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem disabled={mode === 'slot'} onClick={() => handleSelectMode('slot')}>
              {mode === 'slot' ? '✓ Slot mode (current)' : 'Slot mode'}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={mode === 'queue'} onClick={() => handleSelectMode('queue')}>
              {mode === 'queue' ? '✓ Queue mode (current)' : 'Queue mode'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {targetMode && (
          <SessionModeConversionDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            token={token}
            date={date}
            fromMode={mode}
            toMode={targetMode}
            modeChangeCount={modeChangeCount}
            source="opd_tab"
            onConfirmed={() => {
              setDialogOpen(false);
              setTargetMode(null);
              onConverted();
            }}
          />
        )}
      </>
    );
  }
  ```

- [ ] **Why a `<Badge>` inside a `<DropdownMenuTrigger>` and not a `<Button>` styled as a badge?** The static `<OpdModeBadge>` uses `<Badge>`; preserving the visual identity is PD-Q7. `<DropdownMenuTrigger>` accepts any clickable child via `asChild`.

### Step 2 — Mount the dropdown in the toolbars

- [ ] Find the two toolbars (`OpdSlotSessionToolbar.tsx` and `OpdQueueSessionToolbar.tsx`). Each currently renders an `<OpdModeBadge mode={...} />` (or whatever the existing prop interface is). Replace each with:

  ```tsx
  <OpdSessionModePillDropdown
    token={token}
    date={selectedDate}
    mode={mode}                          // 'slot' for the slot toolbar, 'queue' for the queue toolbar
    modeChangeCount={sessionPayload.modeChangeCount}
    isPastDate={isPastDate(selectedDate)}
    onConverted={() => refetchSession()}  // existing parent refetch
  />
  ```

  - The slot toolbar passes `mode='slot'`; the queue toolbar passes `mode='queue'`. (The toolbar component itself already knows its own mode by virtue of being on the slot/queue render branch of `OpdTodayClient`.)
  - `modeChangeCount` and `isPastDate` are passed through from `OpdTodayClient` to each toolbar — verify the existing prop interface allows this, or extend it minimally.

- [ ] **Helper:** `isPastDate(date: string): boolean` lives in `frontend/lib/dates.ts` (pdm-08 added related helpers). If not yet present:

  ```ts
  export function isPastDate(date: string): boolean {
    return date < todayLocalIso();
  }
  ```

- [ ] **Backwards compatibility:** if other places in the codebase still mount `<OpdModeBadge>` as a static pill (e.g., a per-row badge on an appointment card), leave them. Only the toolbar's pill becomes interactive.

### Step 3 — Telemetry

- [ ] In `SessionModeConversionDialog`'s `onConfirmed` callback (pdm-05 already calls it), fire the telemetry. Verify pdm-05 already invokes telemetry; if it doesn't, add it here:

  ```ts
  // Either in pdm-05's dialog (if it owns the telemetry) or in pdm-11's pill onConverted handler:
  recordTelemetry('opd_session.mode_flipped', {
    from: result.fromMode,
    to: result.toMode,
    affected_count: result.affected,
    overflow_count: result.overflowed ?? 0,
    source: 'opd_tab',
    correlation_id: result.correlationId,
  });
  ```

- [ ] Verify the telemetry primitive — `frontend/lib/telemetry.ts` exposes `recordTelemetry(eventName, payload)`. If the project uses a different name (`logEvent`, `track`, etc.), conform.
- [ ] **Distinguish `source: 'opd_tab' | 'settings'`.** pdm-08's settings flow (when it adds a `date_override` that triggers a conversion) would fire with `source: 'settings'`. pdm-11 always fires with `source: 'opd_tab'`.

### Step 4 — `modeChangeCount` propagation

- [ ] **Verify the unified `/opd/session` endpoint already returns `modeChangeCount`** (pdm-02 plan included it in the payload). Check the actual response shape; if missing, file as a small follow-up in pdm-02's task (don't block pdm-11).
- [ ] In `OpdTodayClient.tsx`, pull `modeChangeCount` from `sessionPayload` and pass it down to each toolbar.
- [ ] Also ensure the dialog (pdm-05) accepts `modeChangeCount` for its own DL-14 footer (the same advisory can appear in both the dropdown header and the dialog footer; this is acceptable redundancy because the dialog is also opened from the settings flow which has no dropdown).

### Step 5 — Mobile + a11y

- [ ] **Mobile (375px DevTools):**
  - The pill remains clickable. Dropdown opens correctly via tap.
  - Dropdown content is wide enough to read (`w-72` ≈ 288px; fits within 375px viewport with margin).
- [ ] **Keyboard:**
  - Tab focuses the pill. Enter / Space opens the dropdown.
  - Arrow keys navigate the dropdown items. Enter selects.
  - Escape closes.
- [ ] **Screen readers:**
  - The pill has `role="button" tabIndex={0}` (since it's a Badge, not a Button — verify the project's `<Badge>` accepts these props).
  - The DL-14 advisory inside the dropdown is announced (use `role="alert"` if the screen-reader pass requires it).

### Step 6 — Tests

- [ ] `frontend/__tests__/components/opd/session-mode/OpdSessionModePillDropdown.test.tsx`:

  - **Past date** (`isPastDate=true`) → renders disabled badge with tooltip "Past dates can't be reconfigured."; no dropdown.
  - **Future date, slot mode, 0 changes** → renders clickable pill. Open dropdown. Sees:
    - Label "Switch this day to…"
    - "✓ Slot mode (current)" (disabled item)
    - "Queue mode" (active item)
    - **No** DL-14 advisory.
  - **Future date, queue mode, change_count=3** → DL-14 advisory shows with "3 times".
  - Click "Queue mode" while in slot → dialog opens with `fromMode='slot'`, `toMode='queue'`, `source='opd_tab'`.
  - Click "Slot mode" while in slot → noop (disabled).
  - Click outside dropdown → dropdown closes.
  - `onConfirmed` from the dialog fires `onConverted` on the parent.

- [ ] Mock `SessionModeConversionDialog` for the dropdown test so the dropdown tests don't pull the whole dialog into scope.

### Step 7 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend test -- OpdSessionModePillDropdown` all green.
- [ ] **End-to-end smoke (manual):**
  1. Open `/dashboard/opd-today` for a doctor with today selected. Pill renders. Click → dropdown opens.
  2. Click "Queue mode" (assuming slot is current). Conversion preview dialog opens with affected count.
  3. Confirm → dialog closes, toolbar refetches, pill now shows "Queue mode", page renders queue list.
  4. Re-flip slot ↔ queue → on the third flip, the dropdown shows the DL-14 advisory.
  5. Navigate to a past date → pill renders disabled with the DL-15 tooltip.
  6. Navigate to a future date with no bookings → pill works; dialog shows "0 patients affected".
- [ ] **Telemetry check** — in the browser devtools network tab, confirm `opd_session.mode_flipped` event fires on confirm with `source: 'opd_tab'`.
- [ ] **`rg` checks:**

  ```bash
  rg "OpdSessionModePillDropdown\b" frontend/
  # Expected: definition + 2 mounts (slot + queue toolbars).

  rg "OpdModeBadge\b" frontend/
  # Pre-existing static badge — leave un-modified mounts in place; only toolbar mounts swap.
  ```

---

## Out of scope

- **Multi-session per day** — PD-D1 deferred. The dropdown is per-day, not per-session.
- **Custom target mode picker** — only slot ↔ queue; no third mode.
- **Per-row pill on appointment cards** — leave the static badge in place wherever it's used outside the toolbar.
- **Notification preview inside the dropdown** — the doctor sees notification counts only after opening the dialog. Keeping the dropdown lightweight.
- **Settings-side telemetry for `source='settings'`** — pdm-08 fires that one. pdm-11 only handles `source='opd_tab'`.

---

## Files expected to touch

**New:**

- `frontend/components/opd/session-mode/OpdSessionModePillDropdown.tsx` (~110 LOC).
- `frontend/__tests__/components/opd/session-mode/OpdSessionModePillDropdown.test.tsx` (~150 LOC).

**Modified:**

- `frontend/components/opd/OpdSlotSessionToolbar.tsx` (~5 LOC delta — swap badge for dropdown).
- `frontend/components/opd/OpdQueueSessionToolbar.tsx` (~5 LOC delta — same swap).
- `frontend/components/opd/OpdTodayClient.tsx` (~5 LOC delta — pass `modeChangeCount` + `isPastDate` through).
- `frontend/lib/dates.ts` (~5 LOC delta — `isPastDate` helper if not present).
- `frontend/lib/telemetry.ts` (no change if the primitive exists; add the event type if there's a typed event registry).

---

## Notes / open decisions

1. **Why a dropdown instead of a single-click toggle?** Today the badge has two states (slot or queue). A single-click toggle would flip blindly; the dropdown forces a deliberate "open menu → pick target" gesture, which is a tiny but effective friction bump even before the preview dialog opens. Also matches the existing project pattern of mode-as-dropdown elsewhere (if applicable; verify).
2. **Why does the advisory live in the dropdown and not in the pill itself?** The pill says "Slot mode" / "Queue mode" — adding "(3 changes)" would clutter the toolbar. The advisory is only seen when the doctor opens the dropdown, which is the moment they're considering another change.
3. **What happens if `modeChangeCount` is missing from the response?** Treat as 0 (no advisory). The advisory is a soft nudge, not a hard requirement; missing data shouldn't break the dropdown.
4. **Should the disabled past-date pill show the date's actual mode or hide the mode entirely?** It shows the mode. The doctor is on a past date for a reason — to view that day's appointments. Knowing whether that day operated in slot or queue is useful context, not noise.
5. **What if the doctor opens the dropdown on a future date with no bookings?** The dialog will show "0 patients affected" and confirm becomes a one-click action. This is fine — the doctor is just marking the policy intent for that date.
6. **DL-14 specific copy** — *"You've changed this day's mode {n} times already — patients have been re-notified each time."* Hardcoded in the dropdown for now; locale support is deferred (the entire app is en-IN for v1).
7. **Why a single component file instead of three (pill + dropdown content + dialog wiring)?** The whole thing is ~100 LOC. Splitting adds ceremony without benefit. If the file grows past 200 LOC, extract.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `frontend/components/opd/session-mode/SessionModeConversionDialog.tsx` (pdm-05) — the dialog this dropdown opens.
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-12, DL-14, DL-15, PD-Q7](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 6 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-6-gate-after-pdm-12).
- **Previous task:** [`task-pdm-10-overrun-tray-ui.md`](./task-pdm-10-overrun-tray-ui.md).
- **Next task:** [`task-pdm-12-polish-and-cleanup.md`](./task-pdm-12-polish-and-cleanup.md).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
