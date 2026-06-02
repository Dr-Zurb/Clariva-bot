# Task oq-13: Keyboard shortcuts + a11y polish + per-filter empty states

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 5, Lane ζ step 2 — **S, ~4h**

---

## Task overview

Three small but related polish jobs that wrap up the page's interaction quality:

1. **Keyboard shortcuts** — `J/K` row navigation (vim-style), `Enter` open the focused row, `C` mark current row called silently, `S` open the overflow menu, `/` focus the search box. All shortcuts respect typing context (no firing while a text input has focus).
2. **A11y polish** — confirm row `aria-label`s, focus-visible rings, screen-reader-only labels for icon buttons, color-contrast pass on the status dot + chip combos.
3. **Per-filter empty states** — replace the single "No queue for this day" copy with context-aware empty states: `"No waiting patients"`, `"No completed yet"`, `"No no-shows yet today"`, plus the search-specific empty state from `oq-08`.

**Estimated time:** ~4h. Mostly the shortcut hook + the empty-state mapping.

**Status:** Drafted.

**Hard deps:** [oq-04](./task-oq-04-table-shell-grouping.md), [oq-07](./task-oq-07-status-filter.md), [oq-08](./task-oq-08-search-box.md), [oq-10](./task-oq-10-row-actions-overflow.md) all shipped (so the surfaces these shortcuts target exist).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D2 (whole-row keyboard)](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability) + Phase 5 polish.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes**. Pre-load:
- This task file.
- `frontend/components/opd/OpdQueueTable.tsx` (post-oq-04).
- `frontend/components/opd/OpdQueueRowActions.tsx` (post-oq-10).
- `frontend/components/opd/OpdQueueSearchBox.tsx` (post-oq-08).
- Existing keyboard-hook patterns in the codebase (search `rg "useHotkey|useKeyboardShortcut|key === '/'" frontend/hooks/`).

**Composer-OK sub-steps:** the empty-state copy mapping table can be Composer.

**Estimated turns:** 3–4 Sonnet turns.

---

## Acceptance criteria

### Keyboard hook

- [ ] New file `frontend/hooks/useOpdQueueHotkeys.ts`:

  ```ts
  export interface UseOpdQueueHotkeysOptions {
    enabled: boolean;
    visibleEntries: DoctorQueueSessionRow[];
    focusedEntryId: string | null;
    setFocusedEntryId: (id: string | null) => void;
    onOpen: (entry: DoctorQueueSessionRow) => void;
    onCallSilently: (entry: DoctorQueueSessionRow) => Promise<void> | void;
    onOpenOverflow: (entry: DoctorQueueSessionRow) => void;
    onFocusSearch: () => void;
  }

  export function useOpdQueueHotkeys(opts: UseOpdQueueHotkeysOptions): void;
  ```

- [ ] Bindings (single keys, no modifiers):
  - `J` → move focus to the next visible entry. Wraps at the bottom.
  - `K` → move focus to the previous visible entry. Wraps at the top.
  - `Enter` → `onOpen(focusedEntry)`. Same as clicking the row.
  - `C` → `onCallSilently(focusedEntry)`. No-op when status ∉ {waiting}.
  - `S` → `onOpenOverflow(focusedEntry)`. The overflow menu programmatically opens.
  - `/` → `onFocusSearch()`. Selects the search box and prevents the literal `/` from being typed.
