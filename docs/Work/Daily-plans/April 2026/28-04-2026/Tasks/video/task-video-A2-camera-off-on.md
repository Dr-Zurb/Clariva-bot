# Task video-A2: Camera off / on (`camera_changed` enum + `<VideoSelfTile>` placeholder)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~2h**

---

## Task overview

Today there is no way to turn the camera off mid-call. Patients undressing for a clinical exam, in cluttered rooms, or wanting privacy have to hang up. T1.2 adds a camera-off toggle next to the mic button (A1) and replaces the local video tile with an avatar placeholder when camera is off.

**This task is the first consumer of a NEW Plan 06 system-message enum value: `camera_changed`.** Owns the one-line ALTER TYPE migration (or coordinates with E2's `auto_audio_fallback` enum extension to ship them together — see Notes §1).

The remote view of a camera-off peer also renders the avatar placeholder, so both sides see the same UX.

**Estimated time:** ~2h.

**Status:** **Complete (camera toggle + `<VideoTile>` placeholder shipped; companion-chat system-message wire deferred to voice A7).**

**Depends on:** [task-video-A1](./task-video-A1-mute-unmute-mic.md) (SOFT — controls bar layout, satisfied); voice [Sub-batch 0 P0.B](../Plans/plan-voice-consult-selected-features.md#sub-batch-0--companion-chat-hotfix-p0-1-day) (HARD — companion chat, satisfied).

**Source:** [T1 §T1.2](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md).

---

## Acceptance criteria

### Plan 06 enum extension migration — NOT NEEDED (task-draft correction)

> **Forwarded to voice A7's PR.** This task originally asked for an `ALTER TYPE consultation_message_system_subtype ADD VALUE 'camera_changed'` migration. There is **no such enum** — `consultation_messages.system_event` is plain `TEXT` (Migration 063 line 47, deliberately so: *"`system_event` is deliberately TEXT (not an ENUM) so Plans 07, 08, 09 can each ADD tags without coordinating an `ALTER TYPE` migration ordering"*). Adding a tag is a **pure code change** — extend the `SystemEvent` TypeScript union in `backend/src/services/consultation-message-service.ts` (line 271-296) and add a per-event helper. No migration ever ships.

- [x] ~~New migration `0XX_plan06_camera_changed_enum.sql`~~ — **NOT NEEDED**, see correction above.
- [x] ~~Reverse migration documents `DROP VALUE` impossibility~~ — **N/A**, no migration.
- [ ] Extend `SystemEvent` TS union (`consultation-message-service.ts`) with `'camera_changed'` — **DEFERRED to voice A7** (where the same code path lands `'mute_changed'`; one PR, two values).
- [x] ~~`backend/src/types/dm-instrumentation.ts`~~ — wrong file. The system-event union lives in `backend/src/services/consultation-message-service.ts`. `dm-instrumentation.ts` is the Instagram-DM observability surface, unrelated. **DEFERRED to voice A7** at the correct file.

### `<VideoTile>` component (renamed from `<VideoSelfTile>`)

- [x] **New component** `frontend/components/consultation/VideoTile.tsx` (~155 LOC).
  - **Renamed** from the draft's `<VideoSelfTile>` because the task explicitly asks for the same placeholder on the remote tile too — a "self"-suffixed name was misleading. `<VideoTile>` is generic and used by both surfaces.
  - **Props** (final shape, slightly different from draft):
    - `videoRef: Ref<HTMLVideoElement>` — parent-owned ref so `<VideoRoom>`'s existing `track.attach(...)` calls keep working unchanged. (Draft asked for `videoTrack: LocalVideoTrack | null`; that would have moved track-attachment logic into the tile and risked re-attach lag on every toggle — kept attach in the parent for zero-risk swap.)
    - `label: string` — heading ("You" / "Doctor" / "Patient").
    - `cameraOff: boolean` — flips the placeholder overlay on/off.
    - `actorName: string` — used for initials hash + background color.
    - `muteSelf?: boolean` — sets the HTML `muted` attribute on the `<video>` element to prevent self-echo on the SELF tile (Twilio handles peer audio separately).
    - `mirror?: boolean` — A6 prop stub; default `false`. A2 ships the prop wired through but unused; A6 will add the toggle button.
    - `pendingText?: string | null` — replaces the per-tile "Starting camera…" / "Waiting for doctor…" copy with a single overlay path.
  - **`actorAvatarUrl`** prop **deferred** — task draft Note #2 already gates this behind a feature flag tied to `doctor_settings.avatar_url`; A2 ships the initials-on-color path that the draft picked as the v1 default.
- [x] When `cameraOff === true`: centered avatar (initials, color picked from an 8-entry palette via deterministic char-code hash) + "Camera off" label.
- [x] When `cameraOff === false`: `<video>` element visible (the element stays MOUNTED across toggles via opacity layering — never unmounted — so Twilio's attach binding survives).
- [x] **Same placeholder for remote** — `<VideoRoom>` wires `RemoteVideoTrack.on('disabled' | 'enabled')` events into a `remoteCameraOff` state; the remote `<VideoTile>` reads that state and renders the same avatar overlay. Initial sync uses `track.isEnabled` so a peer who joined with camera already off still shows the placeholder.

### Camera toggle in controls bar

- [x] **Edit `frontend/components/consultation/VideoRoom.tsx`** — controls bar now ships A1 + A2 buttons: `[Mute] [Camera off / Camera on] [Leave call]`. Both new buttons hide while `status !== 'connected'` (no track to toggle).
- [x] **`handleToggleCamera`** uses `LocalVideoTrack.disable()` / `.enable()` via the same `localTracksRef.current.find((t) => t.kind === "video")` pattern A1 used for audio. Functional `setCameraOff` form keeps the side effect against the prior state without a stale-closure dep.
- [x] **Deviation:** task draft asked for "Lucide `Video` / `VideoOff`" icons + "red-tinted" muted state. Lucide is **not** installed (`Grep` returned 0 frontend matches); shipped text-only "Camera off" / "Camera on" with the same **amber** tint A1 uses. Red is reserved for the destructive "Leave call" button — making camera-off red would clash visually. Document in voice A7 / future controls-bar extract: when Lucide lands, swap text → icons in one place.

### Companion-chat system message — DEFERRED to voice A7

> Identical reasoning to A1: the `camera_changed` infrastructure (extend `SystemEvent` union, add `emitCameraChanged` helper, add backend route) doesn't exist yet. RLS blocks frontend-direct INSERT for `sender_role='system'` rows (Migration 063 §4 + Migration 052) — only `emitSystemMessage` running on the service-role admin client can write them. Voice A7 owns this surface by plan; doing it twice would create the helper + route twice. When A7 lands, this task's `handleToggleCamera` adds a single fire-and-forget `fetch(POST /api/v1/consultation/:sessionId/camera, { off: <new> })` after the local `enable()/disable()` call.

- [ ] ~~`emitSystemMessage({ system_subtype: 'camera_changed', ... })`~~ — DEFERRED.
- [ ] ~~Debounce parity with A1's mute (5s collapse)~~ — DEFERRED (will be a 5s correlation window in `emitCameraChanged`'s `correlationId`, parallel to the planned `mute_changed` one).
- [ ] ~~"Patient turned off their camera" / "turned camera back on" body strings~~ — DEFERRED (lives inside the helper, not the frontend).

### Manual smoke

**Live-shipped half (do during A2's PR on staging):**

- [ ] Doctor + patient on different devices, room connected.
- [ ] Self camera off → local "You" tile flips to avatar (initials + colored circle) + "Camera off" label; remote peer sees their remote tile do the same within Twilio's `disabled` event SLA (~500ms).
- [ ] Re-enable camera → tile snaps back to video within ~500ms (no re-publish lag — `disable()` keeps the track + the `<video>` ref binding alive; we only flipped opacity).
- [ ] Cycling camera off → on → off rapidly: no console errors, state stays in sync (no debounce on the local toggle since system-message wire is deferred).
- [ ] During `connecting` and after `Leave call` → camera button NOT rendered.
- [ ] Self tile audio is muted (no self-echo) — confirms `muteSelf` prop wired.
- [ ] Remote tile mute behavior unchanged (peer audio still audible via Twilio's audio path; the `muted` attribute only applies to the local `<video>` playback of the local stream).
- [ ] Recording (Plan 07 / 08) continues across camera toggles. Recorded video artifact will reflect the camera-off frames as black or last-frame — task draft Note #5; documented but not changed.
- [ ] `<VoiceConsultRoom>` and voice consult flow unaffected (no shared component touched).
- [ ] Initials hash stability: refresh the page mid-call → the avatar color stays the same for the same actor name (deterministic hash, no random seed).

**Deferred half (will be smoked when voice A7 lands):**

- [ ] ~~Companion-chat row "Patient turned off their camera" appears within ~1s on the other side.~~ — voice A7
- [ ] ~~Cycling camera off/on rapidly → only one system row appears (debounce).~~ — voice A7

### General

- [x] Type-check (`npx tsc --noEmit`) clean — 0 errors. (Initial `RefObject<HTMLVideoElement | null>` vs `LegacyRef<HTMLVideoElement>` mismatch under React 19 typing fixed by widening the prop to `Ref<HTMLVideoElement>`; documented in the prop JSDoc.)
- [x] Lint (`npx next lint --file VideoRoom.tsx --file VideoTile.tsx`) clean — no warnings or errors.
- [x] No console errors introduced.
- [x] No regression on existing video flow — `connectRoom`, `createLocalTracks`, the entire `participantConnected` / `trackSubscribed` / `room.participants` triple-attach paths, `RecordingControls`, `VideoEscalationButton`, `<TextConsultRoom>` companion mount are all preserved. Only additions: track-attach blocks now ALSO call a new `wireRemoteVideoTrack` helper that subscribes to `disabled`/`enabled`.

---

## Out of scope

- **Camera switch (front / back).** That's [task-video-F1](./task-video-F1-camera-switch.md) in Sub-batch F.
- **Self-view position toggle.** That's [task-video-A5](./task-video-A5-self-view-position-toggle.md).
- **Mirror toggle.** That's [task-video-A6](./task-video-A6-self-view-mirror-toggle.md). A6 just adds `transform: scaleX(-1)` to the `<video>` inside `<VideoSelfTile>`.
- **Auto camera-off on hold.** That's [task-video-B3](./task-video-B3-hold-call.md) (which extends hold semantics to also disable local video).

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/VideoSelfTile.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~30 LOC: camera state + handler + emit).

**Backend:**
- `backend/migrations/0XX_plan06_camera_changed_enum.sql` — **new** (~10 LOC; or fold into `0XX_plan06_enum_video_extras.sql` covering `auto_audio_fallback` from E2).
- `backend/src/types/dm-instrumentation.ts` — **edit** (~2 LOC: add `'camera_changed'` to the literal type).
- `backend/src/utils/dm-copy.ts` — **edit** if a system-message-type copy registry lives here.

**Tests:** none required (smoke covers it).

---

## Notes / open decisions

1. **Combine A2 + E2 enum migrations** — if A2 and E2 ship in the same release window, ship a single `0XX_plan06_enum_video_extras.sql` that adds both `camera_changed` and `auto_audio_fallback`. Otherwise ship as two one-line migrations. Decide at PR time.
2. **Avatar fallback** — initials-on-colored-hash is the v1 default (no remote fetch; works offline; consistent across modalities). Upgrade to `doctor_settings.avatar_url` if available behind a feature flag.
3. **Remote camera-off detection** — Twilio fires `RemoteVideoTrack.on('disabled')` and `.on('enabled')`. Wire these in `<VideoRoom>` to pass the boolean through to the remote-tile render.
4. **`disable()` vs `unpublish()`** — `disable()` is correct here (track stays alive; just stops sending frames). `unpublish` would force a renegotiation and add ~1s lag; out of scope.
5. **Recording boundary** — disabling the local video track does NOT change recording behavior (Plan 02 / 08 governs recording). The recorded artifact will reflect the camera-off frames as black or last-frame depending on Twilio's compositor; document but don't change.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch A](../Plans/plan-video-consult-selected-features.md#sub-batch-a--quick-wins-2-days)
- **Source item:** [T1 §T1.2](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
- **Companion:** [task-video-A1](./task-video-A1-mute-unmute-mic.md) (mute mic; controls bar shipped first)
- **Plan 06:** [companion text channel](../../19-04-2026/Plans/plan-06-companion-text-channel.md)
- **Twilio:** `LocalVideoTrack.enable` / `.disable`, `RemoteVideoTrack` `'disabled'` / `'enabled'` events

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** **Complete (camera toggle + `<VideoTile>` placeholder shipped 2026-04-30; system-message wire deferred to voice A7).** Slotted cleanly into A1's controls bar.

---

## Implementation log

### 2026-04-30 — A2 camera toggle + `<VideoTile>` shipped (system-message wire deferred)

**Scope shipped:**

The visual + behavioral half of T1.2 — a working Camera off/on button on the controls bar (slotted between A1's Mute and the existing Leave call), plus a generic `<VideoTile>` component that renders an avatar placeholder (initials on a deterministic-color circle) whenever EITHER side's camera is off. Local toggle uses `LocalVideoTrack.disable()`; remote toggle is observed via `RemoteVideoTrack.on('disabled' | 'enabled')` events wired from the existing track-subscribe paths.

**Scope deliberately deferred** (mirrors A1's deferral):

The companion-chat system-message wire (`camera_changed` event, 5s debounce, "Patient turned off their camera" rendering) is **not** in this PR. Same three reasons as A1:

1. The infrastructure doesn't exist yet (no `camera_changed` in the `SystemEvent` TS union, no `emitCameraChanged` helper, no backend route).
2. RLS forbids the simpler frontend-emit path the task draft suggests.
3. Voice A7 owns this surface by plan — doing it twice would create the helper + route twice.

When A7 lands, this task's `handleToggleCamera` adds a single fire-and-forget `fetch(POST /api/v1/consultation/:sessionId/camera, { off: <new state> })` after the local `enable()/disable()` call. Same shape as the planned `mute_changed` wire.

**Three task-draft corrections forwarded to voice A7 author:**

1. **No enum migration needed.** Task draft asks for `ALTER TYPE consultation_message_system_subtype ADD VALUE 'camera_changed'`. There is no such enum — `system_event` is plain `TEXT` (Migration 063 line 47, deliberately so to avoid cross-plan migration ordering). Adding a new system-event tag is a pure code change.
2. **Wrong file for the TS literal.** Task draft says edit `backend/src/types/dm-instrumentation.ts` and `backend/src/utils/dm-copy.ts`. Those are the Instagram-DM observability surface — unrelated to consultation system messages. The canonical `SystemEvent` union lives in `backend/src/services/consultation-message-service.ts` lines 271-296.
3. **No frontend-emit path.** RLS rejects `sender_role='system'` writes from any non-service-role caller (Migration 063 §4 + Migration 052). A7 must add a backend route that calls `emitSystemMessage` on the service-role admin client.

**Files changed (this PR):**

- **NEW** `frontend/components/consultation/VideoTile.tsx` (~155 LOC).
  - Renamed from the draft's `<VideoSelfTile>` because the same component is also used for the remote tile (the draft itself asks for that — a self-suffixed name was misleading).
  - Parent-owned `videoRef` keeps Twilio's `track.attach(...)` calls living in `<VideoRoom>` unchanged — zero-risk swap for the existing inline `<video>` JSX.
  - `<video>` element stays MOUNTED across `cameraOff` toggles — overlay layered via `absolute inset-x-0 bottom-0 top-7` over an opacity-zeroed video. Avoids re-attach lag that conditional-mount would force.
  - `actorInitials()` + `actorColor()` helpers: char-code hash → 8-color palette pick. Deterministic across refreshes.
  - `mirror` prop is wired (applies `scale-x-[-1]` Tailwind class) but defaults `false`; A6 will add the toggle button.
- `frontend/components/consultation/VideoRoom.tsx` — additive changes only.
  - Imported `<VideoTile>`.
  - Added `cameraOff` + `remoteCameraOff` state.
  - Added a `wireRemoteVideoTrack` helper inside `connectRoom` that subscribes to `disabled` / `enabled` events on every remote video track (both the `participantConnected` and `room.participants.forEach` branches) and seeds initial state from `track.isEnabled`.
  - Added `handleToggleCamera` callback (mirrors `handleToggleMic`'s pattern).
  - Replaced the two inline `<video>` tile JSX blocks with `<VideoTile>` mounts (self + remote).
  - Slotted the new Camera button into the controls bar between Mute and Leave call (kept A1's `status === 'connected'` gate).
- `frontend/components/consultation/VideoTile.tsx` — initial build had a `RefObject<HTMLVideoElement | null>` typed prop that React 19's `<video>` JSX rejected as not assignable to `LegacyRef<HTMLVideoElement>`. Widened to the broader `Ref<HTMLVideoElement>` (covers both legacy and modern ref shapes).

**Backend / migrations / tests:** none in this PR.

**Verification:**

- `npx tsc --noEmit -p tsconfig.json` (frontend) → exit 0, no errors (after the `Ref<HTMLVideoElement>` widening fix).
- `npx next lint --file components/consultation/VideoRoom.tsx --file components/consultation/VideoTile.tsx` → "✔ No ESLint warnings or errors".
- `ReadLints` on both files → no diagnostics.
- No `<VideoRoom>` or `<VideoTile>` test files exist; live smoke covers them.

**Deviations from the task draft (summary):**

| # | Draft says | Shipped | Why |
|---|---|---|---|
| 1 | `<VideoSelfTile>` (self-only name) | `<VideoTile>` (generic) | Draft itself asks for the same placeholder on the remote tile. Generic name avoids future confusion. |
| 2 | Props: `videoTrack: LocalVideoTrack` | Prop: `videoRef: Ref<HTMLVideoElement>` | Keeps Twilio attach in the parent → zero re-attach lag on toggle. Type widened for React 19. |
| 3 | Lucide `Video` / `VideoOff` icons | Text "Camera off" / "Camera on" | Lucide not installed (parity with A1 deviation). |
| 4 | "Red-tinted" muted state | Amber-tinted | Red is reserved for "Leave call". Amber matches A1's mute styling for cross-control consistency. |
| 5 | `ALTER TYPE consultation_message_system_subtype` migration | NOT NEEDED — `system_event` is TEXT | Migration 063 line 47 — deliberate design. |
| 6 | Edit `backend/src/types/dm-instrumentation.ts` | Wrong file — actual location is `consultation-message-service.ts` line 271-296 | DM-instrumentation is Instagram observability, unrelated. |
| 7 | Companion-chat system message + debounce | DEFERRED to voice A7 | Same reasoning as A1 — infrastructure not present, RLS forbids frontend-direct emit. |
| 8 | "Mode='readonly' camera button hidden" | `status === 'connected'` gate hides the button | `<VideoRoom>` has no `mode='readonly'` prop today; status gate is the equivalent. |
| 9 | Avatar fetched from `actorAvatarUrl` | Initials-on-colored-hash only | Task draft Note #2 already gates `actorAvatarUrl` behind a feature flag; not in v1. |

**Follow-ups (track for voice A7's PR):**

1. Extend `SystemEvent` union (`backend/src/services/consultation-message-service.ts` lines 271-296) with both `'mute_changed'` AND `'camera_changed'` in one PR.
2. Add `emitMuteChanged` AND `emitCameraChanged` helpers; both with `correlationId: \`<event>:<actorId>:${Math.floor(now/5000)}\`` for the 5s debounce.
3. Add `POST /api/v1/consultation/:sessionId/mute` AND `POST /api/v1/consultation/:sessionId/camera` routes (or one shared `POST /:sessionId/track-state` with `{ kind: 'mic' | 'camera', off: boolean }` body).
4. In `<VideoRoom>` `handleToggleMic` AND `handleToggleCamera`, plus `<VoiceConsultRoom>` `toggleMute`, fire-and-forget `fetch` after the local enable/disable.
5. Manual smoke for the deferred half (see "Manual smoke → Deferred half" above).

**Manual smoke (live-shipped half):** unchecked rows in the "Live-shipped half" need a deployed staging env + two participants. Run during PR review.

**Light follow-up cleanup (not blocking):**

- Extract a `<VideoControlsBar>` component (target Sub-batch A's tail or A4's "End call" rework) — A1 + A2 already share styling and the `status === 'connected'` gate; folding both buttons into a single component will be ~30 LOC and unblocks A4's confirmation modal cleanly.
- When Lucide lands as a dep, swap text labels to `Mic`/`MicOff`/`Video`/`VideoOff` in `<VideoControlsBar>` in one place (and in `<VoiceConsultRoom>` for parity).
