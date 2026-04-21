# Task 38: Extend `<VideoRoom>` with companion chat side panel (~30% width on desktop, tab switcher on mobile) — Decision 9 LOCKED

## 19 April 2026 — Plan [Companion text channel](../Plans/plan-06-companion-text-channel.md) — Phase B

---

## Task overview

Decision 9 LOCKED an always-on companion text channel for every video consult. Doctor + patient should be able to send chat messages, attachments, and see system banners alongside the active Twilio Video stream — with no toggling, no separate window, no extra friction.

`<VideoRoom>` today (`frontend/components/consultation/VideoRoom.tsx`, ~164 lines) is a single-purpose Twilio video shell: local + remote video tiles, identity labels, mute/end controls, disconnect callback. No chat. Task 38 extends it into a **two-pane layout** that:

- **Desktop (≥768px):** Renders the existing video tiles in the left ~70% of the canvas and mounts `<TextConsultRoom layout='panel' …>` (Plan 04 component, extended with the new `layout` prop in this task — see Out of scope #1) in a fixed-width right side panel (~30% width, min 320px, max 480px). The panel is **always open** by default — no collapse toggle in v1.
- **Mobile (<768px):** Renders a tab switcher above a single full-width pane. Tabs: `[Video]` (default selected) and `[Chat]`. The Chat tab carries an unread-count badge that increments on every received message while Video is selected and resets to 0 on switching to Chat. Switching tabs swaps the pane's content; the **Twilio video room stays connected** in both states (the video element is rendered offscreen in a hidden div when Chat is selected so the underlying `Room` connection isn't torn down).

`<TextConsultRoom>` already handles its own Realtime subscription, message rendering, composer, and (after Task 39) attachment + system-row rendering. Task 38's job is purely **layout integration + responsive behavior + the unread badge** — no new chat logic.

The companion chat URL + JWT come from the Plan 06 Task 36 `companion` field on the session-create response, which `<ConsultationLauncher>` already threads through (per Task 36 plumbing). Task 38 receives `companion: { sessionId, patientToken? }` as new props on `<VideoRoom>` and mounts `<TextConsultRoom>` with them. **Doctor side uses the existing dashboard auth session** for the chat RLS (no per-session token needed for the doctor); the `patientToken` is unused on the doctor side and is only present so the same `companion` shape can be passed to `<VoiceConsultRoom>` (Task 24c).

**Estimated time:** ~3 hours (the larger end of the plan's 2-3h range, to absorb the `<TextConsultRoom layout='panel' …>` prop addition + the offscreen-video-while-chat-tab-selected mobile gymnastics + the responsive breakpoint dance).

**Status:** Completed 2026-04-19 (test files deferred until frontend test harness ships — see Decision 10 at the bottom)

**Depends on:** Task 36 (hard — `companion.sessionId` reaches `<VideoRoom>` via the launcher props plumbing). Task 37 (soft — the chat panel correctly renders system rows once Task 37 starts emitting them; pre-Task-37 the chat just shows messages without banners). Task 39 (hard — schema for attachment + system rows; without it, `<TextConsultRoom>` has nothing to render in the new kinds). Plan 04 Task 19 (hard — `<TextConsultRoom>` exists; this task extends it with a `layout` prop).

**Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md)

---

## Acceptance criteria

- [ ] **`<TextConsultRoom>` extended with a `layout` prop** (the smaller deliverable in this task, but unblocks both Task 38 and Task 24c):
  ```ts
  interface TextConsultRoomProps {
    sessionId:    string;
    accessToken?: string;             // patient-only; doctor uses dashboard auth
    currentUserRole: 'doctor' | 'patient';
    onDisconnect?: () => void;
    /**
     * Layout mode:
     *  - 'standalone' (default — Plan 04 v1): full-page chat, full header,
     *    message bubbles fill the viewport, composer pinned to the bottom.
     *  - 'panel': mounted in a side panel inside <VideoRoom>. Hides the
     *    header (parent room owns the header), shrinks bubble max-width,
     *    composer stays pinned. Min container width: 320px.
     *  - 'canvas': mounted as the main canvas inside <VoiceConsultRoom>.
     *    Keeps a slim header (just the participant name), wider bubbles
     *    than 'panel', composer pinned. Used by Task 24c.
     */
    layout?: 'standalone' | 'panel' | 'canvas';
  }
  ```
  - The default `'standalone'` preserves Plan 04 Task 19's existing behavior verbatim — no regression on the patient-side full-page chat at `/c/text/[sessionId]`.
  - Implementation strategy: a single internal `<ChatLayout layout={layout}>` wrapper that toggles header visibility + bubble max-width + container padding via CSS classes (Tailwind utility classes; no JS branching for the visual diff).