- [ ] **Typing-context guard** — every binding bails when:
  - `document.activeElement` is `<INPUT>`, `<TEXTAREA>`, or `[contenteditable]`.
  - **Exception:** `Esc` while in the search box blurs the input back to the table (see Notes #1 — soft optional, ship if cheap).
- [ ] **Mod-key guard** — bail when `ctrlKey || metaKey || altKey` is true. Single keys only.
- [ ] **Selection visualization** — focused row gets a left-edge focus ring (color: `ring-primary`, width: 2 px). The row component already supports `tabIndex={0}` (oq-03); add a new `focused` prop or use `aria-selected="true"` and style accordingly. Don't conflate `focused` with `isNextUp` — they can co-occur.

### Wire-up

- [ ] In `OpdTodayClient`:
  - Track `focusedEntryId` state (default `null` → first visible entry on first `J/K`).
  - Compose visible entries (after status + search filters) into a flat array; pass to `useOpdQueueHotkeys`.
  - Wire `onOpen`, `onCallSilently`, `onOpenOverflow`, `onFocusSearch` to existing handlers.
  - **Search ref:** create a ref in `OpdTodayClient`, pass to `<OpdQueueSearchBox inputRef={ref}>`, and `onFocusSearch={() => ref.current?.focus()}`.
  - **Overflow open ref:** the `<OpdQueueRowActions>` component exposes an `onOpenChange` API via `<DropdownMenu>`; expose a programmatic open method (or use `data-row-id` query selector + click). Pick whichever is simpler.

### A11y polish

- [ ] **Row a11y** (extend `oq-03`'s `OpdQueueDenseRow`):
  - Add `aria-selected` reflecting the `focused` prop.
  - Confirm focus-visible ring is visible on keyboard focus (`focus-visible:ring-2`).
- [ ] **Icon buttons everywhere** (Open chevron, overflow ⋯, copy phone, refresh, density toggle):
  - Each has `aria-label`.
  - Each has a tooltip for sighted users.
- [ ] **Status pills + dots:**
  - Each `Badge` from `getOpdStatusMeta` already has its label baked in; verify dot color is supplemented by the text/icon.
  - Run a manual contrast check on the status meta colors against the row backgrounds (light + dark) — if any combo fails WCAG AA (4.5:1), report in the task close-out and file a follow-up; **don't** edit the canonical meta map in this task.
- [ ] **Tab order** (run through the page with Tab key):
  - Toolbar (left actions → density → refresh) → status chips → search → table column header (skipped, not interactive) → first row's chevron → first row's overflow → second row's chevron, etc.
  - No tab traps in popovers; `Esc` closes them and returns focus.
- [ ] **Live region for snapshot updates:** add an `aria-live="polite"` invisible region announcing `"Queue refreshed at HH:mm"` after each successful poll. Throttle to 1/min so the screen reader isn't spammed.

### Per-filter empty states

- [ ] New small helper `frontend/components/opd/opdQueueEmptyState.ts`:

  ```ts
  export interface OpdQueueEmptyStateInput {
    statusFilter: OpdQueueStatusFilterValue;
    query: string;
    sessionDate: string; // YYYY-MM-DD
  }

  export function getOpdQueueEmptyState(input: OpdQueueEmptyStateInput): {
    title: string;
    description: string;
  };
  ```

  Mapping (priority: query first, then status):

  | Condition | Title | Description |
  |---|---|---|
  | `query !== ''` | `"No matches for "${query}"."` | `"Try a different name, phone, or token."` |
  | `statusFilter === 'waiting'` | `"No waiting patients."` | `"Patients arriving will show here."` |
  | `statusFilter === 'called'` | `"No one called yet."` | `"Click Open on a row to call the next patient in."` |
  | `statusFilter === 'in_consultation'` | `"No active consultation."` | `"Open a patient to start one."` |
  | `statusFilter === 'completed'` | `"Nobody finished yet."` | `"Completed patients will show here."` |
  | `statusFilter === 'no_show'` | `"No no-shows yet today."` | `"Patients you mark as no-show or skip will show here."` |
  | default (`all`, no rows) | `"No queue for this day."` | `"Bookings in queue mode will appear here on ${sessionDate}."` |

- [ ] `<OpdQueueTable>` (post-oq-04) consumes this helper for its empty state instead of the hardcoded copy. Helper is pure → easy to unit-test.

### Tests

- [ ] Unit-test `getOpdQueueEmptyState` (~30 LOC; `frontend/__tests__/components/opd/opdQueueEmptyState.test.ts`).
- [ ] Manual smoke test of each shortcut (no automated test required; documenting the keys in the task close-out is enough).

### Type-check + lint

- [ ] Clean.

---

## Out of scope

- **Cmd-K command palette integration** — the global cmd-k from the cockpit batch should pick up `/dashboard/opd-today` actions naturally; out of scope here.
- **Multi-key chord shortcuts** (e.g. `g q`) — single keys keep mental load low.
- **Power-user shortcut help dialog** — out of batch (track in inbox: "OPD queue shortcut cheat-sheet on `?`").
- **Skip-link to main content** — should already exist from a global a11y pass; verify but don't add here.

---

## Files expected to touch

**New:**
- `frontend/hooks/useOpdQueueHotkeys.ts` (~120 LOC)
- `frontend/components/opd/opdQueueEmptyState.ts` (~50 LOC)
- `frontend/__tests__/components/opd/opdQueueEmptyState.test.ts` (~50 LOC)

**Modified:**
- `frontend/components/opd/OpdTodayClient.tsx` (~30 LOC — wire hooks, refs)
- `frontend/components/opd/OpdQueueDenseRow.tsx` (~5 LOC — `focused` prop + ring)
- `frontend/components/opd/OpdQueueTable.tsx` (~10 LOC — consume empty-state helper, render live region)
- `frontend/components/opd/OpdQueueSearchBox.tsx` (~3 LOC — accept `inputRef`)
- `frontend/components/opd/OpdQueueRowActions.tsx` (~5 LOC — programmatic overflow open hook)

---

## Notes / open decisions

1. **`Esc` to blur the search box.** Nice-to-have; doesn't conflict with anything. Ship if it costs ≤5 LOC.
2. **Why `J/K` not `↑/↓`.** Doctors using a keyboard during clinic want their hands on home-row. `J/K` matches vim / Gmail / GitHub conventions. Arrow keys still work for tab nav between buttons; row-level nav uses `J/K`.
3. **`C` for call silently.** Mnemonic. The user already retired the visible `Call` button (`oq-10`); this hotkey is the keyboard equivalent for power users who want fast silent flagging.
4. **Live region throttle.** Without it, every 30 s poll announces; doctors using screen readers would hate that. 1/min is a fair default.

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D2](../plan-opd-queue-redesign-batch.md)
- **Hotkey precedent (cockpit batch):** `frontend/hooks/useCockpitHotkeys.ts` (post-pf-14) — same pattern.
- **Row component:** [task-oq-03-dense-row-component.md](./task-oq-03-dense-row-component.md)
- **Search box:** [task-oq-08-search-box.md](./task-oq-08-search-box.md)
- **Overflow:** [task-oq-10-row-actions-overflow.md](./task-oq-10-row-actions-overflow.md)

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
