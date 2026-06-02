# Task pf-13: `TodaysSchedule` outcome rows + inline "Mark no-show"

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 3, Lane ε step 1 — **M, ~5h**

---

## Task overview

Bundles **P4.3 + P4.4** into one component edit:

1. Replace `TodaysSchedule`'s time-pastness `opacity-60` heuristic with **outcome-based** styling — completed / live / late / cancelled / no-show each get distinct visuals.
2. Add a tiny inline `Mark no-show` button on stale-but-pending rows (the "Late" chip rows) that PATCHes `appointments` with `{ status: 'no_show' }`.

Independent of the wrap-up keystone — uses existing endpoint + existing data hooks.

**Estimated time:** ~5h. The mapping table is the bulk of the work; the inline button is ~30 min.

**Status:** Shipped (2026-05-08).

**Hard deps:** none (pf-06 is a soft dep — if status helpers are extracted there, reuse them).

**Source:** [plan-patient-seeing-flow.md § P4.3, P4.4](../../../../Product%20plans/plan-patient-seeing-flow.md#p43--todaysschedule-outcome-coloured-rows).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/dashboard/cockpit/TodaysSchedule.tsx`.
- `frontend/lib/ui/status.ts` (or wherever badge variants live).
- `frontend/hooks/useTodaysAppointments.ts`.
- The existing PATCH appointment hook (search `useUpdateAppointment` or equivalent).

**Composer-OK sub-steps:** none.

**Estimated turns:** 3–4 Sonnet turns.

---

## Acceptance criteria

### Outcome mapping (P4.3)

- [ ] In `TodaysSchedule`, replace the time-based `opacity-60` heuristic with this mapping:

  | Condition | Visual |
  |---|---|
  | `appointment.status === 'completed'` | `✓` icon + 60 % text + green outline `Done` badge |
  | `consultation_session.status === 'live'` | left accent border + pulsing dot, `bg-primary/5` |
  | `appointment.status ∈ {pending, confirmed}` AND `now > appointment_date + 15 min` | warning-coloured `Late` chip |
  | `appointment.status ∈ {pending, confirmed}` AND `now > appointment_date` | soft amber dot (silent nudge) |
  | `appointment.status === 'cancelled'` OR `'no_show'` | strike-through + destructive outline |
  | else | normal future styling |

- [ ] Helper extracted to `frontend/lib/dashboard/today-schedule-row-meta.ts` (NEW) — pure function `(appointment, session, now) → { variant, badge, dot, strikethrough }`.
- [ ] Helper has unit tests if the existing test pattern supports it; otherwise flag and skip.
- [ ] `now` is passed in (testable) — in production, sourced from `Date.now()` or whatever clock helper this codebase uses.

### Inline "Mark no-show" (P4.4)

- [ ] On rows showing the `Late` chip, render a tiny `Mark no-show` outline button (or icon button) on hover (desktop) / always-visible (mobile).
- [ ] Click → optimistic update: row immediately renders as `no_show` styling, fires `PATCH /v1/appointments/:id` with `{ status: 'no_show' }`. On error, revert + toast.
- [ ] Confirmation: small inline `Are you sure?` step (NOT a modal) — first click flips to "Confirm no-show?" red button, second click commits. Prevents accidental clicks.
- [ ] Button hidden when current user is not the appointment's doctor (defensive — should always be true in this view, but cheap to check).

### "Late" threshold

- [ ] Default `15 minutes` past `appointment_date`. Read from `doctor_settings.auto_no_show_after_min` if non-NULL (so the warning lines up with the auto-marker), else fallback to 15.

### General

- [ ] Type-check + lint clean.
- [ ] No regressions on existing schedule rendering.
- [ ] Mobile-friendly: button stacks correctly under the row time/name on small screens.
- [ ] Realtime: rows update visually when their underlying status changes (existing realtime sub already covers this).

---

## Out of scope

- **Schedule reordering by status.** Out of scope; rows still sort by `appointment_date`.
- **`upcoming` vs `past` sections.** Existing grouping stays.
- **Adding a new "review" CTA on completed rows.** Hover affordance only; primary navigation stays the same (click row → cockpit).

---

## Files expected to touch

**New:**
- `frontend/lib/dashboard/today-schedule-row-meta.ts` (~80 LOC — pure helper)

**Modified:**
- `frontend/components/dashboard/cockpit/TodaysSchedule.tsx` (~80 LOC additive + 30 LOC removed for the time-pastness heuristic)

**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why outcome-based instead of time-based.** A completed earlier-today appointment looks identical to a no-show today, which is the wrong cognitive load on the doctor. Source plan P4.3 calls this out explicitly.
2. **Inline confirm vs full modal for no-show.** Modal is overkill for a single-field action; inline 2-step click is the right friction.
3. **`bg-primary/5` for live row.** Matches the design tokens shipped in A1.
4. **Late threshold reading from auto-no-show.** Keeps the visual cue and the auto-marker in sync — if a doctor opted into auto-mark-after-30-min, the "Late" chip shouldn't fire at 15.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P4.3 + P4.4](../../../../Product%20plans/plan-patient-seeing-flow.md#p43--todaysschedule-outcome-coloured-rows)
- **PATCH appointment endpoint:** existing `appointments-controller.ts`
- **Auto-no-show worker (uses same threshold):** [task-pf-17-auto-noshow-worker.md](./task-pf-17-auto-noshow-worker.md)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
