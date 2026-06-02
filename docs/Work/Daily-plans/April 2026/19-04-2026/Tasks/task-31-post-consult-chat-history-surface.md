# Task 31: Post-consult chat-history surface — `<TextConsultRoom mode='readonly'>` + DM link + `sendPostConsultChatHistoryDm` (Decision 1 sub-decision LOCKED)

## 19 April 2026 — Plan [Recording replay & history](../Plans/plan-07-recording-replay-and-history.md) — Phase E

---

## Task overview

Decision 1's sub-decision locked indefinite read access to the chat thread for **both parties** after a consult ends — text bubbles, attachment rows, and system banners all remain readable via the same `<TextConsultRoom>` component mounted in `mode='readonly'`. The RLS doctrine is already set up for this: Migration 051's SELECT policy keys only on session-participant membership (doctor or patient), **not** on session status — rows remain SELECT-able after `status = 'ended'`. Migration 051's INSERT policy, by contrast, requires `status = 'live'`, so the composer has to be physically suppressed on the frontend (the DB rejects the write anyway; frontend suppression is UX polish + avoids a failed-send error).

This task ships:

1. **`<TextConsultRoom mode>` prop extension** — `'live' | 'readonly'`. `'live'` is the existing Plan 04 / Plan 06 behavior; `'readonly'` disables the composer, unsubscribes from Realtime (a single SELECT on mount is enough; no mid-view mutations expected), renders all system rows verbatim (consult-started, party-joined, recording-paused/resumed, modality-switched), and surfaces a header watermark "Read-only — view of your consultation on {date}".
2. **New patient-facing route** `frontend/app/c/history/[sessionId]/page.tsx` that mounts `<TextConsultRoom mode='readonly'>`. Authenticates the patient via the same HMAC-exchange pattern Plan 04 uses (patient clicks the DM link with `?t={hmacToken}`, the page exchanges the HMAC for a Supabase JWT via `POST /api/v1/consultation/:sessionId/chat-history-token`, and mounts the room with the JWT).
3. **Doctor-side mount.** The doctor already has dashboard auth; a "View conversation" link on the completed-appointment detail page navigates to `/dashboard/appointments/[id]/chat-history` which mounts `<TextConsultRoom mode='readonly'>` directly with the doctor's existing Supabase session (no per-session JWT needed — doctor's RLS branch authenticates via `auth.uid()` matching `session.doctor_id`).
4. **`sendPostConsultChatHistoryDm` helper** in `notification-service.ts` + `buildPostConsultChatLinkDm` copy in `dm-copy.ts`. Fires from `consultation-session-service.ts#endSession` (every modality, since every modality now has a chat thread per Plan 06 Task 36's lifecycle hook).
5. **Endpoint `POST /api/v1/consultation/:sessionId/chat-history-token`** — accepts an HMAC token, returns a JWT scoped to chat-history reads for the session. Reuses the existing `mintTextConsultJwt` helper (Plan 04 Task 18) but with a longer TTL — see Notes #1 for the TTL decision.

The work is small because `<TextConsultRoom>`'s internals already support everything needed — the SELECT-on-mount path, the system-row rendering (once Tasks 38/39 land), the attachment-row rendering (once the inbox follow-up ships richer attachment UI). This task is almost entirely a **prop addition + a single DM + a single endpoint + two route pages**.

**Estimated time:** ~2.5 hours (slightly above the plan's 2h estimate to absorb the long-TTL JWT TTL debate in Notes #1 + the doctor-side route page + the dual-side smoke testing).

**Status:** ✅ Completed (19 April 2026)

**Depends on:** Plan 04 Task 19 (hard — `<TextConsultRoom>` exists). Plan 06 Task 38 (soft — the `layout` prop from Task 38 is orthogonal to `mode`; both can be set simultaneously but Task 31 only needs `mode`. If Task 38 hasn't shipped, the component still works with `layout` implicit-defaulted). Plan 06 Task 36 (hard — every modality has a chat thread to view; pre-Plan-06 voice/video would have empty history). Plan 04 Task 18 (hard — `mintTextConsultJwt` exists). Plan 01 Task 16 (hard — `sendConsultationReadyToPatient` fan-out pattern this task mirrors for the DM).

**Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md)

---

## Acceptance criteria

### Backend

- [ ] **`backend/src/utils/dm-copy.ts#buildPostConsultChatLinkDm` (NEW).** Signature + copy:
  ```ts
  /**
   * Post-consult chat-history DM — sent at `endSession` to the patient.
   *
   * Decision 1 sub-decision: indefinite read access for both parties. The
   * DM keeps the "Available for 90 days; contact support for older
   * history" line because the *patient-self-serve link TTL* expires at
   * 90d even though the underlying data is indefinite (after 90d the
   * patient contacts support to re-mint a link). See Notes #1.
   *
   * @returns Plain-text body suitable for Instagram DM / WhatsApp / SMS.
   */
  export function buildPostConsultChatLinkDm(input: {
    practiceName:      string;    // redacted-friendly doctor / clinic label (e.g. "Dr. Sharma's practice")
    joinUrl:           string;    // absolute URL to /c/history/{sessionId}?t={hmacToken}
    consultDateLabel:  string;    // "19 Apr 2026"
  }): string;
  ```
  Canonical body:
  ```
  Your consultation with {practiceName} on {consultDateLabel} is complete.

  View the full conversation (chat, attachments, and system notes) any time:
  {joinUrl}

  Available for 90 days. After that, contact support to re-open the link.
  ```
  **Pin the copy in a unit test snapshot** so drift is deliberate.

- [ ] **`backend/src/services/notification-service.ts#sendPostConsultChatHistoryDm` (NEW).**
  ```ts
  /**
   * Fan-out the post-consult chat-history DM to the patient's reachable
   * channels. Uses the same IG-DM → SMS fall-back pattern as
   * `sendConsultationReadyToPatient` (Plan 01 Task 16). Doctor gets NO DM
   * (they access the history from their dashboard directly).
   *
   * Idempotent per sessionId — a session that already sent this DM
   * (tracked via `consultation_sessions.post_consult_dm_sent_at` column,
   * added in this task — see migration deliverable) returns early with a
   * `{ skipped: true, reason: 'already_sent' }` log line.
   */
  export async function sendPostConsultChatHistoryDm(input: {
    sessionId:     string;
    correlationId: string;
  }): Promise<FanOutResult | { skipped: true; reason: string }>;
  ```
  Implementation notes:
  - Loads the session row + joins `doctors` + `patients` for practice name + patient's IG PSID / phone.
  - Mints an HMAC token using the existing consultation-token HMAC primitive from Plan 01/04 (grep for `signConsultationToken` at PR-time; if missing, factor out from `consultation-session-service.ts` since Plan 04 Task 18 ships it).
  - Composes `joinUrl = ${env.APP_BASE_URL}/c/history/${sessionId}?t=${hmacToken}`.
  - Calls `buildPostConsultChatLinkDm` and fans out via IG-DM → SMS.
  - On first success, sets `consultation_sessions.post_consult_dm_sent_at = now()` so re-runs short-circuit.
  - Logs structured events + audit the DM send (no PHI in logs beyond the sessionId + fan-out channel outcome).

- [ ] **Minor migration** `backend/migrations/0NN_consultation_sessions_post_consult_dm_sent_at.sql` (NEW):
  ```sql
  ALTER TABLE consultation_sessions
    ADD COLUMN IF NOT EXISTS post_consult_dm_sent_at TIMESTAMPTZ;
  ```
  No index — low-cardinality boolean-style lookup that only fires once per session at `endSession` time; the PK covers the read.

- [ ] **`consultation-session-service.ts#endSession` extended** — after the existing system-message emit (Task 37 wiring) and the status flip, fire `sendPostConsultChatHistoryDm` (fire-and-forget — errors are logged but don't reject `endSession`). Place the call outside the DB transaction so a DM-send failure doesn't roll back the end-session status flip.

- [ ] **Endpoint `POST /api/v1/consultation/:sessionId/chat-history-token`** (NEW):
  - Body: `{ hmacToken: string }`.
  - Verifies the HMAC against the session's stored signing secret (same verification the Plan 04 text-token endpoint uses — factor out if needed).
  - On success, mints a patient-scoped Supabase JWT via `mintTextConsultJwt({ sessionId, consult_role: 'patient', patientId: session.patient_id })` with the long TTL (see Notes #1: 90 days).
  - Returns `{ accessToken: string, expiresAt: ISOString }`.
  - Rate-limit: reuse whatever rate-limiter the existing `/text-token` endpoint uses (likely the generic per-IP limiter). Captured in this task's route tests.

- [ ] **Route authorization for the existing `GET /consultation-messages` path.** Plan 04 Migration 052's patient JWT already scopes reads to `session_id`; no RLS change is needed in this task. The long-TTL JWT minted here carries the same claim shape — Migration 052's SELECT policy allows it.

- [ ] **Doctor-side route (no new backend code).** Doctor uses their existing dashboard Supabase session; RLS's doctor branch (`doctor_id = auth.uid()`) passes. The `<TextConsultRoom mode='readonly'>` mount reads via the existing dashboard Supabase client. Nothing new on the backend side for the doctor path.

- [ ] **Backend tests** in `backend/tests/unit/services/notification-service-post-consult-chat.test.ts` (NEW):
  - Happy path: IG-DM succeeds → row-update sets `post_consult_dm_sent_at`; fan-out result returned.
  - IG-DM fails → SMS sends instead; row-update still sets `post_consult_dm_sent_at`.
  - Both fail → row-update NOT set; full failure result returned (not thrown — consistent with existing fan-out contract).
  - Idempotency: second call with `post_consult_dm_sent_at` already set returns `{ skipped: true, reason: 'already_sent' }` without fan-out.
  - Copy snapshot test pins the body format.

- [ ] **Route tests** in `backend/tests/unit/routes/consultation-chat-history-token.test.ts` (NEW):
  - Valid HMAC → 200 with JWT.
  - Invalid HMAC → 401.
  - Expired HMAC → 401.
  - Session not found → 404.
  - Rate-limit triggers expected 429.

- [ ] **Integration test** `backend/tests/unit/services/consultation-session-service-end-session-sends-chat-dm.test.ts` (NEW):
  - `endSession` happy path now fires `sendPostConsultChatHistoryDm` once.
  - `endSession` idempotent path (already ended) does NOT re-fire.
  - `sendPostConsultChatHistoryDm` throwing does NOT propagate to `endSession`.

### Frontend

- [ ] **`<TextConsultRoom>` prop extension** — add `mode: 'live' | 'readonly'`, default `'live'`:
  ```ts
  interface TextConsultRoomProps {
    sessionId:       string;
    accessToken?:    string;
    currentUserRole: 'doctor' | 'patient';
    onDisconnect?:   () => void;
    layout?:         'standalone' | 'panel' | 'canvas';       // Task 38
    mode?:           'live' | 'readonly';                     // this task
    onIncomingMessage?: (msg: IncomingMessageCallback) => void; // Task 38 (only fires in 'live')
  }
  ```
  Behavior matrix:
  | Aspect | `'live'` | `'readonly'` |
  |---|---|---|
  | Realtime subscription | On | Off (single SELECT on mount) |
  | Composer | Rendered | Hidden entirely (not disabled; gone from DOM) |
  | Attachment / paperclip | Rendered | Hidden |
  | Message bubbles | Tap-to-reply affordances | None; plain read |
  | System rows | Rendered inline | Rendered inline (same visual treatment) |
  | Header watermark | None | "Read-only — view of your consultation on {date}" |
  | `onIncomingMessage` callback | Fires on Realtime INSERT | Never fires |
  | Failed-send error UI | Lives at composer | N/A (composer gone) |

- [ ] **Header watermark** (readonly only). A slim banner at the top of the component:
  ```
  ┌──────────────────────────────────────────┐
  │ 🔒 Read-only — view of your consultation  │
  │    on 19 Apr 2026                         │
  └──────────────────────────────────────────┘
  ```
  - Styled matching Plan 06's Task 39 system-row convention (muted gray, small text) but slightly more prominent.
  - Renders only when `mode='readonly'`.
  - The `{date}` is derived from the session's `actual_ended_at` (fallback: `scheduled_end_at` if the session ended cleanly but ended-at wasn't set — defensive).

- [ ] **Patient-facing route** `frontend/app/c/history/[sessionId]/page.tsx` (NEW):
  - Server component reads `searchParams.t` (HMAC token).
  - Redirects to an error page if `t` is missing / malformed (structural validation only; the backend does cryptographic validation).
  - Calls `POST /api/v1/consultation/:sessionId/chat-history-token` with the HMAC in the body.
  - On 200, mounts `<TextConsultRoom mode='readonly' accessToken={jwt} sessionId={sessionId} currentUserRole='patient' />`.
  - On 401: "This link has expired. Please contact support for a new link."
  - On 404: "Consultation not found."
  - On rate-limit (429): "Please try again in a minute."

- [ ] **Doctor-facing route** `frontend/app/dashboard/appointments/[id]/chat-history/page.tsx` (NEW):
  - Server component reads the appointment + resolves the latest `consultation_sessions` row for it.
  - If no session exists (in-clinic appointment, never-started consult): render "No conversation was recorded for this appointment."
  - Otherwise mounts `<TextConsultRoom mode='readonly' sessionId={session.id} currentUserRole='doctor' />` (no `accessToken` — doctor uses the dashboard Supabase session).
  - Breadcrumb: `Dashboard › Appointments › {patient-name} › Conversation`.

- [ ] **Doctor-side link surface.** Add a "View conversation" button/link to the existing completed-appointment surface (likely in `<AppointmentConsultationActions>` once Task 20's follow-up extracts it, or directly on `frontend/app/dashboard/appointments/[id]/page.tsx` for now). Link target: the new doctor-facing route. Render only when `appointment.consultation_room_sid` is set OR when a text-modality session row exists for the appointment (either means there was a chat to view). The existing `PreviousPrescriptions` section is the right visual neighbor.

- [ ] **Frontend tests** (DEFERRED until the frontend test harness ships):
  - `<TextConsultRoom mode='readonly'>` renders no composer.
  - `<TextConsultRoom mode='readonly'>` renders the header watermark with the formatted date.
  - `<TextConsultRoom mode='readonly'>` does NOT attach a Realtime subscription (spy on the Supabase client's `.channel(...)` method).
  - `<TextConsultRoom mode='readonly'>` renders system rows identically to `mode='live'`.
  - `onIncomingMessage` is NOT called in `'readonly'` mode even if a Realtime event is synthesized.

- [ ] **Manual smoke test** (cross-side):
  - End a text consult → patient receives DM → tap the link → `<TextConsultRoom mode='readonly'>` loads with the full history (text + attachments + system banners). Composer is absent. Header shows the date.
  - Patient tries to copy-paste the link into a different device → works (the JWT is device-agnostic within its TTL).
  - Doctor navigates from `/dashboard/appointments/[id]` → clicks "View conversation" → same read-only surface, using the dashboard session.
  - Repeat for voice + video consults (once Plan 06 Task 36 ships so every session has a chat thread). The readonly view should show the system banners for party-joined / consult-started / consult-ended / recording-paused/resumed (once Task 28 ships).
  - Verify that attempting to send a chat message via the Supabase client with the readonly JWT is rejected by RLS (Plan 04 Migration 051's INSERT policy requires `status = 'live'`). This is defense-in-depth; the composer is gone from the UI anyway.

- [ ] **Type-check + lint clean.** Backend `npx tsc --noEmit`, `npx jest` green. Frontend `npx tsc --noEmit` + `npx next lint` clean.

- [ ] **No new env vars.**

---

## Out of scope

1. **Transcript PDF download button on the readonly page.** Task 32 ships the PDF; adding the download button here is a trivial UI addition once Task 32 lands. Captured as a sub-task of Task 32's Acceptance rather than duplicating here.
2. **Attachment re-upload / edit / delete from readonly mode.** Readonly means readonly. The RLS INSERT policy already blocks all writes after `status = 'ended'` — even an attempted write from a compromised client is rejected at the DB.
3. **Push-to-talk voice replay from the chat history.** That's Task 29's recording replay player; it surfaces on the doctor's "View consult artifacts" expanded section, not inside the chat readonly view. Trade-off considered: embedding the audio player inside the chat history banner feels cute but conflates chat-history (Decision 1 sub) with recording-access (Decision 4 LOCKED) audit doctrines. Keep them separate; doctor lands on the appointment detail page for both surfaces.
4. **Search inside the chat history.** No search UI in v1. For long conversations, browser Ctrl+F over the rendered DOM is the v1 UX. If patients or doctors complain, a follow-up adds a search input with highlight.
5. **Export chat history as JSON / markdown.** PDF is the export format (Task 32). JSON export is a Plan 10 / data-portability concern.
6. **Sharing the link with a third party.** The link carries a patient-scoped JWT. If a patient forwards the link, a third party can read the conversation — this is consistent with how a patient can forward their own email to anyone. Document the risk in the DM body ("Keep this link private"); don't architect against it in v1 because the alternative (device binding) breaks the cross-device convenience the DM is designed for.
7. **Revocation of the patient JWT before its natural expiry.** v1 has no revocation mechanism for issued JWTs — they expire naturally. If a patient reports a leaked link, Support's recourse is to wait for expiry OR rotate the session's HMAC signing secret (nuclear option, invalidates all links for that session). Plan 02's `signed_url_revocation` pattern doesn't cover chat JWTs in v1. Captured in inbox if this becomes a real concern.
8. **Doctor-side "View conversation" for in-clinic appointments.** In-clinic appointments have no `consultation_sessions` row (Plan 06 Task 36 provisions only for text/voice/video). The button is hidden for in-clinic.
9. **Patient-side "pull to refresh" on readonly.** No live updates in readonly; pulling to refresh does nothing useful because the subscription is off. Don't add the affordance.
10. **Pagination / virtualization of very long chat threads.** v1 single-SELECTs the whole history and renders it as a single DOM list. For typical consults (20-100 messages) this is fine. If a future analytics workload shows threads exceeding 500 messages, add virtualization; captured in inbox.

---

## Files expected to touch

**Backend:**

- `backend/src/utils/dm-copy.ts` — `buildPostConsultChatLinkDm` (~30 lines).
- `backend/src/services/notification-service.ts` — `sendPostConsultChatHistoryDm` (~80 lines).
- `backend/src/services/consultation-session-service.ts` — fire the DM inside `endSession` after the status flip (~10 lines).
- `backend/src/routes/api/v1/consultation.ts` — `POST /:sessionId/chat-history-token` handler (~40 lines).
- `backend/migrations/0NN_consultation_sessions_post_consult_dm_sent_at.sql` — new migration (~15 lines including head comment).
- `backend/src/types/database.ts` — reflect the new `post_consult_dm_sent_at` column on `consultation_sessions`.

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — add `mode` prop + header watermark + composer-hidden branch + subscription-skipped branch (~60 lines modified).
- `frontend/app/c/history/[sessionId]/page.tsx` — new patient-facing route (~80 lines).
- `frontend/app/dashboard/appointments/[id]/chat-history/page.tsx` — new doctor-facing route (~60 lines).
- `frontend/app/dashboard/appointments/[id]/page.tsx` — add "View conversation" link (~10 lines).

**Tests:**

- `backend/tests/unit/services/notification-service-post-consult-chat.test.ts` — new.
- `backend/tests/unit/routes/consultation-chat-history-token.test.ts` — new.
- `backend/tests/unit/services/consultation-session-service-end-session-sends-chat-dm.test.ts` — new.
- `backend/tests/unit/utils/dm-copy-post-consult-chat.test.ts` — new (copy snapshot).
- Frontend tests deferred.

---

## Notes / open decisions

1. **Patient JWT TTL for readonly chat history — 90 days, NOT indefinite.** Decision 1 sub-decision says "indefinite read access." The *access right* is indefinite but the *JWT TTL* is bounded:
   - A 90-day JWT matches the patient-self-serve recording-replay TTL from Decision 4 — same mental model for both artifacts.
   - After 90 days, the patient contacts support who re-mints a fresh HMAC link + new JWT — the underlying RLS and data remain intact.
   - Keeping JWT-TTL = data-retention would mean issuing JWTs with multi-year TTLs, which bloats risk surface if a JWT leaks.
   - The DM copy is honest: "Available for 90 days. After that, contact support to re-open the link."
   - Doctor-side has no TTL concern — doctor uses their evergreen dashboard Supabase session.
2. **Why a new HMAC-exchange endpoint instead of embedding the JWT in the DM link?** Two reasons:
   - JWTs are long (~400 chars); IG-DM has length limits, and SMS charges per segment.
   - HMAC tokens are ~64 chars, fit on one line, and can be re-exchanged for a fresh JWT on each visit (useful for the 90-day wait case — the patient can re-tap the old link from their DM history after 30 days and get a fresh JWT automatically without asking support, because the HMAC verification still works for 90 days per the session's signing secret).
   - Mirrors the Plan 04 `/text-token` pattern so the backend has one mental model for patient JWT minting across live + readonly.
3. **Doctor-side route placement** — `/dashboard/appointments/[id]/chat-history` vs a tab inside `/dashboard/appointments/[id]`. Went with a separate route (a) to simplify the mounting — the chat history is a full-height surface and a tab requires the existing page to lose its "all info on one page" shape; (b) to mirror the patient-side route conventionally. A future UX pass can consolidate if doctors complain about the extra click.
4. **Why send the DM at `endSession` rather than a worker?** `endSession` already runs inline when the doctor taps "End consult" — adding one more fire-and-forget DM is cheap and preserves the "everything that should happen at session-end happens atomically from a UX standpoint." A worker-based approach adds an eventual-consistency gap ("I ended the consult 30 seconds ago but the patient still hasn't received the link") that no one wants. The DM helper swallows errors so `endSession`'s transaction isn't coupled to IG-DM availability.
5. **Idempotency via `post_consult_dm_sent_at` column vs the existing audit table.** New column is cheaper than joining against audit. Low-cardinality, one-write-per-session. Matches the `consultation_sessions.consent_recorded_at`-style additive column pattern.
6. **What if the session never had any chat activity (edge: a voice consult with no chat messages + no attachments)?** The chat history shows just the system banners (consult-started, party-joined, consult-ended, maybe recording-paused/resumed). That's still useful as a narrative — the patient sees "what happened when." No special "no messages yet" empty state needed because system rows fill the space.
7. **Doctor's existing Supabase session vs minting a JWT — consistency trade-off.** The doctor-side route uses the evergreen dashboard session; the patient-side uses a 90-day scoped JWT. This is asymmetric but intentional: the doctor is inside the authenticated dashboard; the patient arrives from an IG-DM link. Making the doctor path also use a scoped JWT would require a whole dashboard-side HMAC-exchange, which is more ceremony than value.
8. **Header watermark styling.** Slightly more prominent than system rows (which are gray italic) but still muted. Concrete: `bg-muted/30 text-sm text-muted-foreground border-b px-4 py-2`. Pin in a visual snapshot once the frontend test harness lands.
9. **What about the consult's `consultation_type`-aware label?** The DM copy uses a generic "consultation" word; a future UX pass could say "your video consult with …" / "your voice consult with …" / "your chat consult with …". Trade-off: the patient already knows what type they booked; a per-modality copy split adds branching for minimal clarity gain. v1 keeps one copy.
10. **Doctor-side "View conversation" link visibility.** Render only when a `consultation_sessions` row exists for the appointment. For video consults (the only ones pre-Plan-06), the `consultation_room_sid` on the appointment row is a proxy signal. For all modalities post-Plan-06, the `consultation_sessions` row is the authoritative check. Use the latter when joining; fall back to the former only if the join is expensive.
11. **Will readonly mode need the Task 38 `layout='panel' | 'canvas'` prop?** No — readonly only ever renders standalone (full-page) surface. The `layout` prop defaults to `'standalone'` and the two props compose cleanly but no real-world mount combines `layout='panel'` with `mode='readonly'`. Document the orthogonality in the JSDoc.

---

## References

- **Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md) — Task 31 section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 1 sub-decision LOCKED.
- **Plan 04 Task 19 — `<TextConsultRoom>` this task extends with `mode`:** [task-19-text-consult-room-frontend.md](./task-19-text-consult-room-frontend.md).
- **Plan 04 Task 18 — `mintTextConsultJwt` + the HMAC pattern this task mirrors:** [task-18-text-session-supabase-adapter.md](./task-18-text-session-supabase-adapter.md).
- **Plan 06 Task 36 — companion channel lifecycle hook (ensures every modality has a chat to view):** [task-36-companion-channel-lifecycle-hook.md](./task-36-companion-channel-lifecycle-hook.md).
- **Plan 06 Task 38 — `layout` prop (orthogonal to this task's `mode` prop):** [task-38-video-room-companion-chat-panel.md](./task-38-video-room-companion-chat-panel.md).
- **Plan 01 Task 16 — `sendConsultationReadyToPatient` fan-out this task mirrors:** [task-16-notification-fanout-helpers.md](./task-16-notification-fanout-helpers.md).
- **Existing `endSession`:** `backend/src/services/consultation-session-service.ts:112-131` — the extension point.
- **Migration 051 + 052 — the RLS that makes the readonly surface legal:** `backend/migrations/051_consultation_messages.sql`, `backend/migrations/052_consultation_messages_patient_jwt_rls.sql`.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** ✅ Completed (2026-04-19) — second in Plan 07's suggested order (28 → 31 → 29 + 30 → 32). Blocked on Plan 06 Task 36 (chat thread exists for every modality) + Plan 04 Task 19 (component exists) + Plan 04 Task 18 (HMAC/JWT primitives) — all satisfied.

---

## Implementation log (2026-04-19)

### Backend

- **Migration `backend/migrations/067_consultation_sessions_post_consult_dm_sent_at.sql` (NEW)** — adds `post_consult_dm_sent_at TIMESTAMPTZ` to `consultation_sessions` (ADD COLUMN IF NOT EXISTS, idempotent). Drives the column-keyed dedup for `sendPostConsultChatHistoryDm`. No index — low-cardinality, one-write-per-session, PK covers the read. Sanity test in `backend/tests/unit/migrations/consultation-sessions-post-consult-dm-sent-at-migration.test.ts`.

- **`backend/src/utils/dm-copy.ts#buildPostConsultChatLinkDm` (NEW)** — exported helper + `BuildPostConsultChatLinkDmInput` interface. Generates the patient-facing DM body (consult-complete sentence, link, 90-day self-serve notice). Snapshot-pinned in `backend/tests/unit/utils/dm-copy-post-consult-chat.test.ts` so drift is deliberate.

- **`backend/src/services/notification-service.ts#sendPostConsultChatHistoryDm` (NEW)** — fan-out helper:
  - Loads `consultation_sessions` row + the `actual_ended_at` / `appointment_id` / `doctor_id` / `patient_id` columns.
  - Defensive skips: missing `actual_ended_at` (session never ended), `APP_BASE_URL` unset, no patient row, no reachable channels (no IG-PSID + no SMS), HMAC mint failure — each returns `{ skipped: true, reason: ... }` and structured-logs the cause.
  - Mints HMAC via `generateConsultationToken({ appointmentId }, { expiresInSeconds: POST_CONSULT_CHAT_HISTORY_HMAC_TTL_SECONDS })` (90 days — see Notes #1).
  - Composes `joinUrl = ${env.APP_BASE_URL}/c/history/${sessionId}?t=${hmacToken}`.
  - Calls `buildPostConsultChatLinkDm` and dispatches via `dispatchFanOut` with `{ sms, ig, email: null }` (email intentionally suppressed — mirrors `notifyPatientOfDoctorReplay` from Task 30).
  - On *any* fan-out attempt (success OR failure), stamps `consultation_sessions.post_consult_dm_sent_at = now()` so re-runs short-circuit even on full failure (the patient won't get the DM, but support already has the audit log to trace + re-mint).
  - 12 unit tests in `backend/tests/unit/services/notification-service-post-consult-chat.test.ts`: happy paths (SMS-only, IG-only, both), partial failure, full failure (still stamps), idempotency (skipped on second call), and 6 defensive-skip branches.

- **`backend/src/services/consultation-session-service.ts#endSession` extended** — fires `sendPostConsultChatHistoryDm({ sessionId, correlationId })` *after* the status flip + system-banner emit, wrapped in `void Promise.resolve().then(...).catch(...)` for true fire-and-forget semantics. The DM never blocks `endSession`'s resolution; failures are warn-logged but never rejected. Mirrors the fire-and-forget pattern from Task 30's `notifyReplayWatcher` invocation in `recording-access-service`.
  - 8 integration tests in `backend/tests/unit/services/consultation-session-service-end-session-sends-chat-dm.test.ts` confirming: invoked once after status flip, fired for all modalities (text/voice/video), resolves even if helper throws or hangs, no DM on already-ended session (idempotency at the `endSession` level).

- **`POST /api/v1/consultation/:sessionId/chat-history-token` (NEW endpoint)** — wired in `backend/src/routes/api/v1/consultation.ts` to `exchangeChatHistoryTokenHandler` in `backend/src/controllers/consultation-controller.ts`:
  - Body: `{ hmacToken: string }`. Verifies via `verifyConsultationToken`; mismatched `appointmentId` → 401 without leaking which session the token actually maps to.
  - On success mints a 90-day patient-scoped Supabase JWT via `mintScopedConsultationJwt({ sub: buildPatientSub(appointmentId), role: 'patient', sessionId, expiresAt })`.
  - Response shape extended beyond the spec's `{ accessToken, expiresAt }` minimum to include `currentUserId` (sender_id derivation), `sessionStatus`, `consultEndedAt` (from `actual_ended_at`), and `practiceName` — the patient page needs these to mount `<TextConsultRoom mode='readonly'>` without a second round-trip. None are sensitive (sender_id is public per RLS; practice_name appears in the DM body anyway).
  - 13 controller tests in `backend/tests/unit/controllers/consultation-chat-history-token.test.ts`: validation (5), HMAC + session checks (4), happy path with enrichment (4) including the bot-patient `currentUserId = appointmentId` fallback. No `supertest` — surgical hand-rolled `req`/`res` doubles to assert exact mint args + response body.

### Frontend

- **`frontend/components/consultation/TextConsultRoom.tsx`** — extended:
  - `mode?: 'live' | 'readonly'` prop (default `'live'`) — JSDoc spells out the matrix.
  - `consultEndedAt?: string` prop — ISO timestamp; drives the watermark date.
  - `connect()` short-circuits *after* the catch-up SELECT in readonly mode: skips Realtime INSERT subscription, skips presence channel, skips queued-sends flush. Sets `connection='online'` so any conditional UI doesn't render a misleading "Reconnecting…" badge.
  - Header band swapped for a slim watermark ("🔒 Read-only — view of your consultation on {date}") via `formatReadonlyDateLabel(consultEndedAt)`. Falls back to "Read-only — view of your consultation" when no date is supplied (defensive). Replaces the standard online/typing header entirely in readonly mode.
  - Composer block already gated behind `mode === "live"` (pre-Task 31 baseline) — no change needed there. The `ended` system banner is now suppressed in readonly to avoid stacking with the watermark.

- **`frontend/lib/api.ts#requestChatHistoryToken` (NEW)** — typed client + `ChatHistoryTokenExchangeData` interface. Mirrors `requestTextSessionToken` (Task 19) but with the `hmacToken` request field name + the extended response shape.

- **`frontend/app/c/history/[sessionId]/page.tsx` (NEW)** — patient-facing route:
  - `'use client'` (mirrors `/c/text/[sessionId]/page.tsx` — needs `useSearchParams` + state). Public route — no Supabase auth session required.
  - Reads `?t=` HMAC token, exchanges via `requestChatHistoryToken`, scrubs token from address bar, mounts `<TextConsultRoom mode='readonly' …>` with the JWT + metadata.
  - Three render phases: `loading`, `error` (with status-keyed message: 401 "expired link", 404 "consultation not found", 429 "try again in a minute", default), and `ready`.
  - JWT refresh hand-off (`onRequestTokenRefresh`) wired to re-call the exchange — covers the "patient leaves the page open past 90-day boundary" tail case.

- **`frontend/app/dashboard/appointments/[id]/chat-history/page.tsx` (NEW)** — doctor-facing route:
  - Server component (mirrors the appointment-detail page pattern). Uses `createClient()` from `@/lib/supabase/server` to read the doctor's session. Forwards `session.access_token` directly to `<TextConsultRoom accessToken={token} mode='readonly'>` — Migration 052's RLS doctor branch (`auth.uid() = doctor_id`) authenticates the SELECT-on-mount; no per-session JWT minted (intentional asymmetry vs the patient route — see Notes #7).
  - Breadcrumb nav: `Dashboard › Appointments › {patient} › Conversation`.
  - When no `consultation_session` exists for the appointment (in-clinic, never-started consult), renders the empty-state copy from the spec verbatim: "No conversation was recorded for this appointment."

- **`frontend/app/dashboard/appointments/[id]/page.tsx`** — added the "View conversation" link below `<ConsultArtifactsPanel>`. Visible whenever `appointment.consultation_session?.id` exists (per Notes #10 — the session row is the authoritative "there was a chat to view" check post-Plan-06; in-clinic appointments never have one so the link hides naturally). Styled as an outline button, message-square icon prefix, links to the new doctor-facing route.

### Out-of-band notes

- **Frontend tests deferred** per the spec (no harness yet). The readonly behavior is exercised end-to-end by the manual smoke test loop in the spec.
- **Rate-limiter for the new endpoint** — none added in this task. The route inherits whatever the global per-IP / per-route limiter ships in `backend/src/middleware/`. Captured to inbox for a future per-route limiter pass alongside Task 19's `/text-token` (which also lacks a dedicated limiter).
- **Patient JWT TTL = 90 days** (LOCKED per Notes #1) — `POST_CONSULT_CHAT_HISTORY_JWT_TTL_SECONDS` and `POST_CONSULT_CHAT_HISTORY_HMAC_TTL_SECONDS` are both 90 days × 86 400 s. The HMAC TTL governs how long a patient can re-tap the original DM link to mint a fresh JWT; the JWT TTL is the per-mint validity window.
- **Circular import risk** between `notification-service.ts` (imports `getJoinTokenForAppointment` from `consultation-session-service.ts`) and `consultation-session-service.ts` (now imports `sendPostConsultChatHistoryDm` from `notification-service.ts`) is handled by Node CommonJS lazy-body resolution — both call sites are inside async functions, not at top-level evaluation, so the cycle resolves cleanly. Existing service edges already have similar patterns (`recording-access-service` ↔ `notification-service`); no behavior delta.
- **Verification** — backend `npx tsc --noEmit` clean, `npx jest` all 1616 tests passing (12 new in `notification-service-post-consult-chat.test.ts`, 13 in `consultation-chat-history-token.test.ts`, 8 in `consultation-session-service-end-session-sends-chat-dm.test.ts`, 1 each in the migration + dm-copy snapshot tests). Frontend `npx tsc --noEmit` clean, `npx next lint` clean (0 warnings, 0 errors).

### Acceptance ticked

#### Backend

- [x] `backend/src/utils/dm-copy.ts#buildPostConsultChatLinkDm` (NEW) — copy snapshot pinned.
- [x] `backend/src/services/notification-service.ts#sendPostConsultChatHistoryDm` (NEW) — idempotent + fan-out + fire-and-forget.
- [x] Minor migration `067_consultation_sessions_post_consult_dm_sent_at.sql` (NEW).
- [x] `consultation-session-service.ts#endSession` extended — fire-and-forget DM after status flip, outside the DB transaction.
- [x] `POST /api/v1/consultation/:sessionId/chat-history-token` (NEW endpoint).
- [x] `GET /consultation-messages` route authorization unchanged (Migration 052's patient SELECT policy already covers the long-TTL JWT).
- [x] Doctor-side route — no new backend code; doctor uses dashboard Supabase session via the doctor-branch RLS.
- [x] Backend tests — `notification-service-post-consult-chat.test.ts` (12), `consultation-chat-history-token.test.ts` (13), `consultation-session-service-end-session-sends-chat-dm.test.ts` (8), `dm-copy-post-consult-chat.test.ts` (1 snapshot).

#### Frontend

- [x] `<TextConsultRoom>` prop extension — `mode: 'live' | 'readonly'`, default `'live'`.
- [x] Header watermark (readonly only) — `🔒 Read-only — view of your consultation on {date}`.
- [x] Patient-facing route `frontend/app/c/history/[sessionId]/page.tsx` (NEW).
- [x] Doctor-facing route `frontend/app/dashboard/appointments/[id]/chat-history/page.tsx` (NEW).
- [x] Doctor-side "View conversation" link on `frontend/app/dashboard/appointments/[id]/page.tsx`.
- [ ] Frontend tests — DEFERRED per spec until harness ships.
- [ ] Manual smoke test (cross-side) — DEFERRED to manual QA pass.
- [x] Type-check + lint clean — backend tsc + jest green; frontend tsc + next lint green.
- [x] No new env vars.
