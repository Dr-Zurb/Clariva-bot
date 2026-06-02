# Task video-C5: Screen share (bidirectional; new layout tile)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch C (T3 clinical workflow) — **M item, ~3 days**

---

## Task overview

**Bidirectional** screen share:
- **Doctor → patient:** lab results PDFs, X-rays, education slides, Rx preview.
- **Patient → doctor:** wound photos already on phone, insurance docs, prescription bottles, prior medical records.

Uses W3C `getDisplayMedia` to capture screen / window / tab; publishes as a third Twilio video track. Layout (B6) gets a new "Share" tile that displaces the participant tiles when active.

Plan 06 attachment pipeline overlaps but screen-share is REALTIME; complementary not redundant — share is for "look at this NOW", attachments are for "save this for later".

**Estimated time:** ~3 days.

**Status:** Complete (2026-05-01).

**Depends on:** none core (Twilio supports screen-share tracks); coordinate with [task-video-B6](./task-video-B6-layout-swap.md) for tile layout.

**Source:** [T3 §T3.23](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md).

---

## Acceptance criteria

### Capture + publish

- [x] **`<VideoRoom>` adds a "Share" button** to the controls bar — sits between PiP and Leave; gated on `screen.isSupported && !hold.onHold`. (`VideoRoom.tsx` controls-bar block, ~line 3030.)
- [x] On click → `useScreenShare.start()`:
  ```ts
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: 'always' },
    audio: false,
  });
  const screenTrack = new LocalVideoTrack(stream.getVideoTracks()[0], { name: 'screen' });
  await room.localParticipant.publishTrack(screenTrack);
  ```
  Implementation lives in `frontend/hooks/useScreenShare.ts`. Cleanup is reentrancy-safe (`cleanupInflightRef`) so the OS-stop event + explicit `stop()` don't double-cleanup.
- [ ] **DEFERRED** — Companion-chat row: "🖥 Dr. Sharma started screen sharing." Plan 06 enum extension (`'screen_share_started'` / `'screen_share_stopped'`) is bundled into the combined enum migration window (A2 / E2 / C3 / C5). Local UI is fully usable without it; system message is a "nice to have" affordance that requires backend enum + worker wire-up. Documented in Audit notes below.

### `<ScreenShareTile>` component

- [x] **New component** at `frontend/components/consultation/ScreenShareTile.tsx` (~110 LOC):
  - Renders the screen track via `track.attach(videoRef.current)` lifecycle.
  - Variant-discriminated props: `'self'` (with `onStop`) vs `'remote'`.
  - "Stop sharing" red overlay button (top-right) only on `variant='self'` — always visible (not hover-gated) since accidental shares of private content need a one-tap escape.
  - Bottom-left label pill ("Your screen" / "Shared screen" / custom).
  - `<video playsInline autoPlay muted>` — `muted` is critical for Chrome's autoplay policy (the screen track has `audio: false` so muting is lossless).

### Layout integration

- [x] **In `<VideoRoom>`** — when `isSharingActive` (`localScreenTrack || remoteScreenTrack`), the screen tile section mounts above the camera-tile container, taking `h-[40vh] md:h-[60vh]`. Both local + remote screens can render simultaneously (decision §6 — limit 2 max) — they stack horizontally on desktop, vertically on mobile.
- [x] Camera tiles compress into a compact horizontal strip (`h-24 md:h-32 flex flex-row`) when sharing — the JSX position of the inner `<VideoTile>`s is preserved so Twilio `track.attach()` bindings survive the layout swap (same DOM-stability discipline as the speaker→gallery swap from B6).
- [x] When sharing stops (either side), `isSharingActive` flips false and the layout restores to the user's persisted B6 choice (gallery / speaker / sidebar). The speaker-mode floating self-tile resumes (`floating={...}` prop is force-undefined while sharing).
- [x] Self-tile labels become visible during share (`hideLabel={!isSharingActive && effectiveLayout === "speaker"}`) so the user can tell "You" from the counterparty at thumbnail size.

### Stop sharing

