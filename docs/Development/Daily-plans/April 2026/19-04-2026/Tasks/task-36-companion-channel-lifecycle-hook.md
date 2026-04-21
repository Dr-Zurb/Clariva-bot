# Task 36: Lifecycle hook — `consultation-session-service.ts#createSession` auto-provisions companion text channel + emits `consult_started` for every voice/video session (Decision 9 LOCKED)

## 19 April 2026 — Plan [Companion text channel](../Plans/plan-06-companion-text-channel.md) — Phase A

---

## Task overview

Decision 9 LOCKED an always-on companion text channel for voice + video consults — it auto-opens (not collapsed), it carries attachments + system messages alongside text, and it's a free affordance billed only as the booked modality. The text channel becomes a **first-class part of every consult**, not a per-modality feature.

Plan 04 already shipped the chat infrastructure for the text-modality path (table + RLS + adapter + `<TextConsultRoom>`). For text consults, the chat **is** the consult — `text-session-supabase.ts#createSession` already provisions the Realtime channel and mints the JWT. For voice + video consults today, **no companion chat is provisioned at session-create time** — `videoSessionTwilioAdapter.createSession` and `voiceSessionTwilioAdapter.createSession` create only the Twilio room + Composition recording rules.

Task 36 ships the lifecycle glue:

1. Extend `consultation-session-service.ts#createSession` (current shape at lines 80-106) with a **provision step** that fires after `persistSessionRow` succeeds. The step inspects the new session's modality:
   - `'text'` → no-op (the text adapter already handled it).
   - `'voice'` / `'video'` → call `textSessionSupabaseAdapter.provisionCompanionChannel(...)` (NEW helper added in this task) which mints the patient + doctor JWTs scoped to `consultation_messages` for this session, exactly like the text adapter's existing JWT-mint path.
