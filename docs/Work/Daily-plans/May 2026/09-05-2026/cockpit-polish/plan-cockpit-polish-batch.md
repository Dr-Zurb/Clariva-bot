# Batch — Cockpit polish (09 May 2026)

> **Status:** `Drafted` 2026-05-09.
> **Source:** cockpit screenshot review on 2026-05-09 (Ask-mode walkthrough), backed by code reads of `frontend/components/consultation/cockpit/*`, `frontend/hooks/useDoctorDayPipeline.ts`, `frontend/hooks/useNextAppointmentRoute.ts`, `frontend/components/consultation/TextConsultRoom.tsx`, `frontend/components/dashboard/WalkInQuickModal.tsx`, `frontend/lib/consultation/cockpit-state.ts`, and `backend/src/services/appointment-service.ts`.
> **Execution order (authoritative):** [Tasks/EXECUTION-ORDER-cockpit-polish.md](./Tasks/EXECUTION-ORDER-cockpit-polish.md).
> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
> **Effort:** ~19h serial · ~8h with 4 parallel chats.
> **No new migrations.**

---

## What this batch ships

The cockpit becomes the doctor's "stay-here-the-whole-session" surface — auto-advance is reliable, the queue rail communicates exactly the three patients that matter, the patient identity is scannable in 200 ms, and dead-end UX surfaces are removed.

1. **Pipeline + strip (Phase 1).** `useDoctorDayPipeline.queueEntries` merges all three buckets (`active` + `done` + `missed`) into a single array sorted by `tokenNumber` ASC. This restores the chronological order so `useNextAppointmentRoute` correctly returns the next active patient even immediately after the current patient flips to `completed`. The cockpit queue rail collapses to a 3-chip window (prev / now / next) with token + status colour; the "Walk-in" slot in the rail is removed (see Phase 2).

2. **Cleanup (Phase 2).** The walk-in fast path is removed entirely (modal file deleted, two cockpit / dashboard mount points cleaned, comment debt in `MobilePillBar.tsx` rewritten). Both follow-up-Rx surfaces — the `RxWorkspace` ended-state stub button and the `CockpitHeader` `Send follow-up Rx` primary CTA in the `ended` state — are removed; the `draft-followup` action enum is retired from `cockpit-state.ts`.

3. **Mark-no-show parity (Phase 3).** `TextConsultRoom` gains an `onMarkNoShow` prop and renders a destructive-ghost button next to "End chat" with the same two-step confirm pattern used in `VideoRoom` and `VoiceConsultRoom`. `CockpitHeader`'s `ready` state gains a quiet "Mark no-show" link (visible only when the appointment time is in the past or within ±5 minutes of now), so doctors can correctly flag patients who never joined without leaving the cockpit.

4. **Header redesign + demographics (Phase 4).** Backend widens the doctor-scoped `GET /v1/appointments/:id` payload to include `patient_age` (computed from `patients.date_of_birth`) and `patient_sex` (from `patients.gender`) — privacy boundary is identical to the existing `patient_phone` field on the same endpoint (doctor JWT, ownership-checked). Frontend types update. `CockpitHeader` restructures into a two-row layout: row 1 = patient name + age/sex (prominent; ~16 px primary, ~14 px demographics); row 2 = MRN, phone, modality, scheduled time, OPD token (small, ~12 px, muted).

**Out of scope for this batch:**
- Receptionist-facing or kiosk surfaces (different role; would need their own non-PHI endpoint).
- Walk-in fast-path replacement design — re-introduce only when a real offline-OPD use case is scoped.
- Backend changes for follow-up-Rx — the `draft-followup` action stub exists end-to-end and would need a real backend flow; out of scope.
- Migration `095_prescriptions_episode_link.sql` consumers (the original blocker for the `Add follow-up Rx` button) — the migration stays applied; the UI surface is just retired until there's a real flow that uses it.

---

## Decision lock (locked 2026-05-09, copied here for stability)

