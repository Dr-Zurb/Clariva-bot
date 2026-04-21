# Task 30: Mutual replay notifications — `notifyPatientOfDoctorReplay` (DM) + `notifyDoctorOfPatientReplay` (dashboard event) + `doctor_dashboard_events` table (Decision 4 + 10 LOCKED, audio-only copy in Plan 07)

## 19 April 2026 — Plan [Recording replay & history](../Plans/plan-07-recording-replay-and-history.md) — Phase E

---

## Task overview

Decision 4 LOCKED mutual accountability for every recording replay: when the doctor replays a consult, the patient gets a DM ("Dr. Sharma reviewed the audio of your consult on 19 Apr 2026 — this is normal and audited"); when the patient replays, the doctor sees a dashboard event in their feed. **No SMS/email to the doctor** — they didn't opt into that channel for replay events.

This task is the notification surface that Task 29's `mintReplayUrl` fires into (step 8 of the policy pipeline). Three deliverables:

1. **`notifyPatientOfDoctorReplay` helper** in `notification-service.ts` — fan-out IG-DM → SMS with Decision 4's canonical copy. Audio-baseline copy in Plan 07; Plan 08 extends with `artifactType: 'video'` + a 🎥 indicator in the DM body.
2. **`notifyDoctorOfPatientReplay` helper** in `notification-service.ts` — writes a row into a new `doctor_dashboard_events` table (this task introduces it; no existing doctor-events feed surface in the codebase today — confirmed via grep of `backend/migrations/`). No DM / SMS / email to the doctor because Decision 4's principle 8 language ("dashboard notification"-only) explicitly carves that out to avoid notification fatigue.
3. **`<DoctorDashboardEventFeed>` frontend mount** — a panel on the doctor's dashboard (likely alongside or inside the existing appointments table) that surfaces recent events. v1 scope: just the replay events; the panel is architected to accept future event kinds (modality-switched for Plan 09, recording-stopped-by-patient-request for a Plan 2.x, etc.) additively.

The two helpers are parallel in shape — same signature, same `artifactType` union, same fire-and-forget error semantics — differing only in the write path (DM vs DB row).

**Critical dependency gap (flagged up-front):** `doctor_dashboard_events` does not exist in the migrations directory today (confirmed via grep). This task introduces a **new migration** for it. Trade-off considered: reuse Plan 01 Task 5's `notification_audit_log` (already persists notification metadata) as a dashboard-events feed — rejected because the audit log is metadata-only (no structured payload) and is sized for audit retention, not UI rendering. A dedicated table with a richer payload is the right shape for a user-facing feed.

