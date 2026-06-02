# Task pf-14: Keyboard shortcuts + "Running behind" badge

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 3, Lane ζ step 0 — **XS, ~2h**

---

## Task overview

Bundles **P5.1 + P5.3** into one tiny additive task — both live in `CockpitHeader` / its sibling files and naturally cluster:

1. **Keyboard shortcuts** — `Cmd/Ctrl+Enter` fires the same handler as `<RxWorkspace>`'s sticky "Send to patient". `Cmd/Ctrl+Shift+Enter` opens the wrap-up dialog directly.
2. **"Running behind" badge** — small badge in `CockpitHeader` (right of the queue rail counter) showing `+18 min` when current time > `nextAppointment.appointment_date`. Hidden when on time. Soft warning colour.

**Estimated time:** ~2h. Two small additions; can be one chat with two commits.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-05](./task-pf-05-cockpit-header-done-cta.md) shipped (header surface).

**Source:** [plan-patient-seeing-flow.md § P5.1, P5.3](../../../../Product%20plans/plan-patient-seeing-flow.md#p51--keyboard-shortcuts).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** for the hotkey hook + badge component. **Composer 2 Fast** is OK for the badge if the hook is done in a separate chat.

**New chat?** **Yes — one chat is fine for both** (they're cohesive). Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/CockpitHeader.tsx`.
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (to find the Send button's handler / event surface).
- `frontend/components/global/GlobalCommandPalette.tsx` (precedent for the cmd-K shortcut pattern).
- `frontend/hooks/useTodaysAppointments.ts` (or pf-10's hook for the next-appointment time).

**Composer-OK sub-steps:** the badge component can be its own ~30 LOC file authored by Composer.

**Estimated turns:** 2–3 Sonnet turns.

---

## Acceptance criteria

### Hotkey hook (P5.1)

- [ ] New file `frontend/hooks/useCockpitHotkeys.ts` exporting:

  ```ts
  export interface UseCockpitHotkeysOpts {
    onSendRx?: () => void;
    onOpenWrapUp?: () => void;
    enabled?: boolean;            // false during wrap-up dialog open
  }
  export function useCockpitHotkeys(opts: UseCockpitHotkeysOpts): void;
  ```

- [ ] Listens on `window` `keydown`. Matches `(metaKey || ctrlKey) && key === 'Enter'` → calls `onSendRx`. With `shiftKey` also pressed → calls `onOpenWrapUp` instead.
- [ ] Skips when the active element is a text input / textarea / contenteditable. Prevents firing while typing.
- [ ] Skips when `enabled === false`.
- [ ] Cleanup on unmount.

### Wiring

- [ ] Mounted in `ConsultationCockpit`. `onSendRx` resolves to the same handler as `<RxWorkspace>`'s sticky Send button (refactor or expose via context if needed — minimal-touch is fine, e.g. lift the handler ref).
- [ ] `onOpenWrapUp` opens the same `<WrapUpDialog>` flow as the header CTA.
- [ ] `enabled` is `false` when wrap-up dialog is open (avoid duplicate triggers).
- [ ] When the Send button is **disabled** (e.g. medicines empty, send already in flight), the hotkey is a no-op (delegate to the button's existing disabled state).

### Running-behind badge (P5.3)

- [ ] New file `frontend/components/consultation/cockpit/RunningBehindBadge.tsx` (~40 LOC) exporting `<RunningBehindBadge currentAppointmentId={...} />`.
- [ ] Reads from the same data source as `useNextAppointmentRoute` (or directly from `useDoctorDayPipeline`'s next-active entry).
- [ ] Shows `+{N} min` when `now > nextAppointment.appointment_date`. Hidden otherwise.
- [ ] Styled as a subtle warning badge — `bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100` (or your existing warning-soft variant).
- [ ] Tooltip on hover: `Next slot at {time} — running behind by {N} minutes`.
- [ ] Mounted in `CockpitHeader` to the right of the queue-rail counter (or next to it — your call; visible on `lg+` only).

### General

- [ ] Type-check + lint clean.
- [ ] Hotkey works regardless of which sub-pane has focus (window-level listener).
- [ ] Badge updates each minute (use a 1-minute interval or a `useNow()` helper if the codebase has one).

---

## Out of scope

- **Customising the shortcut keys** — fixed bindings v1.
- **Showing the user the shortcuts somewhere (cheat sheet)** — defer; cmd-K palette can list them later.
- **Threshold tuning** — badge fires immediately past the slot time. Any grace-period logic belongs in pf-13's "Late" chip.

---

## Files expected to touch

**New:**
- `frontend/hooks/useCockpitHotkeys.ts` (~70 LOC)
- `frontend/components/consultation/cockpit/RunningBehindBadge.tsx` (~40 LOC)

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~10 LOC — mount the hook)
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~5 LOC — mount the badge)

**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why not `Cmd/Ctrl+S` for save.** Browsers hijack it for "Save page" in some contexts. `Cmd+Enter` is unambiguous + matches Slack / X mental model.
2. **`Cmd+Shift+Enter` discoverability.** Low — but doctors who want shortcuts will look for them. Don't surface a tooltip for v1; revisit if usage is zero.
3. **Badge visibility on `<lg`.** Hidden because the cockpit header is space-tight on small screens. Inbox a follow-up if doctors want it on mobile.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P5.1 + P5.3](../../../../Product%20plans/plan-patient-seeing-flow.md#p51--keyboard-shortcuts)
- **Hotkey precedent:** `frontend/components/global/GlobalCommandPalette.tsx`
- **Header host:** [task-pf-05-cockpit-header-done-cta.md](./task-pf-05-cockpit-header-done-cta.md)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