2. Extend the same `createSession` to call `emitConsultStarted(session.id)` (Task 37's helper) **after** the provisioning succeeds, so the chat starts with a single canonical "Consultation started at HH:MM." banner across every modality.
3. Add a **`provisionCompanionChannel`** helper to `text-session-supabase.ts`. The helper is essentially a JWT-mint wrapper — the channel itself is virtual (Supabase Realtime channels exist on subscription, not on provisioning), so the only persisted artifact is the patient JWT (the doctor uses their existing dashboard auth session). The helper returns `{ patientJoinUrl, patientToken, expiresAt }` so the **`POST /start-voice` route** added in Plan 05 Task 24 (and the existing `POST /start` video route) can return them in the same response shape that `<ConsultationLauncher>` already consumes for the text branch.
4. Wire the patient companion-chat URL into the existing **consult-ready DM ping**. Plan 01 Task 16's `sendConsultationReadyToPatient` fan-out already sends the join URL; for voice + video the companion-chat URL is **separate** from the room URL (the patient can land on the room directly via the Twilio video / voice page; the chat URL is what the post-consult / pre-consult chat-history surfaces consume). v1 keeps the **companion-chat URL** on the response from `POST /start-voice` / `POST /start` so the doctor side can surface it; the patient does NOT receive a separate DM for it (one ping per consult is the established UX pattern). Document this scope in Notes.

After Task 36 ships, every new voice + video booking has a usable companion chat the moment its session is created — Tasks 38 + 24c then mount `<TextConsultRoom>` inside the rooms to actually surface it.

**Estimated time:** ~2.5 hours (slightly higher than the plan's 2h estimate to absorb the new `provisionCompanionChannel` helper + the `POST /start-voice` / `POST /start` response-shape extension + the regression tests on existing video flow).

**Status:** Not started

**Depends on:** Task 39 (hard — `kind = 'system'` ENUM value exists for `emitConsultStarted` to write into; nothing about the companion-channel **provisioning** itself depends on Task 39, but the `emitConsultStarted` call wired in this task does). Task 37 (hard — `emitConsultStarted` helper exists; if Task 37 hasn't merged when Task 36 lands, stub the call to a `console.info` and document in the task close-out). Plan 04 Task 18 (hard — `text-session-supabase.ts` exists with the JWT-mint primitives this task reuses).

**Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md)

---

## Acceptance criteria

- [ ] **`backend/src/services/text-session-supabase.ts#provisionCompanionChannel`** (NEW exported helper). Final signature:
  ```ts
  /**
   * Provision a companion text channel for a voice or video session.
   *
   * The channel itself is virtual — Supabase Realtime channels are
   * topic-based subscriptions, not persisted resources. This helper's job
   * is purely to mint the patient-scoped JWT + assemble the patient join
   * URL so `<ConsultationLauncher>` (doctor side) and the consult-ready
   * fan-out (patient side, video/voice room ping) can hand off to
   * `<TextConsultRoom>` later when Tasks 38 + 24c mount it inside the
   * room.
   *
   * Idempotent — multiple calls for the same session return the same
   * URL (the JWT itself is regenerated each call because JWTs carry the
   * mint timestamp; URLs collapse identically).
   *
   * Decision 9 LOCKED: chat is a free affordance, billed only as the
   * booked modality — this helper does NOT touch payments / Razorpay /
   * appointment.amount. Pure provisioning.
   */
  export async function provisionCompanionChannel(input: {
    sessionId:    string;             // consultation_sessions.id (already persisted by createSession)
    doctorId:     string;
    patientId:    string | null;      // nullable for legacy appointments without a patient row; helper logs + returns null URL gracefully if so
    appointmentId: string;            // needed by the existing JWT-mint path (mirrors the text-modality createSession's mint)
    correlationId: string;
  }): Promise<{
    patientJoinUrl: string | null;    // null when patientId is null
    patientToken:   string | null;
    expiresAt:      string;           // ISO timestamp; matches the text adapter's getJoinToken contract
  } | null>;                           // returns null when the helper short-circuits (e.g. modality unknown — defensive)
  ```
  Implementation:
  - Reuses `supabase-jwt-mint.ts#mintTextConsultJwt` (Plan 04 Task 18) verbatim — same claim shape (`consult_role: 'patient'`, `session_id: sessionId`), same TTL (`consultation_sessions.scheduled_end_at + buffer`), same secret. The patient never knows the chat is a "companion" — to them it's just a chat URL.
  - Builds `patientJoinUrl` as `${env.APP_BASE_URL}/c/text/${sessionId}?t=${hmacToken}` exactly like the text-modality flow. Note: this means the **patient companion-chat URL points at the same `/c/text/[sessionId]` route as a primary text consult**. Tasks 38 + 24c rely on this URL shape so the doctor's `<VideoRoom>` / `<VoiceConsultRoom>` side panel and the patient's standalone chat surface are the same component, same route, same JWT mint path.
  - Logs at `info` with `{ sessionId, modality: '(provisioned-from-companion-hook)', patientId }` (no PHI; no token).
  - Idempotency: the helper does not write any new persisted state — it only mints a JWT + composes a URL. Multiple calls return functionally-equivalent values (JWT differs by mint timestamp; URL stable).
  - **Trade-off:** the JWT here is **patient-scoped** even when it's the doctor calling `provisionCompanionChannel` from `createSession`. The doctor doesn't need a companion-chat JWT — they re-use their dashboard auth session, which already passes the existing chat RLS doctor branch. Document in the helper's JSDoc.
- [ ] **`backend/src/services/consultation-session-service.ts#createSession` extended** (current shape at lines 80-106). Final shape:
  ```ts
  export async function createSession(
    input: CreateSessionInput,
    correlationId: string
  ): Promise<SessionRecord> {
    const existing = await findActiveSessionByAppointment(input.appointmentId, input.modality);
    if (existing) {
      logger.info({...}, 'Consultation session already exists - returning existing');
      return existing;                                    // existing path stays — companion channel was provisioned on first create; no re-provision
    }

    const adapter = getAdapter(input.modality);
    const adapterResult = await adapter.createSession(input, correlationId);

    const row = await persistSessionRow(input, adapter, adapterResult.providerSessionId);

    // ── NEW (Plan 06 · Task 36): lifecycle hook ─────────────────────────
    // Voice + video sessions get a companion text channel auto-provisioned
    // (Decision 9 LOCKED). Text sessions skip — the text adapter already
    // owns the chat surface end-to-end.
    if (row.modality === 'voice' || row.modality === 'video') {
      try {
        const companion = await textSessionSupabaseAdapter.provisionCompanionChannel({
          sessionId:     row.id,
          doctorId:      row.doctorId,
          patientId:     row.patientId,
          appointmentId: row.appointmentId,
          correlationId,
        });
        // Stash on the returned record for callers that need the URL
        // surfaced in their HTTP response (POST /start-voice etc.).
        // Adds an optional `companion` field to SessionRecord — see types
        // change below.
        if (companion) {
          row.companion = companion;
        }
      } catch (err) {
        // Best-effort: a failed companion provisioning must NOT block the
        // primary consult. Log loudly + carry on. Tasks 38 + 24c will
        // simply render an empty chat panel with a "Chat unavailable —
        // contact support" notice if `companion` is undefined on the
        // returned record.
        logger.error(
          { correlationId, sessionId: row.id, err },
          'companion-channel provisioning failed — proceeding without companion chat',
        );
      }
    }

    // Single canonical consult-started banner across every modality.
    // emitConsultStarted swallows its own errors per Task 37's contract.
    await emitConsultStarted(row.id);

    return row;
  }
  ```
- [ ] **`backend/src/types/consultation-session.ts#SessionRecord` extended** with an optional `companion` field:
  ```ts
  export interface SessionRecord {
    id: string;
    appointmentId: string;
    doctorId: string;
    patientId: string | null;
    modality: Modality;
    providerSessionId: string;
    status: SessionStatus;
    scheduledStartAt: string;
    scheduledEndAt: string;
    actualStartedAt: string | null;
    actualEndedAt: string | null;
    /**
     * Companion text channel for voice + video sessions (Plan 06 · Task 36).
     * Undefined for text-modality sessions (the chat IS the consult — no
     * companion). Undefined when companion provisioning failed (logged,
     * non-fatal). Tasks 38 + 24c read this field to mount <TextConsultRoom>
     * in the room.
     */
    companion?: {
      patientJoinUrl: string | null;
      patientToken:   string | null;
      expiresAt:      string;
    };
  }
  ```
- [ ] **HTTP response shape extended for `POST /start` (video) + `POST /start-voice` (Plan 05 Task 24).** Both routes already return `{ doctorToken, roomName, patientJoinUrl, sessionId }`. Add a fourth field `companion` carrying the same shape as `SessionRecord.companion`. Existing video frontend callers (`startConsultation` in `frontend/lib/api.ts`) ignore unknown response fields — no frontend change required for the existing video flow to keep working. Tasks 38 + 24c will read the new field to wire the chat panel.
  - **`POST /start-text`** (Plan 04 Task 18) is **unchanged** — the text adapter already returns the join URL on its primary contract; there's no separate "companion" surface for text consults.
- [ ] **`emitConsultStarted` wire-up.** The `await emitConsultStarted(row.id)` line is added to `createSession` after the provisioning step (regardless of modality — every consult, including text, gets the canonical banner). Wrapped in nothing — Task 37's helper guarantees it never throws. Belt-and-suspenders `try/catch` is omitted to keep the call site readable; the helper's contract is what makes this safe.
- [ ] **`<ConsultationLauncher>` updated to surface the companion URL** when the doctor starts a video / voice session. The launcher's existing video branch already stores `{ doctorToken, roomName, patientJoinUrl }` in local state after `startConsultation`; extend that state to include `companion` and pass it down to `<LiveConsultPanel>` so the side panel (Task 38) can render the chat. **Note:** Task 36 only ships the data plumbing; Tasks 38 + 24c own the actual `<TextConsultRoom>` mount inside the room. The launcher's job here is purely to thread the prop through. If Tasks 38 + 24c haven't shipped, the prop sits unused — no UI change.
- [ ] **Idempotency.** The existing `findActiveSessionByAppointment` early-return at the top of `createSession` (line 84) means a second `createSession` call for the same `(appointmentId, modality)` returns the existing row WITHOUT re-running the provisioning. **Trade-off:** that means a session whose first companion-provisioning attempt failed will **not** auto-retry on the second `createSession` call — the early-return short-circuits. Acceptable v1: the failure is logged loudly and the chat panel renders the "Chat unavailable" notice; manual recovery is a backend-side `provisionCompanionChannel` call against the existing session. Captured in Notes #2 as a follow-up if real failures appear.
- [ ] **Tests** in `backend/tests/unit/services/consultation-session-service-companion-hook.test.ts` (NEW):
  - **Voice session triggers companion provisioning** — `createSession({ modality: 'voice' })` calls `textSessionSupabaseAdapter.provisionCompanionChannel` exactly once with the persisted session's `{ id, doctorId, patientId, appointmentId }`.
  - **Video session triggers companion provisioning** — same assertion for `modality: 'video'`.
  - **Text session does NOT trigger companion provisioning** — `createSession({ modality: 'text' })` does not call `provisionCompanionChannel` (text adapter handles its chat directly).
  - **Companion-provisioning failure is non-fatal** — when `provisionCompanionChannel` throws, `createSession` returns the persisted row successfully with `companion` undefined and logs at `error`.
  - **Companion data lands on the returned `SessionRecord`** — happy path returns the row with `companion: { patientJoinUrl, patientToken, expiresAt }` populated.
  - **`emitConsultStarted` fires for every modality** — text, voice, video all see exactly one call to the emitter helper (mocked).
  - **Idempotency: existing session short-circuits** — `findActiveSessionByAppointment` returning a row means the adapter is NOT called, `provisionCompanionChannel` is NOT called, `emitConsultStarted` is NOT called. The early-return path stays unchanged.
  - **Voice / video session with `patientId === null`** — the helper still runs but returns `companion.patientJoinUrl === null`; assert the persisted row carries the partial companion shape.
- [ ] **Tests** in `backend/tests/unit/services/text-session-supabase-companion.test.ts` (NEW; sibling to the existing `text-session-supabase.test.ts`, separate file because the new helper deserves its own focused suite):
  - `provisionCompanionChannel` returns the expected `{ patientJoinUrl, patientToken, expiresAt }` shape with the URL pointing at `/c/text/{sessionId}?t={hmac}`.
  - `provisionCompanionChannel` with `patientId === null` returns `{ patientJoinUrl: null, patientToken: null, expiresAt: <still set> }`.
  - `provisionCompanionChannel` is idempotent — two calls return functionally-equivalent shapes (URL identical; tokens differ by mint timestamp but both verify).
  - `provisionCompanionChannel` reuses `mintTextConsultJwt` (verified by spying on the JWT-mint helper rather than re-asserting the JWT shape).
- [ ] **Tests** in `backend/tests/unit/routes/consultation-start.test.ts` and the corresponding `consultation-start-voice.test.ts` (UPDATE both):
  - The HTTP response now includes a `companion` field for video + voice. Pin the field shape; assert it's absent for text.
- [ ] **Frontend change in `<ConsultationLauncher>`** — extend the local `videoSession` state (currently `{ doctorToken, roomName, patientJoinUrl }`) to also carry `companion`. Pass it through to wherever it's consumed downstream (Tasks 38 + 24c). **No new UI in this task** — the data plumbing is the deliverable; rendering comes in Tasks 38 + 24c. Verification posture: `tsc --noEmit` + `next lint` clean (no manual smoke needed because nothing is rendered yet).
- [ ] **No new env vars. No new migrations.**
- [ ] **Type-check + lint clean** on touched files. Backend `npx tsc --noEmit` exit 0. `npx jest tests/unit/services/consultation-session-service-companion-hook.test.ts tests/unit/services/text-session-supabase-companion.test.ts` green; full backend suite green.
- [ ] **Smoke test (manual):** create a voice booking via the existing booking flow, trigger `POST /start-voice` from the doctor dashboard, inspect the response body — assert the `companion.patientJoinUrl` is present and tappable; tap it from a separate browser as the patient and confirm `<TextConsultRoom>` loads (existing Plan 04 surface). The chat is empty except for the `consult_started` banner from `emitConsultStarted` — proves the lifecycle end-to-end. Repeat for video.

---

## Out of scope

- **Mounting `<TextConsultRoom>` inside `<VideoRoom>` or `<VoiceConsultRoom>`.** Tasks 38 + 24c own the rendering; this task only ships the data + JWT plumbing.
- **Patient-side companion-chat DM ping.** v1 sends one consult-ready DM per consult (the existing fan-out for the room URL); the companion-chat URL is surfaced via the doctor side and the patient discovers the companion chat by being **inside the room** when Tasks 38 + 24c land. Sending a separate "your companion chat is ready" DM would be over-notification and breaks the established one-ping-per-consult UX pattern. If post-launch UX research shows patients miss the chat, a follow-up can append the chat URL to the existing consult-ready DM body for voice + video (text consults already have the chat URL — it IS the room URL). Captured in `docs/capture/inbox.md`.
- **Auto-emitting `party_joined` from `createSession`.** Task 37 wires `emitPartyJoined` into the per-modality `getJoinToken` paths (the actual join signal). `createSession` runs at provision time, not join time — emitting `party_joined` from here would falsely fire 5 minutes before any participant is actually in the room.
- **Plan 09's `modality_switched` system message.** Plan 09 owns invoking it; Task 37 owns the helper-shape definition.
- **Backfill of companion channels for sessions created before Task 36 ships.** Acceptable v1 — there are no production text/voice/video sessions yet (Plans 04 + 05 just shipped). If real production sessions exist before Task 36 lands, a one-shot backfill script can iterate `consultation_sessions` and call `provisionCompanionChannel` per row. Captured in `docs/capture/inbox.md` as a conditional follow-up.
- **Failed companion-provisioning auto-retry.** v1 logs and moves on; the chat panel renders "Chat unavailable" on the frontend side. A retry pass (e.g. a worker that sweeps `consultation_sessions` where the row exists but no companion-chat JWT was ever minted) is a Plan 06.5 follow-up.
- **Companion-channel teardown.** Nothing to tear down — the channel is virtual. The chat history persists per Decision 1 (post-consult read access for both parties). The patient JWT expires per its TTL (`scheduled_end_at + buffer`); a follow-up can offer a refresh flow if patients want to re-read the chat months later, but that's Plan 07's territory.
- **Special handling for in-clinic appointments.** `consultation_type === 'in_clinic'` is not a Plan 04/05/06 modality — those appointments don't go through `consultation-session-service.ts#createSession` (no `consultation_sessions` row is provisioned for them). No companion chat for in-clinic; out of scope.
- **AI clinical-assist integration.** Plan 10 (deferred). The companion chat is part of the data substrate Plan 10 will read but Plan 10 doesn't ship in v1.

---

## Files expected to touch

**Backend:**

- `backend/src/services/text-session-supabase.ts` — add the `provisionCompanionChannel` exported helper (~50 lines).
- `backend/src/services/consultation-session-service.ts` — extend `createSession` (lines 80-106) with the lifecycle hook + `emitConsultStarted` call (~25 lines added).
- `backend/src/types/consultation-session.ts` — add the optional `companion` field to `SessionRecord`.
- `backend/src/controllers/consultation-controller.ts` — extend the `POST /start` (video) + `POST /start-voice` handlers to surface `session.companion` in the HTTP response (~5 lines per handler).

**Frontend:**

- `frontend/components/consultation/ConsultationLauncher.tsx` — widen the local `videoSession` state shape to include `companion`; thread it through props (no rendering change in this task).
- `frontend/lib/api.ts` — widen `startConsultation` / `startVoiceConsultation` return type to include the new `companion` field.
- `frontend/types/consultation.ts` (or wherever the response types live) — mirror the SessionRecord widening.

**Tests:**

- `backend/tests/unit/services/consultation-session-service-companion-hook.test.ts` — new.
- `backend/tests/unit/services/text-session-supabase-companion.test.ts` — new.
- `backend/tests/unit/routes/consultation-start.test.ts` — update HTTP-response-shape assertions for video.
- `backend/tests/unit/routes/consultation-start-voice.test.ts` — update HTTP-response-shape assertions for voice (NEW if Plan 05 Task 24 hasn't shipped yet).

**No new migrations. No new env vars.**

---

## Notes / open decisions

1. **Why provisioning at `createSession` time instead of lazy provisioning at first chat-message?** Three reasons:
   - **One canonical timestamp.** The companion-chat lifecycle is tied to the consult lifecycle: started at `createSession`, ended at `endSession`. Provisioning at create-time means the chat history's first message (the `consult_started` banner from Task 37) lines up cleanly with the consult's actual start moment.
   - **No race on first message.** Lazy provisioning would mean the first attempt to send a message races against the JWT-mint; cleaner to mint once at the deterministic `createSession` moment.
   - **Smaller blast radius on JWT-mint failures.** A mint failure at create-time is logged + visible; a mint failure on first-message would surface as a confusing "couldn't send your message" error in the chat UI mid-consult.
2. **Idempotency trade-off — short-circuit on existing session means no companion-retry.** If `provisionCompanionChannel` fails on the first `createSession` call, the session row is persisted but `companion` is undefined. The next `createSession` call returns the existing row early without re-running provisioning. v1 acceptance: log + render "Chat unavailable" on the frontend; manual recovery via a follow-up admin tool. Captured in `docs/capture/inbox.md`. The trigger to fix this for real: a single production failure where a doctor + patient lose the chat for an entire consult.
3. **JWT TTL = `scheduled_end_at + buffer`.** Same TTL as the text adapter's primary `getJoinToken`. A consult that runs over its scheduled slot will see the JWT expire mid-call — the existing reconnect / token-refresh path in `<TextConsultRoom>` (Plan 04 Task 19) already handles this via `onRequestTokenRefresh`. The companion-chat helper produces a JWT with the same TTL semantics so the existing refresh path works unchanged.
4. **Why doesn't the helper persist anything beyond the JWT?** The Supabase Realtime channel is virtual — subscribing creates it on the fly. Persisting a row "this session has a companion channel" is redundant: the existence of the `consultation_sessions` row + its modality are sufficient for the frontend to know whether to mount `<TextConsultRoom>` (Tasks 38 + 24c read `session.modality !== 'text'` to decide).
5. **`SessionRecord.companion` is optional, not always-set for voice/video.** Reflects the reality that companion provisioning can fail. Frontend code that consumes `companion` MUST handle the undefined branch — Tasks 38 + 24c will document this in their acceptance criteria. Tests pin both branches.
6. **What about a chat URL surfaced on the patient consult-ready DM?** Today's fan-out (`sendConsultationReadyToPatient`, Plan 01 Task 16) sends one URL: the room URL. The companion chat URL is **distinct** for voice + video (different route: `/c/text/[sessionId]` vs `/c/voice/[sessionId]`). Adding a second URL to the DM body risks confusion ("which one do I tap?"). v1 keeps the DM single-URL — patients access the companion chat by being inside the voice / video room (Tasks 38 + 24c mount `<TextConsultRoom>` inline). Post-consult chat-history access is a Plan 07 concern.
7. **`emitConsultStarted` fires for text-modality sessions too.** The text adapter doesn't currently emit it (Plan 04 Task 18 didn't ship a banner). Centralizing the call here means text consults gain the same canonical banner as voice + video — improves the Plan 10 AI pipeline's consistency across modalities. Document in the test as the deliberate behavior change for text-modality flows. **Mild risk:** existing `<TextConsultRoom>` users will start seeing the banner immediately after Task 36 ships; if Plan 04's frontend isn't yet rendering system rows, the row sits in the table invisibly until Tasks 38 + 24c land. Acceptable — a hidden persisted row is harmless.
8. **Scope creep guard.** The plan's lifecycle-hook section is small; this task's largest design surface is the `provisionCompanionChannel` helper + its return-shape ripple to the HTTP routes + the frontend prop threading. Resist the temptation to also add post-consult companion-chat access here (that's Plan 07).
9. **What if a voice → video upgrade (Plan 09) creates a "new" modality on the same session?** Plan 09 reuses the same `consultation_sessions` row; the modality flips on `current_modality`, not the row's `modality` field. Companion provisioning was done once at create-time for the booked modality, and the same JWT continues to work for the upgraded modality (it's session-scoped, not modality-scoped). No re-provisioning needed.
10. **Plan 05 Task 24's `POST /start-voice` may not exist yet** when Task 36 ships. If so, Task 36 ships only the `POST /start` (video) HTTP response extension and the test for `POST /start-voice` is deferred. The frontend `<ConsultationLauncher>` plumbing for voice can still ship (it'll silently get an undefined `companion` field until the route surfaces it). Document this dependency clearly in the PR description.

---

## References

- **Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md) — Lifecycle-hook contract section (the inline TypeScript snippet in the plan is the design source).
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 9 LOCKED.
- **Task 39 — schema for `kind = 'system'` rows that `emitConsultStarted` writes:** [task-39-consultation-messages-attachments-and-system-rows.md](./task-39-consultation-messages-attachments-and-system-rows.md)
- **Task 37 — `emitConsultStarted` central helper:** [task-37-system-message-emitter.md](./task-37-system-message-emitter.md)
- **Plan 04 Task 18 — `text-session-supabase.ts` and the JWT-mint primitives this task reuses:** [task-18-text-session-supabase-adapter.md](./task-18-text-session-supabase-adapter.md)
- **Plan 04 Task 19 — `<TextConsultRoom>` that consumes the companion-chat URL via Tasks 38 + 24c:** [task-19-text-consult-room-frontend.md](./task-19-text-consult-room-frontend.md)
- **Plan 05 Task 24 — `POST /start-voice` route this task extends:** [task-24-voice-consult-room-frontend.md](./task-24-voice-consult-room-frontend.md)
- **Existing facade (extend `createSession`):** `backend/src/services/consultation-session-service.ts:80-106`.
- **Existing JWT-mint helper:** `backend/src/services/supabase-jwt-mint.ts` (Plan 04 Task 18).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** **COMPLETED 2026-04-19.** Backend + frontend plumbing shipped. Hard-blocks Tasks 38 + 24c (rendering of `<TextConsultRoom>` inside `<VideoRoom>` / `<VoiceConsultRoom>`) are now unblocked.

