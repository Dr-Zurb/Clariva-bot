# Task 37: `emitSystemMessage` + per-event helpers — central writer for companion-chat system banners (`consult_started`, `party_joined`, `consult_ended` shipped here; Plans 07/08/09 hooks defined)

## 19 April 2026 — Plan [Companion text channel](../Plans/plan-06-companion-text-channel.md) — Phase A

---

## Task overview

Decision 9 LOCKED a unified narrative across modalities: every consult — text, voice, video — has a single timestamp-ordered `consultation_messages` thread that includes lifecycle banners (consult-started, party-joined, recording-paused/resumed, modality-switched, consult-ended) so the AI clinical-assist pipeline (Plan 10) can read one coherent stream per session and the `<TextConsultRoom>` can render the same banners for both parties.

Task 39 ships the schema (`kind = 'system'` + `system_event` column + widened `sender_role` CHECK). Task 37 ships the **central writer** that every emitter funnels through, plus the **first three concrete helpers** that this plan ships:

- `emitConsultStarted(sessionId)` — fired by Task 36's lifecycle hook on every `createSession` (every modality).
- `emitConsultEnded(sessionId, summary)` — fired by `consultation-session-service.ts#endSession` (every modality).
- `emitPartyJoined(sessionId, role)` — fired when a participant connects (the wire-up sites differ per modality; spelled out in Acceptance below).

The remaining `SystemEvent` union members (`recording_paused`, `recording_resumed`, `recording_stopped_by_doctor`, `modality_switched`, `video_recording_started`, `video_recording_stopped`) are **defined as types here** but **not invoked** — Plans 07, 08, 09 will add their own concrete helpers (`emitRecordingPaused`, `emitModalitySwitched`, …) that compose on top of the central `emitSystemMessage`. This task ships the union so those plans don't have to coordinate type-shape changes.

System rows render in `<TextConsultRoom>` (Tasks 38 + 24c) as small inline banners — italic + gray + clock icon — visually distinct from message bubbles. Persistence + RLS + Realtime delivery all reuse Plan 04's existing infrastructure unchanged; this task only adds the writer + the per-event helpers.

**Estimated time:** ~2 hours (actual: ~1h 30m)

**Status:** Code-complete 2026-04-19 — see Decision log

**Depends on:** Task 39 (hard — `kind = 'system'` ENUM value + `system_event` column + `sender_role = 'system'` widening + `consultation_messages_kind_shape_check` row-shape CHECK + the removal of `text-session-supabase.ts#sendMessage` early-throw on `'system'`). Task 36 (soft, parallel — the lifecycle hook will be the **first caller** of `emitConsultStarted`; the two tasks ship in parallel and each PR can land independently as long as 39 lands first).

**Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md)

---

## Acceptance criteria

