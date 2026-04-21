# Task 24 (split): Frontend `<VoiceConsultRoom>` audio-only UI (mute / speaker / end controls, keep-screen-awake, reconnect, "patient hasn't joined" surface, NO companion chat)

## 19 April 2026 — Plan [Voice consultation modality](../Plans/plan-05-voice-consultation-twilio.md) — Phase B

---

## Task overview

Decision 2 LOCKED voice on Twilio Video audio-only mode. Task 23 ships the backend adapter; Task 24 ships the frontend `<VoiceConsultRoom>` audio-only UI that mounts on **both** sides:

1. The patient lands on it after tapping the IG DM ping (`/c/voice/[sessionId]?t=...`).
2. The doctor mounts it inside `<LiveConsultPanel>` (Plan 03 Task 20's slot) when `appointment.consultation_type === 'voice'`.

Both sides use the same component with the same props — `currentUserRole` differentiates the header label, the doctor-only "patient hasn't joined" surface, and the resend-link buttons.

**Master-plan task split note:** the master plan's Task 24 originally bundled "audio-only UI **+** companion text panel auto-opened" (per Decision 9). For sequencing reasons we **split** Task 24 — this task ships the audio-only UI; **Plan 06 ships the companion chat panel** that fills the main canvas when voice (and video) consults run. The split is documented in Plan 05's Tasks table and in Plan 06.

The intentional empty visual region in the middle of the layout (where Plan 06 will drop the companion chat) is a deliberate breathing area in v1 — not a missing feature. A `data-slot="companion-chat"` placeholder marks the future mount point so Plan 06 is a literal swap, not a layout rewrite.

This task delivers:

- A mobile-first audio-only layout (header / big visual indicator / mute-speaker-end controls), mirroring `<VideoRoom>`'s connection lifecycle but with no video tiles.
- Twilio Video JS SDK connection with **audio publish only** (no `createLocalTracks` for video; only `createLocalAudioTrack`).
- `keep-screen-awake` (Wake Lock API) while the session is connected so the patient's phone doesn't sleep mid-call.
- Auto-reconnect with backoff on transient network drops, mirroring `<VideoRoom>`'s patterns.
- Doctor-side "patient hasn't joined yet" surface that appears after 3 minutes with `[Resend link via SMS]` + `[Resend link via IG DM]` buttons that call existing notification helpers.
- A patient-facing route at `frontend/app/c/voice/[sessionId]/page.tsx` that handles the HMAC-token-from-URL handoff (mirrors the existing video patient join flow, NOT the Plan 04 text-token JWT-exchange — voice uses the same Twilio access token shape as video, fetched via `getConsultationToken` or a new `getVoiceConsultationToken` helper depending on what shipping shape is cleanest).
- An animated ring around a placeholder doctor avatar (Apple-style) as the "big visual indicator" instead of a real-time waveform — saves the waveform decision for v2 (per the plan's open decision #3).
- `<LiveConsultPanel>` voice branch wired up on the doctor side (the equivalent of Task 19's deferred doctor-side mount, except this time `<LiveConsultPanel>` already exists from Task 20).

This task is gated on Task 23 (the backend mints the Twilio access tokens this component consumes) and on Plan 03 Task 20 (which already shipped — `<LiveConsultPanel>` exists).

**Estimated time:** ~3-4 hours

**Status:** Completed — 2026-04-19 (folded with Task 24c per EXECUTION-ORDER.md)

**Depends on:** Task 23 (hard — backend voice adapter mints the Twilio Video access token + provisions the audio-only room). Plan 03 Task 20 (hard — already shipped; `<LiveConsultPanel>` slot exists for the doctor-side mount). Task 26 (soft — voice DM copy lights the consult-ready ping; if Task 26 hasn't shipped, the ping throws at copy-build time and the patient receives no DM but the room still works for any patient who reaches the URL out-of-band).

**Plan:** [plan-05-voice-consultation-twilio.md](../Plans/plan-05-voice-consultation-twilio.md)

---

## Acceptance criteria

- [ ] **`frontend/components/consultation/VoiceConsultRoom.tsx`** (NEW) exists with this prop shape:
  ```tsx
  interface VoiceConsultRoomProps {
    accessToken:     string;        // Twilio Video access token from the voice adapter
    roomName:        string;        // Twilio room unique name (matches the video adapter's shape)
    sessionId:       string;        // consultation_sessions.id; used for resend-link backend calls
    currentUserRole: 'doctor' | 'patient';
    onDisconnect?:   () => void;    // mirrors <VideoRoom>'s callback (parent re-fetches state on disconnect)
  }
  export default function VoiceConsultRoom(props: VoiceConsultRoomProps): JSX.Element;
  ```
  Notes on the prop shape:
  - **Identical token plumbing as `<VideoRoom>`.** The voice adapter (Task 23) returns the same `JoinToken` shape as the video adapter — frontend can reuse the existing `accessToken` + `roomName` plumb-through, no JWT exchange dance like the text room needed.
  - **`sessionId`** is required (not optional like in `<LiveConsultPanel>`) because the doctor-side resend-link buttons need it to call the backend.
- [ ] **Layout (mobile-first; flex column, `100dvh` on mobile, fixed-height container on desktop inside `<LiveConsultPanel>`):**

  ```
  ┌─────────────────────────────────┐
  │ Header                          │
  │ {counterpartyLabel} · 🎙 Voice  │
  │ ● {connectionLabel} · {timer}   │
  ├─────────────────────────────────┤
  │ Big visual indicator (centered) │
  │   - animated ring around        │
  │     placeholder avatar          │
  │   - "Recording 🔴" indicator    │
  │     (when consent === true)     │
  │   - or "Not recording" badge    │
  │     (when consent === false;    │
  │      Plan 02 reads decision)    │
  │                                 │
  │   data-slot="companion-chat"   │
  │   (Plan 06 mount point)         │
  ├─────────────────────────────────┤
  │ Controls                        │
  │  [🎙 Mute] [🔊 Speaker] [📞 End]│
  └─────────────────────────────────┘
  ```
  - **Header strip** — counterparty name (patient sees `practiceName` or "Your doctor"; doctor sees "Patient" until Plan 03 wires appointment context — same compromise as `<TextConsultRoom>`'s Task 19 header), modality glyph + label ("🎙 Voice consult"), connection-status dot + label, MM:SS call timer that starts at room-join.
  - **Big visual indicator (center)** — animated ring (CSS-only `@keyframes` pulse, no canvas / no audio-API tap; the plan's open decision #3 picks the simple ring over a waveform for v2 consideration). Centered placeholder avatar disc (initials or generic 🎙 glyph). "Recording 🔴" pill when Plan 02's recording-consent decision is `true`; "Not recording" pill when `false`. Plan 02's consent decision is read from a prop or a context that's hooked up at the `<LiveConsultPanel>` level — for v1 this task can stub the consent prop as `undefined → 'Recording 🔴'` (default-on-by-default per Decision 4) with a `TODO` pointing at Plan 02's surface.
  - **Companion-chat placeholder slot** — a `<div data-slot="companion-chat" />` element inside the big-visual area, sized to the empty breathing region. Plan 06 will replace its `null` children with the companion `<TextConsultRoom mode='live' />`. In v1 the slot renders nothing (no placeholder text, no border) — the breathing area is the v1 UX.
  - **Controls (footer)** — three buttons: Mute (toggles `localAudioTrack.enable(false)` / `enable(true)`), Speaker (toggles HTMLAudioElement output between `'speaker'` and `'earpiece'` via `setSinkId` where supported; on iOS Safari where `setSinkId` is unsupported the button is disabled with a `title="Speaker toggle unsupported on this device"`), End (disconnects the room and fires `onDisconnect`).
- [ ] **Twilio Video JS SDK connection** with audio-only publish:
  - Use `import { connect, createLocalAudioTrack } from "twilio-video"`. **Do NOT** import `createLocalTracks` (which would default to publishing both audio + video).
  - Call `connect(accessToken, { name: roomName, tracks: [audioTrack], audio: true, video: false })` — the explicit `video: false` is defense-in-depth on the publish side; Task 23's recording rules are defense-in-depth on the storage side. Both layers ensure no video artifact ever lands.
  - Mirror `<VideoRoom>`'s `roomRef` / `localTracksRef` / cleanup patterns; copy them rather than refactor a shared base — `<VideoRoom>` is stable shipped code and a refactor risks regression.
  - Remote audio is auto-attached: subscribe to `participantConnected` / `trackSubscribed`, attach the remote audio track to a hidden `<audio>` element. No video DOM needed.
- [ ] **Wake Lock API** (`keep-screen-awake`) acquired on `room.on('reconnected')` and the initial `'connected'` event; released on `'disconnected'` or component unmount. Wrapped in feature-detection (`'wakeLock' in navigator`); on browsers without support (older Safari, Firefox), the call is a no-op and a `console.warn` ships with `[VoiceConsultRoom] Wake Lock unavailable — patient may need to disable auto-lock manually`. No user-facing surface for the warning in v1; documented in the inbox as a follow-up for the patient-onboarding pre-call holding screen.
- [ ] **Reconnect logic** mirrors `<VideoRoom>`'s pattern:
  - `room.on('reconnecting', error => ...)` flips connection status to amber + resets the timer to "Reconnecting…".
  - `room.on('reconnected', () => ...)` flips back to green + restores the timer.
  - `room.on('disconnected', (room, error) => ...)` runs cleanup, fires `onDisconnect`, and (if the disconnect was unintentional, signaled by Twilio's error code) shows a "Connection lost — try rejoining" inline notice with a `[Rejoin]` button that re-runs the parent's token-fetch flow.
  - Backoff array `[1s, 2s, 4s, 8s, 16s, 30s]` (capped) used for the rejoin-button retry sequence after a true disconnect; Twilio's SDK handles the in-room reconnect timing internally.
- [ ] **Doctor-side "patient hasn't joined" surface** appears when `currentUserRole === 'doctor'` AND no remote participant has connected within 3 minutes of room-join. Renders a centered card with:
  - Headline: "Patient hasn't joined yet — it's been {n} min."
  - Body: "Resend the join link?"
  - Two buttons: `[Resend link via SMS]` (calls a new `POST /api/v1/consultation/{sessionId}/resend-link` backend endpoint with `{ channel: 'sms' }`) and `[Resend link via IG DM]` (same endpoint, `{ channel: 'ig_dm' }`).
  - **Backend endpoint stub.** If the resend endpoint doesn't exist yet, this task adds a thin route at `backend/src/routes/api/v1/consultation.ts` that calls `sendConsultationReadyToPatient` with a `force: true` override (bypassing the existing dedup window). Endpoint is doctor-authenticated only. Inbox follow-up captures rate-limiting (e.g. max 3 resends per session) for hardening.
  - **Master plan WhatsApp deferral hold:** do **not** add a `[Resend link via WhatsApp]` button. The plan's open decision #4 explicitly notes this.
- [ ] **Patient-facing route** `frontend/app/c/voice/[sessionId]/page.tsx` (NEW):
  - Reads `t` from the URL query string (HMAC consultation-token, mirroring the existing video patient join flow at `getConsultationToken`).
  - Calls a new `getVoiceConsultationToken(sessionId, token)` helper in `frontend/lib/api.ts` that hits `POST /api/v1/consultation/{sessionId}/voice-token` (or extends the existing `GET /consultation/token` if the existing handler can route by `consultation_type`). Pick the smallest-surface option at PR-time.
  - Missing/invalid token → renders an error CTA with copy "Your link is invalid or expired. Reply to the IG message to get a fresh link."
  - On success: `router.replace('/c/voice/${sessionId}')` strips the token from the address bar (mirrors the Plan 04 Task 19 pattern for hygiene).
  - **Pre-session holding screen** (when `consultation_sessions.status === 'scheduled'`): "Your voice consult starts at {time}. We'll auto-connect you when the doctor opens the room." with a 30s poll re-running the token exchange. Plain copy, no countdown clock — the auto-refresh does the work.
  - **Post-session end-state** (`status === 'ended'`): "This consult has ended. Your prescription will be delivered shortly via DM." Placeholder line for Plan 07's chat-history link.
  - **Live**: mounts `<VoiceConsultRoom>` with `currentUserRole='patient'`.
  - **Mic-permission prelude.** Before connecting to the room, the page calls `navigator.mediaDevices.getUserMedia({ audio: true })` to surface the browser permission prompt early (so the patient denies/grants mic access before the call timer starts). On denial, render "Microphone access is required for voice consults — enable it in your browser settings and reload."
- [ ] **Doctor-side mount in `<LiveConsultPanel>`.** Update `frontend/components/consultation/ConsultationLauncher.tsx`'s `handlePrimaryClick('voice')` branch (currently `flashComingSoon('Voice consultations…')` — see Plan 03 Task 20 ship summary):
  - Replace the `flashComingSoon` call with a `handleStartVoice()` async handler that calls a new `startVoiceConsultation(token, appointmentId)` helper hitting `POST /api/v1/consultation/start` with `{ modality: 'voice' }` (or a dedicated `start-voice` route — pick at PR-time depending on whether the existing `start` handler accepts a modality argument). Returns `{ doctorToken, roomName, patientJoinUrl, sessionId }`.
  - On success, set local state to `{ doctorToken, roomName, sessionId }` and render `<LiveConsultPanel modality='voice' sessionId={sessionId} roomSlot={<VoiceConsultRoom accessToken={doctorToken} roomName={roomName} sessionId={sessionId} currentUserRole='doctor' onDisconnect={handleDisconnect} />} />` — exactly mirrors how the video branch mounts `<VideoRoom>` today.
  - **Re-hydrate on page refresh** — extend the existing `useEffect` that re-fetches the doctor token if `appointment.consultation_room_sid` exists, to also handle the voice case (the room SID column is shared between voice and video — both write through the same Twilio Video room creation path per Task 23). The re-hydrate effect's `bookedModality` guard at `ConsultationLauncher.tsx` currently early-returns when `bookedModality !== 'video'`; widen the guard to allow `'voice'` too.
- [ ] **Header connection-status badge** has three visible states matching `<VideoRoom>`'s palette: green (`Online`), amber (`Reconnecting…`), red (`Disconnected`).
- [ ] **Mute / Speaker controls** are accessible: each button has `aria-label` + `aria-pressed`. Keyboard tab order: Mute → Speaker → End. End button has `aria-label="End consultation"` and triggers a confirm dialog ("End the consultation?") before disconnecting — matches the `<VideoRoom>` leave-call confirmation pattern.
- [ ] **Frontend `tsc --noEmit` + `next lint` clean** on touched files.
- [ ] **Manual smoke test (gating):** with Task 23 + Task 26 shipped to a dev backend with a sandbox Twilio Video account, run a cross-side smoke — one doctor tab in dashboard, one patient tab in incognito on `/c/voice/{sessionId}?t=...` — and verify:
  - Both tabs hear each other (audio works bidirectionally on Chrome desktop, Chrome Android, Safari desktop, Safari iOS).
  - No video tracks published in either direction (verified via Twilio room console: "Tracks: 1 audio per participant").
  - Wake Lock fires on the patient side (verified in Chrome DevTools > Application > Wake Lock).
  - The doctor-side "patient hasn't joined" surface renders after 3 min when the patient tab is closed before joining.
  - Both `[Resend link via SMS]` and `[Resend link via IG DM]` deliver fresh DMs.
  - Disconnecting the network mid-call triggers the amber "Reconnecting…" badge, and reconnecting flips back to green within Twilio's reconnect window.

---

## Out of scope

- **Companion text chat panel.** Plan 06 owns it. The `data-slot="companion-chat"` placeholder is the v1 mount point; Plan 06 fills it.
- **Real-time waveform visual.** v2 candidate. v1 ships the simple animated ring (per the plan's open decision #3).
- **Speaker-toggle on iOS Safari.** Disabled with a `title` tooltip — `setSinkId` is not supported. v1 accepts the limitation; iOS Safari users use the system speaker toggle.
- **Voice → video mid-consult upgrade button.** Plan 09 owns it. Out of scope for v1's Plan 05.
- **Patient self-service "I want to skip this consult" mid-flow.** Out of v1 scope.
- **Microphone-quality indicators** (peak meter, level bar). v2 candidate.
- **Background-noise suppression toggle.** Twilio Video has a noise-suppression module — v1 enables it by default, no UI toggle. Documented as a follow-up for v2 if doctors complain.
- **Bluetooth headset / device-picker UI.** Browser handles it via the system audio settings. v2 candidate to expose in-app.
- **Resend-link rate limiting.** v1 ships unlimited resend (with a small "you've sent 3 in 5 minutes" inline soft warning above the buttons after the third call); proper backend rate-limiting (e.g. `consultation_resend_audit` table) is a follow-up captured in `docs/capture/inbox.md`.
- **Pre-call mic-test screen.** v1 relies on the in-call mute toggle to surface mic problems. v2 may add a "Test your mic" pre-call step.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/VoiceConsultRoom.tsx` — new (the audio-only UI; ~250-300 lines).
- `frontend/components/consultation/ConsultationLauncher.tsx` — modify `handlePrimaryClick('voice')` to start a real voice session; widen the re-hydrate `useEffect` guard from `bookedModality === 'video'` to include `'voice'`; mount `<VoiceConsultRoom>` inside `<LiveConsultPanel>` for the voice branch (mirrors today's video branch).
- `frontend/app/c/voice/[sessionId]/page.tsx` — new (the patient-facing route; ~150-200 lines, mirrors the existing video patient join page in shape and the new text patient route in token-handoff hygiene).
- `frontend/lib/api.ts` — add `startVoiceConsultation(token, appointmentId)` + `getVoiceConsultationToken(sessionId, hmacToken)` helpers (or wire to existing endpoints with a modality argument — pick at PR-time).

**Backend (small route additions only — no new services):**

- `backend/src/routes/api/v1/consultation.ts` — add `POST /start-voice` (auth, doctor-side initiate; thin wrapper that calls `consultation-session-service#createSession({ modality: 'voice' })` and returns the same shape the existing `POST /start` returns) AND `POST /:sessionId/resend-link` (auth, doctor-side; calls `sendConsultationReadyToPatient` with a `force: true` override). Either or both may already exist as a generic-modality version of `POST /start` — verify at PR-time, prefer extension over duplication.
- `backend/src/controllers/consultation-controller.ts` — add the corresponding handlers if new routes are introduced.

**Tests:**

- **Frontend test harness is not bootstrapped.** Per Plan 03 Task 20's ship summary + the existing `docs/capture/inbox.md` follow-up, frontend Jest + RTL + ts-jest is not set up today. Verification posture for this task is **`tsc --noEmit` + `next lint` + manual cross-side smoke**, same as Tasks 19 and 20. **Once the harness lands** (separate inbox follow-up), the test surface should include:
  - `frontend/__tests__/components/consultation/VoiceConsultRoom.test.tsx` — render-mount + control-button-state assertions + Wake Lock feature-detect path.
  - `frontend/__tests__/app/c/voice/[sessionId]/page.test.tsx` — token-from-URL handshake + holding-screen / end-state branches.
  - Backend route additions get unit coverage in `backend/tests/unit/routes/consultation.test.ts` (already exists for the video routes; extends with the voice-specific endpoints).
- The backend route additions in this task **do** get backend test coverage (we're not gated by the missing frontend harness for backend changes):
  - `backend/tests/unit/routes/consultation-start-voice.test.ts` (or extend the existing `consultation.test.ts`) — happy path + auth check.
  - `backend/tests/unit/routes/consultation-resend-link.test.ts` (or extend) — happy path + auth check + verify the `force: true` override flows through to `sendConsultationReadyToPatient`.

---

## Notes / open decisions

1. **Why split the master-plan Task 24 (audio-only UI **+** companion text panel) into Plan 05 Task 24 + Plan 06?** Plan 06 lifts the companion chat into both voice + video consults — it's a **shared surface** between two plans. Bundling it into Task 24 would force Plan 05 to ship a feature that's primarily a Plan 06 deliverable. The split keeps each plan's scope honest and lets Plan 06 reuse `<VoiceConsultRoom>` (this task) + `<VideoRoom>` (already shipped) as static mount points.
2. **`<VoiceConsultRoom>` deliberately copies — not refactors — `<VideoRoom>`'s connection lifecycle.** `<VideoRoom>` is stable shipped code that handles a critical consult flow. A refactor (extracting a `useTwilioRoom` hook, parameterizing audio-only) would risk regression on the production video path for marginal gain. Copy now, refactor later if a third caller appears.
3. **Why the simple animated ring instead of a real-time audio-API waveform?** Per the plan's open decision #3: a waveform is small extra dep + CPU + privacy surface (the audio API can leak metering data via timing). The ring conveys "audio is flowing" without any audio-tap. v2 can revisit if doctor feedback demands it.
4. **Speaker-toggle on iOS Safari.** `setSinkId` is unimplemented as of the latest Safari (verified at PR-time — if Safari ships support before the PR lands, drop the disabled-state branch). The button surfaces the limitation via `title` rather than hiding (showing the affordance disabled is more honest than pretending the feature doesn't exist on this device).
5. **Wake Lock release on tab-hidden.** Browsers auto-release Wake Lock when the tab loses focus. The component re-acquires Wake Lock on `visibilitychange → visible` if still in a connected room — captures the case where the patient briefly switches apps (e.g. to check a calendar) and returns.
6. **3-minute "patient hasn't joined" threshold.** Borrowed from the master plan; adjustable later. Below 2 min is too aggressive (patient is genuinely loading the page); above 5 min is too late (doctor has already moved on mentally).
7. **`onDisconnect` callback semantics.** Mirrors `<VideoRoom>`'s callback exactly — fires once on the first disconnect event (intentional or not), parent component is responsible for refreshing its own state. The doctor-side `<ConsultationLauncher>` will re-call `router.refresh()` 150ms after disconnect (matching the existing video pattern).
8. **Recording-consent indicator stub.** Plan 02's recording-consent decision isn't fully wired today (Task 27's territory). For v1 of this task, default the "Recording 🔴" indicator to ON (per Decision 4's "recording on by default" doctrine). Once Task 27 ships the consent capture, wire the prop. Document the stub in the component's JSDoc.
9. **Resend-link rate limiting.** v1 unlimited (with a soft inline warning at >3 / 5 min); proper backend rate-limiting on `consultation_resend_audit` table is a separate follow-up. Acceptable because the resend buttons are doctor-only and abuse is bounded by doctor session length.
10. **Why `frontend/lib/api.ts` helpers and not direct `fetch` in the component?** Consistency with `startConsultation` / `getConsultationToken` (used by `ConsultationLauncher` today). Centralizes auth header injection + error mapping.
11. **Patient join URL `/c/voice/{sessionId}?t=...` shape** mirrors Plan 04's `/c/text/{sessionId}?t=...`. Same HMAC consultation-token convention as the existing video flow (Plan 04 Task 18's "Departure 2" notes the rationale: HMAC handle in URL, exchanged at API for the access token, avoids JWT-in-URL exfiltration). Voice's "access token" is a Twilio Video token, not a Supabase JWT, but the same exchange pattern applies cleanly.

---

## References

- **Plan:** [plan-05-voice-consultation-twilio.md](../Plans/plan-05-voice-consultation-twilio.md) — Frontend `<VoiceConsultRoom>` section (the inline ASCII layout in the plan is the visual source).
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 2 LOCKED, Decision 9 LOCKED (companion chat), Principle 8 LOCKED.
- **Plan 03 Task 20 — `<LiveConsultPanel>` host where `<VoiceConsultRoom>` mounts:** [task-20-consultation-launcher-and-live-panel.md](./task-20-consultation-launcher-and-live-panel.md)
- **Plan 04 Task 19 — sibling frontend task (text room) this one mirrors in shape:** [task-19-text-consult-room-frontend.md](./task-19-text-consult-room-frontend.md)
- **Plan 05 Task 23 — backend voice adapter that mints the access tokens this component consumes:** [task-23-voice-session-twilio-adapter.md](./task-23-voice-session-twilio-adapter.md)
- **Plan 05 Task 26 — voice DM copy that pings the patient with the join URL:** [task-26-voice-dm-and-booking-copy-principle-8.md](./task-26-voice-dm-and-booking-copy-principle-8.md)
- **Existing video room (the copy source):** `frontend/components/consultation/VideoRoom.tsx`
- **Existing patient text page (the new patient voice page mirrors its hygiene):** `frontend/app/c/text/[sessionId]/page.tsx`
- **Existing launcher (where the doctor-side voice mount goes):** `frontend/components/consultation/ConsultationLauncher.tsx`
- **Twilio Video JS SDK audio-only docs:** verify exact API at PR-time — `connect(token, { name, audio: true, video: false })` is the documented audio-only entry.
- **Wake Lock API spec:** [https://www.w3.org/TR/screen-wake-lock/](https://www.w3.org/TR/screen-wake-lock/) — feature-detect via `'wakeLock' in navigator`.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Completed — 2026-04-19. Shipped with Task 24c folded in per EXECUTION-ORDER.md (audio-only UI + companion canvas chat delivered in a single unit of work, skipping the intermediate empty-canvas state).

---

## Implementation log (2026-04-19)

### Decisions made during execution

1. **Task 24 + Task 24c folded into a single unit of work.** `EXECUTION-ORDER.md` called for this explicitly — since Plan 06 (companion chat infra: lifecycle hook, schema, emitter, `TextConsultRoom` layout prop) had already landed by the time Task 24 entered execution, there was no reason to ship `<VoiceConsultRoom>` with an empty canvas first and then swap it. Shipping the integrated form from day one avoids a deliberately-half-built intermediate state and a wasted design iteration on the placeholder canvas.
2. **`startVoiceConsultation` is idempotent — no separate `getVoiceConsultationToken` helper.** The backend `startVoiceConsultation` short-circuits on an existing active voice session via `findActiveSessionByAppointment(appointmentId, 'voice')` and returns the same access-token envelope on the rejoin branch. This collapses what would have been two frontend helpers (`startVoice` + `getVoiceToken`) into one, and made the re-hydrate `useEffect` in `ConsultationLauncher` a near-mirror of the video branch.
3. **Patient join URL pattern `/c/voice/{sessionId}?t={hmac}`** (mirrors Plan 04's `/c/text/...` shape). The backend Twilio video adapter doesn't populate `JoinToken.url`, so `startVoiceConsultation` manually composes the patient URL from `APP_BASE_URL` + the freshly-minted HMAC consultation-token. Principle 8 LOCKED on the phrasing "audio-only web call" — the patient mic-prelude copy and the holding screen both lead with it to preempt any "is this going to dial my phone?" confusion.
4. **`force: true` on resend-link bypasses the 60s dedup window.** `sendConsultationReadyToPatient` grew an optional `force` flag that zeroes `dedupSeconds` for explicit doctor-triggered resends. This is the resend-link plumbing's only real semantic bite — dedup exists to protect the patient from accidental double-pings on auto-send; an explicit doctor tap is an informed override.
5. **Companion chat is mandatory on the fresh-create branch, undefined on rejoin.** Mirrors Task 38 (`<VideoRoom>`)'s pattern. The session facade auto-provisions the companion channel inside `createSession` (Task 36), so a fresh start always has it; the rejoin path short-circuits before re-provisioning so the frontend `LiveSession.companion` stays undefined there. `<VoiceConsultRoom>` falls back to a voice-only canvas (large pulsing indicator) when the companion is absent — this keeps the rejoin path functional even if a mid-session schema glitch ever left a session without a companion row.
6. **Doctor-side Supabase session fetched inside `<VoiceConsultRoom>` itself** (not hoisted into the launcher). Same design as `<VideoRoom>` — keeps `<TextConsultRoom>` 100% modality-agnostic and isolates the doctor's Supabase auth concern to the room that needs it. The patient side ships a JWT explicitly via the `companion.patientAccessToken` prop (populated by the patient-route's background text-token exchange), which takes precedence over any Supabase session lookup.
7. **Patient mic prelude is a dedicated screen, not a Twilio-triggered prompt.** Requesting `getUserMedia({ audio: true })` via an explicit "Allow microphone" button before we call Twilio's `connect()` means the patient reads friendly framing ("audio-only web call, no phone call") before any browser chrome interrupts them. The prelude stream is immediately stopped once permission is granted — Twilio re-acquires fresh tracks in `createLocalAudioTrack`.

### Shipped files

- `frontend/components/consultation/VoiceConsultRoom.tsx` — new. Audio-only Twilio room with slim header, mute/leave controls, wake lock, reconnect, "patient hasn't joined" banner with resend-link button, companion chat mounted via `<TextConsultRoom layout='canvas'>`, voice-only fallback canvas.
- `frontend/app/c/voice/[sessionId]/page.tsx` — new. HMAC token exchange, mic prelude, scheduled/live/ended lifecycle, background text-token exchange for companion chat, URL `?t=` stripping.
- `frontend/components/consultation/ConsultationLauncher.tsx` — voice branch wired: `handleStartVoice`, `handleResendLink`, voice re-hydrate path, `<VoiceConsultRoom>` mount inside `<LiveConsultPanel>`.
- `frontend/lib/api.ts` — `startVoiceConsultation`, `requestVoiceSessionToken`, `resendConsultationLink` helpers, `VoiceConsultTokenExchangeData` interface.
- `backend/src/services/appointment-service.ts` — `startVoiceConsultation` (mirrors `startConsultation`, modality='voice', voice-specific room name, `/c/voice/` URL).
- `backend/src/services/notification-service.ts` — `sendConsultationReadyToPatient` grew `force?: boolean` option.
- `backend/src/controllers/consultation-controller.ts` — `startVoiceConsultationHandler`, `exchangeVoiceConsultTokenHandler`, `resendConsultationLinkHandler`.
- `backend/src/routes/api/v1/consultation.ts` — `POST /start-voice`, `POST /:sessionId/voice-token`, `POST /:sessionId/resend-link`.
- `backend/tests/unit/services/appointment-service-start-voice.test.ts` — new. 4 test cases (fresh-create, idempotent rejoin, invalid status, Twilio unconfigured).
- `backend/tests/unit/services/notification-service-fanout.test.ts` — extended with `force=true` dedup-bypass case.

### Verification

- Backend: `tsc --noEmit` clean; `jest appointment-service-start-voice` 4/4 pass; `jest notification-service-fanout` (including the new case) all pass.
- Frontend: `tsc --noEmit` clean; `next lint` clean on all affected dirs.
- Manual smoke deferred to cross-side test once a deployed env is available — the component is behind doctor-side feature gating in `ConsultationLauncher` (only mounts when `appointment.consultation_type === 'voice'`) so it will not surface for non-voice bookings even if the backend routes are reachable.