| ID | Decision | Why |
|---|---|---|
| **CP-D1** | The walk-in fast path is **removed**. `WalkInQuickModal.tsx` is deleted; the two mount points (`CockpitQueueRail`, `NowNextCard`) are cleaned. The dead `setWalkInOpen` state and the "+ Walk-in" button trigger are removed. | User direction 2026-05-09: Clariva is a digital-first / teleconsult product; offline-walk-in onboarding doesn't fit the surface today and the modal mints `patient_id=null` appointments that skip the standard onboarding flow. Re-introduce only with a real offline-OPD use case. |
| **CP-D2** | After "Send Rx & finish" (or the explicit "Finish visit" CTA) the cockpit auto-advances to the next patient via the existing `NextPatientCountdown` (a cancellable count-down that respects `doctor_settings.patient_flow_advance`). The deprecated `WrapUpDialog` stays unmounted. | The dialog was redundant — diagnosis + follow-up are already captured inside the prescription form, and the count-down already exists for the `pf-11` flow. Removing the dialog also removed the popup-then-popup feel the user complained about. |
| **CP-D3** | The cockpit queue rail shows exactly **three chips** (previous / now / next) with token number + status colour. The full queue is one click away on `/dashboard/opd-today`. | Six chips + "+N more" was visually noisy and the doctor never used the chips beyond the immediate ±1 window. Keeps cockpit identity-strip-clean. |
| **CP-D4** | Both follow-up-Rx surfaces are **removed**: `RxWorkspace`'s `+ Add follow-up Rx` stub button (ended state) and `CockpitHeader`'s `Send follow-up Rx` primary CTA (ended state). The `draft-followup` action is removed from `CockpitCtaAction`. | Both stubs `console.warn` and don't actually create a new Rx; they promise things the platform doesn't deliver yet. A doctor that needs another Rx for the same patient navigates to the patient page (`/dashboard/patients/:id`) and starts a new prescription there. |
| **CP-D5** | Mark-no-show is reachable from **every consultation modality**: `VideoRoom`, `VoiceConsultRoom`, **`TextConsultRoom`** (new — adds `onMarkNoShow` prop + destructive-ghost button next to "End chat" with the same two-step confirm). For pre-call (the `ready` state, when the patient never joined), `CockpitHeader` exposes a quiet ghost-link "Mark no-show" — visible only when the appointment time is in the past or within ±5 minutes of now (so we don't pre-empt a patient who's running 30 min early). | Closes the only remaining hole in the no-show flow that the patient-flow batch left open. The text-room gap was an oversight; the pre-call header gap matters because by far the most common no-show flow is "patient never showed up at all", which today forces the doctor to start a session they never intended just to access the in-call no-show button. |
| **CP-D6** | The doctor-scoped `GET /v1/appointments/:id` payload widens to include `patient_age` (computed from `patients.date_of_birth` at server-side) and `patient_sex` (from `patients.gender`). Both fields are **null** when the appointment has `patient_id = null` (legacy walk-in rows; no new walk-in rows are created post-CP-D1). Privacy boundary mirrors `patient_phone` already on this endpoint: doctor JWT, ownership-checked, doctor-scope-only. | Doctor sees age/sex on every adjacent surface (patient list, patient detail, prescription PDF) — exposing it on the appointment payload is consistent. Computing `age` server-side avoids a frontend timezone discrepancy. Document the privacy decision in the service file so future engineers don't re-mask it (mirrors OQ-D1 / OQ-D7 from the OPD queue redesign batch). |
| **CP-D7** | `CockpitHeader` splits into a **two-row** patient identity header. **Row 1** (~16 px / 14 px): patient name (primary, bold) + age/sex chip (secondary). **Row 2** (~12 px, muted): MRN, phone, modality, scheduled time, OPD token. Below `lg` breakpoint row 2 collapses to a single truncated line with overflow tooltip. | The current single-row header treats name and metadata with equal visual weight, so the doctor wastes time scanning to find the name. The two-row pattern is the same one used by `OpdQueueDenseRow` after the 08-05-2026 batch — header / queue / detail surfaces stay visually consistent. |

Revisiting any of these belongs in a new `Decision:` block on the affected task spec with a clear `Modify` rationale.

---

## Phases

### Phase 1 — Pipeline + strip (2 tasks · ~4h)