- [ ] **`backend/src/services/consultation-message-service.ts` extended** with the central writer + the `SystemEvent` union + the three concrete helpers shipped in this plan:
  ```ts
  /**
   * The full set of canonical system-event tags written into
   * `consultation_messages.system_event`. Every helper that calls
   * `emitSystemMessage` MUST pass a value from this union.
   *
   * Plans 07, 08, 09 each add their own emit-helpers building on the
   * central primitive but the union is owned here so the type-shape stays
   * stable across plan boundaries:
   *   · 'recording_paused', 'recording_resumed', 'recording_stopped_by_doctor'
   *      → emitted by Plan 07's recording-control surface.
   *   · 'video_recording_started', 'video_recording_stopped'
   *      → emitted by Plan 08's video-escalation flow.
   *   · 'modality_switched'
   *      → emitted by Plan 09's mid-consult switching state machine.
   *
   * The DB column is plain TEXT (Task 39 Notes #4) so additions to the
   * union here do NOT need a migration. Adding a new value is a single-PR
   * change in this file.
   */
  export type SystemEvent =
    | 'consult_started'
    | 'party_joined'
    | 'consult_ended'
    | 'recording_paused'
    | 'recording_resumed'
    | 'recording_stopped_by_doctor'
    | 'modality_switched'
    | 'video_recording_started'
    | 'video_recording_stopped';

  /**
   * UUID used as `sender_id` for every system row. Per Task 39 Notes #5:
   * the column is NOT NULL but system rows have no real sender; we use a
   * synthetic constant so filtering "messages from this user" trivially
   * excludes system rows by `sender_role`.
   *
   * Pinned in a unit test so it never drifts.
   */
  export const SYSTEM_SENDER_ID = '00000000-0000-0000-0000-000000000000';

  /**
   * Central writer for companion-chat system banners. All event-specific
   * helpers below funnel through this one function so the persistence
   * shape, the row-shape CHECK, and the RLS path are exercised in exactly
   * one place.
   *
   * Always uses the service-role Supabase client (system rows bypass the
   * RLS INSERT door per Task 39 Notes #1 — service-role bypass IS the
   * write path).
   *
   * Idempotent at the application layer per `correlationId` (see Notes #2)
   * so retries from the lifecycle hook (Task 36) don't double-banner the
   * chat. Idempotency is best-effort — duplicate writes are caught only
   * within the helper's in-process dedup window (default 60s); broader
   * cross-process dedup is out of scope for v1.
   */
  export async function emitSystemMessage(input: {
    sessionId:      string;
    event:          SystemEvent;
    body:           string;                   // localized banner text rendered verbatim by <TextConsultRoom>
    correlationId?: string;                   // optional; enables in-process dedup
    meta?:          Record<string, unknown>;  // free-form, e.g. { reason: '...', byRole: 'doctor' }; reserved for Plans 07/08/09. NOT persisted in v1 (see Notes #3).
  }): Promise<{ id: string; createdAt: string } | { skipped: true; reason: string }>;

  // -------- Concrete helpers shipped in this plan --------
  // (Plans 07, 08, 09 will add their own helpers in this same file.)

  export async function emitConsultStarted(sessionId: string): Promise<void>;

  export async function emitConsultEnded(
    sessionId: string,
    summary?: string,                         // optional override; defaults to "Consultation ended at HH:MM."
  ): Promise<void>;

  export async function emitPartyJoined(
    sessionId: string,
    role: 'doctor' | 'patient',
  ): Promise<void>;
  ```
  Notes on the surface:
  - Each helper builds the `body` string from the canonical copy (see Acceptance bullet "Canonical body strings" below) and calls `emitSystemMessage`.
  - The helpers all return `Promise<void>` — best-effort writes; failures are logged but never thrown to the caller. Rationale: a failed system-message write must not break the consult lifecycle (e.g. a Realtime outage at consult-start time should not block the doctor from joining the room).
  - `emitSystemMessage` returns the persisted row OR `{ skipped: true, reason }` for the dedup case so callers (mostly the helpers) can log.
- [ ] **Canonical body strings** (the localized text persisted in `body` and rendered verbatim by `<TextConsultRoom>`):
  ```
  consult_started   → "Consultation started at HH:MM."
  party_joined      → "Doctor joined the consult."  / "Patient joined the consult."
                       (depends on `role` argument)
  consult_ended     → "Consultation ended at HH:MM."
                       (caller may pass a custom `summary` override; default is the
                        time-only line above)
  ```
  Time format: `HH:MM` in the **doctor's** timezone (read from the `consultation_sessions` → `doctors.timezone` join). Rationale: the doctor is the "owner" of the consult; rendering all timestamps in the doctor's TZ keeps the chat narrative coherent for both parties even if they're in different time zones (the patient sees `"started at 14:30."` knowing it's their doctor's clock — same convention used by `appointmentConsultationTypeToLabel` and the existing reminder DMs which already format in the doctor's TZ). Document in the helper's JSDoc.
  - **The Plans 07/08/09 events do NOT have canonical bodies in this task.** Each owning plan defines its own copy when it ships its helper.
- [ ] **`emitSystemMessage` implementation** — central writer:
  - Builds the row payload: `{ session_id, sender_id: SYSTEM_SENDER_ID, sender_role: 'system', kind: 'system', system_event: input.event, body: input.body, created_at: now() }`.
  - Inserts via the service-role Supabase client (bypasses RLS).
  - On the row-shape CHECK violating (defensive — the application layer guards against this, but the DB layer is the source of truth): catch the Postgres `23514` error code, log at `error` with `{ sessionId, event, body }`, and return `{ skipped: true, reason: 'row_shape_check_failed' }` rather than throwing. Rationale: a CHECK violation here means the helper was called with bad inputs, and a thrown error mid-consult would be far more disruptive than a missing banner.
  - Logs every successful write at `info` with `{ sessionId, event, system_event_id }` (no PHI in the body field — bodies are short, public-by-design banners).