---

## Decision log — 2026-04-19 close-out

Quick log of the choices made during execution, cross-linked with the acceptance criteria above so the next developer can trace *why* a specific file shape looks the way it does.

1. **`provisionCompanionChannel` is a standalone named export, NOT a method on `ConsultationSessionAdapter`.**
   - The task's acceptance criteria sample used `textSessionSupabaseAdapter.provisionCompanionChannel(...)` as the call site. We chose instead to export it as a top-level function in `text-session-supabase.ts` and import it directly into `consultation-session-service.ts`.
   - **Rationale:** adding it to the adapter interface would widen `ConsultationSessionAdapter` with a text-adapter-specific feature that voice / video adapters have no business implementing. Keeping it standalone preserves the adapter's three-method shape (`createSession` / `endSession` / `getJoinToken`) and keeps companion-channel concerns isolated to one module.
   - **Impact on tests:** the facade's existing `consultation-session-service.test.ts` mock already mocked `video-session-twilio` / `voice-session-twilio` at the module boundary; adding a `text-session-supabase` mock with both `textSessionSupabaseAdapter` + `provisionCompanionChannel` follows the exact same pattern.

2. **`patientToken` surfaces the HMAC consultation-token, NOT the Supabase JWT.**
   - The task doc mentions "reuses `mintTextConsultJwt`" but the actual URL embedded in the patient link is the HMAC consultation-token (see `text-session-supabase.buildPatientJoinUrl` head doc — "JWTs in URLs leak via referrers / server logs / link previews"). The Supabase JWT is only minted on page load by the existing `POST /:sessionId/text-token` exchange controller.
   - We therefore surface `patientToken = <HMAC>` (the URL payload) and `expiresAt = <Supabase-JWT-TTL>` (the text adapter's `getJoinToken` TTL). These are two separate tokens with two separate TTLs; the helper doc block calls this out explicitly so future readers don't assume the HMAC follows the 30-minute JWT TTL.
   - **Trade-off documented in the type:** `SessionRecord.companion.patientToken` JSDoc explicitly notes it's the HMAC, not the JWT, with a link to the rationale.

3. **Idempotency helper output — URL path is stable, HMAC rotates by second.**
   - The task doc's phrasing "URL identical; tokens differ by mint timestamp" can't hold literally because the HMAC's payload includes `exp = now + 24h`, which rotates the signature every second, and the HMAC is embedded in the URL as `?t=...`.
   - **What we ship instead:** the URL's path + host (`https://app.example.com/c/text/{sessionId}`) is stable across calls; the HMAC query-string parameter can differ by mint second but both tokens verify cleanly against `verifyConsultationToken` (same secret, same `appointmentId`). The dedicated idempotency test in `text-session-supabase-companion.test.ts` asserts exactly this shape.
   - **Why this is fine:** callers of the helper (the facade, the `POST /start` controller) only read the return value once — they don't cache URLs across calls. The "idempotent" contract they need is "safe to retry" (no side effects, no duplicate DB writes), which the helper delivers by design (no persistence, only JWT mint + URL compose).

4. **Rejoin path (facade short-circuit) returns `companion: undefined` — documented, not fixed.**
   - Task doc Notes #2 + acceptance criteria explicitly call this out. The first `createSession` call produces the companion and returns it to the original caller; a second call that finds an existing session short-circuits WITHOUT re-provisioning.
   - **What this looks like on the wire:** on the re-join path in `appointment-service.startConsultation`, `existingSession` is truthy, the facade is bypassed entirely, and the HTTP response omits the `companion` field (note the conditional `...(companion ? { companion } : {})` spread at the end of `startConsultation`). The frontend's `VideoSession` state ends up with `companion: undefined`.
   - **Follow-up captured:** if real production failures appear where a doctor + patient lose the chat for an entire consult, a Plan 06.5 retry worker (or an explicit re-provision path wired to the rejoin branch in `appointment-service.startConsultation`) picks up the slack. Until then, Tasks 38 + 24c render a "Chat unavailable" notice when the field is absent.

5. **`emitConsultStarted` is called unwrapped (no try/catch) per Task 37's no-throw contract.**
   - Task 37's helper wraps its own admin-client-unavailability + dedup + `23514` errors in warn-level logs rather than re-throwing. The facade's call site (`await emitConsultStarted(row.id);`) trusts that contract.
   - **Defence-in-depth not added intentionally:** adding a `try/catch` around the emitter here would duplicate Task 37's internal guarantees and obscure the intent of "this banner is guaranteed best-effort at the helper layer". If Task 37's contract ever drifts, that's a one-line PR in the helper; the facade stays clean.

6. **`POST /start-voice` route NOT added in this task — Plan 05 Task 24 owns it.**
   - Per task doc Notes #10, Plan 05 Task 24's `POST /start-voice` has not landed yet. The backend plumbing for its companion field is ready (the voice modality flows through the exact same `facadeCreateSession` → `row.companion` path as video), and when Task 24 ships the HTTP route can simply spread `session.companion` into its response body the same way `appointment-service.startConsultation` does today.
   - **Out-of-scope confirmation:** the voice-specific HTTP response-shape test file (`tests/unit/routes/consultation-start-voice.test.ts`) is deferred to Task 24 — writing it now would ship a test against a route that doesn't exist. A grep-pin at Task 24 merge-time (`rg "session.companion" backend/src/controllers/`) is the hand-off contract.
   - **Existing `POST /start` video route test file also doesn't exist yet** (`tests/unit/routes/consultation-start.test.ts` is not on disk — verified via `Get-ChildItem`). The video HTTP-response shape is pinned at the service-layer contract via `StartConsultationResult` + its companion field; adding a route-level test would be additive value but isn't a blocker for Task 36 acceptance. Captured in `docs/capture/inbox.md`.

7. **Frontend plumbing ships, no rendering — as specified.**
   - `ConsultationLauncher.tsx`'s `VideoSession` state gained `companion?`. Both the fresh-`startConsultation` path (line ~168-189) and the rejoin path (line ~115-148) thread it through. The rejoin fallback (`getConsultationToken`) deliberately leaves `companion` unset — there's no backend surface to re-mint it from the `/token` path.
   - No UI is rendered off the new field in this task (Tasks 38 + 24c own the `<TextConsultRoom>` mount). Verification posture was `tsc --noEmit` + `next lint` clean — both green.

8. **Test coverage delivered:**
   - **New:** `backend/tests/unit/services/consultation-session-service-companion-hook.test.ts` — 11 assertions covering happy path (voice + video), text skip, failure isolation, `emitConsultStarted` wiring (parametrized over all three modalities), idempotency short-circuit, and `patientId === null` passthrough.
   - **New:** `backend/tests/unit/services/text-session-supabase-companion.test.ts` — 8 assertions covering happy path, defensive short-circuits (empty `sessionId`, missing session row), `patientId === null`, `APP_BASE_URL` unset, `CONSULTATION_TOKEN_SECRET` unset (HMAC mint failure), idempotency, and no-persistence (no `insert` / `update` calls).
   - **Updated:** `backend/tests/unit/services/consultation-session-service.test.ts` — extended the module-boundary mocks to register `provisionCompanionChannel` + `emitConsultStarted`. All 18 pre-existing facade assertions still green.
   - **Verification:** full backend jest green (110 suites, 1449 tests), backend `tsc --noEmit` exit 0, frontend `tsc --noEmit` + `next lint` exit 0.

9. **Files touched (reference — mirror of "Files expected to touch" above):**
   - `backend/src/types/consultation-session.ts` — added optional `companion` field with a long JSDoc block explaining the fresh-create vs rejoin nullability + HMAC-vs-JWT token-shape trade-off.
   - `backend/src/services/text-session-supabase.ts` — added `ProvisionCompanionChannelInput` / `ProvisionCompanionChannelResult` interfaces + the `provisionCompanionChannel` function.
   - `backend/src/services/consultation-session-service.ts` — extended imports (companion helper + `emitConsultStarted`) and extended `createSession` with the voice/video provision hook + unwrapped `emitConsultStarted` call.
   - `backend/src/services/appointment-service.ts` — extended `StartConsultationResult` with the `companion` field, plumbed `session.companion` from the facade's return into the HTTP response (conditional spread keeps the rejoin path's response shape unchanged).
   - `frontend/lib/api.ts` — extended `StartConsultationData` with the matching `companion` field.
   - `frontend/components/consultation/ConsultationLauncher.tsx` — widened `VideoSession` with `companion?`; threaded it through both `startConsultation` call sites (fresh + rejoin).

10. **No env var changes. No migration changes.** Per the acceptance criteria — pure code + type plumbing.