| Task | Source decision | Effort | Surface |
|---|---|---|---|
| [cp-01 — fix `useDoctorDayPipeline` queue sort](./Tasks/task-cp-01-pipeline-sort-fix.md) | CP-D2 | XS (~1h) | Frontend hook |
| [cp-02 — `<CockpitQueueRail>` prev/now/next windowing](./Tasks/task-cp-02-prev-now-next-strip.md) | CP-D3 | S (~3h) | Frontend component |

**Phase 1 gate:** Auto-advance after `Send Rx & finish` reliably routes to the next active patient (verified against a fixture with mixed active/done/missed rows). Cockpit queue rail shows exactly 3 chips (prev / now / next) — never more, never less when the data exists; uses the existing `getOpdStatusMeta` colour mapping. The "+ Walk-in" rail slot is gone.

### Phase 2 — Cleanup (2 tasks · ~3.5h)

| Task | Source decision | Effort | Surface |
|---|---|---|---|
| [cp-03 — remove walk-in feature](./Tasks/task-cp-03-remove-walkin.md) | CP-D1 | S (~3h) | Frontend (modal delete + 2 mount-point cleanups) |
| [cp-04 — drop follow-up-Rx surfaces](./Tasks/task-cp-04-drop-followup-rx-surfaces.md) | CP-D4 | XS (~30m) | Frontend (`RxWorkspace`, `cockpit-state.ts`) |

**Phase 2 gate:** `WalkInQuickModal.tsx` no longer exists in the repo. `rg "WalkIn"` returns zero matches in `frontend/components/`. `RxWorkspace.tsx` no longer renders the dashed `+ Add follow-up Rx` button. `cockpit-state.ts` no longer maps the `ended` state to a `Send follow-up Rx` CTA, and `CockpitCtaAction` no longer includes `draft-followup`. `cockpit-state.test.ts` updated to reflect the removed CTA. Type-check + lint clean.

### Phase 3 — Mark-no-show parity (2 tasks · ~4h)

| Task | Source decision | Effort | Surface |
|---|---|---|---|
| [cp-05 — Mark-no-show in `<CockpitHeader>` ready state](./Tasks/task-cp-05-mark-no-show-ready-header.md) | CP-D5 | S (~2h) | Frontend |
| [cp-06 — Mark-no-show in `<TextConsultRoom>`](./Tasks/task-cp-06-mark-no-show-text-room.md) | CP-D5 | S (~2h) | Frontend |

**Phase 3 gate:** All four modalities (`live` / `voice` / `text` / `video` / `in_clinic`) expose Mark-no-show — pre-call via `CockpitHeader.ready`, in-call via the modality room. Each preserves the two-step confirm pattern. Network errors surface inline. The post-success state transitions correctly to `terminal` via the existing `setAppt` flow. No regressions in `CockpitHeader.live` / `wrap_up` / `ended` / `terminal` branches.

### Phase 4 — Header redesign + demographics (3 tasks · ~7.5h)

| Task | Source decision | Effort | Surface |
|---|---|---|---|
| [cp-07 — backend: widen appointment payload with `patient_age` + `patient_sex`](./Tasks/task-cp-07-appointment-demographics-backend.md) | CP-D6 | S (~3h) | Backend service + types |
| [cp-08 — frontend: `Appointment` type update for demographics](./Tasks/task-cp-08-appointment-demographics-frontend-types.md) | CP-D6 | XS (~30m) | Frontend types |
| [cp-09 — `<CockpitHeader>` two-row patient identity layout](./Tasks/task-cp-09-cockpit-header-two-row-layout.md) | CP-D7 | M (~4h) | Frontend |

**Phase 4 gate:** `GET /v1/appointments/:id` returns `patient_age` (number \| null) and `patient_sex` ("male" \| "female" \| "other" \| null). Both fields populate from the joined `patients` row when `patient_id` is present, fall back to `null` otherwise. Privacy decision documented in `appointment-service.ts` (block-comment, mirrors the OQ-D1 / OQ-D7 pattern). Frontend `Appointment` type carries both fields. `CockpitHeader` renders the two-row layout (row 1 = name + age/sex; row 2 = MRN / phone / modality / scheduled / token in a smaller muted font); below `lg` breakpoint row 2 collapses to single line with overflow tooltip. Mark-no-show ghost link from cp-05 lands in the new layout.

