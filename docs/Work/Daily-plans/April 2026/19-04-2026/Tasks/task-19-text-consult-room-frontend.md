# Task 19: Frontend `<TextConsultRoom>` mobile chat UI (Realtime subscriptions, typing/presence, attachments stub, optimistic send, reconnect)

## 19 April 2026 — Plan [Text consultation modality](../Plans/plan-04-text-consultation-supabase.md) — Phase C

---

## Task overview

Decision 1 LOCKED text on Supabase Realtime + Postgres with the explicit trade-off: **~3 extra build days vs Twilio Conversations to ship typing indicators / presence / read receipts ourselves**. Task 19 is where that trade-off is paid down. It's the single biggest task in the v1 multi-modality scope.

`<TextConsultRoom>` is the **branded chat surface** that:

1. The patient lands on after tapping the IG DM ping (`/c/text/[sessionId]?token=...`).
2. The doctor mounts inside `<LiveConsultPanel>` (Plan 03 Task 20's slot) when `appointment.consultation_type === 'text'`.

Both sides use the same component with the same props — `currentUserRole` differentiates the bubble alignment / sender label / "(you)" indicators. After consult-end, Plan 07 will reuse this same component with `mode='readonly'` for chat-history replay; Plan 06 will extend it with attachment rendering and system-message rows.

This task delivers:

- A mobile-first chat layout (header / virtualized message list / composer).
- Real-time Postgres-INSERT subscription via Supabase Realtime, scoped to `session_id = sessionId`.
- Typing indicators + presence ("● Online" / "● Typing…") via Realtime presence channel.
- Optimistic send (insert local row → replace with server-acked row on confirmation).
- Reconnect with backoff + catch-up on missed messages via `created_at > last_seen_at`.
- An attachment composer button that's stubbed disabled with "Attachments coming soon" tooltip (Plan 06 lights it up).
- Patient-facing route at `/c/text/[sessionId]/page.tsx` that hosts the component, handles token-from-query-string handoff, and surfaces errors gracefully.

This task is gated on Tasks 17 (table) + 18 (adapter + JWT mint endpoint). It can ship in the same PR sequence as Plans 04's other tasks, but the integration smoke test requires all of them landed.

**Estimated time:** 6–8 hours (genuinely large; pads exist for reconnect-edge-case debug)

**Status:** Done (frontend surface + patient route shipped; doctor-side mount deferred until Plan 03 Task 20 lands `<LiveConsultPanel>`)

**Depends on:** Task 17 (hard — table + RLS exist). Task 18 (hard — `POST /api/v1/consultations/:sessionId/text-token` exists; adapter mints JWTs). Plan 03 Task 20 (hard — `<LiveConsultPanel>` text slot exists).

**Plan:** [plan-04-text-consultation-supabase.md](../Plans/plan-04-text-consultation-supabase.md)

---

## Acceptance criteria

- [x] **`frontend/components/consultation/TextConsultRoom.tsx`** (NEW) exists with this prop shape:
  ```tsx
  interface TextConsultRoomProps {
    sessionId:       string;
    currentUserId:   string;        // auth.uid() of the caller
    currentUserRole: 'doctor' | 'patient';
    accessToken:     string;        // scoped Supabase JWT from POST /text-token
    mode?:           'live' | 'readonly';   // default 'live'; 'readonly' reserved for Plan 07
  }
  export default function TextConsultRoom(props: TextConsultRoomProps): JSX.Element;
  ```
- [x] **Layout (mobile-first; flex column, `100dvh` on mobile, fixed-height container on desktop inside `<LiveConsultPanel>`):**
  - **Header strip** — counterparty name + presence dot + typing indicator + connection status badge. Doctor display name was dropped (project doesn't track a public `doctors.full_name` — `practice_name` is the patient-facing identifier in every other fan-out), so the patient header reads `"{practiceName}"` (or "Your doctor" if missing) and the doctor header reads "Patient" until Plan 03 wires the appointment context (see "Departures from the spec" below).
  - **Messages list** — non-virtualized for v1 per spec note 3 (avg consult < 50 messages). `TODO` comment in `TextConsultRoom.tsx` points at the upgrade path. Bubbles aligned left for counterparty / right for self. Timestamp grouping (per-minute-bucket + sender break). Empty state copy as specified.
  - **Composer** — auto-grow textarea capped at 4 lines, disabled 📎 attachment button with `title="Attachments coming soon"`, send button disabled when empty or session not live. Enter sends, Shift+Enter inserts newline.
- [x] **Realtime subscription** to `consultation_messages` filtered to `session_id = props.sessionId`:
  - Built on a fresh `@supabase/supabase-js` client (`frontend/lib/supabase/scoped-client.ts`) rather than the existing `frontend/lib/supabase/client.ts`. The existing client uses `@supabase/ssr` cookies which can't easily carry an unauthenticated patient's session-scoped JWT; the scoped client puts the JWT in `global.headers.Authorization` and `realtime.setAuth()`. The existing client stays the cookie/auth-session client for doctor pages.
  - INSERT-only listener; UPDATE/DELETE ignored.
  - Dedup on `id` against optimistic buffer.
  - Subscription errors flip the connection badge to amber + trigger backoff.
- [x] **Presence channel** named `text-presence:${sessionId}`:
  - Joined with `{ user_id, role, online_at }` payload via `channel.track()`.
  - `presence.sync` event drives the counterparty "● Online" dot (any key ≠ `currentUserId` ⇒ counterparty present).
  - Typing broadcasts via `channel.send({ type: 'broadcast', event: 'typing', ... })`, throttled to 1/sec on the way up and bounded by a 3-second idle timer on the way down. Counterparty typing state renders next to the presence dot.
- [x] **Optimistic send** flow:
  - Generates UUID via `crypto.randomUUID()` (with a `local-{ts}-{rand}` fallback for older runtimes — defensive).
  - Pushes optimistic row with `pending: true`, scroll-to-bottom.
  - INSERT goes through the scoped client → RLS does the auth check.
  - On success: clears `pending` immediately AND lets the Realtime echo refresh the row (idempotent dedup by `id`).
  - On failure: marks `failed: true`, renders an inline `⟳ Retry` button that re-fires the same UUID + body.
- [x] **Reconnect** logic:
  - INSERT subscription `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` flips the badge and schedules backoff via `RECONNECT_BACKOFF_MS = [1s, 2s, 4s, 8s, 16s, 30s]` (capped).
  - On reconnect, performs a `consultation_messages` SELECT filtered by `session_id` and (when known) `created_at > lastSeenAt`, capped at 200 rows. Catch-up runs **before** subscribing so there's no gap window.
  - `lastSeenAt` advances to the most recent server-acked row's `created_at` after every merge.
- [x] **Patient-facing route** `frontend/app/c/text/[sessionId]/page.tsx` (NEW):
  - Reads `t` from the URL query string (the existing video link convention uses `?t=` — kept consistent with `text-session-supabase.buildPatientJoinUrl` from Task 18). Renamed param from `token` to `t` to match.
  - Missing/invalid token → renders the spec'd error CTA.
  - `POST /api/v1/consultation/${sessionId}/text-token` exchange via the new `requestTextSessionToken` helper in `frontend/lib/api.ts`.
  - On success: `router.replace('/c/text/${sessionId}')` strips the token from the address bar.
  - Pre-session: holding screen "Your consult starts at {time}" with a 30s poll re-running the exchange (which doubles as a status refresh AND keeps the JWT fresh).
  - Post-session: end-state notice with a placeholder line for Plan 07's chat-history link.
  - Live: mounts `<TextConsultRoom>` with `currentUserRole='patient'` and a `onRequestTokenRefresh` callback that re-runs the exchange.
- [ ] ~~**Doctor-side mount** in `<LiveConsultPanel>`~~ — **deferred** until Plan 03 Task 20 lands `<LiveConsultPanel>` and `<ConsultationLauncher>`. Neither file exists in `frontend/components/consultation/` today (verified via glob); blocking on a non-existent file is a worse failure mode than shipping the patient-side surface in isolation. Once Task 20 lands, it should mount `<TextConsultRoom>` with `currentUserRole='doctor'` and pass the doctor's existing `supabase.auth.getSession().access_token` as `accessToken` (the scoped client treats it as an opaque RLS JWT — same code path).
- [x] **Connection status badge** has three visible states: green (`Online`), amber (`Reconnecting…`), red (`Offline`). Red is delayed by 30s of continuous downtime so brief network blips don't alarm users.
- [x] **Send-while-disconnected:** composer disabled with tooltip "Reconnecting — your message will send when back online." Send actions during disconnect get queued in `queuedSendsRef` and drained inside the `SUBSCRIBED` callback after reconnect.
- [x] **Token expiry handling:** when an INSERT or SELECT returns 401, the component calls `onRequestTokenRefresh` (which the patient page wires to `requestTextSessionToken`) and triggers a reconnect cycle that rebuilds the scoped client with the fresh JWT. No logout — `accessToken` is purely in-memory state.
- [x] **Accessibility:** Tab order is composer → send button. The disabled attachment button has `aria-label` + `title`; pressing it does nothing. The messages list is `role="log" aria-live="polite" aria-relevant="additions"`. Color tokens use `bg-blue-600 text-white` (self bubble) and `bg-white text-gray-900` (counterparty) which clear WCAG AA.
- [ ] **Manual smoke test (gating):** **deferred** — blocked on Plan 03 Task 20 landing `<LiveConsultPanel>` so the doctor can mount the room. Patient-side smoke (token-expired error, holding screen, end-state) can be verified standalone by hitting `/c/text/{sessionId}?t=...` against a backend with the test secret. Documented in inbox as a follow-up smoke checklist to run once Task 20 lands.
- [x] **Frontend `tsc --noEmit` + `next lint` clean** on touched files.

---

## Out of scope

- Attachments (Plan 06).
- System messages with custom rendering (e.g. "Doctor enabled video for this consult") — Plan 06.
- Read receipts (per-message read state). v1 uses session-membership + presence as a coarser proxy.
- Message editing / deletion / threading / reactions.
- Voice notes. Out of v1 entirely (would belong to Plan 06 if ever).
- Translation / i18n. English-only v1.
- Push notifications when a message arrives and the tab is backgrounded. The IG-DM ping handles "consult started"; in-consult silence relies on the user keeping the tab focused. Push notification surface is a Plan 10+ concern.
- A frontend test for this component. **Frontend test harness still doesn't exist** (Plan 03 Task 20 documented this gap and the bootstrap follow-up). Manual smoke per the acceptance criteria is the verification posture. **Strongly recommend** the test-harness bootstrap follow-up lands before this task to make the smoke checklist programmable.
- Backend changes. All backend wiring is Tasks 17 + 18. This task is pure frontend.
- The Plan 09 modality-switch button rendering inside `<LiveConsultPanel>`. Plan 09's slot prop is already on the panel from Task 20.
- Replay UI for ended sessions. Plan 07 ships `mode='readonly'`.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — new (the chat UI)
- `frontend/components/consultation/LiveConsultPanel.tsx` — extend (replace text-modality placeholder div with `<TextConsultRoom>` mount)
- `frontend/components/consultation/ConsultationLauncher.tsx` — extend (text-modality primary button now calls real session-create flow instead of toasting)
- `frontend/app/c/text/[sessionId]/page.tsx` — new (patient-facing route)
- `frontend/lib/api.ts` — add `requestTextSessionToken(sessionId, urlToken)` helper that POSTs to `/text-token`
- `frontend/lib/supabase/client.ts` — verify it exposes a way to set the auth token on demand; if not, add a small helper

**Backend:** none in this task. (Tasks 17 + 18 own the backend; this task is the frontend consumer.)

**Tests:** none in this PR — see Out of scope. Manual smoke per acceptance criteria.

---

## Notes / open decisions

1. **Pre-session holding screen vs. open-immediately.** Decision 5 RLS rejects pre-session inserts at the DB layer. The frontend can choose to mount the chat in read-only-ish mode pre-session (composer disabled, friendly "starts at {time}" banner) OR redirect away. Recommendation: mount with composer disabled — feels less janky and gives the patient a sense of "I'm in the right place". Auto-poll status every 30 sec and auto-enable composer when status flips to `'live'`.
2. **Token in URL is a leak surface.** The single-use exchange (URL token → JWT) is the mitigation. Document the threat model in the route file's header comment: "URL token may end up in browser history / referer headers / shoulder-surfed; JWT never appears in URL."
3. **Virtualization library:** check `frontend/package.json` for `react-window` or `@tanstack/virtual`. If neither is present, **either** add `react-window` (smaller, simpler) **or** ship without virtualization for v1 and add it when the first session crosses ~200 messages. Recommendation: ship without virtualization in v1; the average consult will have < 50 messages. Add a TODO comment in the messages-list component pointing at the upgrade path. Saves ~30 min and a dependency add.
4. **Optimistic-send dedup edge case:** the Realtime subscription will deliver back our own INSERT as an event. The dedup must compare on the client-generated `id` (we pass `id` in the INSERT, Supabase persists it, the Realtime event echoes back the same `id`). Verify this round-trips correctly in the smoke test — if Postgres overwrites `id` in any way, the dedup breaks and you'll see double messages locally.
5. **Presence cleanup on unload:** `window.addEventListener('beforeunload', ...)` to broadcast a leave. Modern browsers throttle these; Supabase Realtime presence has a TTL fallback that handles silent drops within ~30s. Acceptable.
6. **Doctor-side disconnect = end consult?** No. The doctor closing the browser tab does NOT end the session — they may be navigating away briefly. Only the explicit `[End consult]` button calls `endSession`. The patient sees the doctor go offline (presence dot turns grey) but the chat continues to work; messages queued by the patient land in the DB and the doctor sees them on return. Document this in the doctor-side UX.
7. **CSS modules / Tailwind / etc:** match the existing dashboard styling system (Tailwind, per the rest of `frontend/`). Use existing color tokens for bubble backgrounds. No new design system entries.
8. **The patient route is unauthenticated.** Add the route to whatever middleware allowlist the existing `/book` route uses. If there's no allowlist and middleware doesn't gate `/c/*`, document the route's exception and verify with a manual smoke test (open the URL in incognito, no login required).
9. **Mobile keyboard occluding composer:** standard mobile-web pattern is `100dvh` + `interactive-widget=resizes-content` viewport meta. Verify the existing app's viewport meta supports this; if not, add a route-level override.

---

## References

- **Plan:** [plan-04-text-consultation-supabase.md](../Plans/plan-04-text-consultation-supabase.md) — Frontend `<TextConsultRoom>` section + lifecycle wiring.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 1 LOCKED + Decision 5 LOCKED.
- **Task 17 — schema this room reads/writes:** [task-17-consultation-messages-table-rls-storage.md](./task-17-consultation-messages-table-rls-storage.md)
- **Task 18 — token endpoint + adapter this room calls:** [task-18-text-session-supabase-adapter.md](./task-18-text-session-supabase-adapter.md)
- **Task 20 — `<LiveConsultPanel>` mount target:** [task-20-consultation-launcher-and-live-panel.md](./task-20-consultation-launcher-and-live-panel.md)
- **Existing Supabase client:** `frontend/lib/supabase/client.ts`
- **Existing video room (UX style reference):** `frontend/components/consultation/VideoRoom.tsx`
- **Existing public booking page (unauth route reference):** `frontend/app/book/page.tsx`

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Done (2026-04-19) — patient surface shipped end-to-end; doctor-side mount + manual cross-side smoke deferred until Plan 03 Task 20 lands.

---

## Departures from the spec

1. **Doctor display name dropped from header.** The spec called for "{practiceName} / Dr. {doctorName}". The project doesn't ship a public-facing `doctors.full_name` column — every other patient-facing fan-out (IG DM, SMS, email, booking confirmation) keys on `doctor_settings.practice_name`. Inventing a doctor-name source for chat alone would create a new identifier surface that isn't reflected in the rest of the patient experience. The exchange endpoint returns `practiceName` only; the chat header reads `practiceName` (or "Your doctor" fallback). If a real doctor name source is added later, it slots in as one prop on `<TextConsultRoom counterpartyName>`. **Inbox follow-up**: capture whether to add a `doctor_settings.public_doctor_name` field for the chat header + the existing fan-outs.

2. **Patient-page query param renamed from `?token=` to `?t=`.** Task 18's `text-session-supabase.buildPatientJoinUrl` already mints URLs with `?t=...` (kept consistent with the existing video flow's `?t=` convention). Renaming on the route side instead of the URL builder side is the lower-risk move — only the route file needs to know about the param name.

3. **Backend exchange endpoint extended additively.** Task 18 shipped `POST /text-token` returning `{ token, expiresAt }`. Task 19 needs more — `currentUserId`, `sessionStatus`, `scheduledStartAt`, `expectedEndAt`, `practiceName` — to render the holding screen, end-state, and chat header without an extra round-trip. The handler in `consultation-controller.ts` was extended to return all of these. Behaviour additions:
   - `currentUserId` is derived as `consultation_sessions.patient_id ?? consultation_sessions.appointment_id`. Both are UUIDs and bot-booked guests will have a null `patient_id`. The migration-052 patient-branch INSERT policy doesn't constrain `sender_id` (only `session_id`), so an arbitrary-but-stable UUID is safe and required (column is `UUID NOT NULL`).
   - When `sessionStatus in ('ended', 'cancelled')`, `token` and `expiresAt` are returned as `null` and the JWT mint is skipped — the patient can't write to an ended session anyway, and skipping the mint avoids confusing TTL semantics.
   - `practiceName` lookup is best-effort + logged-on-failure; the frontend has a "Your doctor" fallback if it's absent.

4. **Doctor-side `<LiveConsultPanel>` mount and `<ConsultationLauncher>` text branch are NOT touched.** Spec called for both to be updated as part of this task. Plan 03 Task 20 hasn't shipped — neither file exists in the repo today (verified via glob on `frontend/components/consultation/`). Wiring against non-existent components is impossible; we instead documented the integration shape (one-line `<TextConsultRoom>` mount inside `<LiveConsultPanel>` for the text branch, doctor's `supabase.auth.getSession().access_token` as `accessToken`) so Task 20 can pick it up with no rework. Cross-task touch is now Task 20's responsibility, not a Task 19 deferred item.