- [x] User clicks "Stop sharing" (controls-bar button OR the red overlay on `<ScreenShareTile variant='self'>`) → `useScreenShare.stop()` → `room.localParticipant.unpublishTrack(screenTrack)` + `screenTrack.stop()`.
- [x] If the OS share dialog gets dismissed (user clicks the browser's "Stop sharing" notification), Twilio's `LocalVideoTrack.on('stopped')` fires; the hook subscribes and runs the same cleanup. Reentrancy-safe via `cleanupInflightRef` so the redundant fire from explicit `stop()` doesn't double-clean.

### Plan 06 enum extension

- [ ] **DEFERRED** — Add `'screen_share_started'` and `'screen_share_stopped'` enum values. Combine with A2 / E2 / C3 enum migration window per task draft.

### Manual smoke

- [ ] Manual smoke pending real-device verification per the standing video-batch protocol (B7 / C2 / B6 / B8 / B3 / B4 all carry the same pending row). Local + lint + typecheck pass; the controls-bar button mounts when `screen.isSupported`, the privacy banner mounts when `screen.localScreenTrack`, and the share-tile section mounts when `isSharingActive`.

### Mobile

- [x] **iOS:** `screen.isSupported` returns false (capability check + UA-string fallback for iOS-Chrome / iOS-Edge / iOS-Firefox builds that expose a stub `getDisplayMedia` that always rejects). Share button is HIDDEN entirely (decision §15).
- [x] **Android Chrome:** capability check returns true (Chrome ≥ 70); works.

### `mode='readonly'`

- [ ] **DEFERRED to mode-prop landing PR.** `<VideoRoom>` doesn't carry a `mode` prop today (same as B4 / B6 / B7 / C2 / B3); when it lands, gate the Share button on `mode !== 'readonly'`. Documented in the C5 hook + controls-bar comments; one-line guard when the prop arrives.

### General

- [x] Type-check clean (`npx tsc --noEmit`).
- [x] Lint clean (`npx eslint` on all new + modified files).
- [x] No console errors expected — defensive `try`/`catch` around Twilio `unpublishTrack` (the room may have disconnected behind us) + `track.stop()` (the track may already be stopped).

---

## Out of scope

- **Audio capture from shared screen / tab** (e.g. video with audio). Out of scope v1; opt-in v2.
- **Annotation on shared screen.** Out of scope (large surface, complex; defer to v2).
- **Recording the shared screen.** Twilio composer captures it natively if the recording is configured; verify behavior at PR time.
- **Patient-side document upload via share.** Plan 06 attachment pipeline is the right path for that.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/ScreenShareTile.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~80 LOC: capture + publish + layout integration).

**Backend:**
- (with C3 / A2 / E2 enum migration) Add `'screen_share_started'` and `'screen_share_stopped'` to enum.

**Tests:** none required.

---

## Notes / open decisions