- [ ] **`<VideoRoom>` props extended** with the optional `companion` field:
  ```ts
  interface VideoRoomProps {
    accessToken: string;
    roomName: string;
    onDisconnect?: () => void;
    role?: 'doctor' | 'patient';
    /**
     * Plan 06 Task 38: when present, mounts <TextConsultRoom layout='panel' …>
     * as the companion chat side panel (desktop) or behind a chat tab (mobile).
     * Undefined when the launcher couldn't provision the companion channel
     * (Task 36 logged + carried on); in that case the room renders without
     * a chat surface and shows a small inline "Chat unavailable" notice
     * in place of where the panel would have been (desktop) / no chat tab
     * (mobile).
     */
    companion?: {
      sessionId:    string;
      patientToken?: string;            // present only when currentUserRole === 'patient'
    };
  }
  ```
  - `<VideoRoom>` MUST handle `companion === undefined` gracefully — rendering without the panel + without the tab switcher (mobile collapses to the original full-canvas video).
- [ ] **Desktop layout (≥768px):** Two-pane flex layout:
  - Left pane: existing video tiles (local + remote, plus identity labels, plus mute/end controls). Width: `flex-1` (fills remaining space).
  - Right pane: `<TextConsultRoom layout='panel' …>`. Width: clamp `min(30vw, 480px), 320px, 30vw` — minimum 320px, maximum 480px, target 30% of viewport. Border-left to visually separate.
  - Both panes share the same parent height (the existing `<VideoRoom>` container height — typically `h-[calc(100vh-header)]` or whatever the parent page enforces; verify at PR-time against the appointment detail page's actual layout).
  - The mute/end controls strip stays at the bottom of the **left pane only** — the chat composer lives at the bottom of the **right pane**. They visually align horizontally but are separate components.
- [ ] **Mobile layout (<768px):** Tab switcher above a single full-width pane:
  - Tabs row: `[ 🎥 Video ] [ 💬 Chat (3) ]` — the Chat tab carries the unread-count badge in parentheses; badge hidden when count is 0.
  - Default selected tab: `Video`.
  - Selected tab indicator: bottom border under the active tab + slightly heavier font weight; matches existing dashboard tab styling at `frontend/components/dashboard/...` (mirror whatever tab component is canonical there to avoid one-off styling).
  - Pane below tabs: full-width content. When `Video` selected → existing video tiles + controls. When `Chat` selected → `<TextConsultRoom layout='panel' …>`.
  - **Critical: the Twilio video Room stays connected when the user switches to the Chat tab.** Implementation: render the video pane in a `display: hidden` div (CSS `hidden` class) rather than unmounting. The Twilio `Room` instance + the `<video>` element refs persist; only the visibility flips. Tearing down + reconnecting the Room on each tab switch would cost ~2-5s and produce visible "reconnecting" jank.
  - Mute/end controls strip stays under the video pane (visible only when Video tab is selected).
  - Chat composer is at the bottom of the chat pane (visible only when Chat tab is selected).
- [ ] **Unread-count badge** (mobile only):
  - State lives in `<VideoRoom>` (not in `<TextConsultRoom>`) — `<VideoRoom>` is the parent that owns the active-tab knowledge.
  - `<TextConsultRoom>` exposes a callback prop `onIncomingMessage?: (msg: { id: string; kind: 'text' | 'attachment' | 'system' }) => void` — fired on every Realtime INSERT received. **System rows do NOT count toward the unread badge** (a system banner shouldn't pull the user away from the video). Filter `kind !== 'system'` before incrementing.
  - When `<VideoRoom>`'s `activeTab === 'chat'`, every incoming message is consumed (badge stays 0). When `activeTab === 'video'`, increment.
  - On tab switch from Video → Chat, reset count to 0 (the user is now seeing the messages).
  - Cap displayed count at `99+` per dashboard convention.
- [ ] **Empty / failure states:**
  - When `companion === undefined`: desktop shows a small inline `<div className="border-l p-4 w-80 text-sm text-muted-foreground">Chat unavailable — backend couldn't provision a companion channel for this session. <button onClick={onRetry}>Retry</button></div>` in the right pane (the retry calls a hypothetical `POST /api/v1/consultation/{sessionId}/companion-retry` route that this task does NOT ship — render the button disabled with a `title="Coming soon — refresh the page to retry."` for v1). Mobile hides the chat tab entirely.
  - When `companion` is present but `<TextConsultRoom>` itself fails to subscribe (e.g. Realtime websocket error): `<TextConsultRoom>`'s existing error UI from Plan 04 Task 19 takes over inside the panel — no new error UI needed at the `<VideoRoom>` layer.
- [ ] **Responsive breakpoint** at 768px (Tailwind's `md:`). Test by resizing browser; the layout should flip cleanly without layout shift inside either pane.
- [ ] **Accessibility:**
  - Tabs use `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls` — match whatever pattern the dashboard's existing tab component uses.
  - The unread-count badge has `aria-label="{count} unread chat messages"`.
  - Tab switching is keyboard-navigable (`Tab` to focus, `Space` / `Enter` to activate, `Arrow Left/Right` to move between tabs).
  - The "Chat unavailable" notice's retry button is `aria-disabled="true"` until a real retry endpoint ships.
- [ ] **`<ConsultationLauncher>` updated to pass `companion` through** — extend the `<VideoRoom>` mount (current call site in `<ConsultationLauncher>`, in the video branch) to forward `videoSession.companion`. Task 36 already widened the local state shape; this task wires the prop through.
- [ ] **No changes to the Twilio video lifecycle.** The chat panel mounts after `<VideoRoom>`'s existing connect-to-Room flow completes; it does not interfere with the Twilio SDK. Mute / end / reconnect all work exactly as before.
- [ ] **Tests** in `frontend/__tests__/components/consultation/VideoRoom-companion-chat.test.tsx` (NEW; **deferred** until the frontend test harness ships per the existing inbox follow-up — see Notes #5):
  - Desktop renders the chat panel when `companion` is present; renders the "Chat unavailable" notice when `companion` is absent.
  - Mobile renders the tab switcher when `companion` is present; renders no tab switcher (just full-width video) when `companion` is absent.
  - Mobile: switching to Chat tab does NOT call `onDisconnect` (the Room stays connected).
  - Mobile: incoming `kind: 'text'` message while Video tab selected increments the unread badge by 1.
  - Mobile: incoming `kind: 'system'` message while Video tab selected does NOT increment the badge.
  - Mobile: switching to Chat tab resets the badge to 0.
  - Mobile: badge displays `99+` when count exceeds 99.
- [ ] **Tests** in `frontend/__tests__/components/consultation/TextConsultRoom-layout-prop.test.tsx` (NEW; same harness deferral):
  - `layout='standalone'` (default) renders the header.
  - `layout='panel'` hides the header.
  - `layout='canvas'` renders a slim header.
  - Bubble max-width differs across the three modes (visual snapshot or computed-style assertion).
- [ ] **Manual smoke test (verification posture v1; doctor + patient cross-side):**
  - Provision a video booking, start the consult from the doctor dashboard. Confirm the chat panel appears on the right (desktop). Send a message from the doctor side; open the patient join URL in an incognito window; confirm the chat panel appears for the patient too and the message is visible. Send a message from the patient side; confirm the doctor sees it without delay.
  - Resize the browser below 768px — confirm the tab switcher appears, video stays selected by default, switching to Chat preserves the Twilio Room connection (mute button should still be controllable when switching back to Video; the remote video tile should still be live).
  - Send a message from the patient side while the doctor is on the Video tab — confirm the Chat tab badge increments to "1". Switch to Chat — badge resets, message visible.
  - Confirm the consult-started system banner from Task 37 renders italic + gray + clock icon (NOT a message bubble).
  - End the consult from the doctor side — chat history persists (Plan 04 Decision: post-consult read access is preserved); refreshing the chat URL still loads the messages but the composer is disabled (Plan 04 Task 18 RLS enforces live-only inserts).
- [ ] **Type-check + lint clean.** Frontend `npx tsc --noEmit` exit 0. `npx next lint` clean.
- [ ] **No new env vars. No new routes. No backend changes.**

---

## Out of scope

1. **`<TextConsultRoom>` attachment-rendering UI for the new `kind = 'attachment'` rows.** The schema lands in Task 39 + the `layout` prop lands here, but rich attachment-bubble rendering (image thumbnail, PDF preview, tap-to-view-via-signed-URL flow) is **deferred to a follow-up Task 38b** captured in `docs/capture/inbox.md`. v1 attachment rows render as a generic "📎 Attachment" line with a tap-to-download link via the raw signed URL. Same trade-off applies to Task 24c — both consume the same `<TextConsultRoom>` so the attachment-rendering follow-up benefits both at once.
2. **`<TextConsultRoom>` system-row rendering polish.** v1 renders system rows as a single italic gray line with a clock icon (`<svg>` from lucide-react) prefix. No animation, no avatar, no CTA buttons. Same follow-up as #1 if richer rendering is needed.
3. **Companion-chat retry endpoint.** The "Chat unavailable" notice's retry button is disabled in v1 (no backend endpoint exists). A retry endpoint is captured in `docs/capture/inbox.md` as a follow-up; trigger is a single user complaint that "the chat never showed up."
4. **Collapsible side panel on desktop.** The plan's open question #1 confirms always-open is the v1 doctrine; no collapse toggle.
5. **Chat panel resize handle.** v1 fixes the panel width to a clamp formula (320–480px target 30vw). A draggable resize handle is a polish follow-up — captured in `docs/capture/inbox.md`.
6. **Picture-in-picture / floating-video on mobile when Chat tab is selected.** Tempting (the user could see the doctor's face while typing) but adds significant Twilio SDK + DOM complexity. v1 just hides the video; the Room stays connected so audio still plays. If users complain about losing the visual on mobile chat, follow-up.
7. **Background blur / virtual backgrounds.** Twilio Video supports them; this task does not surface UI for them. Existing `<VideoRoom>` doesn't either. Deferred.
8. **Keyboard shortcut to swap tabs (`Cmd+/`).** Maybe in a polish PR; not in v1.
9. **Persisting "last selected tab" across page refreshes.** v1 always defaults to Video on mobile. Persisting via `localStorage` is a one-line follow-up if users complain.
10. **Voice version of this work** — Task 24c covers `<VoiceConsultRoom>`'s canvas-fill chat mount (no tab switcher, no video pane to hide; the chat IS the canvas). Out of scope here.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — extend with `layout: 'standalone' | 'panel' | 'canvas'` prop + the `onIncomingMessage` callback prop (~30 lines added).
- `frontend/components/consultation/VideoRoom.tsx` — extend with the two-pane desktop layout + the mobile tab switcher + the unread-count state machine + the `companion` prop (~120 lines added; the file grows from ~164 → ~280 lines).
- `frontend/components/consultation/ConsultationLauncher.tsx` — wire `videoSession.companion` through to `<VideoRoom>`'s new `companion` prop (~3 lines).
- `frontend/components/consultation/types.ts` (or wherever the consultation component types live) — mirror the new prop shapes.

**Tests (deferred until frontend test harness ships):**

- `frontend/__tests__/components/consultation/VideoRoom-companion-chat.test.tsx` — new.
- `frontend/__tests__/components/consultation/TextConsultRoom-layout-prop.test.tsx` — new.

**No backend changes. No new env vars. No new routes. No migrations.**

---

## Notes / open decisions

1. **Why mount `<TextConsultRoom>` instead of building a chat panel from scratch?** Decision 9's whole point: a single chat surface used across modalities so the AI pipeline reads one consistent stream. Building a parallel chat panel duplicates the Realtime subscription, the message rendering, the attachment UI, the system-row UI — and silently drifts from the standalone chat over time. Mounting the same component is the only honest implementation of Decision 9.
2. **Why `layout='panel'` instead of building styling logic into `<VideoRoom>`?** The styling diff (header visibility, bubble width, composer placement) belongs to the chat component because it owns those primitives. Pushing it into `<VideoRoom>` would mean `<VideoRoom>` reaches into `<TextConsultRoom>`'s internals — coupling. The `layout` prop is an explicit contract: "I'm being mounted in a side panel; adjust your layout accordingly." Same prop serves Task 24c.
3. **Why does the Twilio Room stay connected when the Chat tab is selected (mobile)?** Disconnecting + reconnecting the Twilio Room on every tab switch would (a) cost 2-5 seconds of reconnect time, (b) generate unnecessary "participant left / joined" events on the other side, (c) break the consult-recording continuity (Twilio composes per-Room not per-Track). Hiding the video element via CSS keeps everything intact for the cost of slightly more memory + battery while in the Chat tab. Acceptable v1 trade-off.
4. **Why doesn't the unread badge increment on system rows?** A system banner (e.g. "Patient joined the consult") shouldn't yank the doctor's attention from the video — it's informational, not conversational. If users complain that they miss legitimate banners (e.g. "Recording paused" in Plan 07), revisit and add a separate "system events" badge or render system events as a transient toast on the video pane.
5. **Frontend test harness deferral.** `<VideoRoom>`'s test file is captured but cannot be written until the inbox-tracked frontend test harness (jest + RTL + ts-jest) bootstraps. Verification posture for this task is `tsc --noEmit` + `next lint` + manual cross-side smoke. The test files are expected to be written in the same PR that bootstraps the harness, retroactively covering Tasks 19 + 20 + 24 + 38 + 24c at once.
6. **Chat panel default width.** Plan says ~30%. v1 uses `clamp(320px, 30vw, 480px)`. Reasoning: at common laptop widths (1280–1440px), 30vw lands at 384–432px which is comfortable for chat; clamping at 480px prevents the chat from eating too much of an ultrawide monitor's video area; the 320px floor matches the typical Twilio Video tile minimum width on the left pane. Pin in the file as a CSS custom property if a future redesign wants to tweak.
7. **Tab switcher styling — match existing dashboard tab component.** Search for existing `<Tabs>` / `<TabsList>` / `<TabsTrigger>` usage in the dashboard pages and reuse the same component if available; otherwise build a minimal one inline matching the dashboard's visual language. Avoid introducing a new design language inside the consultation surface.
8. **Doctor-side authentication for the chat panel.** The doctor uses their existing dashboard Supabase session — RLS's doctor branch (`session_id IN (SELECT id FROM consultation_sessions WHERE doctor_id = auth.uid())`) passes without a per-session token. `<TextConsultRoom>` already handles this from Plan 04 Task 19 (the `accessToken` prop is optional; without it the component uses the existing Supabase client session). No changes needed to the chat component for the doctor side.
9. **What if the chat panel composer has unsent text when the consult ends?** The chat composer is part of `<TextConsultRoom>`; on consult-end (Plan 04 RLS rejects the INSERT because `status != 'live'`), the composer's existing failed-send error UI takes over. No new behavior in this task.
10. **`onIncomingMessage` callback timing.** Fires on Realtime INSERT receipt, NOT on initial-history fetch. Reasoning: initial history loaded on first mount represents conversation that already happened; the doctor knows about it. Only NEW messages (mid-consult arrivals) should trigger the badge. `<TextConsultRoom>` separates these cleanly today (history fetch + Realtime subscription are different code paths); this task taps into the subscription path only.

---

## References

- **Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md) — Frontend layout deliverables → `<VideoRoom>` extension section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 9 LOCKED.
- **Task 36 — `companion` prop source:** [task-36-companion-channel-lifecycle-hook.md](./task-36-companion-channel-lifecycle-hook.md)
- **Task 37 — system-row writer that this panel renders:** [task-37-system-message-emitter.md](./task-37-system-message-emitter.md)
- **Task 39 — schema for the attachment + system rows the panel renders:** [task-39-consultation-messages-attachments-and-system-rows.md](./task-39-consultation-messages-attachments-and-system-rows.md)
- **Plan 04 Task 19 — `<TextConsultRoom>` (this task adds the `layout` prop):** [task-19-text-consult-room-frontend.md](./task-19-text-consult-room-frontend.md)
- **Existing `<VideoRoom>`:** `frontend/components/consultation/VideoRoom.tsx:1-164`.
- **Existing `<ConsultationLauncher>`:** `frontend/components/consultation/ConsultationLauncher.tsx` (video branch is the wire-up site).
- **Task 24c (sibling — voice room canvas-fill):** [task-24c-voice-consult-room-companion-chat-mount.md](./task-24c-voice-consult-room-companion-chat-mount.md)

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Completed 2026-04-19 — shipped alongside the existing `<TextConsultRoom>` upgrade (layout prop + system/attachment rendering + `onIncomingMessage`). Task 24c (voice parallel) still pending per `EXECUTION-ORDER.md`.

---

## Decision log (2026-04-19)

1. **Added `sessionId` to `companion` result shape (backend + frontend).** The task spec called for `<VideoRoom companion={{ sessionId, patientToken? }}>`. The Task 36 `companion` shape that reaches the frontend today carries `{ patientJoinUrl, patientToken, expiresAt }` — the session UUID was implicit (embedded in the URL path). Rather than have `<VideoRoom>` parse `/c/text/{id}?t=...` to recover it, I echoed `sessionId` at three layers: `ProvisionCompanionChannelResult`, `SessionRecord.companion`, `StartConsultationResult.companion` (and the mirror `StartConsultationData.companion` on the frontend). The doctor-side mount uses this directly — no URL parsing, no string-matching.
2. **Doctor-side auth is fetched lazily inside `<VideoRoom>`, not threaded as props.** The task spec implies the doctor uses their dashboard Supabase session; rather than widening `<VideoRoom>`'s props with `doctorAccessToken` / `doctorUserId`, the companion-panel branch calls `createClient().auth.getSession()` on mount. This keeps the external prop shape minimal (`{ sessionId, patientToken? }`) and localizes "where does the JWT come from" to one spot. The ‟Chat unavailable" notice surfaces if the session lookup fails (e.g. a stale browser that lost auth between page load and companion mount).
3. **`<TextConsultRoom>` `layout` prop implemented as pure CSS; no plumbing branches.** Container class, header visibility, bubble max-width, and padding vary by `layout` — everything else (Realtime plumbing, composer, message merge) is identical. This keeps the `standalone` (Plan 04 Task 19) behavior verbatim and means Task 24c's `canvas` layout is the same contract with a slightly different Tailwind class bundle.
4. **`onIncomingMessage` fires from the Realtime INSERT handler only, not the historic fetch.** Per Note #10: initial history = messages that already happened, and the receiving user knows about them. Only NEW Realtime arrivals should bump the badge. The two code paths are already separate in `<TextConsultRoom>` so the filter is a literal placement choice, not a flag.
5. **System-row rendering landed in this task (italic + clock icon), attachment rendering is minimal (📎 + link).** The task spec declares polish "out of scope" but ships a baseline — italic gray line with a lucide-style clock SVG for system rows, and a plain `<a>` + 📎 prefix for attachment rows. Rich attachment previews (image thumbnails, PDF viewer) and system-row polish (avatars, animations, CTAs) are captured for a follow-up.
6. **Twilio Room stays connected across mobile tab switches (CSS `hidden`, not unmount).** Task spec Note #3 — unmounting + reconnecting would cost 2-5s of reconnect time plus spurious `participantConnected` / `Disconnected` events on the other side. Same treatment extended to the chat pane on mobile: `<TextConsultRoom>` stays mounted when the Video tab is selected so the Realtime subscription doesn't churn (same rationale — subscription rebuild is slow + wastes Realtime-seat allotment).
7. **Unread badge skips system rows AND self-sent messages.** Note #4 covers the system-row filter. Self-sent filter is an add-on: the Realtime echo of a message the local user just sent also arrives as an INSERT event; without filtering it would silently bump the badge on a Video tab for a message the user just typed on Chat tab (before switching back). Gated on `msg.senderRole === role` — a coarse but effective filter for v1 since the badge only matters on mobile where only one party is typically local.
8. **Companion prop shape accepts `patientToken?: string`, even on doctor-side mounts, for Task 24c reuse.** The task spec calls this out explicitly — doctor `<VideoRoom>` ignores `patientToken`, but the same `companion` shape passes through to `<VoiceConsultRoom>` (Task 24c) where the patient-side mount uses it. Keeping the prop shape consistent means Task 24c is plumbing-only.
9. **Desktop panel width: `clamp(320px, 30vw, 480px)` via Tailwind arbitrary class.** Plan says ~30%; 320 floors avoids the chat feeling cramped on small laptops, 480 caps prevent ultrawide users from losing too much video area. Pinned as an inline Tailwind class rather than a CSS variable to keep the file self-contained; if a future redesign wants to tweak, promoting to `theme.extend.width` or a CSS var is a one-line move.
10. **Test files deferred per task spec (frontend test harness not yet bootstrapped).** Acceptance-criteria `VideoRoom-companion-chat.test.tsx` + `TextConsultRoom-layout-prop.test.tsx` are named and scoped; they'll land in the same PR that brings up the frontend harness. Verification posture for this task: `npx tsc --noEmit` (backend + frontend — both green), full backend `npx jest` (110 suites / 1449 tests green, including the updated companion-hook + companion-helper suites), `npx next lint` (no warnings or errors), manual smoke deferred until the test harness PR.
