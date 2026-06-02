# Task cp-02: `<CockpitQueueRail>` — collapse to prev / now / next, drop the "+ Walk-in" rail slot

## 09 May 2026 — Batch [Cockpit polish](../plan-cockpit-polish-batch.md) — Phase 1, Lane α step 1 — **S, ~3h**

---

## Task overview

`frontend/components/consultation/cockpit/CockpitQueueRail.tsx` currently renders up to 6 patient chips with a "+N more" overflow. After cp-01 ships and the pipeline returns rows in clean token order, the rail's mental model becomes: *the doctor only ever cares about three positions — the patient they just saw, the patient they're seeing, the patient they're about to see.* Anything beyond that is queue-management, which lives on `/dashboard/opd-today` already.

This task collapses the rail to **exactly three slots** with strict slot semantics:

```
[ ⬅ prev ]     [ ● NOW ]     [ next ➡ ]
   #N-1            #N            #N+1
   gray             status         status
   muted            colour         colour
```

Each chip shows: `#token` + first-name (full name on hover via tooltip) + a colour dot mapped from `getOpdStatusMeta(status).colorClass`. The "now" chip is visually distinct (heavier border, thicker font, larger).

The same edit also removes the "+ Walk-in" trigger that lives at the right end of the rail today (CP-D1: walk-in feature is removed entirely; cp-03 owns the modal-file delete + the `NowNextCard` mount, but the rail-side mount is folded into this task to keep the lane parallel-safe).

**Estimated time:** ~3h (~2h for the rail rewrite, ~1h for the chip tooltip + status dot polish + responsive trim).

**Status:** Pending.

**Hard deps:** **cp-01** — the prev/next derivation depends on `entries` being sorted globally by `tokenNumber`. If cp-01 isn't shipped first, this task's "prev" chip will frequently point at a `done` row that isn't actually the just-finished one.

