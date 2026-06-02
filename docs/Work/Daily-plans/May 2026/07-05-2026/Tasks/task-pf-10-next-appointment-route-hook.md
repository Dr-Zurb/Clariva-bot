# Task pf-10: `useNextAppointmentRoute()` hook

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 2, Lane δ step 1 — **XS, ~2h**

---

## Task overview

Tiny hook that returns the next appointment to navigate to (or `null` if the doctor's day is done). Powers `<NextPatientCountdown>` (pf-11), `<EndOfDayCard>` (pf-18), and the prefetch hook (pf-15).

Source-resolution mirrors pf-07: queue mode → next entry from `useOpdSnapshot.active` (sorted by `tokenNumber`); slot/telemed → next `pending`/`confirmed` from `useTodaysAppointments` (sorted by `appointment_date`).

**Estimated time:** ~2h. Pure wrapping over pf-07's data + a small label / modality derivation.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-07](./task-pf-07-doctor-day-pipeline-hook.md) shipped.

**Source:** [plan-patient-seeing-flow.md § P3.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p32--usenextappointmentroute-hook).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A — small bounded hook.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/hooks/useDoctorDayPipeline.ts` (post-pf-07).

**Composer-OK sub-steps:** none.

**Estimated turns:** 1–2 Sonnet turns.

---

## Acceptance criteria

### Hook surface

- [ ] New file `frontend/hooks/useNextAppointmentRoute.ts` exporting:

  ```ts
  export interface NextAppointmentRoute {
    appointmentId: string;
    url: string;             // /dashboard/appointments/{id}
    label: string;           // "Mohit K (#5)" — patient short name + token / position
    modality: 'text' | 'voice' | 'video' | 'in_clinic';
    positionLabel: string;   // "#5 of 12" — for the countdown overlay copy
  }

  export function useNextAppointmentRoute(opts: {
    currentAppointmentId: string | null;
  }): {
    next: NextAppointmentRoute | null;
    isLoading: boolean;
    error: Error | null;
  };
  ```

### Resolution

- [ ] Wraps `useDoctorDayPipeline({ currentAppointmentId: opts.currentAppointmentId })`.
- [ ] **Queue mode:** the next eligible entry is the first `entry` AFTER `currentIndex` whose status ∈ `{waiting, called}`. (Skip `in_consultation` — that's another live patient that the cockpit shouldn't auto-jump to. Skip `completed` / `missed`.)
- [ ] **Schedule mode:** the next eligible entry is the first AFTER `currentIndex` whose status ∈ `{pending, confirmed}` AND whose `appointment_date >= now() - 1h` (i.e. not too late to be relevant).
- [ ] When no eligible entry → returns `{ next: null }`.

### Label / modality derivation

- [ ] `label` = `${patientShortName ?? 'Walk-in'}` plus `(#${tokenNumber})` in queue mode or the time of slot in schedule mode (`(2:30 PM)`). Short and scannable.
- [ ] `modality` derived from the appointment row's `consultation_type` (text/voice/video/in_clinic).

### General

- [ ] Type-check + lint clean.
- [ ] Pure derivation — no extra API calls; relies on pf-07's data.
- [ ] Memoised return.

---

## Out of scope

- **Skipping over patients in mid-consult** — only auto-skip across `completed` / `missed`. The current call is the user's responsibility to end before the countdown fires.
- **Walk-in priority** — walk-ins join the day pipeline at their natural sort position (token number / created_at). No special prioritisation here.

---

## Files expected to touch

**New:**
- `frontend/hooks/useNextAppointmentRoute.ts` (~80 LOC)

**Modified:** none.
**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why `now() - 1h` cutoff in schedule mode.** Auto-advancing to a slot that was supposed to start an hour ago is rarely useful — that patient is gone or someone else needs attention. Hardcoded for v1; revisit if doctors complain.
2. **Why skip `in_consultation` in queue mode.** Two patients can technically be in_consultation simultaneously (handoff). The auto-advance shouldn't pick one for the doctor — they should pick manually via the rail or chevrons.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P3.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p32--usenextappointmentroute-hook)
- **Pipeline hook:** [task-pf-07-doctor-day-pipeline-hook.md](./task-pf-07-doctor-day-pipeline-hook.md)
- **Downstream consumers:** [task-pf-11-next-patient-countdown.md](./task-pf-11-next-patient-countdown.md), [task-pf-15-prefetch-next-chart.md](./task-pf-15-prefetch-next-chart.md), [task-pf-18-end-of-day-summary.md](./task-pf-18-end-of-day-summary.md)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