- [ ] **Idempotency / dedup** — in-process LRU keyed by `(sessionId, event, correlationId)` with a 60-second TTL. Any second call with the same triple within the window returns `{ skipped: true, reason: 'duplicate_correlation_id' }` without writing. Out of process (e.g. two backend pods) the dedup is **not enforced**; documented as a v1 limitation. The v1 callers (Task 36's `createSession` lifecycle hook) typically run within a single request's process so cross-process dedup is rarely the actual fix. If real production telemetry shows duplicate banners in chat, the follow-up is a Postgres-side `INSERT ... ON CONFLICT (session_id, system_event) DO NOTHING` partial unique index — captured in Out of scope below.
- [ ] **Time formatting helper** — small internal `formatTimeInDoctorTz(date: Date, timezone: string): string` that returns `'HH:MM'` (24-hour, zero-padded). Wraps `Intl.DateTimeFormat`. Defaults to `Asia/Kolkata` if the doctor's timezone is missing or invalid (matches the rest of the codebase's TZ fallback per `dm-copy.ts`).
- [ ] **Wire-up sites for the three concrete helpers shipped in this plan:**

  | Helper | Call site (added in this task) | Notes |
  |---|---|---|
  | `emitConsultStarted(sessionId)` | `consultation-session-service.ts#createSession` (Task 36 wires this) | Defer the actual call to Task 36 — Task 37 ships the helper, Task 36 ships the wiring. Document in Task 37 that the helper exists but is not yet invoked from `createSession` until Task 36 lands. |
  | `emitConsultEnded(sessionId, summary?)` | `consultation-session-service.ts#endSession` (this task adds the call directly) | Endpoint is small + obvious; bundling the wire-up here saves a round-trip with Task 36. Document in Task 36 that `endSession` already emits its banner. |
  | `emitPartyJoined(sessionId, 'doctor' \| 'patient')` | (multiple sites; spelled out below) | Per-modality, per-side. |

  **`emitPartyJoined` wire-up sites:**
  - **Video / Voice (doctor side)** — `videoSessionTwilioAdapter.getJoinToken` / `voiceSessionTwilioAdapter.getJoinToken` for `role === 'doctor'`. Fire after the token mint succeeds; the doctor is about to join the room. **Trade-off accepted:** "joined" here means "fetched the join token" not "Twilio's `participantConnected` webhook fired" — the latter is more accurate but lives in `consultation-verification-service.ts` and threading the emit through the webhook handler couples Plan 06 to Plan 01's webhook lifecycle. Token-mint is close-enough for v1; document the trade-off in the helper's JSDoc. A Plan 07 follow-up can promote to webhook-driven if accuracy matters for the AI narrative.
  - **Video / Voice (patient side)** — same pattern, in the same `getJoinToken` call when `role === 'patient'`.
  - **Text** — `text-session-supabase.ts#getJoinToken` for both roles. Same token-mint trigger; text consults don't have a "Twilio webhook fires" milestone, so token-mint is the canonical join signal for text.
  - **Idempotency** — token-mint can fire multiple times for the same role on retries / page-refresh. The 60s in-process dedup catches most duplicates; a refresh after 60s will re-banner. Acceptable v1 — the chat is a narrative for the AI pipeline + a UX comfort signal for the participants; an extra "Doctor joined" banner on a refresh is honest behavior.
