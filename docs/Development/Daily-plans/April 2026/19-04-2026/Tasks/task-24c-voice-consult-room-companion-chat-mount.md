# Task 24c: Extend `<VoiceConsultRoom>` — fill the main canvas with `<TextConsultRoom layout='canvas' …>` (Decision 9 LOCKED — voice consults get a free always-on companion chat)

## 19 April 2026 — Plan [Companion text channel](../Plans/plan-06-companion-text-channel.md) — Phase B

---

## Task overview

This is the **`24-companion`** split from the master plan's Task 24, hived off into Plan 06 because Decision 9 LOCKED the companion chat as a separate phase from `<VoiceConsultRoom>`'s primary audio-only UI delivery (Plan 05 Task 24).

Plan 05 Task 24 shipped `<VoiceConsultRoom>` with the audio-only UI (animated ring, mute/speaker/end controls, recording indicator, "patient hasn't joined" surface, no video). It deliberately left the **main canvas visually empty** — the audio-only experience has no faces to look at, but Decision 9 said "fill that space with the companion chat instead of leaving it dead." Task 24c does exactly that.

Unlike `<VideoRoom>` (Task 38) which uses a side panel because video tiles need the canvas, `<VoiceConsultRoom>` puts `<TextConsultRoom layout='canvas' …>` **as the main canvas content**:

- The animated voice indicator + participant info gets a slim header strip at the top.
- The chat fills the rest of the main canvas — full width, scroll-on-overflow.
- Mute / speaker / end controls strip stays pinned at the bottom.
- The chat composer lives **above** the controls strip (not at the very bottom — the controls strip is a fixed bottom bar; the composer floats just above it).
- No tab switcher — voice consults have nothing to switch between (the audio is always playing in the background regardless of UI focus).

The same `<TextConsultRoom>` component (extended in Task 38 with the `layout` prop) is reused; this task is purely **layout integration + the same `companion` prop wiring + the same unread-aware behavior on browser-blur** (since there's no tab switcher, the unread badge from Task 38 doesn't apply here — the chat is always visible when the room is open).

After Task 24c ships, voice consults have a fully-formed UX: audio call + persistent chat + attachments + system banners, all on one canvas. The doctor can speak the diagnosis verbally AND drop a prescription PDF in chat without leaving the room.

**Estimated time:** ~1.5 hours (matches the plan's "~1.5h" estimate; small task because Task 38 already extended `<TextConsultRoom>` with the `layout` prop and Task 36 already provides the `companion` field on the session).

**Status:** Completed — 2026-04-19 (folded into Task 24 implementation per EXECUTION-ORDER.md; `<VoiceConsultRoom>` shipped with companion canvas mount from day one, eliminating the intermediate empty-canvas state)

**Depends on:** Plan 05 Task 24 (hard — `<VoiceConsultRoom>` exists). Task 38 (hard — `<TextConsultRoom>` `layout` prop exists; reuses the `'canvas'` mode added there). Task 36 (hard — `companion.sessionId` reaches `<VoiceConsultRoom>` via the launcher props plumbing). Task 37 (soft — system rows render correctly once Task 37 emits them). Task 39 (hard — schema for attachment + system rows).

**Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md)

---

## Acceptance criteria

