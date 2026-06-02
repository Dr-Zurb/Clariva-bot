# Task pf-11: `<NextPatientCountdown>` overlay

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 2, Lane δ step 2 — **S, ~3h**

---

## Task overview

A 5-second cancellable countdown overlay that mounts inside (or replaces) `EndedCard` when the cockpit transitions to `wrap_up` or `ended` AND the doctor's `patient_flow_advance` setting is `'countdown'`. Counts down once per second; on `0`, fires `router.push(next.url)` from `useNextAppointmentRoute`. Cancellable; or "Go now" to skip the wait.

If `useNextAppointmentRoute().next === null`, the overlay defers to `<EndOfDayCard>` (pf-18) instead.

**Estimated time:** ~3h. Most time is the timer state machine + the cancel UX.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-03](./task-pf-03-cockpit-state-wrapup.md) (state), [pf-09](./task-pf-09-doctor-settings-flow-advance.md) (setting), [pf-10](./task-pf-10-next-appointment-route-hook.md) (route).

**Source:** [plan-patient-seeing-flow.md § P3.1](../../../../Product%20plans/plan-patient-seeing-flow.md#p31--nextpatientcountdown-overlay).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A.

**Why not Opus:** the timer is `setInterval` + a few state flags. The trickiest part is making sure cancellation doesn't leak intervals — covered by a clean useEffect cleanup.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/hooks/useNextAppointmentRoute.ts` (post-pf-10).
- `frontend/components/consultation/cockpit/EndedCard.tsx` (existing — to confirm where to mount).
- The doctor-settings hook (post-pf-09).

**Composer-OK sub-steps:** none.

**Estimated turns:** 2–3 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/consultation/cockpit/NextPatientCountdown.tsx` exporting:

  ```ts
  export interface NextPatientCountdownProps {
    currentAppointmentId: string;
    triggeredAt?: 'auto' | 'manual';   // 'auto' = post-Send-Rx; 'manual' = doctor pressed Done
    onCancel?: () => void;
    onDone?: () => void;
  }
  export function NextPatientCountdown(props: NextPatientCountdownProps): JSX.Element | null;
  ```

- [ ] Returns `null` when `useDoctorSettings().patientFlowAdvance !== 'countdown'`. (For `'instant'` we navigate immediately; for `'manual'` we don't render.)
- [ ] Returns `null` when `useNextAppointmentRoute().next === null` — `EndedCard` (or pf-18's `EndOfDayCard`) handles that branch.

### UI

- [ ] Mounted inside the existing `EndedCard` shell (pf-11 wraps `EndedCard`'s primary surface; the back-action / send-summary CTAs from `EndedCard` stay visible during the countdown).
- [ ] Layout:

  ```
  ✓ Done with Asha P
  Going to Mohit K (#5) in 4… [Cancel] [Go now ▸]
  ```

- [ ] Countdown number animates with a subtle progress ring (CSS or a 30-LOC ring component). Default 5 seconds.
- [ ] **Cancel** → stops the timer, calls `onCancel?.()`, swaps the overlay for the unmodified `EndedCard` content. Doctor stays on the current cockpit.
- [ ] **Go now** → cancels the timer + immediately calls `router.push(next.url)`.
- [ ] When the timer reaches 0 → calls `router.push(next.url)` automatically + calls `onDone?.()`.

### Instant-mode behaviour

- [ ] When `patientFlowAdvance === 'instant'`, the component renders nothing but immediately fires `router.push(next.url)` on mount (one-shot). Use a `ref` flag to prevent double-fire under React strict mode double-invocation.

### Manual-mode behaviour

- [ ] When `patientFlowAdvance === 'manual'`, returns `null`. The doctor stays on `EndedCard` until they navigate manually (via queue rail / dashboard).

### Cleanup

- [ ] On unmount or cancel, ensure `clearInterval` runs. No leaked timers across cockpit re-mounts.

### Wiring

- [ ] Mount inside `EndedCard.tsx` (additive — wrap the primary content in a conditional render: if countdown component is rendering, dim `EndedCard`'s primary section behind it).
- [ ] Triggered automatically when `state` transitions `wrap_up → ended` (via the wrap-up dialog's `onSaved`) OR when `state === 'ended'` on initial mount AND `patientFlowAdvance === 'countdown'`.

### General

- [ ] Type-check + lint clean.
- [ ] Renders in both light + dark; the countdown digit has tabular-num so it doesn't jitter.
- [ ] Smoke-test all three settings values: `'countdown'` (visible), `'instant'` (immediate route), `'manual'` (no-op).

---

## Out of scope

- **End-of-day card** — pf-18 owns the `next === null` branch.
- **Prefetching the next patient's chart** — pf-15 owns it; this overlay does not preload.
- **Configurable countdown length** — defaults to 5s; no per-doctor knob (revisit if requested).

---

## Files expected to touch

**New:**
- `frontend/components/consultation/cockpit/NextPatientCountdown.tsx` (~160 LOC)

**Modified:**
- `frontend/components/consultation/cockpit/EndedCard.tsx` (~20 LOC — wrap primary surface so the countdown overlay can render on top / instead)

**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why a wrapping overlay vs replacing `EndedCard`.** `EndedCard` already has useful actions (review recordings, etc.). Stacking the countdown on top means `Cancel` snaps back to the full ended card instantly.
2. **5 seconds default.** Long enough to pull back, short enough not to feel slow. Doctors will calibrate via P3.3 settings.
3. **Strict-mode double-fire guard.** React strict mode mounts components twice in dev; the `instant` branch needs a ref guard so we don't double-`push`.
4. **Triggering on initial mount of `ended`.** Defensive — if doctor reloads the cockpit page on an `ended` appointment, we still want to offer the auto-advance. Use a session-storage flag to prevent re-triggering on the same appointment after a cancel.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P3.1](../../../../Product%20plans/plan-patient-seeing-flow.md#p31--nextpatientcountdown-overlay)
- **State machine:** [task-pf-03-cockpit-state-wrapup.md](./task-pf-03-cockpit-state-wrapup.md)
- **Setting source:** [task-pf-09-doctor-settings-flow-advance.md](./task-pf-09-doctor-settings-flow-advance.md)
- **Route source:** [task-pf-10-next-appointment-route-hook.md](./task-pf-10-next-appointment-route-hook.md)
- **EOD branch:** [task-pf-18-end-of-day-summary.md](./task-pf-18-end-of-day-summary.md)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
