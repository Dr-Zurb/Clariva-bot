# Task cs-09: Hide global "Start consult" CTA on `/dashboard/appointments/[id]`

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase C, Lane α — **XS, ~30min**

---

## Task overview

The global app header has a `Start consult` button (or similar primary CTA) that's always rendered for doctors. On every dashboard page this is correct — it's the "jump into the next consult" shortcut.

On the cockpit page itself (`/dashboard/appointments/[id]`), this CTA is **redundant**. The cockpit already exposes a primary `Start consult` action inside `<ReadyCard>` (and contextual actions in `<IdleCard>` / `<EndedCard>`). Two competing CTAs on one page split the doctor's attention and make the cockpit's own primary action feel less authoritative.

cs-09 hides the global CTA only when the user is on `/dashboard/appointments/[id]`. Everywhere else it stays.

**Estimated time:** ~30min.

**Status:** Done.

**Hard deps:** none.

**Source:** [plan-cockpit-shell-redesign-batch.md § Phase C](../plan-cockpit-shell-redesign-batch.md#phase-c--polish-3-tasks-3h-3-parallel-lanes).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- The global app header component — likely `frontend/components/AppHeader.tsx` or `frontend/components/layout/Header.tsx` (grep for "Start consult" or `next-appointment-route` if the CTA uses the next-route hook).
- `frontend/app/dashboard/appointments/[id]/page.tsx` (read-only — confirm the route matches).

**Estimated turns:** 1 turn.

---

## Acceptance criteria

### Pathname-aware conditional render

- [ ] In the global header file, find where `Start consult` (or the equivalent CTA) is rendered. Wrap it (or its parent block) with a pathname check using `usePathname()`:

  ```tsx
  'use client';
  import { usePathname } from 'next/navigation';

  // …inside the header component:
  const pathname = usePathname();
  const isOnCockpit =
    pathname?.startsWith('/dashboard/appointments/') ?? false;

  // …
  {!isOnCockpit && <StartConsultCTA … />}
  ```

  - Use `startsWith` instead of an exact match — the route is `/dashboard/appointments/:id`, so the dynamic segment varies.
  - The `?? false` guards against `pathname` being `null` during initial render.

- [ ] If there's a sibling "secondary" CTA (e.g. "Open queue") that's separate from `Start consult`, **leave it alone** — only the primary `Start consult` is the redundant one. The "Open queue" link to `/dashboard/opd-today` is still useful from the cockpit.

### Other CTA surfaces with the same pattern

- [ ] Grep for other places that render a `Start consult` button outside the cockpit:
  - The `MobilePillBar` in non-cockpit pages? — Doesn't exist; the pill bar is cockpit-only.
  - A floating "next appointment" pill? — If present (look for components that consume `useNextAppointmentRoute`), apply the same conditional.
  - `<ScheduleStripCard>` on the dashboard? — That's a different surface (jumps into a *specific* appointment, not "the next one"). Out of scope.

### Tests

- [ ] If the header has a test file, add:
  - Render with pathname `/dashboard/appointments/abc-123`. Assert `Start consult` is NOT in the DOM.
  - Render with pathname `/dashboard/opd-today`. Assert `Start consult` IS in the DOM.
- [ ] Existing header tests pass.

### Manual verification

- [ ] Open `/dashboard/opd-today` — confirm `Start consult` is in the header.
- [ ] Click into a patient → cockpit page. Confirm `Start consult` is no longer in the header.
- [ ] Navigate back. Confirm it reappears.

---

## Out of scope

- **Restyling the global header** — only conditional visibility.
- **Replacing the global CTA with a different primary action** — out of scope. If "Open OPD queue" is more useful, that's a separate UX decision.
- **The cockpit's own internal `Start consult` button** — that's `<ReadyCard>` (cs-10 polishes it).
- **Mobile header behaviour** — the same `usePathname()` check applies on mobile; one-line change covers both surfaces.

---

## Files expected to touch

**Modified:**
- The global header file (`AppHeader.tsx` or equivalent) — ~5 LOC delta.
- The header's test file (if present) — ~15 LOC delta.

**New:** none.

---

## Notes / open decisions

1. **Why `usePathname()` and not a custom context?** This is the smallest, most idiomatic Next.js solution. A context prop ("isOnCockpit") would require provider plumbing; pathname is already available as a hook.
2. **What if the route layout changes (e.g. `/dashboard/cockpit/[id]`)?** Update the prefix string. One-line change in one file. Acceptable maintenance cost.
3. **Why hide instead of disable?** A disabled primary CTA would be visually noisy and confusing — "why is this grayed out?" Hiding gives the doctor a cleaner header.

---

## References

- **Affected file:** the global header component (location TBD — grep for "Start consult").
- **Cockpit's own primary CTA:** `frontend/components/consultation/cockpit/ReadyCard.tsx` (slimmed in `cs-10`).

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Done