**Source:** [plan-cockpit-polish-batch.md § CP-D1, CP-D3](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat (don't carry cp-01's context). Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (the full file).
- `frontend/lib/opd-status-meta.ts` (read-only — for `getOpdStatusMeta`).
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` (read-only — for chip styling precedent).
- `frontend/hooks/useDoctorDayPipeline.ts` (read-only — for the pipeline shape).

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### Three-slot layout

- [ ] The rail renders **exactly three chip slots**: `prev`, `now`, `next`. Slot identity is derived from `useDoctorDayPipeline().entries` and `currentIndex`:

  ```ts
  const prev = currentIndex > 0 ? entries[currentIndex - 1] : null;
  const now = entries[currentIndex] ?? null;
  const next = currentIndex >= 0 ? entries[currentIndex + 1] : null;
  ```

- [ ] When a slot is `null` (e.g. doctor is on token `#1` so `prev` doesn't exist), render an **empty placeholder** that visually balances the rail (a dashed-border ghost chip with the text "—") rather than collapsing the layout. This preserves the now-chip's centered position.

- [ ] **No "+N more" overflow pill.** No "see more" trigger. The full queue is one click away on `/dashboard/opd-today` — link the rail's left or right edge to that page (subtle ghost button, e.g. `View all (24)`).

### Chip content

Each non-empty chip shows:

- [ ] **Token number** as `#NN` (zero-padded NO; just `#3`, `#12`, `#107`).
- [ ] **First name only** as the visible label (truncated to ~12 chars with ellipsis if longer).
- [ ] **Status colour dot** at the leading edge — 6 px circle, colour from `getOpdStatusMeta(entry.status).dot` (existing helper used by `OpdQueueStrip` and `OpdQueueDenseRow`).
- [ ] **Tooltip** on hover (use `<Tooltip>` from `@/components/ui/tooltip`) showing: full name + scheduled time + waited time. Pattern matches `OpdQueueStrip`'s chip tooltips exactly.
- [ ] **Click target** routes to `/dashboard/appointments/${entry.id}` for `prev` and `next` chips. The `now` chip is **not clickable** (the doctor is already on this appointment); render it as a `<div>` not a `<Link>`.

### Visual hierarchy

- [ ] **`now` chip** — primary visual weight: `font-semibold`, slightly larger padding (`px-3 py-1.5` vs. `px-2 py-1`), border `border-primary` (or the cockpit's accent), background `bg-primary/5`.
- [ ] **`prev` / `next`** — secondary weight: `font-normal`, `text-muted-foreground`, border `border-border`, transparent background.
- [ ] **Empty placeholder** — `border-dashed border-muted text-muted-foreground/60` + label "—".
- [ ] **Arrow separators** between slots: `<ChevronRight class="h-3 w-3 text-muted-foreground/40" />` between prev→now and now→next. (Rendered only when both adjacent slots are non-empty; otherwise a non-breaking-space spacer.)

### Walk-in removal (rail-side only)

- [ ] **Delete** the `WalkInQuickModal` import (`line 23`).
- [ ] **Delete** the `walkInOpen` state hook + `setWalkInOpen` setter.
- [ ] **Delete** the rail's `+ Walk-in` button block (currently `lines 354–368`) and its surrounding section.
- [ ] **Delete** the `<WalkInQuickModal ... />` mount at the bottom of the component (currently `lines 398–404`).
- [ ] After this edit, the file should have **zero references** to anything walk-in: `rg "[Ww]alk[ -]?[Ii]n" CockpitQueueRail.tsx` → no matches.
- [ ] cp-03 (lane β) handles the modal file deletion + the `NowNextCard` mount + the `MobilePillBar` comment cleanup. **Do not touch those files in this task.**

### Schedule mode behaviour

- [ ] **Schedule mode** (`isQueueMode === false`) — same three-slot layout. The pipeline's `scheduleEntries` sort by `appointment_date` chronologically; `entries[currentIndex - 1] / +1` works identically. **Token number** in this mode falls back to the entry's `position` number (`#N of M`) — wire this through `mapAppointment` if not already exposed.

### Mobile behaviour

- [ ] Below `sm` breakpoint: hide `prev` and `next` chips entirely, render only the `now` chip — the rail becomes a single status pill in the cockpit header. The full queue is still one click away (`View all` link stays visible).

### Type-check + lint + tests

- [ ] Type-check + lint clean.
- [ ] Existing snapshot tests in `frontend/components/consultation/cockpit/__tests__/CockpitQueueRail.test.tsx` (if any) update or add a new snapshot capturing the three-slot layout. **Do not delete** existing tests — update them.

---

## Out of scope

- **Pipeline data shape changes** — `cp-01` already shipped; this task consumes `entries` as-is.
- **Walk-in modal file deletion** — `cp-03` (lane β) handles `WalkInQuickModal.tsx` + `NowNextCard.tsx`.
- **Header redesign** — `cp-09` (lane ε) restructures `CockpitHeader.tsx`. This task only owns the rail.
- **Strip on `/dashboard/opd-today`** — `OpdQueueStrip` is a different component; this task doesn't touch it.
- **Empty-state copy** for "no queue today" — keep whatever the existing rail renders when `entries.length === 0`.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (~150 LOC delta — full layout rewrite)
- `frontend/components/consultation/cockpit/__tests__/CockpitQueueRail.test.tsx` (if exists; otherwise new file with one snapshot test)

**New:** none.

**Deleted:** none. (`WalkInQuickModal.tsx` is deleted in cp-03.)

---

## Notes / open decisions

1. **Why first-name only on the chip?** Patient first names alone fit the chip width budget (~80 px) without truncation in the common case. Full name is on the hover tooltip. If first name is empty (rare — guest appointments), fall back to `Patient` (matches existing fallback in `OpdQueueStrip`).
2. **Status colour dot — what colour for `done`?** Use `gray-400` (not green). The "done" state isn't a celebration; it's a "this is in the past" marker. Mirrors `getOpdStatusMeta('completed').dot`.
3. **What about the OpdQueueStrip on the dashboard?** Different component, different surface. The strip on `/dashboard` is a doctor-overview surface that benefits from the wider 6-chip view. The cockpit rail is in-session and benefits from the focused 3-chip view. Don't unify.
4. **Why hide prev/next on mobile?** The cockpit on mobile is already cramped (header + video room + controls). The full queue is one tap away on `/dashboard/opd-today`, which on mobile uses `OpdQueueMobileCard` (cp-12 from the OPD batch). No need to compete for header real-estate.
5. **`View all (N)` link — clickable target?** `/dashboard/opd-today?date=YYYY-MM-DD` (today's session date in the doctor's timezone). Mirror the existing pattern in `OpdQueueStrip`'s "Open queue" CTA.
6. **Does this break the existing CockpitQueueRail tests?** Almost certainly yes (snapshot mismatch). That's expected — update them. The behaviour-level tests (clicking a chip routes to `/dashboard/appointments/:id`) should still pass with minor selector tweaks.

---

## References

- **Component to rewrite:** `frontend/components/consultation/cockpit/CockpitQueueRail.tsx`
- **Pipeline source:** `frontend/hooks/useDoctorDayPipeline.ts` (cp-01 dependency)
- **Style precedent (chip + tooltip):** `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx`
- **Status colour helper:** `frontend/lib/opd-status-meta.ts § getOpdStatusMeta`
- **Walk-in mount points cp-03 owns:** `frontend/components/dashboard/cockpit/NowNextCard.tsx` lines ~390–404, `frontend/components/dashboard/WalkInQuickModal.tsx` (DELETE).
- **Previous batch context:** [Daily-plans/May 2026/07-05-2026/Tasks/task-pf-08-cockpit-queue-rail.md](../../../07-05-2026/Tasks/task-pf-08-cockpit-queue-rail.md) — initial rail; this task supersedes the 6-chip + overflow design.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
