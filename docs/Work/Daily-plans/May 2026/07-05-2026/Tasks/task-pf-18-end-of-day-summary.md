# Task pf-18: End-of-day summary card

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 3, Lane ζ step 4 — **XS, ~2h**

---

## Task overview

After the day's last patient completes (i.e. `useNextAppointmentRoute().next === null` immediately after wrap-up), `EndedCard` swaps for an `<EndOfDayCard>` showing the day's totals and two CTAs.

Cheap to ship — pure composition over numbers already in flight via `useTodaysAppointments` / `useDoctorDayPipeline`.

**Estimated time:** ~2h. Component + condition wiring + numbers calculation.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-10](./task-pf-10-next-appointment-route-hook.md) shipped.

**Source:** [plan-patient-seeing-flow.md § P5.6](../../../../Product%20plans/plan-patient-seeing-flow.md#p56--end-of-day-summary).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A.

**New chat?** **Yes** — fresh chat (or stitched after pf-15 if context fits — both are ζ-lane and small). Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/EndedCard.tsx`.
- `frontend/hooks/useDoctorDayPipeline.ts` (post-pf-07) for the numbers source.
- `frontend/hooks/useNextAppointmentRoute.ts` (post-pf-10) for the `next === null` discriminator.

**Composer-OK sub-steps:** none.

**Estimated turns:** 1–2 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/consultation/cockpit/EndOfDayCard.tsx` exporting:

  ```ts
  export interface EndOfDayCardProps {
    doctorName?: string | null;
  }
  export function EndOfDayCard(props: EndOfDayCardProps): JSX.Element;
  ```

### UI

- [ ] Title: `You're done for today` (or `Wrapped — {firstName}` if `doctorName` provided).
- [ ] Subtitle line with the day's numbers — derive from `useDoctorDayPipeline` and pull `totalDone`, `totalActive`, `totalMissed`, plus a count of "prescriptions sent today" (a separate fetch — `GET /v1/prescriptions/today/count` or aggregate from existing `prescriptions` data — match what's available; if no easy source exists, omit the prescription count for v1):

  ```
  12 patients · 11 completed · 1 no-show · 9 prescriptions sent
  ```

- [ ] Two primary buttons:
  - `Wrap up clinic ▸` — navigates to `/dashboard` (or wherever the doctor's daily-close action lives — match existing flows).
  - `Review tomorrow's schedule` — navigates to `/dashboard?d={tomorrow}` (or whatever date-param the schedule reads).
- [ ] Tertiary `Stay on this screen` link.

### Wiring (when EOD card replaces EndedCard)

- [ ] In `EndedCard.tsx` (or in `<NextPatientCountdown>` per pf-11's wiring), when `useNextAppointmentRoute().next === null`:
  - If `pf-11` is mounted (countdown), it short-circuits → renders `<EndOfDayCard>` instead of the countdown overlay.
  - If `pf-11` not yet on this code path, `EndedCard` directly renders `<EndOfDayCard>` when `next === null`.
- [ ] **Don't** flicker: the swap should happen on first paint of `ended` state when no next exists; not after a countdown attempts to start and finds nothing.

### General

- [ ] Type-check + lint clean.
- [ ] Renders cleanly in light + dark.
- [ ] Numbers update reactively if a late walk-in is added (e.g. via pf-16) — re-evaluates `next === null`.

---

## Out of scope

- **Backend "close clinic" semantics** — the button just routes. No DB action.
- **Per-doctor analytics dashboards** — separate plan.
- **Sharing the summary** — no copy-to-clipboard / send-email v1.

---

## Files expected to touch

**New:**
- `frontend/components/consultation/cockpit/EndOfDayCard.tsx` (~120 LOC)

**Modified:**
- `frontend/components/consultation/cockpit/EndedCard.tsx` (~10 LOC — conditional swap)
- `frontend/components/consultation/cockpit/NextPatientCountdown.tsx` (~5 LOC — short-circuit when `next === null`)

**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Prescription count.** If there's no cheap aggregate, ship without it — the rest of the line is plenty informative. Inbox a follow-up to add `GET /v1/prescriptions/today/count`.
2. **Late walk-in logic.** When a late walk-in lands, `next` becomes non-null again — the EOD card disappears, replaced by the normal countdown / EndedCard flow. Acceptable.
3. **Why "Wrap up clinic" copy.** Distinct from the per-patient "Done with patient" — clear shift in scope ("clinic" = whole day).

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P5.6](../../../../Product%20plans/plan-patient-seeing-flow.md#p56--end-of-day-summary)
- **Route hook:** [task-pf-10-next-appointment-route-hook.md](./task-pf-10-next-appointment-route-hook.md)
- **Sibling card:** `frontend/components/consultation/cockpit/EndedCard.tsx`

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
