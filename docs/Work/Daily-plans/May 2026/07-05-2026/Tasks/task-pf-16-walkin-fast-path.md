> **⚠️ SUPERSEDED 2026-05-09 by [CP-D1](../../09-05-2026/plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).** Walk-in feature removed; Clariva is digital-first.

# Task pf-16: "+ Walk-in" fast path

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 3, Lane ζ step 2 — **S, ~3h**

---

## Task overview

A 1-field "Walk-in" modal (just patient name, free text) that creates an appointment with `appointment_date = now()`, the doctor's default `consultation_type`, `status = 'confirmed'`, and `patient_id = null`. On submit, routes the cockpit to the new appointment.

Mounted in two places: a `+ Walk-in` button on the queue rail (queue-mode only), and a `+ Walk-in` button on the dashboard header (any doctor). Saves doctors the 4-field friction of the existing `AddAppointmentModal` for the common case.

**Estimated time:** ~3h. Modal + create-appointment wiring + 2 mount points.

**Status:** Shipped (2026-05-08).

**Hard deps:** none.

**Source:** [plan-patient-seeing-flow.md § P5.4](../../../../Product%20plans/plan-patient-seeing-flow.md#p54---walk-in-fast-path).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/appointments/AddAppointmentModal.tsx` (the heavy modal we're skipping).
- The create-appointment hook (search `useCreateAppointment` or equivalent).
- `frontend/components/dashboard/DashboardHeader.tsx` (or wherever the dashboard header lives — for the second mount point).
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (post-pf-08 — for the rail mount; or fall back to a header mount if not yet shipped).

**Composer-OK sub-steps:** none.

**Estimated turns:** 2–3 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/dashboard/WalkInQuickModal.tsx` exporting:

  ```ts
  export interface WalkInQuickModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: (appointment: Appointment) => void;
  }
  export function WalkInQuickModal(props: WalkInQuickModalProps): JSX.Element;
  ```

### UI

- [ ] Single `<Dialog>` with three lines:
  1. **Title:** `Walk-in patient`.
  2. **Single input:** `Patient name (optional)` — placeholder `e.g. Asha P`.
  3. **Footer:** primary `Create & open ▸` (always enabled — name is optional), secondary `Cancel`.
- [ ] Submitting fires the create-appointment endpoint with:

  ```ts
  {
    patient_id: null,
    patient_name_hint: nameOrNull,        // if backend supports it; otherwise stash in metadata
    appointment_date: new Date().toISOString(),
    consultation_type: doctor.defaultConsultationType ?? 'in_clinic',
    status: 'confirmed',
    duration_minutes: doctor.defaultDurationMinutes ?? env.SLOT_INTERVAL_MINUTES,
  }
  ```

- [ ] On success: `onCreated(appointment)`, `onClose()`, then `router.push('/dashboard/appointments/{appointment.id}')`.
- [ ] On error: surface in an `<Alert>` strip below the input.

### Mount point 1 — queue rail

- [ ] In `<CockpitQueueRail>` (pf-08), when `source === 'queue'`, render a `+ Walk-in` outline button at the right end of the strip (before the chevrons or as a separate inline action).
- [ ] Click → opens the modal.
- [ ] **Soft dep:** if pf-08 hasn't shipped, defer this mount and add it as a pf-08 follow-up.

### Mount point 2 — dashboard header

- [ ] On the main dashboard page (`frontend/app/dashboard/page.tsx` or its header component), add a `+ Walk-in` button next to the existing `Add appointment` button.
- [ ] Click → opens the modal.
- [ ] After create, `onCreated` callback navigates the user to the cockpit.

### Backend / endpoint reuse

- [ ] No new endpoint — uses the existing `POST /v1/appointments` controller.
- [ ] Verify the endpoint accepts `patient_id: null`. If validation rejects it (existing schema may force a UUID), update the validation to allow null + add a `patient_name_hint` field — small additive change in the appointment validator. Coordinate via a quick edit in `backend/src/utils/validation.ts` if needed.

### General

- [ ] Type-check + lint clean.
- [ ] Walk-in appointments render in `<TodaysSchedule>` and `<OpdQueueStrip>` (queue mode) immediately via realtime sub.
- [ ] In the cockpit, the chart rail correctly hides for `patient_id === null` (verified by cockpit-1 helper `shouldShowChartRail`).

---

## Out of scope

- **Patient row creation** — walk-ins create no `patients` row v1; the chart fill / lazy-create is a separate item (parked in source plan P5.4 notes).
- **Custom slot duration / time** — uses doctor defaults; doctor can edit later via the appointment detail page.
- **Walk-in priority bumping** — joins at natural sort position.

---

## Files expected to touch

**New:**
- `frontend/components/dashboard/WalkInQuickModal.tsx` (~140 LOC)

**Modified:**
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (~10 LOC — mount button)
- `frontend/app/dashboard/page.tsx` OR its header component (~10 LOC — mount button)
- `backend/src/utils/validation.ts` (~3 LOC — if `patient_id: null` validation needs widening)

**Deleted:** none.

---

## Notes / open decisions

1. **Why a separate modal instead of pre-filling AddAppointmentModal.** The existing modal has 4 fields and validation gates that don't apply to walk-ins. A purpose-built modal is cleaner and faster to type.
2. **Patient name optional.** Some doctors won't even type a name — they'll fill the chart later. Don't gate the create.
3. **`patient_name_hint`.** If the existing schema doesn't have a column for this, store it in the appointment's `notes` field (or whichever metadata field exists) and surface it in the cockpit header until a real patient is linked. Inbox a follow-up to surface it natively.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P5.4](../../../../Product%20plans/plan-patient-seeing-flow.md#p54---walk-in-fast-path)
- **Existing add-appointment flow:** `frontend/components/appointments/AddAppointmentModal.tsx`
- **Cockpit handles `patient_id === null`:** [Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-1-state-machine.md](../../06-05-2026/Tasks/task-cockpit-1-state-machine.md) (`shouldShowChartRail`)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