- [ ] **`<VoiceConsultRoom>` props extended** with the optional `companion` field (mirrors `<VideoRoom>`'s shape from Task 38):
  ```ts
  interface VoiceConsultRoomProps {
    accessToken:     string;
    roomName:        string;
    sessionId:       string;
    currentUserRole: 'doctor' | 'patient';
    onDisconnect?:   () => void;
    /**
     * Plan 06 Task 24c: when present, fills the main canvas with
     * <TextConsultRoom layout='canvas' …> as the companion chat surface.
     * Undefined when the launcher couldn't provision the companion channel
     * (Task 36 logged + carried on); in that case the canvas renders the
     * pre-Plan-06 empty-space placeholder ("Voice consult in progress —
     * tap end to finish") with a small inline "Chat unavailable" notice.
     */
    companion?: {
      sessionId:    string;
      patientToken?: string;            // present only when currentUserRole === 'patient'
    };
  }
  ```
- [ ] **Layout — desktop + mobile (single layout, responsive only on padding):**
  ```
  ┌─────────────────────────────────────────────┐
  │ Header                                       │
  │ Dr. Sharma · 🎙 Voice consult · 🔴 Recording  │   ← slim header strip; ~64px tall
  ├─────────────────────────────────────────────┤
  │                                              │
  │   <TextConsultRoom                           │
  │     sessionId={companion.sessionId}          │
  │     accessToken={companion.patientToken}     │
  │     currentUserRole={currentUserRole}        │
  │     layout='canvas' />                       │
  │                                              │   ← chat fills the main canvas; scrolls on overflow
  │   (chat history + composer pinned at bottom  │
  │    of this region, just above the controls)  │
  │                                              │
  ├─────────────────────────────────────────────┤
  │ 🎙 mute · 🔊 speaker · 📞 end                  │   ← controls strip; pinned bottom; ~80px tall
  └─────────────────────────────────────────────┘
  ```
  - Header: existing voice-room participant info + recording-indicator from Plan 05 Task 24, condensed into a single horizontal strip. Hide the large animated ring (it dominated the empty canvas in Plan 05 v1; with the chat filling the space, the ring is no longer needed for visual interest). Replace with a small pulsing dot adjacent to the participant name to indicate "audio is live."
  - Main canvas: `<TextConsultRoom layout='canvas' …>`. The `'canvas'` layout mode (added in Task 38) keeps a slim internal header (just participant name + connection status) and uses wider message bubbles than `'panel'`.
  - Controls: existing Plan 05 Task 24 controls (mute / speaker / end); positioning unchanged.
  - The chat composer sits **inside `<TextConsultRoom layout='canvas'>`** at the bottom of the canvas region, above the controls strip. Composer + controls are visually separate but adjacent.
- [ ] **The animated voice indicator from Plan 05 Task 24 is downsized** — it was a large center-canvas pulsing ring in v1; in this task it becomes a small pulsing dot inline with the header. The pulsing animation continues (still useful as a "audio is live" signal) but no longer dominates the canvas. Remove the large ring's CSS / DOM entirely.
- [ ] **Empty / failure states:**
  - When `companion === undefined`: render the pre-Plan-06 empty-canvas placeholder ("Voice consult in progress — tap end to finish.") in the main canvas region, with a small inline "Chat unavailable — backend couldn't provision a companion channel for this session." notice below it. Audio + controls work normally.
  - When `companion` is present but `<TextConsultRoom>` fails to subscribe: `<TextConsultRoom>`'s existing error UI takes over inside the canvas (same as Task 38).
- [ ] **No tab switcher.** Voice consults have nothing to switch between; the chat is always visible when the room is open. The unread-count badge logic from Task 38 does NOT apply to `<VoiceConsultRoom>`. (If a future plan wants a "minimize the chat to focus on audio" toggle, that's a follow-up.)
- [ ] **`onIncomingMessage` callback NOT wired in this task** — it exists on `<TextConsultRoom>` (added in Task 38) but `<VoiceConsultRoom>` doesn't have a tab switcher to badge. Pass `undefined` (default) for the prop.
- [ ] **Wake Lock + audio-only Twilio setup unchanged.** Plan 05 Task 24's audio-only `connect(token, { audio: true, video: false })`, the wake-lock acquisition, the reconnect logic, the "patient hasn't joined" surface — all untouched. Task 24c is purely a canvas-content swap, not a Twilio lifecycle change.
- [ ] **Patient-side route unchanged.** Plan 05 Task 24 created `frontend/app/c/voice/[sessionId]/page.tsx`; this task does NOT add a new patient route. The patient mounts `<VoiceConsultRoom companion={...} />` from the same route after Task 36's lifecycle hook delivers `companion` via the existing patient-token-exchange API endpoint.
- [ ] **`<ConsultationLauncher>` updated to pass `companion` through to `<VoiceConsultRoom>`** — once the voice branch ships in `<ConsultationLauncher>` (currently stubbed as `flashComingSoon('Voice consultations…')` per Task 20's launcher; Plan 05 Task 24 unblocks the real branch). Task 24c's launcher wiring mirrors Task 38's wiring for video. **If the launcher's voice branch hasn't shipped yet** when Task 24c lands, this task ships the `<VoiceConsultRoom>` `companion` prop + the layout work, and the launcher wiring is captured as a follow-up that ships alongside the launcher's voice branch enablement.
- [ ] **Tests** in `frontend/__tests__/components/consultation/VoiceConsultRoom-canvas-chat.test.tsx` (NEW; **deferred** until the frontend test harness ships, same as Task 38):
  - When `companion` is present, the main canvas mounts `<TextConsultRoom layout='canvas' …>`.
  - When `companion` is absent, the main canvas renders the empty-canvas placeholder + the "Chat unavailable" notice.
  - The slim header strip renders the participant name + the small pulsing dot.
  - The large animated ring from Plan 05 v1 is NOT rendered (snapshot or DOM query assertion that the relevant element is gone).
  - The mute / speaker / end controls strip is pinned at the bottom and renders the same buttons as Plan 05 Task 24's tests.
- [ ] **Manual smoke test (verification posture v1; doctor + patient cross-side):**
  - Provision a voice booking, start the consult from the doctor dashboard. Confirm the `<VoiceConsultRoom>` opens with the chat filling the main canvas, the slim header strip at top, controls at bottom, and the audio is connected (mute toggling works).
  - Send a chat message from the doctor side; open the patient join URL in an incognito window; confirm the chat appears + the message is visible to the patient. Send a message from the patient side; confirm the doctor sees it.
  - Confirm the consult-started system banner from Task 37 renders in the chat as italic + gray + clock icon (NOT a message bubble).
  - End the consult — chat history persists; the room closes; the post-consult experience (Plan 07 territory) takes over.
  - Resize the browser to mobile width — confirm the layout stays readable (the slim header should wrap or shrink gracefully; the controls stay visible at the bottom).
- [ ] **Type-check + lint clean.** Frontend `npx tsc --noEmit` exit 0. `npx next lint` clean.
- [ ] **No backend changes. No new env vars. No new routes. No migrations.**

---

## Out of scope

1. **`<TextConsultRoom>` attachment-rendering UI for `kind = 'attachment'` rows.** Same Out-of-scope #1 as Task 38 — both tasks consume `<TextConsultRoom>` and benefit from the same follow-up (`task-38b-attachment-rendering-polish.md`, captured in `docs/capture/inbox.md`). v1 attachment rows render as a generic "📎 Attachment" line with a tap-to-download link.
2. **Picture-in-picture style "minimize chat to focus on audio."** Tempting but adds floating-window complexity; not in v1.
3. **Visual transcription stream in the chat.** Plan 05 Task 25 ships post-consult batched transcription via Whisper / Deepgram; live streaming transcription into the chat is a Plan 10 / Plan 11 concern (real-time captioning is a separate beast — provider, latency, accuracy trade-offs all need their own design pass).
4. **A "share this chat" button.** Post-consult chat history is accessible via the same URL after the consult ends (Plan 04 RLS preserves SELECT). A dedicated share affordance is a Plan 07 concern.
5. **Voice waveform visualization in the canvas.** The pulsing dot in the header is the v1 audio-presence indicator. A real-time waveform is a polish follow-up if users complain that the dot doesn't feel "live" enough.
6. **Speaker-isolation chat-pane resizing.** No resize handle in v1 — the chat fills whatever's between the header and the controls. Window resize handles the responsive case.
7. **Hold-to-talk push-to-talk.** Voice consults are full-duplex; no PTT. Not in scope here or in Plan 05.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/VoiceConsultRoom.tsx` — extend with the `companion` prop, swap the empty canvas for `<TextConsultRoom layout='canvas' …>`, downsize the animated ring into a header pulsing dot (~80 lines added; ~30 lines removed for the old ring CSS/DOM).
- `frontend/components/consultation/ConsultationLauncher.tsx` — wire `voiceSession.companion` through to `<VoiceConsultRoom>`'s new `companion` prop (~3 lines, only when the launcher's voice branch is enabled).

**Tests (deferred until frontend test harness ships):**

- `frontend/__tests__/components/consultation/VoiceConsultRoom-canvas-chat.test.tsx` — new.

**No backend changes. No `<TextConsultRoom>` changes** (the `layout` prop was added in Task 38). **No new env vars. No new routes. No migrations.**

---

## Notes / open decisions

1. **Why no tab switcher (vs Task 38's mobile tabs)?** Voice has no video tile to compete with the chat for canvas space — the chat IS the canvas. A tab switcher would split a single conceptual surface into two for no UX benefit. The audio is always in the background regardless of where the user looks.
2. **Why downsize the animated ring?** Plan 05 v1 used a large central ring as the only thing in the canvas — visual interest for an otherwise-empty space. With the chat filling the canvas, the ring competes with chat content for attention. The header pulsing dot keeps the "audio is live" signal at much smaller real estate.
3. **Why `layout='canvas'` instead of `layout='panel'`?** `'panel'` is optimized for a narrow side-panel context (smaller bubbles, no header). `'canvas'` is optimized for full-width content (wider bubbles, slim header). The two layouts are deliberately distinct so each parent room renders the chat at a comfortable density for its surrounding context. Trade-off: maintaining two non-trivial styling modes inside `<TextConsultRoom>`. Acceptable because the alternative (one styling mode that compromises both contexts) produces a worse UX for both rooms.
4. **What about wake-lock during the consult?** Plan 05 Task 24 already acquires the screen wake lock when `<VoiceConsultRoom>` mounts; that behavior is unchanged here. The chat surface inside the canvas does NOT add or remove wake-lock concerns — the lock is room-scoped, not chat-scoped.
5. **Frontend test harness deferral.** Same as Task 38 — `<VoiceConsultRoom-canvas-chat>` test file is captured but cannot be written until the inbox-tracked frontend test harness bootstraps. Verification posture is `tsc --noEmit` + `next lint` + manual cross-side smoke.
6. **Composer placement — above the controls strip.** The chat composer is part of `<TextConsultRoom>`; it pins to the bottom of `<TextConsultRoom>`'s container. Since `<TextConsultRoom>` fills the region between the slim header and the controls strip, its composer naturally sits just above the controls — no special CSS needed in `<VoiceConsultRoom>`. Document the layering assumption (composer-belongs-to-chat-component) in `<TextConsultRoom>`'s `'canvas'` mode JSDoc.
7. **What if the patient's audio is muted but they're typing actively?** The room visually conveys both: the pulsing dot in the header is gray (muted) + the chat composer / typing indicator is active. Two independent signals; both appropriate. No special UI needed for the "muted but typing" combo state.
8. **What if a patient sends a 50 MB attachment over voice?** Same as Task 38 / Plan 06 spec — composer-side error, doesn't pollute the persisted log. Application-layer guard rejects before upload.
9. **Mobile small-screen height squeeze.** The slim header (~64px) + controls (~80px) plus the iOS Safari URL bar can squeeze the chat region on small phones. Mitigation: `<TextConsultRoom>`'s scroll-on-overflow already handles short message areas; the composer pins to the bottom of the chat region so the user always sees what they're typing. If users complain about cramped phones, follow-up is to make the header collapse on scroll.
10. **What if `companion.sessionId !== sessionId` (the room's session ID)?** Defensive — they should be identical (both come from the same `consultation_sessions` row). If they ever diverge, log at `error` and render the "Chat unavailable" notice. Captures the edge where a misconfigured launcher passes the wrong session.

---

## References

- **Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md) — Frontend layout deliverables → `<VoiceConsultRoom>` extension section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 9 LOCKED.
- **Plan 05 Task 24 — `<VoiceConsultRoom>` (this task extends):** [task-24-voice-consult-room-frontend.md](./task-24-voice-consult-room-frontend.md)
- **Task 38 — `<TextConsultRoom>` `layout` prop (this task reuses `'canvas'`):** [task-38-video-room-companion-chat-panel.md](./task-38-video-room-companion-chat-panel.md)
- **Task 36 — `companion` prop source:** [task-36-companion-channel-lifecycle-hook.md](./task-36-companion-channel-lifecycle-hook.md)
- **Task 37 — system-row writer:** [task-37-system-message-emitter.md](./task-37-system-message-emitter.md)
- **Task 39 — schema for attachment + system rows:** [task-39-consultation-messages-attachments-and-system-rows.md](./task-39-consultation-messages-attachments-and-system-rows.md)
- **Plan 04 Task 19 — `<TextConsultRoom>` (extended in Task 38, mounted here):** [task-19-text-consult-room-frontend.md](./task-19-text-consult-room-frontend.md)
- **Existing `<ConsultationLauncher>`:** `frontend/components/consultation/ConsultationLauncher.tsx` (voice branch is the wire-up site once Plan 05 Task 24 enables it).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Completed — 2026-04-19. Folded into Task 24's initial implementation (single unit of work). `<VoiceConsultRoom>` shipped with the companion chat mount from day one — no intermediate empty-canvas state needed because Plan 06 infra (Tasks 36, 37, 38, 39) had already landed by the time Task 24 entered execution.

---

## Implementation notes (2026-04-19)

See the **Implementation log** section of `task-24-voice-consult-room-frontend.md` — this task's scope was delivered as part of that same unit of work. Key points:

- `VoiceConsultRoom.tsx` directly embeds `<TextConsultRoom layout='canvas' …>` in its main canvas region whenever a `companion` prop is passed.
- The voice-only fallback (no companion present — idempotent rejoin case) renders a large pulsing audio-presence indicator centered in the canvas. When companion IS present, that indicator collapses to a compact header-strip pulsing dot (matching the spec in this task's `.md`).
- Patient-side companion JWT + `currentUserId` flow through `companion.patientAccessToken` / `companion.patientCurrentUserId` (populated by `frontend/app/c/voice/[sessionId]/page.tsx` after a background `requestTextSessionToken` exchange). Doctor-side flow uses the Supabase session fetched inside `<VoiceConsultRoom>` itself.
- `onPatientTokenRefresh` threads through the patient route's `handlePatientTokenRefresh` so the chat client can refresh its JWT without restarting the voice call when the session-scoped token nears expiry.
- No tab switcher on voice (as specified) — chat IS the canvas.
