# Plan — Patient seeing flow (the cockpit's "see → prescribe → next" loop)

## Make a 30-patient OPD session feel like 30 single-screen taps, not 30 navigations

> **Status:** `Drafted` 2026-05-07. **Depends on:** `plan-ui-system-redesign.md` (shipped — provides the cockpit shell, OPD strip, Now/Next card, design tokens). Specifically, the cockpit redesign batch ([Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../Daily-plans/May%202026/06-05-2026/plan-cockpit-redesign-batch.md)) shipped the three-pane workspace this plan extends.
>
> **Status legend (matches `ehr/` convention):** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Selection markers per item:** `Decision: [ ] Yes / [ ] No / [ ] Modify`. Tick exactly one in each item before it advances to a daily-plans batch.
>
> **Effort:** ~3 dev-days frontend + ≤0.5 day backend if we ship Phases 1+2; a further ~1.5 days for Phase 3 polish.

---

## Why this plan exists now

Today the cockpit nails the **inside** of a consultation (chart + room + Rx side-by-side, lockdown of K1–K7 from the cockpit redesign batch). What it doesn't nail is **the seam between two consultations**:

- After "Send to patient" (`PrescriptionForm.onSent`), nothing happens. The cockpit doesn't even know an Rx was sent. The screen sits there.
- The appointment status flips to `completed` only via `<MarkCompletedForm>` — buried in a kebab → Sheet (per `task-cockpit-4-header.md` Notes #2). No friction-free "I'm done with this patient" moment exists.
- Inside the cockpit the doctor has zero peripheral awareness — no idea whether 2 or 12 patients remain, no hint of which one is next, no way to jump.
- In `OpdQueueStrip` the `STATUS_META` covers `waiting / called / in_progress / no_show` only. The DB enum (`opd_queue_entries.status`, migration 028) is `'waiting' | 'called' | 'in_consultation' | 'completed' | 'skipped' | 'missed' | 'cancelled'` — so completed patients silently fall off the strip and the doctor never sees "3 done · 1 in consult · 8 waiting" at a glance. (There's also an unrelated bug worth flagging: `frontend/hooks/useOpdSnapshot.ts` filters on `'in_progress'` while the DB enum is `'in_consultation'` — see P4.1.)
- `frontend/components/dashboard/cockpit/TodaysSchedule.tsx` dims past rows by **time-pastness** (`opacity-60`), not by **outcome** — a completed earlier-today appointment looks identical to a no-show.

So the "patient seeing flow" gap is real and concentrated. This plan closes it.

---

## North star

From [ehr/plan-00-ehr-roadmap.md](./ehr/plan-00-ehr-roadmap.md):

> "doctor opens it, taps two chips, sends in 30 seconds"

Generalised to a session of 30 patients, the equivalent target is:

> Sending the Rx, finishing the chart entry, and pulling up the next patient is **one motion**, not three navigations.

Every item below ladders to that. If an item doesn't, flag it in `Notes:` and probably reject.

---

## Decisions LOCKED 2026-05-07

These are scoping decisions agreed in chat at plan creation. Items below MUST respect them; revisiting any of them belongs in a new `Decision:` block on the affected item with a clear `Modify` rationale.

| ID | Decision | Implication |
|----|----------|-------------|
| **P-D1** | **A separate explicit "Done with patient" CTA is the single event that flips `appointment.status` to `completed`.** Send Rx and End-consult only *enable* it; they never auto-complete. | Adds a new `wrap_up` cockpit state (P3.1) between `live` and `ended`. `EndedCard` rebrands as a post-wrap-up surface. `<MarkCompletedForm>` is absorbed into the new wrap-up dialog (P1.1) and the kebab "Mark completed" item is retired. |
| **P-D2** | **Auto-advance to the next patient defaults to a 5-second cancellable countdown.** Doctors can opt out (instant / manual) per-doctor in settings. Never silent. | P5.1 (`<NextPatientCountdown>`) is the default surface on the `EndedCard`. Setting lives on `doctor_settings` (`patient_flow_advance` enum: `countdown` / `instant` / `manual`, default `countdown`). |
| **P-D3** | **The cockpit gets a thin horizontal queue rail in the header**, not a side rail. Position counter + previous / next + clickable tokens. | Modifies `frontend/components/consultation/cockpit/CockpitHeader.tsx` only — does not touch the three-column lock (K1). Lives below the existing sticky header strip. |
| **P-D4** | **Wrap-up dialog mandatory fields = diagnosis (free text + tag chips) and follow-up date (one-click chips: "1 wk", "1 mo", "no follow-up"). Everything else stays optional.** | Two columns of mandatory data. Schema add: `appointments.diagnosis_text`, `appointments.diagnosis_tags TEXT[]`, `appointments.followup_date DATE NULL`, `appointments.followup_kind TEXT` ('none' / 'in_person' / 'tele'). |
| **P-D5** | **The cockpit queue rail renders for telemed / slot doctors too**, sourced from `useTodaysAppointments` instead of `useOpdSnapshot`. Identical UX, different source. | One component (`<CockpitQueueRail>`) consumes a `useDoctorDayPipeline()` adapter that picks `useOpdSnapshot` (queue mode) or `useTodaysAppointments` (slot / telemed). |
| **P-D6** | **Completed entries stay visible in the queue rail and `OpdQueueStrip`, greyed.** Behind a "3 done ▾" disclosure when the count exceeds 5. | `OPD_ACTIVE_STATUSES` in `useOpdSnapshot` widens to include `completed` / `missed` / `skipped`; UI adds collapsed "Done" group; header reads `3 done · 1 in consult · 8 waiting`. |
| **P-D7** | **Auto-no-show is opt-in and configurable per doctor.** Default off. When on, a worker flips `appointments.status` from `confirmed` → `no_show` after `N` minutes past `appointment_date` if no consultation session was started. | Backend worker (cron / interval), gated on `doctor_settings.auto_no_show_after_min` (NULL = off). UI surfaces an in-cockpit "Mark as no-show" inline button as the manual fallback. |

---

## Decision matrix (single-screen overview)

Tick the column you want for each row. This table mirrors the per-item details below; it exists so the whole plan is reviewable in one screen before scrolling.

### P0 — Strategic decisions (already locked above; column kept for audit)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| P0.1 | Explicit "Done with patient" CTA owns appointment completion (P-D1) | [x] | [ ] | [ ] | |
| P0.2 | Auto-advance default = 5 sec countdown (P-D2) | [x] | [ ] | [ ] | |
| P0.3 | Queue rail = thin top strip (P-D3) | [x] | [ ] | [ ] | |
| P0.4 | Wrap-up mandatory fields = diagnosis + follow-up (P-D4) | [x] | [ ] | [ ] | |
| P0.5 | Cockpit queue rail also for telemed / slot doctors (P-D5) | [x] | [ ] | [ ] | |
| P0.6 | Completed entries stay visible, greyed (P-D6) | [x] | [ ] | [ ] | |
| P0.7 | Auto-no-show is opt-in, default off (P-D7) | [x] | [ ] | [ ] | |

### P1 — Wrap-up checkpoint (the keystone)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| P1.1 | `<WrapUpDialog>` — modal with diagnosis + follow-up + Done | [x] | [ ] | [ ] | |
| P1.2 | Backend: `POST /v1/appointments/:id/wrap-up` — atomic flip + persist | [x] | [ ] | [ ] | |
| P1.3 | Cockpit state machine: add `wrap_up` between `live` and `ended` | [x] | [ ] | [ ] | |
| P1.4 | Migration: `appointments.diagnosis_text / diagnosis_tags / followup_date / followup_kind` | [x] | [ ] | [ ] | |
| P1.5 | Retire kebab "Mark completed" item; absorb form into wrap-up dialog | [x] | [ ] | [ ] | |

### P2 — Cockpit queue rail

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| P2.1 | `<CockpitQueueRail>` component mounted in `CockpitHeader` | [x] | [ ] | [ ] | |
| P2.2 | `useDoctorDayPipeline()` adapter (queue ↔ slot / telemed) | [x] | [ ] | [ ] | |
| P2.3 | Click token → cockpit navigates to that appointment, no full reload | [x] | [ ] | [ ] | |
| P2.4 | Position counter "#4 of 12 · 3 done" surface + prev/next chevrons | [x] | [ ] | [ ] | |

### P3 — Auto-advance / next patient

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| P3.1 | `<NextPatientCountdown>` overlay on `EndedCard` | [x] | [ ] | [ ] | |
| P3.2 | `useNextAppointmentRoute()` hook (handles all three modes) | [x] | [ ] | [ ] | |
| P3.3 | `doctor_settings.patient_flow_advance` enum + Settings toggle UI | [x] | [ ] | [ ] | |

### P4 — Visual differentiation in OPD / Today

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| P4.1 | Fix `useOpdSnapshot` enum drift (`in_progress` → `in_consultation`) + widen `OPD_ACTIVE_STATUSES` to keep done/missed/skipped | [x] | [ ] | [ ] | Bug-fix-shaped; small. |
| P4.2 | `OpdQueueStrip` STATUS_META gets `completed`, `missed`, `skipped`, plus header summary `3 done · 1 in consult · 8 waiting` | [x] | [ ] | [ ] | |
| P4.3 | `TodaysSchedule` rows colour by **outcome**, not by time-pastness | [x] | [ ] | [ ] | |
| P4.4 | Inline "Mark no-show" button on stale-but-pending rows | [x] | [ ] | [ ] | |

### P5 — Quality-of-life touches

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| P5.1 | Keyboard shortcut: `Cmd/Ctrl+Enter` = Send Rx, `Cmd/Ctrl+Shift+Enter` = Done & Next | [x] | [ ] | [ ] | |
| P5.2 | Prefetch next patient's chart when cockpit hits `wrap_up`/`ended` | [x] | [ ] | [ ] | |
| P5.3 | "Running behind" badge in cockpit header (compares now vs next slot) | [x] | [ ] | [ ] | |
| P5.4 | "+ Walk-in" fast path (one-field modal, defaults `now()` + duration) | [x] | [ ] | [ ] | |
| P5.5 | Auto-no-show worker (gated by P-D7 setting) | [x] | [ ] | [ ] | |
| P5.6 | End-of-day summary card (replaces `EndedCard` after the day's last patient) | [x] | [ ] | [ ] | |

### P6 — Out of scope (parked)

| ID | Item | Promote? (Y/N) | Notes |
|----|------|----------------|-------|
| P6.1 | Multi-doctor handoff (transfer queue position) | [ ] | Single-doctor V1 per `plan-ui-system-redesign.md` U6.2. |
| P6.2 | Patient self-arrival check-in (kiosk / SMS link) | [ ] | Belongs to a future "patient ops" plan. |
| P6.3 | Voice / dictation in wrap-up dialog | [ ] | Hangs off T6 (AI assist). |
| P6.4 | Per-specialty wrap-up fields (OB-LMP, paeds growth chart …) | [ ] | E1 generalist-first lock from `ehr/plan-00`. |
| P6.5 | Native mobile redesign of the queue rail | [ ] | Inherits cockpit-7 mobile pattern; revisit when mobile work resumes. |
| P6.6 | Bulk actions on the queue rail (mass mark no-show at end of day) | [ ] | Worth it iff P5.5 doesn't cover the case. |

---

## Per-item details (decisions live here too — the table above is just a summary)

### P1 · Wrap-up checkpoint (the keystone)

> **Why this is the keystone:** without a single, low-friction "Done" event, every other feature in this plan is glued to a hack. Auto-advance has nothing to fire on. The queue rail can't tell which patients are done. Today's Schedule's outcome-coloring has no `completed` row to render. P1 ships first; everything else stacks on it.

#### P1.1 — `<WrapUpDialog>` component

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New client component `frontend/components/consultation/cockpit/WrapUpDialog.tsx`. Modal with three sections, in this order:

1. **Diagnosis** — single free-text input + tag chips below. Tag suggestions hydrate from the doctor's recent diagnoses (small `/v1/diagnoses/recent` endpoint, P1.2).
2. **Follow-up** — three one-click chips: `1 wk`, `1 mo`, `no follow-up`, plus a date picker for "custom". One radio above for kind: `In-person` / `Tele`.
3. **Footer** — `Save & next ▸` (primary) and `Save & stay` (secondary). `Esc` cancels back to the live cockpit.

**Why:** Keeps the friction below the "habit threshold" — two fields, mostly chips. Anything richer (full SOAP) belongs in T2/T3 not here.

**Mount surfaces:**
- Triggered by clicking the new "Done with patient" button on the cockpit header (P1.5) at any state ∈ `live` / `wrap_up`.
- Triggered automatically (with the dialog pre-open) when `PrescriptionForm.onSent` fires AND `consultation_session.status === 'ended'` AND the doctor's setting `patient_flow_advance !== 'manual'`.

**Cost:** Medium — ~½ day. Pure composition over `Dialog`, `Input`, `Badge`, `Button`, existing `MarkCompletedForm` field validation patterns.

**Reversibility:** High.

**Depends on:** P1.2 (endpoint), P1.4 (schema).

---

#### P1.2 — Backend: `POST /v1/appointments/:id/wrap-up`

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New controller + service that, in a single transaction:

1. Verifies caller is the appointment's doctor (RLS-aligned).
2. Persists `diagnosis_text`, `diagnosis_tags`, `followup_date`, `followup_kind` on the `appointments` row.
3. Flips `appointments.status` to `completed` (idempotent — second call is a no-op when already completed).
4. If `consultation_session.status === 'live'`, also calls the existing `endSession()` facade — wrap-up implies the consult is over. (For text/voice/video alike — facade owns the modality dispatch.)
5. Returns the updated appointment row.

**Companion read endpoint:** `GET /v1/diagnoses/recent?limit=20` — returns the doctor's most-used diagnosis tags from the last 90 days for autocomplete in P1.1. Aggregates over `appointments.diagnosis_tags` (post-P1.4). Cached client-side.

**Why:** A single transactional flip prevents the "Rx sent but appointment never completed" silent state we have today (the bug under P-D1).

**Files:**
- `backend/src/controllers/appointment-controller.ts` — add `wrapUpAppointmentHandler`.
- `backend/src/services/appointment-service.ts` — add `wrapUpAppointment(input)`.
- `backend/src/routes/api/v1/appointments.ts` — wire `POST /:id/wrap-up`.
- `backend/src/utils/validation.ts` — `validateWrapUpBody` schema.

**Effort:** ~0.5 day backend.

**Depends on:** P1.4 (schema).

---

#### P1.3 — Cockpit state: add `wrap_up`

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Extend `frontend/lib/consultation/cockpit-state.ts` (cockpit-1) so `deriveCockpitState()` returns `wrap_up` when:

```
appointment.status        ∈ {pending, confirmed}      // not yet completed
consultation_session.status === 'ended'               // call is over
```

Today this combo silently routes to `ended`, so the doctor sees `EndedCard` even though the appointment is still officially open. Adding `wrap_up` as a distinct state lets `CenterPane` mount a different surface (the wrap-up CTA banner — P1.5) and lets the queue rail and Today's Schedule colour the row "needs wrap-up" not "done".

**Side effects to update:**
- `canSendPrescription(state)` and `canEditPrescriptionDraft(state)` should both treat `wrap_up` like `live` (Rx is still editable for follow-up Rx during wrap-up).
- `shouldMountLauncher(state)` returns `false` for `wrap_up` (the room is gone; no launcher needed).
- Mobile `MobilePillBar` handles `wrap_up` identically to `ended` for now.

**Effort:** ~0.5 day, including the state-machine unit-test extension.

**Reversibility:** High — pure helper change.

**Depends on:** none (independent of backend).

---

#### P1.4 — Migration: appointment wrap-up columns

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New migration `backend/migrations/0XX_appointment_wrapup.sql`:

```sql
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS diagnosis_text   TEXT NULL,
  ADD COLUMN IF NOT EXISTS diagnosis_tags   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS followup_date    DATE NULL,
  ADD COLUMN IF NOT EXISTS followup_kind    TEXT NULL
    CONSTRAINT appointments_followup_kind_check
    CHECK (followup_kind IS NULL OR followup_kind IN ('none','in_person','tele'));

CREATE INDEX IF NOT EXISTS idx_appointments_diagnosis_tags_gin
  ON appointments USING gin (diagnosis_tags);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_completed_recent
  ON appointments (doctor_id, status)
  WHERE status = 'completed';
```

**Why:** Keeps wrap-up data on `appointments` (close to the lifecycle) rather than splitting into a sibling table. Avoids a JOIN for every cockpit render.

**RLS:** No new policies — inherits `appointments` RLS. The new columns are doctor-readable / writable through the existing predicates.

**Reversibility:** Medium — additive columns; rollback is `DROP COLUMN`. The GIN index on `diagnosis_tags` is the only meaningful storage cost; small.

**Effort:** ~0.25 day.

---

#### P1.5 — Retire kebab "Mark completed"; new header CTA

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** In `frontend/components/consultation/cockpit/CockpitHeader.tsx`:

- Remove the `Mark completed` `DropdownMenuItem` from the kebab (currently `task-cockpit-4-header.md` Notes #2).
- Add a primary-styled "Done with patient" button to the right side of the header. Visible when `state ∈ {live, wrap_up}`. Disabled with tooltip when `state === 'live'` AND nothing has been sent yet (encourages but does not force Rx-first; the dialog itself is the gate).
- Click → opens `<WrapUpDialog>`.

`<MarkCompletedForm>` is deleted (the wrap-up dialog covers all of its surface area + more). `<AppointmentConsultationActions>` loses one of its three remaining sections — mentioned in the existing inbox entry that was already lobbying to delete that wrapper.

**Why:** A single visible CTA replaces a buried kebab item — the keystone has to be impossible to miss.

**Effort:** ~0.5 day.

**Depends on:** P1.1.

---

### P2 · Cockpit queue rail

#### P2.1 — `<CockpitQueueRail>` component

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New file `frontend/components/consultation/cockpit/CockpitQueueRail.tsx`. A single-row strip (40 px tall) docked under the existing sticky `CockpitHeader`. Layout:

```
‹  #4 of 12 · 3 done   |  ✓ Rahul S   ●  Asha P (now)   ○ Mohit K (next)   ○  +6 more  ›
```

- Left chunk = position counter (`#current of total · doneCount done`).
- Middle = horizontally scrollable token strip; tokens render as `Badge`s with the same status meta as P4.2.
- Right chunk = previous / next chevrons. Click → navigates the cockpit (P2.3).

**Visibility:** all states except `terminal`. Hidden on mobile (`<lg`) — the bottom pill bar plus Now/Next on the dashboard cover this on small screens; revisit in P6.5.

**Effort:** ~0.75 day (mostly polishing the scroll affordance and the token sizing across breakpoints; the data is straight from P2.2).

---

#### P2.2 — `useDoctorDayPipeline()` adapter

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New hook `frontend/hooks/useDoctorDayPipeline.ts` that returns:

```ts
{
  entries: PipelineEntry[];      // unified shape: { id, label, status, position, tokenNumber? }
  currentIndex: number | null;   // index of the appointment currently mounted in the cockpit
  doneCount: number;
  totalCount: number;
  source: 'queue' | 'schedule';  // which mode
  isLoading: boolean;
  error: Error | null;
}
```

Internally it picks based on `doctor_settings.opd_mode`:
- `queue` → wraps `useOpdSnapshot` (now widened by P4.1 to include `completed`).
- `slot` / unset → wraps `useTodaysAppointments`, normalising the appointment list into `PipelineEntry`s.

Telemed-only practices fall into the `slot` branch automatically (no `opd_mode` row). This is exactly what P-D5 promised: one component, two sources.

**Effort:** ~0.5 day.

**Depends on:** P4.1 (so the hook can rely on a corrected enum).

---

#### P2.3 — In-cockpit navigation

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Clicking a token / chevron triggers `router.push('/dashboard/appointments/{id}')`. Because the cockpit page (`frontend/app/dashboard/appointments/[id]/page.tsx`) is a server component, Next.js streams the new appointment without a full hard reload — but the cockpit client island remounts. That's acceptable for v1; instant-feel comes from P5.2 (chart prefetch).

**Defensive:** If the click target is the currently-mounted appointment, no-op (silently ignore — avoids a wasted mount cycle).

**Effort:** ~0.25 day.

---

#### P2.4 — Position counter UX

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** The header chunk reads `#{currentIndex + 1} of {totalCount} · {doneCount} done` with `font-tabular` so digits don't jitter across renders. Click on the counter → opens a `Popover` showing the day's full pipeline (overflow of the inline strip).

**Why:** Doctors live by progress signals — "8 of 12" tells them whether to slow down or speed up far better than a count of "waiting".

**Effort:** ~0.25 day.

---

### P3 · Auto-advance / next patient

#### P3.1 — `<NextPatientCountdown>` overlay

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** A small overlay that mounts inside `EndedCard` (or replaces it for the duration of the countdown) with:

```
✓ Done with Asha P
Going to Mohit K (#5) in 4… [Cancel] [Go now ▸]
```

- Countdown ticks once per second; default 5 s (configurable via `patient_flow_advance_seconds`, P3.3, default 5).
- Cancel → stays on `ended` for indefinite manual review.
- Go now → fires `useNextAppointmentRoute()`'s navigate immediately.
- Once the countdown reaches 0 it auto-fires the navigate.
- If `useNextAppointmentRoute()` returns `null` (no more patients today), the overlay swaps for the end-of-day card (P5.6) instead.

**Effort:** ~0.5 day.

**Depends on:** P1.3 (so it fires off `wrap_up`/`ended` properly), P3.2.

---

#### P3.2 — `useNextAppointmentRoute()` hook

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Returns `{ url, label, modality } | null` for the next appointment to handle. Source resolution:

- `queue` mode → next entry from `useOpdSnapshot` with status ∈ `waiting` / `called`, ordered by `tokenNumber`.
- `slot` / telemed mode → next `pending` / `confirmed` appointment from `useTodaysAppointments`, ordered by `appointment_date`.

Returns `null` when nothing eligible remains.

**Effort:** ~0.25 day (light wrapping over the same data the queue rail already pulls).

---

#### P3.3 — `doctor_settings.patient_flow_advance` toggle

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Migration adds a single column:

```sql
ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS patient_flow_advance TEXT NOT NULL DEFAULT 'countdown'
    CONSTRAINT doctor_settings_patient_flow_advance_check
    CHECK (patient_flow_advance IN ('countdown','instant','manual'));
```

Settings page (`/dashboard/settings/practice-setup/page.tsx` or a new sub-page) gets a radio group:

- **Confirm before advancing (5 s countdown)** — recommended (default).
- **Go to next patient instantly** — for high-volume OPD.
- **Stay on this screen until I move** — for slow / complex consults.

**Effort:** ~0.5 day (migration + settings UI + plumbing the value through to `useNextAppointmentRoute`).

---

### P4 · Visual differentiation in OPD / Today

#### P4.1 — Fix `useOpdSnapshot` enum drift; widen active set

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** `frontend/hooks/useOpdSnapshot.ts` currently has:

```ts
const OPD_ACTIVE_STATUSES = new Set(['waiting', 'called', 'in_progress']);
```

Migration 028 defines the actual enum as `'waiting' | 'called' | 'in_consultation' | 'completed' | 'skipped' | 'missed' | 'cancelled'`. So `'in_progress'` is dead and `'in_consultation'` rows are silently misclassified as inactive.

**Two fixes:**

1. Replace `'in_progress'` with `'in_consultation'` (bug fix).
2. Widen the snapshot to also surface `completed`, `missed`, `skipped` rows, but separate them from `entries`:

```ts
return {
  isOpdEnabled,
  active: DoctorQueueSessionRow[],     // waiting / called / in_consultation
  done:   DoctorQueueSessionRow[],     // completed (today)
  missed: DoctorQueueSessionRow[],     // missed / skipped / cancelled
  totalActive, totalDone, totalMissed,
  isLoading, error, retry,
};
```

**Why:** P-D6 needs done-today visible; P2.2's adapter can't be honest about `doneCount` without this.

**Reversibility:** High — pure hook change. Existing callers (`OpdQueueStrip`) read `active` instead of `entries` post-rename.

**Effort:** ~0.25 day.

---

#### P4.2 — `OpdQueueStrip` STATUS_META + header summary

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** In `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx`:

- Extend `STATUS_META` map to cover `completed`, `missed`, `skipped`, `cancelled` (with muted-success / destructive / muted variants).
- Header subtitle reads `{totalDone} done · {totalActive} waiting · {totalMissed} no-show` (drop zero counts gracefully).
- Below the active list, add a collapsed `Done today (3) ▾` disclosure that expands to show the day's completed entries (greyed). Default collapsed once `totalDone > 5`.

**Effort:** ~0.5 day.

**Depends on:** P4.1.

---

#### P4.3 — `TodaysSchedule` outcome-coloured rows

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** In `frontend/components/dashboard/cockpit/TodaysSchedule.tsx`, replace the time-pastness `opacity-60` heuristic with outcome:

| `appointment.status` × session signal | Visual |
|---|---|
| `completed` (post-P1.2) | ✓ icon + 60 % text + green outline badge "Done" |
| `consultation_session.status === 'live'` | left accent border + pulsing dot, `bg-primary/5` (today reserved for current-hour group) |
| `pending` / `confirmed` AND `now > appointment_date + slot/2` (defaults to 15 min) | warning-coloured "Late" chip — hint to act |
| `pending` / `confirmed` AND past appointment time | normal future styling but with a soft amber dot (silent nudge) |
| `cancelled` / `no_show` | strike-through + destructive outline |
| Future / current | as today |

**Effort:** ~0.75 day. Uses existing status helpers from `lib/ui/status.ts` (extending the badge variant map).

**Reversibility:** High.

---

#### P4.4 — Inline "Mark no-show"

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** On `TodaysSchedule` rows that show the "Late" chip (P4.3), add a tiny `Mark no-show` button that fires `PATCH /v1/appointments/:id` with `{ status: 'no_show' }`. Uses the existing appointment-update endpoint (no new backend work).

**Why:** Saves a navigation. Especially useful when the auto-no-show worker (P5.5) is off, which is the default per P-D7.

**Effort:** ~0.25 day.

---

### P5 · Quality-of-life touches

#### P5.1 — Keyboard shortcuts

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Inside the cockpit:

- `Cmd/Ctrl+Enter` — fires the same handler as `<RxWorkspace>`'s sticky "Send to patient". Disabled when the button is disabled.
- `Cmd/Ctrl+Shift+Enter` — opens the wrap-up dialog (P1.1) directly. Convenience when no Rx is needed (advice-only consult).
- `Esc` from inside the wrap-up dialog cancels back to the cockpit.

Live in a small `useCockpitHotkeys()` hook scoped to the `ConsultationCockpit` mount. Re-uses the cmd-K shortcut pattern from `GlobalCommandPalette`.

**Effort:** ~0.25 day.

---

#### P5.2 — Prefetch next patient's chart

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** When the cockpit transitions to `wrap_up` or `ended`, fire-and-forget calls to `getPatientAllergies`, `getPatientConditions`, `getPatientVitals`, `getPatientProblems` for the next-up patient (resolved via `useNextAppointmentRoute()`). Cache in React Query / SWR keyed on `(patientId, "today")` so the chart-rail mount on the next page is a cache hit.

**Why:** Makes the auto-advance feel instant. Without this, the next cockpit shows skeletons for ~1 s while the chart hydrates.

**Effort:** ~0.5 day.

---

#### P5.3 — "Running behind" badge

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Small badge in `CockpitHeader` (right of the queue rail counter) that shows `+18 min` when `now() > nextAppointment.appointment_date`. Soft warning colour. Hidden when on time.

**Why:** Doctors self-pace from this signal far better than a printed schedule. Doesn't shame them — just informs.

**Effort:** ~0.25 day.

---

#### P5.4 — "+ Walk-in" fast path

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** A "+ Walk-in" button on the queue rail (queue-mode doctors) and on the dashboard header (any doctor). Opens a 1-field modal: just patient name (free text). On submit, creates an appointment with:

- `appointment_date = now()`
- `consultation_type = 'in_clinic'` (or doctor's default mode)
- `status = 'confirmed'`
- `patient_id = null` (walk-in path; patients row created lazily on chart fill)

Then routes the cockpit to that appointment.

**Why:** Today walk-ins go through `AddAppointmentModal` (4 fields). For a busy OPD, that's friction.

**Effort:** ~0.5 day.

---

#### P5.5 — Auto-no-show worker

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Backend interval job that, every 5 min:

1. Queries `appointments` where `status IN ('pending','confirmed')` AND `appointment_date < now() - doctor_settings.auto_no_show_after_min minutes` AND `consultation_session.id IS NULL` (no session ever created).
2. Flips them to `status = 'no_show'`.
3. Emits a dashboard-event `appointment.auto_no_show` for the doctor.

Gated entirely on `doctor_settings.auto_no_show_after_min` being non-NULL — opt-in per P-D7. Settings UI (P3.3 page) gets a parallel section "Auto mark no-show after { N } minutes" with a clear caveat about telemed lateness tolerance.

**Effort:** ~0.5 day backend.

**Depends on:** P3.3's settings migration (adds the column alongside `patient_flow_advance`).

---

#### P5.6 — End-of-day summary

**Decision:** [x] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** After the last patient of the day completes (i.e. `useNextAppointmentRoute()` returns `null` immediately after a wrap-up), `EndedCard` swaps for an `<EndOfDayCard>`:

```
You're done for today
12 patients · 11 completed · 1 no-show · 9 prescriptions sent
[ Wrap up clinic ]   [ Review tomorrow's schedule ]
```

Numbers come from the same `useTodaysAppointments` data already in flight.

**Why:** Closes the loop emotionally. Cheap to ship — pure composition.

**Effort:** ~0.25 day.

---

### P6 · Out of scope (parked)

Items below are explicitly *not* in this plan but listed so we don't forget. Promote them by ticking `Y` and they get their own plan file or get folded into a follow-up.

#### P6.1 — Multi-doctor handoff

**Promote:** [ ]  
**Notes:** Transferring a queue position to another doctor in the same clinic. Single-doctor V1 per `plan-ui-system-redesign.md` U6.2.

#### P6.2 — Patient self-arrival check-in

**Promote:** [ ]  
**Notes:** Kiosk + patient-side "I'm here" SMS link. Belongs to a future "patient ops" plan.

#### P6.3 — Voice / dictation in wrap-up dialog

**Promote:** [ ]  
**Notes:** "Hold to dictate" for diagnosis. Hangs off T6 (AI assist).

#### P6.4 — Per-specialty wrap-up fields

**Promote:** [ ]  
**Notes:** OB-LMP/EDD, paeds growth chart, etc. Locked out by E1 (generalist-first) in `ehr/plan-00`.

#### P6.5 — Native mobile redesign of the queue rail

**Promote:** [ ]  
**Notes:** Inherits cockpit-7 mobile bottom-pill pattern; revisit when mobile work resumes.

#### P6.6 — Bulk actions on the queue rail

**Promote:** [ ]  
**Notes:** End-of-day "mark all remaining no-show" sweep. Worth it iff P5.5 doesn't cover the case.

---

## Sequencing recommendation (if every item ticks `Yes`)

```
Phase 1 (keystone) — ~1 dev-day
 │   P1.4  migration: appointment wrap-up columns
 │   P1.2  POST /v1/appointments/:id/wrap-up + GET /v1/diagnoses/recent
 │   P1.3  cockpit state: add wrap_up
 │   P1.1  <WrapUpDialog>
 │   P1.5  retire kebab; new header CTA
 ▼
Phase 2 (queue rail + auto-advance) — ~1.5 dev-days
 │   P4.1  fix useOpdSnapshot enum + widen active set     ← prerequisite for P2.2
 │   P2.2  useDoctorDayPipeline()
 │   P2.1  <CockpitQueueRail>
 │   P2.3  in-cockpit navigation
 │   P2.4  position counter + popover
 │   P3.3  doctor_settings.patient_flow_advance + Settings UI
 │   P3.2  useNextAppointmentRoute()
 │   P3.1  <NextPatientCountdown>
 ▼
Phase 3 (visual + QoL) — ~1.5 dev-days
     P4.2  OpdQueueStrip: STATUS_META extension + summary
     P4.3  TodaysSchedule: outcome-coloured rows
     P4.4  inline mark no-show
     P5.1  keyboard shortcuts
     P5.2  prefetch next patient's chart
     P5.3  "running behind" badge
     P5.4  "+ Walk-in" fast path
     P5.5  auto-no-show worker (backend; gated by setting)
     P5.6  end-of-day summary
```

Phase 1 ships independently and is the **gate** — there's no point shipping Phase 2's auto-advance if Phase 1's wrap-up checkpoint doesn't exist. Phase 2 ships independently of Phase 3 (queue rail works without TodaysSchedule's recolour). Phase 3 items can land à la carte; none block another.

**Estimated effort if all picked:** ~4 dev-days frontend + ~0.5 day backend + ~0.5 day for migrations / auto-no-show worker = **~5 dev-days**. Two parallel chats (one for backend Phase 1, one for frontend Phase 1) compress Phase 1 to ~half a day.

---

## Success criteria (how we'll know it worked)

| Metric | Today | Target after Phase 1+2 |
|---|---|---|
| Time from "Send Rx" to "next cockpit interactive" | unmeasured (manual: send → click back → click next appointment ≈ 8–12 s) | ≤2 s (auto-advance with prefetch) |
| % of completed consults where `appointment.status === 'completed'` | unmeasured (suspected ≪ 100 %; bug surface) | ≥98 % |
| % of completed consults with a recorded diagnosis | 0 % (column doesn't exist) | ≥85 % |
| Doctor-reported "I lose track of where I am in the queue" | qualitative; reported in pilot | →0 in queue-mode pilot |
| `OpdQueueStrip` shows `done` count | never | always (post P4.2) |
| Avg cockpit screen-stares per patient (visual telemetry, P5 of telemetry plan) | ~3 (login → Now/Next → cockpit) | 1 (cockpit only, after first patient) |

---

## Open questions (track here; lock before promoting to batch)

These are questions that *don't* block drafting but should be answered before a batch is promoted to `Committed`.

#### P-Q1 — Diagnosis tag taxonomy

**Question:** P1.1's tag chips draw from the doctor's recent free-text diagnoses (no canonicalisation). When ICD-10 / SNOMED arrives (T-something), do we backfill `diagnosis_tags` from free-text via a one-shot script, or treat ICD as a parallel column?

**Notes:** Recommend parallel column when ICD lands. Free-text stays for human readability.

---

#### P-Q2 — `wrap_up` lifetime

**Question:** If a doctor never completes the wrap-up dialog (closes the tab mid-flow), does the appointment stay in `wrap_up` forever? Should there be a soft expiry that auto-completes with empty diagnosis after, say, 24 h?

**Notes:** Vote: yes, auto-complete with `diagnosis_text = NULL` and a system-generated note. Cleaner than perpetual half-states.

---

#### P-Q3 — Wrap-up for cancelled / no-show appointments

**Question:** Does the doctor wrap-up for cancelled / no-show appointments? Probably not — but they may want to record "patient did not arrive" or a brief note.

**Notes:** Vote: skip the dialog for these states. Add a tiny notes field on the cancel / no-show actions if doctors ask.

---

#### P-Q4 — Telemetry

**Question:** What events do we want to track for this flow?

**Notes:** Suggested: `cockpit.wrap_up.opened`, `cockpit.wrap_up.completed`, `cockpit.next_patient.advanced` (auto / manual / cancelled), `cockpit.queue_rail.token_clicked`. PHI-free counts only.

---

#### P-Q5 — In-clinic vs telehealth wrap-up parity

**Question:** Should the wrap-up dialog look identical for in-clinic and telehealth, or do telehealth consults get an extra "Send chart-history DM?" toggle (Plan 07 surface)?

**Notes:** Plan 07 already auto-DMs the chat-history on session end (`sendPostConsultChatHistoryDm`). The dialog should display the upcoming DM as a passive line ("We'll DM the chat history to the patient") — not a toggle.

---

## Plan rules (pre-ship workflow)

These apply while the plan is `Drafted` / `Selected`.

1. **Editing this file is welcome** under any `Notes:` line. Don't edit headers / IDs.
2. **Don't renumber items.** P-IDs are stable. New items take the next available number; killed items keep their ID and gain `[KILLED]` suffix.
3. **When all items in a section have a `Decision:` ticked, that section is "Reviewed."** When P0–P5 are all Reviewed, the plan promotes to a dated batch under `Daily-plans/<month>/<date>/plan-patient-flow-batch.md` and becomes `Committed`.
4. **Implementation MUST NOT start until promotion.** Work-in-progress on individual items inside daily-plans batches is fine; net-new items belong here first.

---

**Created:** 2026-05-07.  
**Status:** `Drafted`.  
**Owner:** TBD.
