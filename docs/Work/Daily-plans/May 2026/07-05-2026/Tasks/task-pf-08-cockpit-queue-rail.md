# Task pf-08: `<CockpitQueueRail>` + nav + position counter

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 2, Lane γ step 2 — **M, ~4h**

---

## Task overview

Bundles **P2.1 + P2.3 + P2.4** into one component: a thin (40 px) horizontal strip docked under the existing sticky `CockpitHeader` showing position counter + scrollable token strip + prev / next chevrons. Click a token → cockpit re-mounts on that appointment via `router.push` (no full reload). Click the position counter → opens a `<Popover>` listing the day's full pipeline.

Renders for queue-mode AND slot/telemed-mode (per **P-D5**), sourced from `useDoctorDayPipeline` (pf-07).

**Estimated time:** ~4h. Bulk is the scroll affordance + token sizing across breakpoints + the popover content.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-07](./task-pf-07-doctor-day-pipeline-hook.md) shipped, [pf-05](./task-pf-05-cockpit-header-done-cta.md) shipped (the mount slot in `CockpitHeader`).

**Source:** [plan-patient-seeing-flow.md § P2.1, P2.3, P2.4](../../../../Product%20plans/plan-patient-seeing-flow.md#p21--cockpitqueuerail-component).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A. Bounded UI; primitives all exist.

**Why not Opus:** layout is one row; popover is `<Popover>` + a list; the navigation handler is one `router.push`.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/hooks/useDoctorDayPipeline.ts` (post-pf-07).
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (post-pf-05 — to confirm the mount slot location).
- `frontend/components/ui/badge.tsx`, `frontend/components/ui/popover.tsx`, `frontend/components/ui/button.tsx`.
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` (precedent for token sizing + status meta).

**Composer-OK sub-steps:** none.

**Estimated turns:** 3–5 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` exporting:

  ```ts
  export interface CockpitQueueRailProps {
    currentAppointmentId: string | null;
  }
  export function CockpitQueueRail(props: CockpitQueueRailProps): JSX.Element | null;
  ```

- [ ] Returns `null` when `entries.length === 0` (no day pipeline → no rail).
- [ ] Returns `null` when `state === 'terminal'` (per source plan visibility rule). The state is derivable from the parent `ConsultationCockpit` and passed in via context OR a prop — your call; matching prop drilling is fine.

### Layout

- [ ] Single row, ~40 px tall, docked **below** the existing sticky `CockpitHeader` strip. The new strip is also sticky (sticky stack: header strip → queue rail strip → page content).
- [ ] Three regions, left → right:
  1. **Position counter chunk** (left, fixed width):

     ```
     #4 of 12 · 3 done
     ```

     Use `font-tabular-nums` (or your codebase's tabular-num utility) so digits don't jitter across renders. Click → opens popover (see below).

  2. **Token strip** (middle, flex-1, horizontally scrollable with `overflow-x-auto`):

     ```
     ✓ Rahul S   ●  Asha P (now)   ○ Mohit K (next)   ○ Sara K   ○ +6 more
     ```

     - Each token is a `<Badge>` styled by status (re-use the meta map from pf-12 once it lands; pre-pf-12, hard-code: `completed = green outline`, `in_consultation = solid primary`, `waiting/called = outline`, `missed/no_show = destructive outline`).
     - Tokens are clickable. Click → `router.push(entry.href)` UNLESS `entry.isCurrent` (no-op).
     - The current token gets a left accent border + a `(now)` suffix.
     - The next-active token (first non-current with status ∈ `{waiting, called, pending, confirmed}`) gets a `(next)` suffix.
     - When scrollable, fade the right edge with a CSS gradient.

  3. **Chevron chunk** (right, fixed width):

     ```
     ‹  ›
     ```

     - `‹` → navigate to the entry at `currentIndex - 1` (no-op if `0`). Disabled when there's no previous.
     - `›` → navigate to the entry at `currentIndex + 1` (no-op when at end). Disabled when there's no next.
     - Tooltips: `Previous patient` / `Next patient`.

### Popover (clicked from the position counter)

- [ ] `<Popover>` content is a vertically-scrolling list of the full pipeline (~max 60 % of viewport height, scrollable inside).
- [ ] Each row: status icon · label · token number (queue mode) · time (schedule mode) · `(now)` / `(next)` markers.
- [ ] Click a row → same nav as token click; closes popover.

### Navigation behaviour (P2.3)

- [ ] Use Next.js `router.push(entry.href)`. Because `app/dashboard/appointments/[id]/page.tsx` is a server component, the cockpit client island re-mounts cleanly. That's acceptable for v1; pf-15 makes the next mount feel instant via prefetch.
- [ ] Defensive: if the click target's `entry.id === currentAppointmentId`, no-op (silently ignore).
- [ ] **No full page reload** — verify by watching network tab on click; only the appointment data fetches re-fire.

### Mount slot

- [ ] Mount in `frontend/components/consultation/cockpit/CockpitHeader.tsx` directly below the existing sticky header strip — the slot pf-05 documented. **One import line + one `<CockpitQueueRail currentAppointmentId={appointment.id} />` JSX line.**
- [ ] Do NOT touch any other parts of `CockpitHeader.tsx` — pf-05 owns the rest.

### Mobile / breakpoint behaviour

- [ ] **Hidden** on `<lg` per source plan (mobile keeps the bottom-pill bar from cockpit-7). Use `className="hidden lg:flex …"` (or your codebase's responsive utility).

### General

- [ ] Type-check + lint clean.
- [ ] Renders cleanly in light + dark; tokens have non-clashing contrast for each status.
- [ ] Smoke-tested: open cockpit → rail visible → click prev / next chevrons → cockpit re-mounts on each.

---

## Out of scope

- **Mobile redesign** — source plan P6.5 parked it.
- **Bulk actions on the rail** — source plan P6.6 parked it.
- **Status meta extension** — pf-12 owns the canonical map; this task uses a temporary local map until pf-12 ships, then refactors imports (a 5-min Composer follow-up).

---

## Files expected to touch

**New:**
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (~280 LOC)

**Modified:**
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~3 LOC — one import + one mount line; no other edits)

**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why a top strip instead of a side rail.** P-D3 lock — preserves the cockpit's three-column lock (K1) and gives doctors peripheral awareness without a fifth column. Solo-tested in design pass.
2. **Sticky stacking.** Two sticky bars (header + queue rail) is fine on modern browsers; verify no layout shift when entering / leaving the popover (popover should `position: fixed` so it doesn't push).
3. **`+N more` token.** When `entries.length > 6` and the rest doesn't fit, render a `+N more` token that opens the popover (same as clicking the counter).
4. **Re-using `OpdQueueStrip`'s status meta.** Will share once pf-12 extracts it. For now, hardcode locally; refactor in a follow-up Composer chat.
5. **Prev/next deeper than direct neighbour?** Skipping `completed` / `missed` rows for the chevrons might feel better — but source plan calls for index-±1 strictly. Stick to literal interpretation v1; revisit in a follow-up if doctors complain.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P2.1 / P2.3 / P2.4](../../../../Product%20plans/plan-patient-seeing-flow.md#p21--cockpitqueuerail-component)
- **Hook:** [task-pf-07-doctor-day-pipeline-hook.md](./task-pf-07-doctor-day-pipeline-hook.md)
- **Mount slot:** [task-pf-05-cockpit-header-done-cta.md](./task-pf-05-cockpit-header-done-cta.md)
- **Status-meta precedent (will share post pf-12):** `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx`

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
