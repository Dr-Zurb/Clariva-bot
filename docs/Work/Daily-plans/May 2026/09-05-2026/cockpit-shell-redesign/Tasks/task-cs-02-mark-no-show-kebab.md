# Task cs-02: Move `Mark no-show` from inline header link into the KebabMenu

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase A, Lane γ — **S, ~1.5h**

---

## Task overview

Earlier today, [`cp-05`](../../cockpit-polish/Tasks/task-cp-05-mark-no-show-ready-header.md) added a `Mark no-show` ghost link to the cockpit header so doctors could correctly flag a no-show patient pre-call. After [`cp-09`](../../cockpit-polish/Tasks/task-cp-09-cockpit-header-two-row-layout.md) restructured the header into a two-row layout, the cp-05 button ended up:

1. **Visually misplaced** — pushed to the far right of row 2 by an `ml-auto`, alongside demographic chips ("Age 42 · Male"). That row's job is metadata, not actions; the button feels foreign.
2. **Invalid HTML** — `<button>` is rendered inside a `<p>` (the row 2 wrapper). React doesn't error, but DOM spec doesn't allow interactive content inside paragraphs. Lighthouse a11y warns.
3. **Inconsistent with sibling actions.** `Reschedule`, `Cancel`, `Open patient profile` are all in the existing `<KebabMenu>` (the `⋯` button on row 1). `Mark no-show` is the same shape of action — clinical-impact discrete event — but lives in a different surface. Doctors hunt for it.

The fix is to **move the button into the existing `KebabMenu`** as a proper menu item, alongside its siblings, and let the second row revert to demographic-only metadata. The `m` keyboard shortcut from cp-05 stays bound — only the click surface moves.

**Estimated time:** ~1.5h.

**Status:** Pending.

**Hard deps:** none — cp-05 and cp-09 already shipped.