---

## Whole-batch acceptance gate

Run after all 4 phase gates close. One Opus chat, paste full diff, ask for the final grade.

```
- [ ] Send Rx & finish → cockpit auto-advances to the next active patient via NextPatientCountdown.
      Tested against a fixture with at least 3 active patients (current at index 0, two more behind).
- [ ] Cockpit queue rail shows exactly 3 chips (prev / now / next) — never overflows, never shows
      a "+N more" pill, never shows a "+ Walk-in" trigger.
- [ ] `rg -i "walk[ -]?in"` in frontend/ returns zero matches outside of historical task files in docs/.
- [ ] frontend/components/dashboard/WalkInQuickModal.tsx no longer exists.
- [ ] RxWorkspace.tsx no longer renders the dashed-border "+ Add follow-up Rx" button.
- [ ] cockpit-state.ts no longer maps `ended` to a Send-follow-up-Rx CTA; `draft-followup` is
      removed from `CockpitCtaAction`. Existing tests in cockpit-state.test.ts pass.
- [ ] CockpitHeader.tsx renders a quiet "Mark no-show" link in the `ready` branch, visible only
      when appointment_date is in the past or within ±5 min of now.
- [ ] TextConsultRoom.tsx accepts `onMarkNoShow` and renders a destructive-ghost button next to
      "End chat" with the standard two-step confirm.
- [ ] Voice / video rooms still expose Mark-no-show with no regressions.
- [ ] GET /v1/appointments/:id returns patient_age (number|null) and patient_sex (enum|null).
- [ ] backend tests cover the widened payload (one new assertion in the existing suite).
- [ ] frontend Appointment type includes patient_age + patient_sex.
- [ ] CockpitHeader is two rows: row 1 = name + age/sex (prominent); row 2 = MRN, phone, modality,
      scheduled, token (small / muted).
- [ ] Below `lg` breakpoint row 2 collapses to a single line with overflow tooltip.
- [ ] Type-check + lint clean (frontend + backend).
- [ ] No new migrations.
- [ ] No regressions in: PrescriptionForm footer (previous batch), NextPatientCountdown, EndedCard,
      EndOfDayCard, OpdQueueStrip, OpdQueueDenseRow, AppointmentDetailWorkArea.
```

---

## Cost calibration

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Opus turns | Sonnet turns | Composer turns |
|---|---|---|---|
| Phase 1 (cp-01, 02) | 0 | 3–4 | 0 |
| Phase 2 (cp-03, 04) | 0 | 2–3 | 1 (cp-04 trivial) |
| Phase 3 (cp-05, 06) | 0 | 3–4 | 0 |
| Phase 4 (cp-07, 08, 09) | 1 (cp-07 privacy + contract review) | 5–6 | 0 |
| Whole-batch close | 1 (final grade) | 0 | 1 (three-way doc sync) |
| **Totals** | **~2** | **~13–17** | **~2** |

**Red flag:** if any single task takes >2 chats, **stop and tighten the task file's spec section.** The task file IS the spec.

---

## References

- [`Tasks/EXECUTION-ORDER-cockpit-polish.md`](./Tasks/EXECUTION-ORDER-cockpit-polish.md) — authoritative execution order
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules
- Style precedent: [Daily-plans/May 2026/08-05-2026/plan-opd-queue-redesign-batch.md](../../08-05-2026/plan-opd-queue-redesign-batch.md)
- Predecessor cockpit batches:
  - [Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../../06-05-2026/plan-cockpit-redesign-batch.md) — initial cockpit redesign (state machine, shell, panes).
  - [Daily-plans/May 2026/07-05-2026/plan-patient-flow-batch.md](../../07-05-2026/plan-patient-flow-batch.md) — auto-advance + countdown + walk-in fast path. `task-pf-16-walkin-fast-path.md` is **superseded** by this batch's CP-D1.

---

**Created:** 2026-05-09. **Status:** `Drafted`.