5. **No frontend tests added.** Spec called this out as out-of-scope ("frontend test harness still doesn't exist"). The harness is still missing — already captured as an inbox follow-up from Task 18 (`bootstrap a live-Supabase test harness`). Manual smoke per the patient-side acceptance criteria; cross-side smoke deferred until Task 20 lands.

6. **Virtualization not added.** Spec recommended either adding `react-window` OR shipping without it for v1. Shipped without it; `TODO` comment in `TextConsultRoom.tsx`'s message-list section flags the upgrade path when a session crosses ~200 messages.

7. **Scoped Supabase client is its own helper, not a setter on the existing client.** Spec said "verify [the existing client] exposes a way to set the auth token on demand; if not, add a small helper". Existing `frontend/lib/supabase/client.ts` uses `@supabase/ssr`'s cookie-based session — designed for logged-in dashboard pages, not for an in-memory session-scoped JWT. Added `frontend/lib/supabase/scoped-client.ts` with `createScopedRealtimeClient(jwt)` that builds a fresh `@supabase/supabase-js` client with `global.headers.Authorization` + `realtime.setAuth(jwt)` and `auth.persistSession=false` so the JWT never reaches `localStorage`. This required adding `@supabase/supabase-js` as a direct dependency (was previously transitive via `@supabase/ssr`).