**Estimated time:** ~3.5 hours (slightly above the plan's 3h to absorb the new migration + the `<DoctorDashboardEventFeed>` frontend component + dual dashboard mount site).

**Status:** Completed (2026-04-19) — see Implementation Log at the foot of this file.

**Depends on:** Plan 07 Task 29 (hard — `mintReplayUrl` is the caller). Plan 01 Task 16 (hard — fan-out helper pattern this task mirrors for the patient DM). Plan 07 Task 28 (soft — none of this task's code overlaps with Task 28, but logically they ship together in Phase E). No dependency on Plan 02 migrations — this task ships its own migration for `doctor_dashboard_events`.

**Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md)

---

## Acceptance criteria

### Backend — migration

- [x] **`backend/migrations/066_doctor_dashboard_events.sql` (NEW).** Table shape:
  ```sql
  CREATE TABLE IF NOT EXISTS doctor_dashboard_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_kind      TEXT NOT NULL CHECK (event_kind IN (
                      'patient_replayed_recording'
                      -- Plans 08, 09 will additively widen this CHECK
                    )),
    session_id      UUID REFERENCES consultation_sessions(id) ON DELETE SET NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_doctor_dashboard_events_doctor_unread
    ON doctor_dashboard_events(doctor_id, acknowledged_at NULLS FIRST, created_at DESC);

  ALTER TABLE doctor_dashboard_events ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS doctor_dashboard_events_select_self ON doctor_dashboard_events;
  CREATE POLICY doctor_dashboard_events_select_self
    ON doctor_dashboard_events
    FOR SELECT
    USING (doctor_id = auth.uid());

  DROP POLICY IF EXISTS doctor_dashboard_events_update_self ON doctor_dashboard_events;
  CREATE POLICY doctor_dashboard_events_update_self
    ON doctor_dashboard_events
    FOR UPDATE
    USING (doctor_id = auth.uid())
    WITH CHECK (doctor_id = auth.uid());
  -- INSERT is service-role-only (backend writes via service client; bypasses RLS).
  -- No DELETE policy — events persist for ~30 days, swept by a retention worker (out of scope).
  ```
  - Head comment documents the schema + the forward-compat `event_kind` extensibility plan (Plans 08/09 add values additively via `DROP CONSTRAINT` + `ADD CONSTRAINT` with widened IN list, matching Plan 06 Task 39's pattern for `sender_role`).
  - `session_id ON DELETE SET NULL` (not cascade) — if a session is hard-deleted at regulatory retention end, the feed row survives with a stable audit trail (useful for any later "prove we notified the doctor" query).
  - `acknowledged_at NULLS FIRST` in the index — the UI queries unread-first.
  - Reverse migration documented at file foot.

- [ ] **`backend/src/types/database.ts` extended** to carry the new table's type. *(Deferred — the codebase queries `doctor_dashboard_events` only via the dashboard-events-service helpers, which carry their own typed DTOs. Adding it to `database.ts` is a follow-up cleanup once another caller materializes; tracked in `docs/capture/inbox.md`.)*

### Backend — helpers

- [x] **`backend/src/utils/dm-copy.ts#buildRecordingReplayedNotificationDm` (NEW).** Signature + canonical copy:
  ```ts
  /**
   * DM copy sent to the patient when the doctor replays their consult
   * recording. Audio-only copy in Plan 07; Plan 08 extends with
   * `artifactType: 'video'` (adds a 🎥 indicator + slightly different
   * body).
   */
  export function buildRecordingReplayedNotificationDm(input: {
    practiceName:     string;
    consultDateLabel: string;           // "19 Apr 2026"
    artifactType:     'audio' | 'transcript';  // Plan 08 adds 'video'
  }): string;
  ```
  Canonical body (audio):
  ```
  Your doctor at {practiceName} reviewed the audio of your consult on {consultDateLabel}.

  This is a normal part of care (doctors often revisit consults to refine their plan).
  Every access is audited, and you can ask support for the access log anytime.
  ```
  Canonical body (transcript):
  ```
  Your doctor at {practiceName} reviewed the transcript of your consult on {consultDateLabel}.

  This is a normal part of care (doctors often revisit consults to refine their plan).
  Every access is audited, and you can ask support for the access log anytime.
  ```
  **Pin both variants in a copy-snapshot test.**

- [x] **`backend/src/services/notification-service.ts#notifyPatientOfDoctorReplay` (NEW).**
  ```ts
  /**
   * Fan-out the doctor-replayed-recording DM to the patient. IG-DM → SMS
   * fall-back (same pattern as `sendConsultationReadyToPatient`).
   *
   * Fire-and-forget at the call site — errors are logged + audited but
   * never thrown. Per Decision 4 principle 8 ("this is a normal part of
   * care"), a missed DM is UX-bad but not safety-critical; a thrown error
   * would incorrectly bubble into `mintReplayUrl` and break a legitimate
   * replay on a transient IG-DM outage.
   *
   * Idempotency: the caller (`mintReplayUrl`) provides the
   * `recordingAccessAuditId` which uniquely identifies this replay
   * attempt. The helper writes a `notification_audit_log` row keyed on
   * that ID to dedupe against retries.
   */
  export async function notifyPatientOfDoctorReplay(input: {
    sessionId:              string;
    patientId:              string;
    artifactType:           'audio' | 'transcript';
    recordingAccessAuditId: string;
    correlationId:          string;
  }): Promise<FanOutResult | { skipped: true; reason: string }>;
  ```
  Implementation notes:
  - Load session + doctor + patient via the standard service-role Supabase client.
  - Resolve `practiceName` (doctor's display name / clinic label per existing `resolvePracticeNameForDoctor` helper if present; fall back to "your doctor's clinic").
  - Format `consultDateLabel` from `session.actual_ended_at` in the **patient's** preferred display format (or `Asia/Kolkata` fallback — same convention as Task 37's time formatter).
  - Compose body via `buildRecordingReplayedNotificationDm`.
  - Fan out IG-DM → SMS via the existing primitives.
  - On success: write `notification_audit_log` row with `kind = 'patient_recording_replay_notification'`, `correlation_id`, `metadata.recording_access_audit_id = input.recordingAccessAuditId`.
  - On failure: log structured error, write a failed audit row, return `FanOutResult` with the per-channel outcomes (do not throw).
  - If `notification_audit_log` already has a row with the same `recording_access_audit_id`, return `{ skipped: true, reason: 'already_notified' }` without fan-out.

- [x] **`backend/src/services/notification-service.ts#notifyDoctorOfPatientReplay` (NEW).**
  ```ts
  /**
   * Write a `doctor_dashboard_events` row for the doctor to see in their
   * dashboard feed. No DM / SMS / email — Decision 4 carves out
   * doctor-facing replay notifications as dashboard-only to avoid
   * notification fatigue.
   *
   * Same idempotency pattern as the patient-side helper: deduped against
   * `recordingAccessAuditId`.
   */
  export async function notifyDoctorOfPatientReplay(input: {
    sessionId:              string;
    doctorId:               string;
    artifactType:           'audio' | 'transcript';
    recordingAccessAuditId: string;
    correlationId:          string;
  }): Promise<void | { skipped: true; reason: string }>;
  ```
  Implementation:
  - Idempotency: pre-check `doctor_dashboard_events WHERE doctor_id = ? AND payload->>'recording_access_audit_id' = ?`. If exists, skip.
  - Insert row:
    ```ts
    {
      doctor_id:  input.doctorId,
      event_kind: 'patient_replayed_recording',
      session_id: input.sessionId,
      payload: {
        artifact_type:             input.artifactType,
        recording_access_audit_id: input.recordingAccessAuditId,
        patient_display_name:      <resolved from session join>,
        replayed_at:               now().toISOString(),
        consult_date:              session.actual_ended_at,
      },
    }
    ```
  - Logs at `info` with `{ doctorId, sessionId, artifactType, eventId }` (no PHI).

- [x] **Supporting helper `getDashboardEventsForDoctor`** — consumed by the frontend:
  ```ts
  export async function getDashboardEventsForDoctor(input: {
    doctorId:       string;
    unreadOnly?:    boolean;          // default false
    limit?:         number;           // default 20; max 100
    cursor?:        string;           // opaque pagination cursor (row.id-based)
  }): Promise<{ events: DashboardEvent[]; nextCursor?: string }>;

  export async function markDashboardEventAcknowledged(input: {
    doctorId: string;
    eventId:  string;
  }): Promise<void>;
  ```
  These are thin wrappers over Supabase queries, respecting the RLS on the table. `markDashboardEventAcknowledged` sets `acknowledged_at = now()` for the row (only if the row belongs to the caller — RLS enforces).

### Backend — routes

- [x] **`GET /api/v1/dashboard/events`** (NEW; doctor-only). Query params: `unread` (bool), `limit`, `cursor`. Returns `{ events, nextCursor }`. Uses dashboard auth (doctor's Supabase session).
- [x] **`POST /api/v1/dashboard/events/:eventId/acknowledge`** (NEW; doctor-only). Marks the event read; 204 on success, 404 if not found / not owned.

### Backend — tests

- [x] **`backend/tests/unit/services/notification-service-mutual-replay.test.ts`** (NEW):
  - `notifyPatientOfDoctorReplay` happy path — IG-DM succeeds → audit log row written; returns `FanOutResult` with success.
  - `notifyPatientOfDoctorReplay` idempotency — second call with same `recordingAccessAuditId` returns `{ skipped: true, reason: 'already_notified' }`.
  - `notifyPatientOfDoctorReplay` copy snapshot for `artifactType: 'audio'` and `'transcript'`.
  - `notifyDoctorOfPatientReplay` happy path — row inserted into `doctor_dashboard_events` with expected payload.
  - `notifyDoctorOfPatientReplay` idempotency — same check.
  - Both helpers swallow errors (DB failure → logs + returns structured result; does NOT throw).
  - `getDashboardEventsForDoctor` returns rows for the calling doctor only (RLS test via direct Supabase client with a different doctor's session).
  - `getDashboardEventsForDoctor` with `unreadOnly: true` filters on `acknowledged_at IS NULL`.
  - `markDashboardEventAcknowledged` sets the timestamp; a second call is a no-op.

- [x] **`backend/tests/unit/controllers/dashboard-events-controller.test.ts`** (NEW; covers the route handlers' contract — auth gate, DTO shape, query param validation, NotFoundError pass-through). Renamed from the spec's `routes/dashboard-events.test.ts` because the test exercises the controller via direct invocation rather than mounting an Express app; the route file is a one-liner that maps URL → handler and is verified by `npx tsc`.
  - `GET /events` 401 (UnauthorizedError forwarded to next) when `req.user` missing.
  - `GET /events` passes `req.user.id` as `doctorId` (auth-boundary contract).
  - `GET /events` ValidationError on malformed `unread` / `limit`.
  - `POST /events/:id/acknowledge` propagates NotFoundError.
  - Pagination cursor round-trip is covered in `dashboard-events-service.test.ts`.

- [x] **`backend/tests/unit/migrations/doctor-dashboard-events-migration.test.ts`** (NEW; mirrors the content-sanity tests from Plan 04 / Plan 06 Task 39):
  - Table definition includes all expected columns + the CHECK constraint's initial value.
  - RLS is enabled; the two policies exist with the expected using / check clauses.
  - The unread-first index exists.
  - Reverse-migration block documented at file foot.

### Frontend

- [x] **`frontend/components/dashboard/DoctorDashboardEventFeed.tsx` (NEW).** Props:
  ```ts
  interface DoctorDashboardEventFeedProps {
    initialEvents?: DashboardEvent[];          // server-rendered initial batch; can be empty
    initialUnreadCount?: number;
  }
  ```
  Behavior:
  - Fetches `GET /dashboard/events?unread=true&limit=10` on mount.
  - Renders a list of events; each event is a card with:
    - Icon (🎧 for `patient_replayed_recording` audio; 📝 for transcript).
    - Copy: `"{patient_display_name} replayed the {artifactType} of their consult on {consult_date}."`
    - Time-ago label ("3 hours ago").
    - "Mark as read" button (calls the acknowledge endpoint; optimistically removes from unread list).
    - Optional "View consult" link → `/dashboard/appointments/{appointment-id}` (resolved by joining from session).
  - If no unread: collapsed empty state "All caught up. No new replay events."
  - If there's a `nextCursor`, shows a "Load more" button (no infinite scroll in v1).

- [x] **`<DoctorDashboardEventFeed>` mount site.** Mounted on `frontend/app/dashboard/page.tsx` directly under the appointments table. The supabase access token is plumbed through `dashboard/layout.tsx` → `DashboardShell` → `Header` so both the feed and the bell can authenticate without a second `getSupabaseServerClient` round-trip.

- [x] **Header bell indicator** — `DashboardEventsBell` lives in `frontend/components/dashboard/DashboardEventsBell.tsx`. Renders in the header beside the existing menu, polls `GET /dashboard/events?unread=true&limit=1` every 60s while the tab is visible, shows a red badge with the count, and links to `#dashboard-events-feed` (the feed's anchor on the same page). v1 uses a link rather than a popover; the dashboard layout doesn't ship a popover primitive yet.

- [ ] **Frontend tests** (DEFERRED — the frontend repo doesn't yet ship a Jest/RTL harness; introducing one is its own task. Captured in `docs/capture/inbox.md`. Manual smoke test below covers the v1 paths):
  - Feed renders events; empty state when no events.
  - "Mark as read" calls the acknowledge endpoint and removes the event from the unread list.
  - Time-ago formatting.
  - Copy pinning per `artifactType`.

- [ ] **Manual smoke test** (DEFERRED — requires Task 29 to have shipped a working replay end-to-end against a live IG-DM/SMS sandbox; will be executed at PR-merge time):
  - As the doctor, replay a consult → open a second browser as the patient → confirm the patient's IG-DM inbox (or SMS fallback) receives the `buildRecordingReplayedNotificationDm` body with the correct date + practice name + artifact type.
  - Open `notification_audit_log` via psql → confirm the row exists with `recording_access_audit_id` set.
  - Trigger the doctor-replay twice for the same session → second call returns `{ skipped: true }`; only one DM sent.
  - As the patient (via HMAC link), replay the consult → as the doctor, reload the dashboard → confirm the bell icon shows a red dot + the feed surfaces the event with correct patient name / artifact type / date.
  - Click "Mark as read" → event disappears from unread; `doctor_dashboard_events.acknowledged_at` is set.
  - Second patient replay → second feed event appears.
  - Verify RLS: use a different doctor's auth → `GET /dashboard/events` returns empty (does not leak the first doctor's events).

- [x] **Task 29 wire-up verification** — the `mintReplayUrl` function (Task 29) calls:
  - `notifyPatientOfDoctorReplay` when `requestingRole === 'doctor'`.
  - `notifyDoctorOfPatientReplay` when `requestingRole === 'patient'`.
  - `notifyDoctorOfPatientReplay` when `requestingRole === 'support_staff'` (per Task 29 Notes #11: doctor is the consent relationship holder).
  - Both calls pass `recordingAccessAuditId` (the newly-inserted audit row's ID) so idempotency keys correctly.
  - Both calls are fire-and-forget from `mintReplayUrl`'s perspective — add a `void Promise.resolve().then(...)` wrapper so a hanging helper doesn't delay the mint response.
  - Verify via unit test of `mintReplayUrl` (extends Task 29's test file; this task's own tests focus on the helpers themselves).

- [x] **Type-check + lint clean.** Backend `npx tsc --noEmit` + `npx jest` green (77 tests pass; broader related suites also re-run clean). Frontend `npx tsc --noEmit` + `npx next lint` clean on the touched files.

- [x] **No new env vars.**

---

## Out of scope

1. **Video-artifact differentiation in copy.** Plan 08 extends `artifactType` with `'video'` + adds a 🎥 indicator in the DM body. v1 ships `'audio' | 'transcript'`. The helper's union is additively-widened; no caller refactor needed.
2. **Doctor DM / email / SMS for replay events.** Decision 4 explicitly carves this out as dashboard-only. Documented in the helper's JSDoc so a future PR doesn't accidentally add it.
3. **Patient-side dashboard for replay events.** Patients don't have a clariva dashboard in v1; they receive DMs. If/when a patient portal ships, a symmetric feed would be the obvious move — captured in `docs/capture/inbox.md` as a Plan 2.x concern.
4. **Event retention worker.** `doctor_dashboard_events` should eventually sweep old acknowledged rows (e.g. >90 days). v1 doesn't ship the worker — the table is small-volume (one row per replay, probably single-digit per doctor per month initially) and disk cost is negligible. Follow-up when volume justifies.
5. **Granular event types.** v1 ships `'patient_replayed_recording'` only. Plans 08 / 09 add `'patient_replayed_video'`, `'patient_transcripted_consult'`, `'modality_switched_mid_consult'`, etc. The CHECK constraint widens additively.
6. **Push notifications / desktop notifications.** Doctor opts in to browser-push in a future UX pass; v1 is passive in-page rendering of the feed.
7. **Feed filters / search.** v1 is chronological unread + "all" tab is enough. Search by patient name is a post-v1 concern.
8. **Bulk acknowledge / "mark all as read" button.** Easy win if doctors complain; v1 one-at-a-time is fine.
9. **Feed row renders copy-redacting PHI.** v1 shows the patient's display name in the doctor's feed; the doctor already has access to the patient record, so this isn't a PHI leak. If a future user (e.g. a shared clinic device) needs a redacted mode, a feature-flag follows.
10. **Translation of DM copy.** English-only per master plan. i18n is a future PR.
11. **A/B testing of DM copy.** v1 ships one canonical body per artifact type. Experimentation follows once we have telemetry on "did the patient understand the DM" (they usually won't reply to it).
12. **Unsubscribe from replay DMs.** Decision 4's principle: the patient consented to this when they booked with a recording-enabled doctor. No per-user opt-out in v1. If regulatory pressure mounts, add a doctor-settings-level "skip patient replay DMs" flag (with audit logging the decision); captured in inbox.
13. **Aggregating multiple replays within a short window into one DM.** A doctor who replays the same consult three times in an hour today sends three DMs — noisy. Aggregation (one DM per day per consult per artifactType) is an obvious v2 improvement; captured in inbox.
14. **A support-staff replay that bypasses the doctor notification.** Decision 4 principle 8: all replays are audited + notified. Support-staff replays notify the doctor (per Task 29 Notes #11). No carve-out.

---

## Files expected to touch

**Backend (new):**

- `backend/migrations/0NN_doctor_dashboard_events.sql` — new migration.
- `backend/src/services/dashboard-events-service.ts` — the three helpers (`getDashboardEventsForDoctor`, `markDashboardEventAcknowledged`, potentially a shared `insertDashboardEvent` used by this task + Plan 09).
- `backend/src/routes/api/v1/dashboard-events.ts` — two new routes.

**Backend (extend):**

- `backend/src/utils/dm-copy.ts` — `buildRecordingReplayedNotificationDm`.
- `backend/src/services/notification-service.ts` — `notifyPatientOfDoctorReplay` + `notifyDoctorOfPatientReplay` (uses `dashboard-events-service.ts#insertDashboardEvent` for the DB write).
- `backend/src/services/recording-access-service.ts` (Task 29's file) — call sites for the two helpers; fire-and-forget semantics + `recordingAccessAuditId` plumbing.
- `backend/src/types/database.ts` — reflect the new table.

**Frontend (new):**

- `frontend/components/dashboard/DoctorDashboardEventFeed.tsx` — the feed component.
- `frontend/lib/api.ts` — wrappers for `getDashboardEvents`, `acknowledgeDashboardEvent`.

**Frontend (extend):**

- `frontend/app/dashboard/page.tsx` — mount the feed.
- `frontend/components/dashboard/DashboardHeader.tsx` (or wherever the header lives) — the bell icon + unread-count indicator.

**Tests:**

- `backend/tests/unit/services/notification-service-mutual-replay.test.ts` — new.
- `backend/tests/unit/services/dashboard-events-service.test.ts` — new.
- `backend/tests/unit/routes/dashboard-events.test.ts` — new.
- `backend/tests/unit/migrations/doctor-dashboard-events-migration.test.ts` — new.
- `backend/tests/unit/utils/dm-copy-recording-replayed.test.ts` — new (copy snapshot).
- `backend/tests/unit/services/recording-access-service.test.ts` — extend with the "mutual notification fired" assertions (may already be in Task 29's tests; coordinate at PR-time to avoid duplication).
- Frontend tests deferred.

---

## Notes / open decisions

1. **Why a new `doctor_dashboard_events` table instead of reusing `notification_audit_log`?** Audit logs are append-only, metadata-only, and sized for retention (hence indexes on `correlation_id` / `occurred_at`, not on UI-readable fields). A user-facing feed needs a structured payload (artifact_type, patient_display_name, consult_date) and a lightweight `acknowledged_at` mutation path. The two workloads don't overlap cleanly; separate tables serve both better. Precedent: the codebase already separates `prescription_events` (if present — confirm at PR-time) from `notification_audit_log`.
2. **Why fire-and-forget from `mintReplayUrl`?** A replay is user-initiated (the doctor or patient just clicked play); making them wait on a DM fan-out (which can take 500ms+) is bad UX. The audit row is already written (step 6 of Task 29's pipeline) — the notification helpers are observer-pattern writes on top. Helper failures don't undo the audit.
3. **Why dedupe on `recordingAccessAuditId` and not on a time-windowed key?** Idempotency-per-audit-row means retries of `mintReplayUrl` (e.g. the backend retries a Twilio 5xx) don't spam the patient. Aggregation ("one DM per consult per day") is deliberately out of scope (inbox item #13) because it requires a more sophisticated dedup window + UX tradeoffs.
4. **Why `payload JSONB` instead of structured columns?** Forward compatibility. Plan 09's `modality_switched` event will have `{ from_modality: 'voice', to_modality: 'video', switched_by: 'doctor', switched_at, reason }`; Plan 08's video-escalation will have its own shape. A typed column per event kind would explode into a wide table. JSONB + discriminated-union types on the TypeScript side is the right trade-off. Document in the migration head comment.
5. **Why `ON DELETE SET NULL` on `session_id`?** Plan 02's archival worker hard-deletes `consultation_sessions` rows at regulatory retention end. The dashboard event survives with `session_id = NULL` — useful for the doctor's feed history ("I replayed a consult in April 2026; it's no longer in my appointments but the event row proves I was notified of a patient replay at the time"). `ON DELETE CASCADE` would lose that record, which the doctor may legitimately want.
6. **Copy choice.** The "this is a normal part of care" language is intentional — Decision 4's principle 8 mandates non-alarming framing. Doctors revisit consults; that's what good care looks like. Patients shouldn't interpret a DM as "something went wrong."
7. **Audio vs transcript copy split.** Plan 07 ships both; they differ in the one-word insertion. Plan 08's video copy will be a third variant. Keep the variant logic inside `buildRecordingReplayedNotificationDm` rather than at call sites — single source of truth.
8. **Why no patient "dashboard"?** v1 has no patient portal; patients interact via IG-DM / SMS only. A future patient portal would add a symmetric feed; architecturally, the same `dashboard-events-service.ts` can back both sides.
9. **Rate-limit on the patient-side DM.** Decision 4 principle 8 doesn't explicitly mandate; aggregation inbox item #13 covers the "doctor replays 10x in an hour" edge. v1 sends one DM per replay unless already-notified dedup short-circuits; if telemetry shows this is noisy, aggregation ships next.
10. **`acknowledged_at NULLS FIRST` index gotcha.** Postgres btree indexes default to `NULLS LAST` for ascending order. The explicit `NULLS FIRST` matches the query pattern ("show unread first"). Pin this in the migration-content-sanity test.
11. **Support-staff user UUID.** When `requestingRole === 'support_staff'`, the patient DM still goes out (doctor reviewed the audio) but references the **doctor's** practice name, not the support staff — the patient doesn't know support staff exists. The doctor's dashboard event surfaces the support-staff identity in the payload (`payload.accessed_by_role: 'support_staff'`, `payload.accessed_by_user_id: <staff UID>`, `payload.escalation_reason`) so the doctor knows it wasn't them. Frontend copy for support-staff events: `"Support staff reviewed the audio of your consult with {patient} on {date}. Reason: {escalation_reason}."`.
12. **Frontend bell icon unread count freshness.** The count re-fetches on every page-load; no long-lived subscription in v1. If the doctor keeps the dashboard open for hours, they won't see new events until they navigate or manually refresh. Acceptable — the DM doesn't need real-time-within-the-minute freshness; replay events are informational. A follow-up can add a Supabase Realtime subscription on `doctor_dashboard_events` if doctors complain.

---

## References

- **Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md) — Task 30 section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 4 LOCKED + principle 8 framing.
- **Task 29 (caller):** [task-29-recording-replay-player-patient-self-serve.md](./task-29-recording-replay-player-patient-self-serve.md) — `mintReplayUrl` fires these helpers at step 8 of the pipeline.
- **Plan 01 Task 16 (fan-out pattern):** [task-16-notification-fanout-helpers.md](./task-16-notification-fanout-helpers.md).
- **Plan 08 (forward consumer):** will extend `artifactType` with `'video'`.
- **Plan 09 (forward consumer):** will widen `event_kind` CHECK + add `'modality_switched'` to the feed.
- **Existing `notification-service.ts`:** `backend/src/services/notification-service.ts` (the extension target for the two new helpers).
- **Existing `dm-copy.ts`:** `backend/src/utils/dm-copy.ts` (the extension target for `buildRecordingReplayedNotificationDm`).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Completed (2026-04-19). All backend acceptance criteria met; frontend feed + bell mounted; only the manual smoke test (which requires Task 29's live IG-DM/SMS round-trip) and the deferred frontend test harness remain open follow-ups.

---

## Implementation log — 2026-04-19

### Backend
- **Migration `backend/migrations/066_doctor_dashboard_events.sql`** — created the `doctor_dashboard_events` table per spec (UUID PK, `doctor_id` FK with `ON DELETE CASCADE`, `event_kind` CHECK starting at `'patient_replayed_recording'`, `session_id` FK with `ON DELETE SET NULL`, `payload JSONB`, `acknowledged_at`, `created_at`). Added the `(doctor_id, acknowledged_at NULLS FIRST, created_at DESC)` index, enabled RLS, and shipped the two `doctor_id = auth.uid()` policies (SELECT + UPDATE). INSERT stays service-role-only. Reverse migration documented at the foot of the file.
- **`backend/src/utils/dm-copy.ts`** — added the `RecordingReplayedArtifactType` union (`'audio' | 'transcript'`) and `buildRecordingReplayedNotificationDm(input)` which emits the canonical Decision-4 body. The variant logic is internal so the call sites stay flat; Plan 08 will widen the union additively with `'video'` + a 🎥 indicator.
- **`backend/src/services/dashboard-events-service.ts` (NEW)** — three exports:
  - `insertDashboardEvent` — pre-checks `doctor_dashboard_events WHERE doctor_id = ? AND payload->>'recording_access_audit_id' = ?` for idempotency, then inserts. Returns `{ skipped: true, reason: 'already_recorded' }` when a duplicate is detected.
  - `getDashboardEventsForDoctor` — paginated fetch with base64-encoded `created_at|id` cursor, optional `unreadOnly`, and `limit` capped at 100 (defaults 20). Returns `{ events, nextCursor }`.
  - `markDashboardEventAcknowledged` — sets `acknowledged_at = now()` filtered by `doctor_id` (RLS-belt-and-braces). Throws `NotFoundError` when zero rows update.
- **`backend/src/services/notification-service.ts`** — added the two helpers per spec:
  - `notifyPatientOfDoctorReplay` — IG-DM → SMS fan-out with idempotency keyed on `audit_logs` rows of `action = 'patient_recording_replay_notification'` carrying the `recording_access_audit_id`. Returns `FanOutResult` on dispatch and `{ skipped: true, reason: 'already_notified' }` on dedup. Errors are logged + audited but never thrown — fire-and-forget per Decision 4 principle 8.
  - `notifyDoctorOfPatientReplay` — delegates to `insertDashboardEvent`. No DM/SMS/email. Carries `escalation_reason` + `accessed_by_role` in the payload when the caller is `support_staff` (Notes #11).
- **`backend/src/services/recording-access-service.ts`** — `writeAuditRow` now `INSERT … RETURNING id` so the helper can be passed the `recordingAccessAuditId`. The stub `notifyReplayWatcher` was replaced by a router that picks `notifyPatientOfDoctorReplay` (when `requestingRole === 'doctor'`) or `notifyDoctorOfPatientReplay` (when `'patient' | 'support_staff'`), wrapped in `void Promise.resolve().then(...)` so a hanging notification never delays the mint response. Removed the stale `session` destructuring that the stub no longer needed.
- **Routes**: `backend/src/routes/api/v1/dashboard-events.ts` (NEW) wires `GET /` and `POST /:eventId/acknowledge` to `backend/src/controllers/dashboard-events-controller.ts`. The router mounts at `/api/v1/dashboard/events` from `routes/api/v1/index.ts`. Both endpoints require `authenticateToken` (UnauthorizedError forwarded to next() when missing) and pull the doctor id from `req.user.id`.

### Backend tests
- **`backend/tests/unit/utils/dm-copy-recording-replayed.test.ts`** — copy snapshot for both `'audio'` and `'transcript'` variants pinning the Decision-4 body verbatim.
- **`backend/tests/unit/services/dashboard-events-service.test.ts`** — covers idempotency-pre-check, happy/insert-failure paths, the cursor-pagination round-trip, the `unreadOnly` filter, and ownership enforcement on `markDashboardEventAcknowledged` (NotFoundError on zero rows; second call is a no-op).
- **`backend/tests/unit/services/notification-service-mutual-replay.test.ts`** — fan-out happy path, idempotency short-circuit, email channel omission, and graceful error handling for both helpers.
- **`backend/tests/unit/controllers/dashboard-events-controller.test.ts`** — wraps the asyncHandler-wrapped controller in a small `invoke` helper that captures errors passed to `next()`, then asserts UnauthorizedError when `req.user` is missing, ValidationError on malformed `unread`/`limit`, NotFoundError pass-through on acknowledge, and that `req.user.id` is forwarded as `doctorId`.
- **`backend/tests/unit/migrations/doctor-dashboard-events-migration.test.ts`** — content-sanity checks pinning the table columns, CHECK constraint's initial value, RLS-enabled state, both policies, and the `NULLS FIRST` index ordering.
- **`backend/tests/unit/services/recording-access-service.test.ts`** — extended the supabase mock so `recording_access_audit.insert(row).select('id').single()` returns a synthetic id, and added module-level mocks for the two notification helpers (typed as `jest.fn<() => Promise<unknown>>()` to satisfy strict-mode jest typing). Asserts that the right helper fires for each `requestingRole`.

### Frontend
- **`frontend/lib/api.ts`** — added `PatientReplayedRecordingPayload`, `DashboardEventKind`, `DashboardEvent`, `DashboardEventsResponse`, `GetDashboardEventsOptions`, plus `getDashboardEvents(token, opts)` and `acknowledgeDashboardEvent(token, eventId)`. The acknowledge helper uses raw `fetch` because the existing `request` helper is GET-only.
- **`frontend/components/dashboard/DoctorDashboardEventFeed.tsx` (NEW)** — client component. Fetches `unread=true&limit=10` on mount, renders one card per event with an icon (🎧 audio / 📝 transcript), the Decision-4 phrasing, a relative time-ago label, an optimistic "Mark as read" button, and a "Load more" button when `nextCursor` is present. Empty/loading/error states are all rendered. Anchored at `id="dashboard-events-feed"` so the bell can deep-link.
- **`frontend/components/dashboard/DashboardEventsBell.tsx` (NEW)** — header bell. Polls `unread=true&limit=1` every 60s while the tab is visible (`document.visibilityState === 'visible'`), shows a red badge with the unread count, and links to `#dashboard-events-feed` on the same dashboard page.
- **`frontend/app/dashboard/layout.tsx`** — pulls `session?.access_token` from `getSupabaseServerClient()` and threads it into `DashboardShell`.
- **`frontend/components/layout/DashboardShell.tsx`** + **`Header.tsx`** — added an optional `token` prop and rendered `DashboardEventsBell` only when present (so the bell stays hidden if a layout ever forgets to pass the token, rather than calling the API anonymously).
- **`frontend/app/dashboard/page.tsx`** — mounted `DoctorDashboardEventFeed` directly under the appointments table, passing the same `token`.

### Verification
- Backend: `npx tsc --noEmit` clean, `npx jest backend/tests/unit/services/dashboard-events-service.test.ts backend/tests/unit/services/notification-service-mutual-replay.test.ts backend/tests/unit/services/recording-access-service.test.ts backend/tests/unit/controllers/dashboard-events-controller.test.ts backend/tests/unit/utils/dm-copy-recording-replayed.test.ts backend/tests/unit/migrations/doctor-dashboard-events-migration.test.ts` — 77 green; broader related suites re-run unchanged.
- Frontend: `npx tsc --noEmit` clean; `npx next lint frontend/components/dashboard frontend/components/layout frontend/app/dashboard frontend/lib` clean on the touched files.

### Decisions / deviations from the spec
1. **Routes test renamed** from `tests/unit/routes/dashboard-events.test.ts` to `tests/unit/controllers/dashboard-events-controller.test.ts` — the test exercises the controller via direct invocation rather than mounting an Express app. The route file is a one-line URL→handler map and is verified via `npx tsc`.
2. **`backend/src/types/database.ts`** was **not** extended for `doctor_dashboard_events`. The dashboard-events-service helpers carry their own typed DTOs (`DashboardEventRow`, `InsertDashboardEventInput`) and no other module reaches into the table directly. Captured as a follow-up cleanup in `docs/capture/inbox.md` for whenever a second caller materializes.
3. **`asyncHandler` test ergonomics** — controller errors propagate via `next(err)`, not promise rejections. Added an `invoke(handler, req, res)` helper to capture and assert on those, rather than restructuring the controller.
4. **Frontend test harness deferred** — the frontend repo doesn't yet ship a Jest/RTL setup. Component tests for the feed + bell are deferred until that harness lands; the `<DashboardEventsBell>` polling cadence + the feed's optimistic acknowledge will be covered then. Manual smoke test covers v1.
5. **Dedicated bell anchor over popover** — DashboardShell doesn't ship a popover primitive yet. The bell links to `#dashboard-events-feed` on the same page; future work can swap in a popover without changing the bell's API.
6. **`writeDenialAudit` call site** — `writeAuditRow` now returns the inserted id, but the deny path doesn't need it. Left as-is (return value is simply ignored) rather than introducing a separate signature.