**Source:** [plan-cockpit-shell-redesign-batch.md § CS-D5](../plan-cockpit-shell-redesign-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (the file changed by cp-05 + cp-09).
- The existing `KebabMenu` component (likely `frontend/components/ui/KebabMenu.tsx` or co-located inside the header — grep first).
- `frontend/hooks/useCockpitHotkeys.ts` (verify the `m` binding still wires to the same `onMarkNoShow` callback after the move).

**Estimated turns:** 2–3 turns (impl + a11y / hotkey verification).

---

## Acceptance criteria

### `Mark no-show` is a `KebabMenu` item

- [ ] In `<CockpitHeader>`, locate the cp-05 inline button:
  ```tsx
  <button
    type="button"
    onClick={onMarkNoShow}
    className="ml-auto text-sm text-rose-600 hover:underline …"
  >
    Mark no-show
  </button>
  ```
  and **delete it**.

- [ ] Locate the existing `<KebabMenu>` invocation in row 1 of the header. Add a new `MenuItem` (or whatever the API of the local Kebab is) **before** `Cancel` (it's a less-destructive action than cancel, more-destructive than reschedule):

  ```tsx
  <KebabMenuItem
    onClick={onMarkNoShow}
    disabled={!canMarkNoShow}
    aria-keyshortcuts="m"
  >
    Mark no-show
    <span className="ml-auto text-xs text-muted-foreground">m</span>
  </KebabMenuItem>
  ```

  - `canMarkNoShow` is the same boolean cp-05 used to enable / disable the button (true only when the cockpit state is `ready` and the appointment is past its scheduled start). Lift it into the kebab-item disabled prop unchanged.
  - `aria-keyshortcuts="m"` advertises the hotkey to AT users.
  - The trailing `<span>` shows the hotkey hint inline (matching the established pattern for other shortcut items if there are any; if not, this is a clean addition).

### Header row 2 reverts to demographics-only

- [ ] After the inline button is removed, row 2 of the header should contain just the demographic + secondary-metadata pills:
  - "Age 42 · Male" (from cp-09)
  - Phone number
  - Modality icon + label
  - Scheduled time
  - OPD token (post cs-04)

  **No** action buttons. **No** `ml-auto` on a paragraph wrapping a button.

- [ ] Type-check the file: the `<p>` element should now contain only inline-content children (`<span>`, text). If TypeScript or React's runtime warns about nested interactive content, the fix is wrong — re-check.

### Hotkey survives the move

- [ ] In `useCockpitHotkeys.ts`, the `m` binding still calls the same `onMarkNoShow` callback. **No change required** if the binding is on `onMarkNoShow` directly (not on the inline button).
- [ ] Open `useCockpitHotkeys.test.ts`. Confirm the `m`-key test still passes. If the test mounts `<CockpitHeader>` and asserts the inline button exists in the DOM, **rewrite the assertion** to check that pressing `m` calls the `onMarkNoShow` mock — the click surface should not be part of the test contract.

### A11y + browser smoke

- [ ] **Keyboard nav:** Tab through the cockpit header. The kebab menu trigger gets focus. Press `Enter` to open. Arrow-down to "Mark no-show". Press `Enter`. Confirm `onMarkNoShow` fires.
- [ ] **Screen reader smoke (VoiceOver / NVDA, optional but recommended):** the kebab menu announces "Mark no-show, m" via `aria-keyshortcuts`.
- [ ] **Lighthouse a11y audit:** the previous "interactive content inside paragraph" warning is gone.

### Tests

- [ ] **Update `cockpit-header.test.tsx`** (if it exists) — replace any "renders Mark no-show button in the header" assertion with one that:
  1. Opens the kebab menu.
  2. Asserts a `Mark no-show` menu item is present and enabled when `canMarkNoShow=true`.
  3. Asserts it's disabled when `canMarkNoShow=false`.
- [ ] **`useCockpitHotkeys.test.ts`** — `m` still fires `onMarkNoShow`. (Probably no change needed; verify.)
- [ ] All other cp-NN tests stay green.

---

## Out of scope

- **The KebabMenu component itself.** If our local Kebab is missing variants like `aria-keyshortcuts` support, do **not** rebuild it as part of this task — wire `aria-keyshortcuts` directly on the menu item via spread props if needed, and file a follow-up.
- **Reordering existing kebab items.** `Mark no-show` slots in a sensible position (before `Cancel`); don't shuffle the others.
- **Other action buttons in the header.** The "Done" / "Send Rx" / "Finish visit" CTAs from `<PrescriptionForm>` footer are unaffected — they're not in the header at all.
- **Mobile menu.** If `MobilePillBar` already has its own no-show affordance, don't touch it. If not, this is also out of scope for cs-02 (a separate batch can revisit mobile).

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~25 LOC delta — delete inline button, add kebab item)
- `frontend/components/consultation/cockpit/__tests__/cockpit-header.test.tsx` (if present, ~20 LOC delta)
- `frontend/hooks/__tests__/useCockpitHotkeys.test.ts` (only if it asserts on the inline button presence; otherwise unchanged)

**New:** none.

---

## Notes / open decisions

1. **Why not a "destructive" red kebab item?** The existing `Cancel` is red; promoting `Mark no-show` to red too would dilute the visual hierarchy. `Mark no-show` is documentation, not destruction — keep it the standard text color, with the `Cancel` red reserved for the truly-destructive option below it.
2. **Why before `Cancel`?** Doctors reach for `Mark no-show` more often than `Cancel` (no-shows happen daily; cancellations are rarer admin work). Putting the more-frequent action higher in the menu reduces cognitive load.
3. **What if the Kebab is not yet a discrete component?** If `<CockpitHeader>` inlines the dropdown (e.g. via a Radix `<DropdownMenu>` directly), the change is the same — add a `<DropdownMenuItem>` rather than a custom `<KebabMenuItem>`. The shape generalizes.
4. **Should the disabled state explain itself?** Optional polish: if `canMarkNoShow=false`, render a tooltip on the disabled kebab item: "Available after the scheduled start time has passed". Stretch goal — not required for acceptance.

---

## References

- **Predecessor:** [Daily-plans/May 2026/09-05-2026/cockpit-polish/Tasks/task-cp-05-mark-no-show-ready-header.md](../../cockpit-polish/Tasks/task-cp-05-mark-no-show-ready-header.md) — the inline button cs-02 retires.
- **Header context:** [Daily-plans/May 2026/09-05-2026/cockpit-polish/Tasks/task-cp-09-cockpit-header-two-row-layout.md](../../cockpit-polish/Tasks/task-cp-09-cockpit-header-two-row-layout.md) — the two-row layout that exposed the misplacement.
- **Affected components:**
  - `frontend/components/consultation/cockpit/CockpitHeader.tsx`
  - The local `KebabMenu` (location TBD; grep for `KebabMenu` or for the existing `Reschedule` / `Cancel` items in the header file).
- **Hotkey wiring:** `frontend/hooks/useCockpitHotkeys.ts` — `m` binding.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
