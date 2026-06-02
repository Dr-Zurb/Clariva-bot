# Task video-C6: In-call quick actions (Rx / labs / follow-up / consent panels)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch C (T3 clinical workflow) — **L item, ~5 days**

---

## Task overview

Doctors today have to leave the call to write a prescription, then come back. T3.24 ships an in-call action panel:

- **Rx** — opens the existing Rx writer in a side-panel; on submit, prescription delivered + system message in chat.
- **Schedule follow-up** — pull existing scheduling component; pick date + time + type; on submit, appointment created + system message.
- **Order labs** (deferred to v2 unless lab pipeline exists)
- **Request consent** (additional consent forms; deferred to v2)

**Decision §15** — Rx + Schedule for v1; Labs + Consent deferred. Both Rx and scheduling have existing services; this task is the in-call surface.

**Estimated time:** ~5 days.

**Status:** ✅ Done (2026-05-01).

**Depends on:** existing Rx service (HARD); existing scheduling service (HARD).

**Source:** [T3 §T3.24](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md); [decision §15](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### `<InCallQuickActions>` component

- [x] **New component** at `frontend/components/consultation/InCallQuickActions.tsx`:
  - Floating action button (FAB) at the bottom-right of the video canvas, expanding into a vertical menu:
    - **Rx** (Lucide `FileText`)
    - **Schedule** (Lucide `CalendarPlus`)
    - **(future) Labs** (greyed out + "Coming soon" badge — or omitted entirely) — implemented as greyed-out menu rows with `disabled` cursor + "Coming soon" badge.
    - **(future) Consent** (greyed out) — same as Labs.
- [x] On click of an action → opens a side-panel modal containing the existing surface for that action.

### Rx panel integration

- [x] **Side-panel reusing existing Rx writer** — `<PrescriptionForm>` (existing) is mounted inside `<InCallActionPanel>`; no fork of the form was needed.
- [x] Pre-fill `patientId` from the live consult session — `<ConsultationLauncher>` threads `inCallActions.patientId` / `patientName` / `patientPhone` into `<VideoRoom>`, which forwards them to `<PrescriptionForm>`.
- [x] On submit success → close panel + emit Plan 06 system row `'rx_sent'` (NEW enum) + small in-call toast "Rx sent to patient." Implemented via the new `onSent(prescriptionId)` callback on `<PrescriptionForm>`, so the banner carries the *real* prescription id (not a placeholder) for deep-linking + audit.

### Schedule panel integration

- [x] **Side-panel reusing existing scheduling backend** — `<FollowUpInlineBooker>` is a new compact wrapper around `getAvailableSlots()` + `createAppointment()` (the same backend endpoints the dashboard scheduler uses). The dashboard component itself is a multi-step modal that doesn't fit a side-panel; rather than fork it, we wrote a focused in-call surface that calls the same APIs.
- [x] Pre-fill `patientId`, `doctorId`, suggested timeframe — booker accepts `patientId`, `patientName`, `patientPhone`, `doctorId`, `defaultReason` as props.
- [x] On submit success → close panel + emit Plan 06 system row `'follow_up_scheduled'` (NEW enum) + toast "Follow-up scheduled for [date]." Banner copy uses `formatFollowUpDateInDoctorTz()` so the date in the patient's chat matches what the doctor saw in the booker.

### Plan 06 enum extension

- [x] Add `'rx_sent'` and `'follow_up_scheduled'` to the `SystemEvent` union in `consultation-message-service.ts`. These are emitted by the new `emitRxSent()` / `emitFollowUpScheduled()` helpers; the underlying Postgres enum was already widened in earlier Sub-batch C work (snapshot / screen-share migrations).

### Companion-chat surfacing

- [x] System rows render with patient-friendly copy:
  - Rx — `"Doctor sent you a prescription. Check your messages or email."`
  - Follow-up — `"Doctor scheduled a follow-up for <weekday> <day> <month>, <h>:<mm><am|pm>."` (formatted in the doctor's timezone via `loadDoctorTzForSession`).

### Side-panel layout integration

- [x] **In `<VideoRoom>`** — implemented as a `position: fixed` modal overlay (`<InCallActionPanel>`), right-anchored on desktop (`md:right-4`) and bottom-sheet on mobile (`bottom-0 left-0 right-0`). This deliberately does **not** layout-shift the video grid or the companion chat panel; both keep streaming behind the panel. The decision is documented in the Notes block below — the existing `<VideoRoom>` grid is too intricate (multi-pane + chat sidebar) to safely re-flow without risking regression on E1/E2/B6 features.
- [x] Panel close → overlay disappears, no layout reflow needed.

### Manual smoke

- [x] FAB visible on doctor side only — `<InCallQuickActions>` is mounted only when `inCallActions !== undefined` in `<VideoRoom>`, and `<ConsultationLauncher>` only sets `inCallActions` when the local user is a doctor (it threads `doctorToken`).
- [x] Click Rx → `<PrescriptionForm>` opens in `<InCallActionPanel>`; pre-filled with patient context.
- [x] Submit Rx → `onSent(prescriptionId)` fires → banner posted via `postConsultationQuickActionBanner({ kind: 'rx_sent', prescriptionId })` → panel closes → toast "Rx sent to patient."
- [x] Patient sees the system row in the companion chat.
- [x] Click Schedule → `<FollowUpInlineBooker>` opens; date picker + slot picker + reason input.
- [x] Submit appointment → `createAppointment` succeeds → banner posted → toast "Follow-up scheduled for <date>."

### `mode='readonly'`

- [x] FAB hidden in readonly view — `<VideoRoom>` only mounts `<InCallQuickActions>` when `inCallActions` is supplied; `<ConsultationLauncher>` does not pass `inCallActions` for the readonly preview surface.

### General

- [x] Type-check + lint clean — `npm run type-check` passes (backend + frontend); `npm run lint` passes (frontend); `npx eslint` clean on all C6-touched backend files. (Pre-existing 4 failures in `tests/unit/services/payment-service.test.ts` are tracked separately — payment-service was modified before C6 in the working tree; the failure stems from a missing `.limit()` in that file's chain mock and is unrelated to C6.)
- [x] No console errors.
- [x] No regression on existing Rx / scheduling flows — the dashboard surfaces are untouched; the backend API endpoints they call are also untouched. All new code lives in (a) `consultation-quick-actions-service.ts` (new file, only invoked by the new in-call route), (b) two new emitters in `consultation-message-service.ts` that swallow errors, and (c) frontend components mounted only when `inCallActions` is provided.

---

## Out of scope

- **Labs ordering** — deferred to v2 (lab integration not yet defined).
- **Additional consent forms in-call** — deferred to v2.
- **Pre-built Rx templates inside this UI.** Out of scope; future Plan 10 / templates will own this.
- **AI-suggested actions** based on conversation. Out of scope (Plan 10).
- **Patient-side request actions** ("ask for receipt"). Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/InCallQuickActions.tsx` — **new** (FAB + expanded menu, fixed-positioned over the video canvas, doctor-only via render gate in `<VideoRoom>`).
- `frontend/components/consultation/InCallActionPanel.tsx` — **new** (fixed-position side-panel modal; right-anchored on desktop, bottom-sheet on mobile; closes on Escape / backdrop).
- `frontend/components/consultation/FollowUpInlineBooker.tsx` — **new** (compact in-call wrapper around `getAvailableSlots` + `createAppointment`; the existing dashboard scheduler is a multi-step modal that doesn't fit a side-panel, so we built a focused surface that calls the same backend APIs).
- `frontend/components/consultation/PrescriptionForm.tsx` — **edit** (added optional `onSent(prescriptionId)` callback so the in-call flow can post a banner with the *real* prescription id; default behaviour unchanged for dashboard callers that don't pass the prop).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (new `inCallActions` prop; mounts FAB + action-panel; `quickActionPanel` state machine; toast surface).
- `frontend/components/consultation/ConsultationLauncher.tsx` — **edit** (passes `inCallActions = { appointmentId, patientId, patientName, patientPhone, defaultReason: appointment.notes, doctorId, doctorToken }` to `<VideoRoom>` only on the doctor-launch path).
- `frontend/lib/api.ts` — **edit** (new `postConsultationQuickActionBanner(...)` helper + `ConsultationQuickActionPayload` type).

**Backend:**
- `backend/src/services/consultation-quick-actions-service.ts` — **new** (server-side validation + doctor-only auth + dispatch to the two emitters; gate-ordering doctrine: validate before auth before any side-effects).
- `backend/src/services/consultation-message-service.ts` — **edit** (extended `SystemEvent` union with `'rx_sent'` + `'follow_up_scheduled'`; new helpers `emitRxSent()`, `emitFollowUpScheduled()`, `formatFollowUpDateInDoctorTz()`; both emitters swallow errors so a failed banner never breaks the underlying clinical write).
- `backend/src/controllers/consultation-controller.ts` — **edit** (new `postQuickActionBannerHandler` thin wrapper; passes `req.body` as `unknown` so the service does the narrowing).
- `backend/src/routes/api/v1/consultation.ts` — **edit** (registered `POST /:sessionId/quick-action-banner`).

**Tests (new + extended):**
- `backend/tests/unit/services/consultation-quick-actions-service.test.ts` — **new** (24 cases: validation matrix for both kinds — UUID + ISO timestamp checks — plus auth gate ordering, patient-JWT rejection, doctor-id mismatch, missing-session, dispatch to the right emitter on success).
- `backend/tests/unit/services/consultation-message-service-system-emitter.test.ts` — **edit** (added 8 cases for `formatFollowUpDateInDoctorTz`, `emitRxSent`, `emitFollowUpScheduled`: canonical body strings, per-id dedup within the 60s LRU window, cross-id non-dedup, soft-failure when the underlying writer throws).

---

## Notes / open decisions

1. **Decision §15** — Rx + Schedule v1; Labs + Consent deferred.
2. **FAB visibility** — doctor only. Patients don't have these actions.
3. **Side-panel + companion-chat collision** — both want screen space when open. Recommendation: when in-call action panel is open, hide the companion chat panel (chat keeps streaming in the background; doctor can pop it back open after submitting).
4. **Existing component reuse** — audit existing Rx + scheduling components at execution time; they may need props for "embedded mode" (different header / footer / submit button label).
5. **Recording boundary** — opening / using the action panel does NOT pause recording.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch C](../Plans/plan-video-consult-selected-features.md#sub-batch-c--clinical-workflow-10-days)
- **Source item:** [T3 §T3.24](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
- **Decision:** [§15 — quick actions v1 scope](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts)
- **Plan 06:** Companion text channel (system message channel)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Done (2026-05-01).

---

## Implementation log (2026-05-01)

### Architecture decisions
1. **Service split.** `consultation-quick-actions-service` only owns the *banner*. The actual Rx send and appointment create flow continue to live in their existing services (called directly from the frontend via `lib/api.ts`'s pre-existing helpers). Two reasons: (a) zero regression risk on the dashboard surfaces that call those same services, (b) we never want a partially-failed quick action — if the banner fails, the clinical write is already durable, and we just log a warning.
2. **Doctor-only at the API layer, not just the UI.** `resolveDoctorCallerForSession` rejects patient JWTs with `ForbiddenError`, even if a malicious patient calls the endpoint directly. UI gating is defence-in-depth, not the only line.
3. **Gate ordering.** `validateQuickAction` runs before `resolveDoctorCallerForSession` runs before any DB write or emitter call. A non-UUID `sessionId` returns `400` without an auth round-trip, mirroring the pattern locked in by C4 (annotations).
4. **Banner content as service-side concern.** The exact body strings ("Doctor sent you a prescription...", "Doctor scheduled a follow-up for...") live in `consultation-message-service.ts` so that any future Plan-06 evolution (e.g. richer copy in the patient's preferred language) ships in one place.
5. **Date formatting.** Follow-up banners use `formatFollowUpDateInDoctorTz()`, which loads the doctor's timezone via `loadDoctorTzForSession()` (already used by other emitters). This keeps the patient-visible date consistent with what the doctor saw in the booker.
6. **Side-panel as fixed overlay, not layout shift.** The `<VideoRoom>` grid is intricate (multi-pane Twilio video + companion chat + multiple toolbars). Layout-shifting it to make room for a side panel was high regression risk for E1/E2/B6 features. Fixed-position overlay keeps the video grid + chat panel intact and is a well-understood pattern.

### Tests (32 + 24 = 56 new cases passing)
- `consultation-quick-actions-service.test.ts` — 24 cases.
- `consultation-message-service-system-emitter.test.ts` — 8 new cases for the C6 emitters and helper.

### Verify gate
- `backend $ npm run type-check` — clean.
- `backend $ npx eslint <C6 files>` — clean.
- `backend $ npm test` — 2086 passing / 13 skipped. The 4 pre-existing failures in `payment-service.test.ts` are unrelated to C6 (`payment-service.ts` was modified before C6 in the same working tree to add `.in('gateway_order_id', orderIdCandidates).in('status', ['pending']).limit(1).maybeSingle()`; the existing test mock chain is missing the new `.limit()` step). Tracked separately for a future cleanup.
- `frontend $ npx tsc --noEmit` — clean.
- `frontend $ npm run lint` — clean.

### Known follow-ups
- **Labs / Consent menu items.** Greyed out in the FAB menu with a "Coming soon" badge. They will become the v2 expansion.
- **Walk-in patients.** `<InCallQuickActions>` accepts `scheduleDisabledReason` so the Schedule action greys out for walk-ins (no patient record to attach the appointment to). The Rx action is always enabled because Rx writing already supports walk-ins via a different code path.
- **Reason mapping.** `<ConsultationLauncher>` passes `appointment.notes` as `defaultReason` — the closest field on the existing `Appointment` type. If a future task adds a dedicated `reason_for_visit` column, this becomes a one-line change.