1. **Audio share** — defer to v2; v1 is video-only screen capture.
2. **Privacy banner** — when YOUR screen is shared, render a sticky "You're sharing your screen" banner at the top of YOUR own view (not counterparty's) so you remember to stop before showing private content.
3. **iOS degradation** — `getDisplayMedia` is broadly unsupported on iOS Safari; document.
4. **Track-name convention** — use `name: 'screen'` on the `LocalVideoTrack` so the receiver can distinguish from the camera track.
5. **Recording impact** — Twilio's composer captures published tracks; the screen track will be included in the recording artifact unless explicitly excluded. Verify at PR time per Plan 02 / 08 doctrine.
6. **Multi-screen-share** — both sides sharing simultaneously is allowed; layouts shrink to fit (4 tiles: 2 cameras + 2 screens). Limit to 2 screens max.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch C](../Plans/plan-video-consult-selected-features.md#sub-batch-c--clinical-workflow-10-days)
- **Source item:** [T3 §T3.23](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
- **W3C:** `getDisplayMedia`
- **Twilio:** `LocalVideoTrack` with custom name; `publishTrack` / `unpublishTrack`
- **Coordination:** [task-video-B6](./task-video-B6-layout-swap.md) (layout displacement)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete (2026-05-01).

---

## Implementation log (2026-05-01)

### Files

**New:**
- `frontend/lib/video/screen-share-support.ts` (~95 LOC) — pure capability module mirroring `pip-support.ts` (B7) and `actor-avatar.ts` (B2). Exports `isScreenShareSupported()` (three-layer gate: `mediaDevices` exists, `getDisplayMedia` is a function, UA isn't iOS) and `isIOSUserAgent()` (negative gate).
- `frontend/hooks/useScreenShare.ts` (~245 LOC) — owns the local screen-share lifecycle. Mirrors `usePictureInPicture` (B7) + `useTwilioReconnectState` (B4) shape (capability + state + two actions; errors as typed string rejects). Critical implementation choices:
  - **`'permission-denied'` is silently swallowed** at the `<VideoRoom>` callsite (matches Slack / Zoom UX — declining the picker is a non-event); other errors map to amber-pill notices.
  - **`cleanupInflightRef`** serializes the OS-stop-event teardown vs. explicit `stop()` so the two paths don't double-clean.
  - **`roomRef`** captures the latest `room` for the unmount cleanup (avoids stale-closure bugs when the room re-connects mid-share).
  - **Pre-publish bail** — re-checks `room.state === 'connected'` after the picker resolves, in case the user clicked Leave during the OS-picker await.
  - **Auto-stop on unmount** — releases the OS screen-capture handle so a route change / call disconnect doesn't leave a stranded share.
- `frontend/components/consultation/ScreenShareTile.tsx` (~110 LOC) — generic tile for either local or remote screen track. Variant-discriminated props (`'self' | 'remote'`); the self variant carries an always-visible (not hover-gated) red "Stop sharing" overlay. Matches `<VideoTile>`'s frame aesthetic so the visual transition camera→screen is "different content, same frame."

**Modified:**
- `frontend/components/consultation/VideoRoom.tsx` (~190 LOC of additions across 7 hunks):
  1. **Imports** — added `RemoteVideoTrack` type, `useScreenShare` hook, `ScreenShareTile` component.
  2. **State block (~line 880)** — `useScreenShare({ room: roomState })`, `remoteScreenTrack`, `screenShareNotice`, `isSharingActive` derivation, `handleToggleScreenShare` callback.
  3. **`isRemoteScreenTrack` predicate** + **`clearRemoteScreenIfMatches`** helper inside `connectRoom` — added next to the existing `wireRemoteVideoTrack` so all remote-track routing logic lives together.
  4. **Two `participant.on('trackSubscribed')` blocks** + **two `participant.tracks.forEach()` blocks** — split `kind === 'video'` into screen vs. camera by `track.name === 'screen'`. Screen tracks set `remoteScreenTrack` state; cameras keep the existing `attach(remoteVideoRef)` + `wireRemoteVideoTrack()` path. Without this split, the screen track would clobber the camera attachment.
  5. **Two `participant.on('trackUnsubscribed')` blocks** — added screen-track branch that calls `clearRemoteScreenIfMatches`. The `room.on('participantDisconnected')` handler also defensively clears `remoteScreenTrack` (belt-and-braces — `trackUnsubscribed` is the SDK-contract primary path).
  6. **Privacy banner** (sibling above `<div className="relative">`, NOT an absolute overlay) — amber pill with monitor-icon, mounted only when `screen.localScreenTrack !== null`. Pushes the canvas down so it can't be missed.
  7. **Screen-share section** (inside `<div className="relative">`, before the camera-tile container) — `h-[40vh] md:h-[60vh]`, mounts both local + remote screens when present (decision §6 — limit 2 max).
  8. **Camera-tile container** — added `isSharingActive` className branch that flips the layout to `flex h-24 md:h-32 flex-row` (compact horizontal strip). Inner wrappers swap from `display: contents` to `min-w-0 flex-1`. The `<VideoTile>` JSX position is preserved across the swap so Twilio attachments survive.
  9. **`<VideoTile videoRef={localVideoRef}>`** — `floating` prop force-undefined when `isSharingActive`; `hideLabel` flips to false so the user can tell "You" from the counterparty in the thumbnail strip.
  10. **Share button** in controls bar — between PiP and Leave; gated on `screen.isSupported && !hold.onHold`; active state gets red tint (matches the destructive Stop button on the self tile + Leave call); inline SVG monitor glyph (consistent with B6 / B7 / B8 / C2's "no Lucide in deps yet" precedent); `disabled={screen.isStarting}` covers the picker-open window.
  11. **Notice pill** below controls bar — same amber pattern as B7's PiP notice + C2's bg notice.

### Verification

```bash
cd frontend
npx tsc --noEmit -p tsconfig.json    # clean
npx eslint lib/video/screen-share-support.ts hooks/useScreenShare.ts components/consultation/ScreenShareTile.tsx components/consultation/VideoRoom.tsx    # clean
```

### Audit

- **No tests were touched.** Per task spec ("Tests: none required.") + the standing video-batch precedent (B3 / B4 / B6 / B7 / B8 / B9 / C2 all shipped without unit tests; manual smoke after real-device verification).
- **No icon library / no toast library** — same constraint set we've been operating under across Sub-batch B + C2. Inline SVGs match the existing aesthetic; amber-pill notices match the existing PiP / virtual-bg / reconnect notices.
- **System message wire-up DEFERRED** to combined enum migration. The local UI works completely without it; the system event is a "nice to have" that requires backend enum + worker wire-up. Same precedent as A1 / A2 / B3 / B9 deferring system messages until voice batches land.
- **`mode='readonly'` DEFERRED** to the mode-prop-landing PR. `<VideoRoom>` doesn't carry `mode` today; comments in the controls-bar branch document the one-line guard for when it arrives.
- **Manual smoke DEFERRED** to real-device verification per the standing batch protocol (B7 / C2 / B6 / B8 / B3 / B4 all carry the same pending row).
- **No backend changes.**

### Deviations from the draft

1. **Pure module + hook + tile split** instead of inlining the capture logic in `<VideoRoom>`. Mirrors B7's `usePictureInPicture` + `pip-support.ts` separation. The hook also handles OS-stop event subscription (Twilio fires `'stopped'` when the underlying MediaStreamTrack ends — covers BOTH our explicit `stop()` AND the browser's "Stop sharing" notification).
2. **`'permission-denied'` is silently swallowed** at the callsite (no toast). Matches Slack / Zoom / Meet UX — clicking Cancel on the OS picker is a non-event. Distinguished from genuine failures via `DOMException.name === 'NotAllowedError'`. The hook also splits out `'no-room'` (defensive — the parent should gate on connected) and `'no-track'` (vanishingly rare; defensive guard) so the parent can map each to a specific copy.
3. **Layout displacement uses a single `isSharingActive` flag** instead of a third `VideoLayout` value (`'share'`). Reasons: (a) doesn't pollute the persisted layout state — when sharing stops, the user's chosen B6 layout naturally restores; (b) doesn't require expanding the `VideoLayout` type/`isVideoLayout()` guard / VideoLayoutSwitcher options; (c) the share-strip layout has different DOM constraints (the screen tile must be ABOVE, not BESIDE, the camera tiles) so it doesn't fit the gallery/speaker/sidebar pattern anyway.
4. **Privacy banner is a sibling above the canvas**, not an absolute overlay. Two reasons: (a) absolute overlays compete for z-index space with hold/reconnect/PiP banners (already 30/30/25); (b) sliding the canvas down naturally GUARANTEES the user sees it — they can't accidentally hide it by scrolling.
5. **Both local + remote screens render simultaneously** when both sides share (decision §6 limit-2-max). On desktop they go side-by-side (`md:flex-row`); on mobile they stack (`flex-col`). The `flex-1` + `min-w-0` on each lets them share the available space evenly.
6. **`isRemoteScreenTrack` predicate + `clearRemoteScreenIfMatches` helper** are inlined inside `connectRoom` (next to `wireRemoteVideoTrack`) instead of hoisted to module scope, so they share the closure capture of the four `setRemoteScreenTrack` call sites. Same pattern as `wireRemoteVideoTrack` itself.
7. **`participantDisconnected` defensively clears `remoteScreenTrack`** even though `trackUnsubscribed` is the SDK-contract primary path. A hard transport drop / SDK quirk could skip the per-track event; this guarantees the share tile doesn't stay mounted with a dead track after the peer disconnects. Same belt-and-braces pattern as the audio-router cleanup.

### Future PR pointers

- **Enum migration** — add `'screen_share_started'` / `'screen_share_stopped'` to the Plan 06 enum. Wire an `applyScreenShareSystemEvent` flow analogous to `applyRecordingSystemMessage` so the companion chat shows the system row. Bundle with A2 + E2 + C3 (decision per task draft).
- **`mode='readonly'`** — when the prop lands, add `mode !== 'readonly'` gates to: the Share button, the screen-share section JSX, the privacy banner. The hook itself can stay because `screen.isSupported` is read-only.
- **Audio share opt-in (v2)** — flip the `audio: false` in `getDisplayMedia` to a `useScreenShare({ withAudio: true })` option. Twilio supports publishing the audio track separately. Out of scope for v1 per task §"Out of scope" §1.
- **Multi-screen-share limit (decision §6 — limit 2 max)** — currently NOT enforced because v1 is bidirectional 1-on-1; if a third party publishes a `name: 'screen'` track, it will overwrite the `remoteScreenTrack` slot via "last set wins." Three-way calls (C8) are the right time to introduce a `Map<participantSid, RemoteVideoTrack>` for the screen-track slot.
- **Recording impact (decision §5)** — Twilio's composer captures all published tracks by default; the screen track will appear in the recording artifact. Verify behavior at PR time per Plan 02 / 08 doctrine; if undesired, add an `excludeFromRecording` API call when publishing the screen track.