- [ ] **`endSession` wire-up — direct in this task.** Extend `backend/src/services/consultation-session-service.ts#endSession` (current shape at lines 112-131) to call `emitConsultEnded(session.id)` after the status flip succeeds. Wrap in `try/catch` so a failed banner write never blocks the session-end transaction (the helper itself swallows errors per the contract above; the `try/catch` is belt-and-suspenders).
- [ ] **Tests** in `backend/tests/unit/services/consultation-message-service-system-emitter.test.ts` (NEW):
  - **`emitSystemMessage` happy path** — writes the row with the expected `{ kind, sender_role, sender_id, system_event, body }` shape; returns the row ID + createdAt.
  - **`emitSystemMessage` dedup** — second call within 60s with the same `(sessionId, event, correlationId)` returns `{ skipped: true, reason: 'duplicate_correlation_id' }` and writes only once.
  - **`emitSystemMessage` dedup expires** — second call after 60s writes again. Uses `jest.useFakeTimers()` to advance the clock.
  - **`emitSystemMessage` swallows row-shape CHECK violation** — mock the DB client to throw a `'23514'` error; helper returns `{ skipped: true, reason: 'row_shape_check_failed' }`, logs at `error`, never throws.
  - **`SYSTEM_SENDER_ID` constant pin** — assertion that the constant equals `'00000000-0000-0000-0000-000000000000'` (matches Task 39's documented value).
  - **`emitConsultStarted` body** — pinned snapshot for the canonical `"Consultation started at HH:MM."` shape with a fixed timezone fixture (`'Asia/Kolkata'`, `'14:30'`).
  - **`emitConsultEnded` body** — pinned snapshot for default summary; pinned snapshot for caller-supplied summary override.
  - **`emitPartyJoined` body** — pinned snapshots for `role: 'doctor'` and `role: 'patient'`.
  - **Helpers swallow errors** — when the underlying `emitSystemMessage` rejects (e.g. DB connection failure), each helper resolves successfully (does not throw). Verifies the "best-effort, never blocks lifecycle" contract.
- [ ] **Tests** in `backend/tests/unit/services/consultation-session-service.test.ts` (UPDATE):
  - `endSession` happy path now also calls `emitConsultEnded` exactly once.
  - `endSession` swallows a failure from `emitConsultEnded` (mock the helper to throw; `endSession` still resolves).
  - `endSession` does NOT call `emitConsultEnded` when the session was already ended (idempotent path returns early — no banner).
- [ ] **Tests** in `backend/tests/unit/services/text-session-supabase.test.ts` (UPDATE) and the corresponding `video-session-twilio.test.ts` / `voice-session-twilio.test.ts` (UPDATE):
  - `getJoinToken` for each role calls `emitPartyJoined` once with the correct `role` argument.
  - The 60s dedup means a second `getJoinToken` call within the window does NOT double-banner — verify by stubbing the message-service helper and asserting call count.
- [ ] **No new env vars. No new migrations** (Task 39 ships them).
- [ ] **Type-check + lint clean** on touched files. Backend `npx tsc --noEmit` exit 0. `npx jest` full suite green. The `text-session-supabase.test.ts` system-happy-path test that Task 39 added covers the "system rows insert via `sendMessage`" path; this task's central writer goes through a separate code path (direct service-role insert from the message service) so both code paths get test coverage.

---

## Out of scope

- **Lifecycle hook in `createSession`.** Task 36 owns the `createSession` extension that fires `emitConsultStarted` at session-create time; this task ships the helper but defers wiring to Task 36 to keep PRs focused.
- **`recording_paused` / `recording_resumed` / `recording_stopped_by_doctor` emit-helpers.** Plan 07 owns them. The `SystemEvent` union here defines the type so Plan 07's helpers can land additively without coordinating a type change.
- **`modality_switched` emit-helper.** Plan 09 owns it.
- **`video_recording_started` / `video_recording_stopped` emit-helpers.** Plan 08 owns them.
- **Cross-process / cross-pod dedup.** v1 dedup is in-process LRU only. If duplicate banners surface in production, the follow-up is a Postgres partial unique index `(session_id, system_event)` for the events that should be at-most-once per session (e.g. `consult_started` and `consult_ended`). Captured in `docs/capture/inbox.md`.
- **Persisting `meta` in the DB.** The helper signature accepts `meta?: Record<string, unknown>` for forward compatibility (Plans 07/08/09 will want to attach `{ reason: '...', byRole: 'doctor' }` to recording-pause / modality-switch banners), but **v1 does not persist it**. Adding `system_meta JSONB` is a one-line additive migration — captured as a follow-up in inbox once a real consumer needs it. v1 callers should pass `meta` through and accept that it's stripped before insert; document in the helper's JSDoc.
- **Localizing banner copy.** v1 is English-only per the master plan. The body strings are hardcoded English; a future i18n plan replaces the `formatTimeInDoctorTz`-driven body builder with a translation lookup keyed on `system_event` + `meta`.
- **Webhook-driven `emitPartyJoined`.** v1 fires from token-mint per the trade-off above. Plan 07 follow-up can promote to Twilio's `participantConnected` webhook for accuracy if the AI narrative starts getting confused by the slight discrepancy.
- **`emitPartyJoined` for the patient on the text-modality path that doesn't go through `getJoinToken`.** Currently text patients always come through `POST /:sessionId/text-token` which calls `getJoinToken`, so the wire-up is uniform. If a future flow lets a patient land on `<TextConsultRoom>` without a token-mint (e.g. a doctor-side preview), no party-joined banner fires for them. Acceptable v1.
- **An "AI started reading" / "AI finished reading" system banner.** Plan 10 territory.
- **`emitSystemMessage` rate limiting.** No rate limit on the central writer. The 60s dedup window protects against the dominant duplicate-write pattern; a malicious caller could flood the helper but the helper is private to backend services (no HTTP exposure). Defense-in-depth not needed in v1.

---

## Files expected to touch

**Backend:**

- `backend/src/services/consultation-message-service.ts` — extend with `SystemEvent` union, `SYSTEM_SENDER_ID` constant, `emitSystemMessage`, `emitConsultStarted`, `emitConsultEnded`, `emitPartyJoined`, `formatTimeInDoctorTz` helper. ~150 lines added.
- `backend/src/services/consultation-session-service.ts` — extend `endSession` (lines 112-131) to call `emitConsultEnded` after the status flip; wrap in `try/catch`. (Task 36 will add the matching `emitConsultStarted` call to `createSession` separately.)
- `backend/src/services/video-session-twilio.ts` — extend `getJoinToken` to call `emitPartyJoined(sessionId, role)` after the token mints successfully.
- `backend/src/services/voice-session-twilio.ts` — same pattern (the voice adapter's `getJoinToken` defers to the video adapter; either thread the emit through the deferred call OR add it on the voice adapter's side and skip on the video side — pick the cleaner option at PR-time).
- `backend/src/services/text-session-supabase.ts` — extend `getJoinToken` similarly.

**Tests:**

- `backend/tests/unit/services/consultation-message-service-system-emitter.test.ts` — new.
- `backend/tests/unit/services/consultation-session-service.test.ts` — extend with the `endSession` emits-banner assertions.
- `backend/tests/unit/services/text-session-supabase.test.ts` — extend with the `getJoinToken` emits-banner assertions.
- `backend/tests/unit/services/video-session-twilio.test.ts` — extend with the `getJoinToken` emits-banner assertions.
- `backend/tests/unit/services/voice-session-twilio.test.ts` — extend with the `getJoinToken` emits-banner assertions (or assert the deferred-to-video-adapter path doesn't double-emit, depending on which wire-up shape is picked).

**No frontend changes** (Tasks 38 + 24c render system rows in `<TextConsultRoom>`).

**No new migrations. No new env vars.**

---

## Notes / open decisions

1. **Why a central `emitSystemMessage` instead of letting each plan call `text-session-supabase.ts#sendMessage` directly?** Three reasons:
   - **One row-shape contract.** The Task 39 row-shape CHECK has specific requirements for `kind = 'system'` rows (must have `system_event`, `sender_role = 'system'`, `sender_id = SYSTEM_SENDER_ID`). Burying that knowledge in the central writer means every caller passes only what's semantically meaningful (`event` + `body`); the writer fills in the rest. Without this layer, every emitter site reinvents the row shape and one of them eventually gets it wrong.
   - **Centralized dedup.** The 60s in-process dedup is a single concern; spreading it across 5+ call sites duplicates the LRU logic.
   - **Future cross-cutting concerns** (rate limiting, telemetry, i18n lookup, webhook-driven promotion) all become a one-file change.
2. **Why dedup keyed on `correlationId` instead of `(sessionId, event)` alone?** `(sessionId, event)` is too aggressive — `consult_started` should be at-most-once per session (correct), but `party_joined` should fire once per party per session (incorrect under `(sessionId, event)`). The `correlationId` lets the caller decide what counts as a duplicate. For `emitConsultStarted` the helper passes `correlationId = 'consult_started'` (the event tag itself), which collapses to "at most one per 60s per session" — correct. For `emitPartyJoined` the helper passes `correlationId = 'party_joined:doctor'` or `'party_joined:patient'`, which collapses to "at most one per 60s per session per role" — correct.
3. **Why not persist `meta` in v1?** Plans 07/08/09 want it; this plan can ship the column additively when those plans need it. Persisting an empty JSONB column for every system row in v1 is wasted bytes + a small index/CHECK overhead for zero v1 readers. Captured in Out of scope as the trigger for the follow-up.
4. **Why `Promise<void>` from the per-event helpers (vs the central writer's richer return)?** The helpers are fire-and-forget by contract — the lifecycle code (Task 36's `createSession`, this task's `endSession`, the various `getJoinToken` paths) doesn't read the result. The richer return shape from the central writer is for tests + for any future caller that genuinely needs the persisted ID.
5. **Why `Asia/Kolkata` as the TZ fallback?** Matches `dm-copy.ts`'s existing convention and "code global, start India" Principle 2. If a doctor's timezone is missing entirely, defaulting to the most likely TZ is more useful than `'UTC'` (which would render `'09:00.'` for a 14:30 IST consult and confuse both parties). Once doctor profiles consistently carry `timezone`, the fallback becomes dead code.
6. **`SYSTEM_SENDER_ID = '00000000-0000-0000-0000-000000000000'`.** Pinned in tests so a future "let's use a real auto-generated UUID" refactor breaks loudly. The constant is a deliberate marker — anyone debugging "why does this row have sender_id zero?" finds the comment in `consultation-message-service.ts` immediately.
7. **Voice / Video `getJoinToken` — which adapter emits `party_joined`?** Two options: (a) emit from each adapter's `getJoinToken`, accepting that the voice adapter delegates to the video adapter so a voice consult would emit twice if both layers emit; (b) emit only from the video adapter's `getJoinToken`, and let the voice adapter's deferral inherit the emit. **Pick (b)** — single source, no double-banner. The voice adapter's tests assert the no-double-emit behavior. Document in the voice adapter's JSDoc.
8. **What if Task 36 ships before Task 37?** Task 36 cannot complete without `emitConsultStarted` existing — they're sibling tasks that ideally land in the same PR sequence. If schedule pressure forces Task 36 first, it can stub `emitConsultStarted` to a `console.info` call and replace with the real helper when Task 37 lands. Document this fallback in Task 36 as well.
9. **`endSession` body of "Consultation ended at HH:MM."** is a deliberately minimal banner. Plan 07 (post-consult experience) may want to enrich it with "Recording is now available" or "Prescription delivered" once those flows ship; the `summary` parameter on `emitConsultEnded` exists exactly for this future override.
10. **No `system_event = 'session_ready'`** — the consult-ready DM ping is a fan-out concern (Task 16's `sendConsultationReadyToPatient`), not an in-chat banner. The companion chat doesn't exist yet at the moment a session goes ready (it's provisioned at create-time per Task 36). If a future plan wants a "Session is ready — waiting for the patient to join" banner, it ships its own emit-helper here.

---

## References

- **Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md) — System-message emitter contract section (the inline TypeScript snippet in the plan is the design source).
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 9 LOCKED.
- **Task 39 — schema this writer targets:** [task-39-consultation-messages-attachments-and-system-rows.md](./task-39-consultation-messages-attachments-and-system-rows.md)
- **Task 36 — first caller of `emitConsultStarted`:** [task-36-companion-channel-lifecycle-hook.md](./task-36-companion-channel-lifecycle-hook.md)
- **Task 38 — `<VideoRoom>` chat panel that renders system rows:** [task-38-video-room-companion-chat-panel.md](./task-38-video-room-companion-chat-panel.md)
- **Task 24c — `<VoiceConsultRoom>` chat canvas that renders system rows:** [task-24c-voice-consult-room-companion-chat-mount.md](./task-24c-voice-consult-room-companion-chat-mount.md)
- **Plan 04 Task 18 — `text-session-supabase.ts#sendMessage` (parallel write path; the central writer here is its sibling):** [task-18-text-session-supabase-adapter.md](./task-18-text-session-supabase-adapter.md)
- **Existing message-service file (this task extends):** `backend/src/services/consultation-message-service.ts:78` (`listMessagesForSession`).
- **Existing facade (this task extends `endSession`):** `backend/src/services/consultation-session-service.ts:112-131`.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Code-complete 2026-04-19 — see Decision log. Ready to land immediately after Task 39 (which shipped 2026-04-19).

---

## Decision log — 2026-04-19 (code-complete)

### Shipped

**Emitter surface — `backend/src/services/consultation-message-service.ts` (+~300 lines):**

- `SystemEvent` union (all 9 canonical tags — Plan 06 uses 3, Plans 07/08/09 own the other 6 additively).
- `SYSTEM_SENDER_ID = '00000000-0000-0000-0000-000000000000'` — canonical home (re-exported from `text-session-supabase.ts` for pre-Task-37 callers).
- `emitSystemMessage(input)` — central writer. Service-role insert, in-process LRU dedup keyed on `(sessionId, event, correlationId)` with 60 s TTL, Postgres `23514` CHECK-violation swallow → `{ skipped, reason: 'row_shape_check_failed' }`, admin-unavailable swallow → `{ skipped, reason: 'admin_unavailable' }`, all other insert errors swallowed at `warn` (contract: never throws — callers rely on this for fire-and-forget).
- `formatTimeInDoctorTz(date, tz)` — `Intl.DateTimeFormat` wrapper returning zero-padded 24 h `HH:MM`; falls back to `Asia/Kolkata` on missing/invalid timezone (matches `dm-copy.ts` / `appointment-service.ts` convention).
- `loadDoctorTzForSession(sessionId)` (internal) — two-hop admin lookup `consultation_sessions` → `doctor_settings.timezone` (NOT `doctors.timezone` — the task doc's hint on `doctors.timezone` was incorrect; the actual source of truth is `doctor_settings.timezone`, matching the rest of the codebase). Defaults to `Asia/Kolkata` on any miss.
- `emitConsultStarted(sessionId)` — body `"Consultation started at HH:MM."` in doctor TZ. Helper declared but **not yet wired** into `consultation-session-service.ts#createSession` — Task 36 owns that wire-up (per this task's Acceptance: "Document in Task 37 that the helper exists but is not yet invoked from `createSession` until Task 36 lands").
- `emitConsultEnded(sessionId, summary?)` — default body `"Consultation ended at HH:MM."`; `summary` override rendered verbatim. **Wired directly from `consultation-session-service.ts#endSession` (this task).**
- `emitPartyJoined(sessionId, role)` — body `"Doctor joined the consult."` / `"Patient joined the consult."`. Dedup `correlationId = 'party_joined:doctor'` / `'party_joined:patient'` so the two roles never collapse.
- `__resetSystemEmitterDedupForTests()` — test-only hook.

**Wire-ups shipped in this task:**

- `consultation-session-service.ts#endSession` — calls `emitConsultEnded(session.id)` after the status flip, wrapped in `try/catch` (belt-and-suspenders on top of the helper's own error-swallow contract). The no-op "session already ended" path is NOT banner'd.
- `video-session-twilio.ts#getJoinToken` — calls `emitPartyJoined(input.sessionId, input.role)` after the token mints. Gated on `input.sessionId` (the legacy lazy-write bridge can call without a session id; skip silently rather than fail). Fires for BOTH video and voice (voice's `getJoinToken` delegates here — see below).
- `text-session-supabase.ts#getJoinToken` — same pattern; text's `getJoinToken` always has `input.sessionId` (throws without it per Task 18 contract), so the guard is redundant but harmless.
- `voice-session-twilio.ts#getJoinToken` — intentionally **not** modified. Delegates to the video adapter per Notes #7's design (single-source, no double-banner). JSDoc updated to pin this contract.

**Tests — 1 new file, 4 updated, +31 tests:**

- `backend/tests/unit/services/consultation-message-service-system-emitter.test.ts` (**NEW**, 22 tests) — emitter happy path, dedup within/across 60 s window, cross-role dedup key isolation, 23514 swallow, admin-unavailable swallow, generic DB error swallow, missing-input guards, pinned canonical body snapshots for all three helpers, fixed-TZ fixtures (`09:00Z → 14:30 Asia/Kolkata`), `SYSTEM_SENDER_ID` drift guard, "helpers swallow errors" assertions via `mockImplementation(throw)`.
- `consultation-session-service.test.ts` — 3 new tests (`endSession` fires `emitConsultEnded` exactly once on happy path, does NOT fire on already-ended idempotent path, swallows a rejected `emitConsultEnded`).
- `video-session-twilio.test.ts` — 3 new tests (`getJoinToken` fires for doctor, fires for patient, does NOT fire when `sessionId` absent).
- `voice-session-twilio.test.ts` — 1 new test (`getJoinToken` does NOT call `emitPartyJoined` directly — regression guard against a future maintainer adding a second emit that would double-banner voice consults).
- `text-session-supabase.test.ts` — 2 new tests (`getJoinToken` fires for doctor, fires for patient).

**Verification run:**

- `npx tsc --noEmit` → exit 0 (zero errors).
- Full backend suite `npx jest` → **108 / 108 suites passed**, **1,427 / 1,427 tests passed** (was 107 / 1,396 pre-task).
- `ReadLints` on all touched files → clean.

### Scope clarifications

1. **`SYSTEM_SENDER_ID` canonical home moved from `text-session-supabase.ts` → `consultation-message-service.ts`.** Task 39 put the constant in `text-session-supabase.ts` (the insert-helper module) as a provisional home. This task moves the canonical declaration to `consultation-message-service.ts` per the Acceptance bullet list and re-exports it from `text-session-supabase.ts` (via `export { SYSTEM_SENDER_ID } from './consultation-message-service'`) so the Task 39 test suite keeps importing from the legacy path. No breakage.
2. **`doctors.timezone` → `doctor_settings.timezone`.** The task doc's Acceptance bullet on "Canonical body strings" said `"read from the consultation_sessions → doctors.timezone join"`. A quick grep showed the actual source of truth is `doctor_settings.timezone` (per `appointment-service.ts:182`, `notification-service.ts:187`, and 6 other sites). Shipped as `doctor_settings` two-hop lookup; the JSDoc pins the convention match with `dm-copy.ts`.
3. **Acceptance bullet "error code `23514`".** Shipped exactly as written. Any other Postgres error code falls through to the "generic DB error" swallow path (log at `warn`, return `{ skipped, reason: 'row_shape_check_failed' }`) rather than throwing — keeps the best-effort contract simple.
4. **`emitConsultStarted` NOT yet called.** The helper is shipped, exported, and tested here, but the actual `createSession` call-site is owned by Task 36 per the Acceptance table. `consultation-session-service.ts#createSession` is unchanged by this task. When Task 36 lands, it just needs `import { emitConsultStarted } from './consultation-message-service'` + a single `try/catch` wrap after `persistSessionRow(...)`; the writer is already pinned by tests.
5. **`meta` parameter on `emitSystemMessage`** — accepted in the signature, stripped before insert (Out-of-scope bullet: "Persisting `meta` in the DB"). Plans 07/08/09 can pass context now; a `system_meta JSONB` additive migration ships when a real consumer needs it.

### Merge-time checklist (human review before approval)

- [ ] Verify `doctor_settings.timezone` column exists in your environment (should — it's populated in 6+ code sites). If not, the `emit*` helpers will fall back to `Asia/Kolkata` silently, which is correct behavior but a signal that onboarding should be fixed.
- [ ] Verify the cron / lifecycle hook in Task 36 can import `emitConsultStarted` cleanly once both PRs merge. No coordinating change needed; it's a pure additive import.
- [ ] Optional smoke test: in staging, end a live text session and confirm `SELECT body, system_event FROM consultation_messages WHERE session_id = '...' AND kind = 'system' ORDER BY created_at` shows the three banners (`party_joined` doctor + `party_joined` patient + `consult_ended`) with sensible `HH:MM` values.

### Dependencies status

- **Task 39** — HARD dependency. Landed 2026-04-19 (schema + row-shape CHECK + `senderRole='system'` widening). ✅ Satisfied.
- **Task 36** — sibling. Still Not-started. Task 37 ships `emitConsultStarted` as a ready-to-consume helper; Task 36 just wires the single call site. Landing order is 37-before-36 now (37 is merged code-complete; 36 picks up the helper).
- **Plans 07 / 08 / 09 emit-helpers** — out of scope here; the `SystemEvent` union exported here is the type-shape contract those plans consume without modification.

---