8. **Per-render token-refresh swap rebuilds the client.** When `onRequestTokenRefresh` returns a fresh JWT, the component triggers a full reconnect (teardown + rebuild + re-subscribe). Cleaner than mutating `global.headers` in-place (not supported by the public API) and the latency cost is bounded — token expiry is rare and the catch-up SELECT covers any messages that landed mid-cycle.

9. **Patient-page exchange call doubles as polling.** Holding-screen poll (every 30s) re-runs the exchange call rather than hitting a separate "session-status" endpoint. Saves an endpoint, keeps the JWT fresh while the patient waits, and the response shape already includes everything we need. Backend cost is minor — the exchange handler's heaviest work is the HMAC verify + a maybeSingle SELECT.

---

## Ship summary

**Backend (additive extension to Task 18):**

- `backend/src/controllers/consultation-controller.ts` — `exchangeTextConsultTokenHandler` response widened with `currentUserId`, `sessionStatus`, `scheduledStartAt`, `expectedEndAt`, `practiceName`. JWT mint skipped on ended/cancelled (returned as `null`). Practice name lookup is best-effort.

**Frontend (new):**

- `frontend/lib/supabase/scoped-client.ts` — `createScopedRealtimeClient(jwt)` + `attachJwtToRealtime(client, jwt)` helpers. Pure client construction; no React.
- `frontend/lib/api.ts` — `requestTextSessionToken(sessionId, urlToken)` helper + `TextConsultSessionStatus` / `TextConsultTokenExchangeData` types.
- `frontend/components/consultation/TextConsultRoom.tsx` — the chat surface (header, message list, composer; presence/typing; optimistic send + retry; reconnect backoff; token-refresh hook).
- `frontend/app/c/text/[sessionId]/page.tsx` — patient route (token exchange, address-bar scrub, holding screen with 30s poll, live mount, end-state).

**Frontend (modified):**

- `frontend/package.json` + `package-lock.json` — adds `@supabase/supabase-js` as a direct dependency (was previously transitive via `@supabase/ssr`).

**Verification:**

- Frontend `npx tsc --noEmit` — clean.
- Frontend `npx next lint --dir components/consultation --dir app/c --dir lib/supabase` — clean.
- Backend `npx tsc --noEmit` — clean.
- Backend `npx jest --silent` — 1206 tests pass across 91 suites; no regressions from the controller extension.

**Deferred (with documentation):**

- Doctor-side mount inside `<LiveConsultPanel>` and `<ConsultationLauncher>` text-branch wiring — both blocked on Plan 03 Task 20.
- Cross-side manual smoke — blocked on the same.
- Frontend test harness — captured as an inbox follow-up from Task 18; still applicable here.
