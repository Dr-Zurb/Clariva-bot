# Task 27: Recording-consent capture at booking + soft re-pitch flow + decline handling

## 19 April 2026 — Plan [Recording governance foundation](../Plans/plan-02-recording-governance-foundation.md) — Phase E (Decision 4 LOCKED)

---

## Task overview

Decision 4 in the master plan locked **recording-on-by-default** with **patient consent at booking** and a **soft re-pitch on first decline**. Today the booking flow has a `consent` step (in `backend/src/types/conversation.ts:123`) but it captures *consent to schedule the appointment*, not *consent to record the consult*. Recording today fires implicitly for video — there is no per-booking decision row, no consent versioning, and no doctor-side banner for declined patients.

This task lands the **write half** of the recording governance layer: the `appointments.recording_consent_*` columns, the `recording-consent-service.ts` facade, the IG-bot booking-flow extension that asks the question + handles the soft re-pitch, the public `/book` page checkbox, and the doctor-side `<SessionStartBanner>` that surfaces when a patient declined. Recording lifecycle itself (start/stop/pause) keeps firing through the existing video adapter — that wraps around in Plan 07. What changes here is **whether** recording is allowed for a given session, and the audit trail that proves it.

This is the Plan 02 task that ships first because it's user-visible (booking flow + frontend checkbox) and because Plans 04 / 05 cannot start without `recording_consent_decision` to read at session-start time.

**Estimated time:** ~3 hours

**Status:** Not started

**Depends on:** Plan 01 Task 15 (hard — `consultation_sessions` exists; doctor-side `<SessionStartBanner>` reads `consultation_sessions.id` to look up consent). Soft-blocks every Plan 02 sibling (Tasks 33 + 34) on the consent column shape.

**Plan:** [plan-02-recording-governance-foundation.md](../Plans/plan-02-recording-governance-foundation.md)

---

## Acceptance criteria

- [ ] **Migration `0NN_appointments_recording_consent.sql` ships** (next free number after 050) with these additive columns:
  ```sql
  ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS recording_consent_decision BOOLEAN,        -- NULL = not yet asked
    ADD COLUMN IF NOT EXISTS recording_consent_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recording_consent_version   TEXT;
  ```
  All three nullable so existing rows keep working. Reverse migration drops all three.
- [ ] **`backend/src/services/recording-consent-service.ts` exists** exporting:
  ```ts
  export async function captureBookingConsent(input: {
    appointmentId:  string;
    decision:       boolean;
    consentVersion: string;        // e.g. 'v1.0'
    correlationId:  string;
  }): Promise<void>;

  export async function rePitchOnDecline(input: {
    appointmentId: string;
    correlationId: string;
  }): Promise<{ shouldShow: boolean; copy: string }>;

  export async function getConsentForSession(input: {
    sessionId: string;             // consultation_sessions.id
  }): Promise<{
    decision:    boolean | null;   // null = patient never answered
    capturedAt:  Date    | null;
    version:     string  | null;
  }>;
  ```
  `getConsentForSession` joins `consultation_sessions.appointment_id → appointments.recording_consent_*`. Plans 04 / 05 / video gate their recording paths on `decision === false`.
- [ ] **Consent text + version constants** live in `backend/src/constants/recording-consent.ts`:
  ```ts
  export const RECORDING_CONSENT_VERSION = 'v1.0';
  export const RECORDING_CONSENT_BODY_V1 =
    'I agree to my consultation being recorded for medical records and quality. ' +
    'The doctor can pause recording at any time. I can review or download my recording ' +
    'for 90 days, or request access for the full medical-record retention period anytime.';
  ```
  Bumping the body text MUST bump the version string in the same PR. Document this rule at the top of the constants file.
- [ ] **IG-bot booking-flow extension:** new `recording_consent` step in `PatientCollectionStep` (`backend/src/types/conversation.ts:113-132`), inserted between `consent` and `awaiting_date_time`. Handler:
  - Bot asks "Are you OK with this consult being recorded? Reply **Yes** or **No**." (copy from `dm-copy.ts#buildRecordingConsentAskMessage`).
  - On **Yes** → `captureBookingConsent({ decision: true, consentVersion: 'v1.0' })`, advance to `awaiting_date_time`.
  - On **No** → invoke `rePitchOnDecline()` once, send `dm-copy.ts#buildRecordingConsentExplainer`, ask again with `[Keep recording on] [Continue without recording]` quick replies.
  - On second **No** → `captureBookingConsent({ decision: false })`, **do NOT block** the booking, advance to `awaiting_date_time`. Decision 4 is explicit: booking is never blocked on consent decline.
  - State persisted to `conversations.metadata` so re-entry on retry doesn't re-ask.
- [ ] **Public booking page checkbox:** `frontend/components/booking/RecordingConsentCheckbox.tsx` (new) and `frontend/components/booking/RecordingConsentRePitchModal.tsx` (new), wired into `frontend/app/book/page.tsx`:
  - Default checked.
  - On uncheck → modal opens with the soft re-pitch explainer. Two CTAs: `[Keep recording on]` (re-checks) and `[Continue without recording]` (closes modal, leaves unchecked).
  - On submit → calls a new `POST /api/v1/appointments/:id/recording-consent` endpoint that writes via `captureBookingConsent`.
  - Both components a11y-correct (label associated with input, modal traps focus, ESC closes).
- [ ] **`POST /api/v1/appointments/:id/recording-consent`** route in `backend/src/routes/appointments.ts` (or sibling). Request body: `{ decision: boolean, consentVersion: string }`. Verifies the appointment exists, calls `captureBookingConsent`, returns `204 No Content`. Auth: same convention as the existing booking-page endpoints (booking token, not auth.uid — patients aren't logged in).
- [ ] **Doctor-side banner:** `frontend/components/consultation/SessionStartBanner.tsx` (new). Reads consent via the consultation API (extend the existing endpoint that returns `consultation_sessions` data, OR add a new lightweight `GET /api/v1/consultations/:sessionId/recording-consent`). Renders **only** when `decision === false`:
  > **Patient declined recording.** This consult is not being recorded. Take detailed clinical notes.
  Wired into `frontend/components/consultation/VideoRoom.tsx` at the top of the component tree (above the video tracks). Plans 04 + 05 wire it into their respective consult panels later — same component, no fork.
- [ ] **`dm-copy.ts` extensions** (pure functions, snapshot-tested):
  - `buildRecordingConsentAskMessage(input: { practiceName?: string }): string` — the initial ask.
  - `buildRecordingConsentExplainer(input: { version: string; practiceName?: string }): string` — the soft re-pitch body. Embeds `RECORDING_CONSENT_BODY_V1` to keep one source of truth.
  - Snapshot tests in `backend/tests/unit/utils/dm-copy.snap.test.ts` (extend existing file).
- [ ] **Tests:**
  - `backend/tests/unit/services/recording-consent-service.test.ts` — happy path (capture true / false / second-decline-after-re-pitch), `getConsentForSession` joins correctly, missing appointment errors, double-capture overwrites with later timestamp.
  - `backend/tests/unit/utils/dm-copy-recording-consent.test.ts` — snapshot fixtures for both new builders.
  - `backend/tests/unit/workers/instagram-dm-handler-recording-consent.test.ts` — IG-bot step transitions through the new `recording_consent` state, including re-pitch and second decline.
- [ ] **Type-check + lint clean.** All migrations apply forward + reverse. No regression on existing booking-flow tests.

---

## Out of scope

- Pause / resume control (Plan 07 owns the doctor-side button + service-call wiring; this task only ships the audit table that Plan 07 writes to — see Task 28's note in the master plan).
- Replay player + mutual access notifications (Plan 07).
- The actual `consultation_recording_audit` table — that ships in this same Plan 02 but as part of Task 28 inside Plan 07's scope (the table exists in the master plan as a Plan-02 deliverable; gate that ship on a separate task to keep this PR small). **Update the plan-02 deliverable list if you decide to land the audit table here for atomicity** — that's a judgment call at PR time.
- Voice-modality + text-modality consent variants. The same `recording_consent_decision` column applies to all modalities; copy doesn't fork until Plans 04 / 05 ship modality-specific surface text.
- Account-deletion handling (Task 33).
- Retention-driven hide / delete logic (Task 34).
- Re-prompting patients with already-active future bookings when the consent body version bumps. See Plan 02 open question #1 — owner call, not in scope here.

---

## Files expected to touch

**Backend:**

- `backend/migrations/0NN_appointments_recording_consent.sql` — new (next free number after 050)
- `backend/src/services/recording-consent-service.ts` — new
- `backend/src/constants/recording-consent.ts` — new (consent text + version)
- `backend/src/types/conversation.ts` — extend `PatientCollectionStep` union with `'recording_consent'`
- `backend/src/workers/instagram-dm-webhook-handler.ts` — wire the new step transition (smallest possible diff; keep the rest of the handler untouched)
- `backend/src/utils/dm-copy.ts` — add `buildRecordingConsentAskMessage` + `buildRecordingConsentExplainer`
- `backend/src/routes/appointments.ts` (or wherever public booking-page endpoints live) — add `POST /:id/recording-consent`

**Frontend:**

- `frontend/components/booking/RecordingConsentCheckbox.tsx` — new
- `frontend/components/booking/RecordingConsentRePitchModal.tsx` — new
- `frontend/components/consultation/SessionStartBanner.tsx` — new
- `frontend/app/book/page.tsx` — mount the checkbox in the confirmation step
- `frontend/components/consultation/VideoRoom.tsx` — mount the banner

**Tests:**

- `backend/tests/unit/services/recording-consent-service.test.ts` — new
- `backend/tests/unit/utils/dm-copy-recording-consent.test.ts` — new
- `backend/tests/unit/workers/instagram-dm-handler-recording-consent.test.ts` — new

---

## Notes / open decisions

1. **Consent default in IG-bot:** the chat flow is reply-driven, not a checkbox. The bot must **explicitly ask** rather than assume opt-in. The public `/book` page can default-check the box because the patient sees and can uncheck it before submitting; in chat, silence is not consent.
2. **Soft re-pitch limit = 1.** Asking twice on a single decline is fine; asking three times crosses into dark-pattern territory. If the patient declines after the re-pitch, persist `decision = false`, set the banner, and let the consult proceed.
3. **Where to call `captureBookingConsent` from the IG flow:** at the `recording_consent → awaiting_date_time` transition, NOT at booking-confirmation finalization. Capturing at the transition means the row exists even if the patient drops off before payment — useful telemetry for "patients who consented but didn't book", helpful for the soft re-pitch effectiveness audit.
4. **Banner reads from `consultation_sessions.id`, not `appointment_id`** because the consultation surface is moving to be session-keyed (Plan 01 Task 15). The service join (`session.appointment_id → appointments.recording_consent_decision`) keeps the contract stable as `appointments.consultation_room_*` is dropped in Task 35.
5. **`recording_consent_version` carry-forward:** when the patient consents, store the **current** `RECORDING_CONSENT_VERSION` constant. If the constant later bumps to `v1.1`, that booking still shows as `v1.0` consent in audit — that's the legal-defensibility property we want. See Plan 02 open question #1 for re-prompt policy on version bumps.
6. **Audit table reference:** Plan 02 includes `consultation_recording_audit` and the `recording_audit_action` enum. This task does NOT write into it (no `patient_declined_pre_session` rows in v1) — that's deferred to Plan 07's pause/resume wiring. Acceptable because the column data (`appointments.recording_consent_decision = false`) is itself the audit record for the decline-at-booking case.
7. **API auth shape:** the public booking page is unauthenticated (booking-token in URL). Re-use that token mechanism for `POST /:id/recording-consent` — do NOT require login. This matches `POST /api/v1/appointments` which already takes booking tokens.

---

## References

- **Plan:** [plan-02-recording-governance-foundation.md](../Plans/plan-02-recording-governance-foundation.md) — Migration A + Task 27 service deliverables + Frontend deliverables sections.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 4 LOCKED entry.
- **Existing IG-bot conversation steps:** `backend/src/types/conversation.ts:113-132`
- **Existing IG-bot consent step (different concept — consent to schedule):** `backend/src/workers/instagram-dm-webhook-handler.ts` (search for `'consent'` step transitions)
- **Existing public booking page:** `frontend/app/book/page.tsx`
- **Existing video consult surface:** `frontend/components/consultation/VideoRoom.tsx`
- **Existing dm-copy snapshot suite:** `backend/tests/unit/utils/dm-copy.snap.test.ts`
- **Plan 01 Task 15 — consultation_sessions FK source:** [task-15-consultation-sessions-facade-and-schema.md](./task-15-consultation-sessions-facade-and-schema.md)

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started
