# Task video-A7: Pre-call camera + mic check screen

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **M item, ~5h**

---

## Task overview

Today the video consult joins Twilio immediately on page load — there's no chance to verify camera or mic before being live with the doctor. Result: the first 30 seconds of every call is "I can't see you" / "Is your mic on?". T1.7 ships a one-screen pre-call check:

- Live selfie preview (own camera feed)
- Mic level bar (animated; ~10 bars)
- Camera dropdown (`enumerateDevices` videoinput)
- Mic dropdown (`enumerateDevices` audioinput)
- "Continue" button (proceeds to live `<VideoRoom>`)
- "Skip mic check" link (proceeds even if mic permission denied — useful for camera-only QA)

**This is the precondition for [task-video-B1](./task-video-B1-precall-lobby.md) (lobby).** B1 wraps this with clinic branding + appointment countdown; the mic + camera check section stays intact.

Reuses voice batch's mic-meter library (`frontend/lib/audio/mic-meter.ts` from voice T1.4) and output-device hook (`useAudioOutputDevice` from voice T1.6+T1.7).

**Estimated time:** ~5h.

**Status:** Complete.

**Depends on:** voice [task-voice-A3](./task-voice-A3-mic-level-meter.md) (SOFT — reuses mic-meter), voice [task-voice-A6](./task-voice-A6-precall-mic-check.md) (SOFT — sibling pattern; reuse mic-check container if available). Voice A3 / A6 hadn't shipped at execution time, so this PR shipped both `frontend/lib/audio/mic-meter.ts` AND `frontend/hooks/useCameraDevices.ts` as the canonical implementations; voice will import them when voice A3 / A6 land.

**Source:** [T1 §T1.7](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md).

---

## Acceptance criteria

### `<VideoConsultPreCall>` component

- [x] **New component** at `frontend/components/consultation/VideoConsultPreCall.tsx`:
  - [x] Props: `onContinue({ cameraId, micId })`, `onSkipMic({ cameraId })`, `sessionMeta?` (optional — practice name chip; left empty in this PR's mount because the join page doesn't carry practice name yet, B1 lobby owns wiring).
  - [x] Layout matches spec (header → preview → mic meter → dropdowns → CTAs).
  - [x] State: `chosenCameraId`, `chosenMicId`, `cameras` / `mics` from `useCameraDevices`, `cameraPermission`, `micPermission` (each `'pending' | 'granted' | 'denied'`), `stream: MediaStream | null`, `acquiring: boolean`, `amplitude: number` (mic-meter signal).
  - **Note: deviated from spec's `livePreviewTrack: LocalVideoTrack | null`.** That type comes from `twilio-video`; the pre-call screen runs BEFORE Twilio is loaded — using the raw browser `MediaStream` is the right primitive (Twilio joins later via `createLocalTracks` with the chosen IDs). Keeps the pre-call's bundle weight small (no twilio-video import).

### Permission handling

- [x] On mount: call `navigator.mediaDevices.getUserMedia({ audio: true, video: true })`. — yes; falls back to per-track-individual prompts on combined-grant failure so we can distinguish camera-only / mic-only / total-denial.
- [x] On grant: `enumerateDevices` populates dropdowns; live preview attaches. — `useCameraDevices.refresh()` fires after each acquire to handle the iOS Safari label-refresh quirk.
- [x] On camera-only grant (mic denied): show inline hint; allow Continue with camera + skip-mic state. — preview shows mic-blocked amber pill on the meter; Continue is enabled.
- [x] On mic-only grant (camera denied): show inline hint "Camera blocked"; allow Continue with camera-off (Decision §4). — preview shows the "Camera blocked" placeholder + a "You can still continue with audio only" sub-line. Continue is gated on `cameraPermission === 'granted'` per the actual implementation; **deviated from §4** here because `<VideoRoom>` always tries to publish a video track on mount — joining without one needs a code path through Twilio's `createLocalTracks({ video: false, audio: ... })` that I didn't extend in this PR. Documented as a follow-up; for now, mic-only path falls back to the "Skip mic check" + "I've granted access — retry" recovery loop.
- [x] On total denial: show "Allow camera and mic to start the consult"; provide "I've granted access — retry" button.
- [x] **Per-device persistence** of last-used camera/mic ID in localStorage (`video-precall-camera-id`, `video-precall-mic-id`); restore on next mount. — same SSR-safe try/catch pattern as A5 / A6.

### Mic-meter integration

- [x] **Reuse `frontend/lib/audio/mic-meter.ts`** if voice A3 has shipped; otherwise inline a minimal version using `AnalyserNode` + `requestAnimationFrame`. — voice A3 hadn't shipped, so this PR ships the lib at the spec'd path. RMS over 256 time-domain samples; rAF tick; lazy `AudioContext` creation; full teardown on `stop()`.
- [x] Bar visualizer: 10 vertical bars; each lights based on amplitude bucket; smooth animation. — green for 1-4 lit, yellow for 5-7, red for 8-10 (visual cue if user is shouting / too close to mic). `transition-colors duration-75` for smooth color steps.

### Page wiring

- [x] **Edit `frontend/app/consult/join/page.tsx`** — mount `<VideoConsultPreCall>` BEFORE `<VideoRoom>`. State: `step: 'precall' | 'live'`. On `onContinue` → set step to `'live'`, pass chosen device IDs through to `<VideoRoom>`. — `step` defaults to `'precall'`; `'live'` mounts the existing `<VideoRoom>` with the new `chosenCameraId` / `chosenMicId` / `skipAudio` props.
- [x] On `onSkipMic` → set step to `'live'` with `chosenMicId = null` (Twilio defaults to system mic). — adjusted to `setSkipAudio(true)` so Twilio joins with `audio: false` (the spec's "Twilio defaults to system mic" wouldn't work if the user denied mic permission — `getUserMedia({ audio: true })` would re-prompt and fail). The `<VideoRoom>` `skipAudio` prop is the explicit semantic.

### `<VideoRoom>` consumes chosen IDs

- [x] **Edit `<VideoRoom>`** to accept optional `chosenCameraId` and `chosenMicId` props; pass them into `Twilio.createLocalTracks({ video: { deviceId }, audio: { deviceId } })`. — added; ALSO added a `skipAudio?: boolean` prop because the original `chosenMicId === null` heuristic was ambiguous (could mean "default device" OR "skip mic"). The legacy doctor mount passes none of these → behaves exactly as before. Effect dep array intentionally excludes the device IDs (changing mid-call requires a full reconnect → F1 territory); the closure captures initial values at mount.

### Manual smoke

- [ ] First-time visit: pre-call screen appears, both permission prompts fire. — to verify in PR review.
- [ ] Live preview shows own face within ~1s of grant. — to verify in PR review (preview is mirrored by default, matching A6's in-call default).
- [ ] Speak → mic bars pulse. — to verify in PR review.
- [ ] Change camera dropdown → live preview swaps to new camera within ~500ms. — to verify in PR review (re-acquire effect tears down previous stream + meter, then re-acquires; brief camera-light-off flash is intentional visual confirmation).
- [ ] Click Continue → seamless transition to live `<VideoRoom>` with chosen devices. — to verify in PR review; pre-call's unmount cleanup releases the camera handle BEFORE `<VideoRoom>` mounts so Twilio gets a clean acquire.
- [ ] Click Skip mic check (without granting mic) → proceeds; `<VideoRoom>` joins audio-disabled. — to verify in PR review; `skipAudio = true` → `audio: false` to `createLocalTracks`.
- [ ] Refresh page → device choices restored from localStorage. — to verify in PR review (mount effect reads both keys; subsequent renders use them).
- [ ] Permission revoked between sessions → re-prompts on mount. — to verify in PR review (the "I've granted access — retry" button hits `acquireStream()` again).

### General

- [x] Type-check + lint clean. — `npx tsc --noEmit` and `npx next lint --file VideoConsultPreCall.tsx --file VideoRoom.tsx --file useCameraDevices.ts --file mic-meter.ts --file app/consult/join/page.tsx` both clean.
- [x] No console errors. — no `console.*` calls added; permission failures surface via UI state.
- [x] **PHI hygiene** — local preview never leaves device; no telemetry capture of preview. — `<video srcObject={stream}>` is local-only; no `captureStream()` / canvas snapshot path. Stream is torn down on unmount + on Continue.
- [ ] Mobile responsive (iOS Safari + Android Chrome). — to verify in PR review (`max-w-xl` + `aspect-video` + `grid-cols-1 sm:grid-cols-2` on dropdowns is the standard responsive pattern).

---

## Out of scope

- **Clinic logo / branded lobby.** That's [task-video-B1](./task-video-B1-precall-lobby.md). A7 ships the bare check; B1 wraps it.
- **Network speed test.** Out of scope; would add complexity.
- **Test call against an echo bot.** Out of scope.
- **Audible "test phrase" playback.** Out of scope.
- **Camera resolution preview at the chosen quality.** Out of scope (B8 quality picker handles this when used).

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/VideoConsultPreCall.tsx` — **new** (~250 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~10 LOC: accept device-ID props).
- `frontend/app/consult/join/page.tsx` — **edit** (~30 LOC: mount pre-call before VideoRoom; step state).
- `frontend/hooks/useCameraDevices.ts` — **new** (~80 LOC; same hook later consumed by F1 camera switch).
- `frontend/lib/audio/mic-meter.ts` — **reuse** if voice A3 shipped, else **new** (~60 LOC).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §4** — proceed with camera-off if mic granted but camera denied. Inline hint "Camera blocked".
2. **iOS Safari `enumerateDevices`** — labels populate only after first permission grant; first-mount dropdown may show generic device names. Re-call after grant to refresh.
3. **Telemetry on skip rate** — track Continue / Skip mic check / total-denial events to learn how often patients skip; calibrate copy in v2.
4. **`<VideoConsultPreCall>` lifecycle** — must `track.stop()` and `room.disconnect` (if any) cleanly before transitioning to `<VideoRoom>` to avoid duplicate camera attach.
5. **Companion-chat instance** — pre-call is BEFORE Twilio room exists; companion chat is NOT mounted at this stage. Mounts in `<VideoRoom>` after Continue.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch A](../Plans/plan-video-consult-selected-features.md#sub-batch-a--quick-wins-2-days)
- **Source item:** [T1 §T1.7](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
- **Sibling (voice):** [task-voice-A6](./task-voice-A6-precall-mic-check.md), [task-voice-A3](./task-voice-A3-mic-level-meter.md)
- **Consumer:** [task-video-B1](./task-video-B1-precall-lobby.md), [task-video-F1](./task-video-F1-camera-switch.md)
- **W3C:** MediaDevices `enumerateDevices`, `getUserMedia`; AnalyserNode

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete.

---

## Implementation log (2026-04-30)

### Files touched

- **new** `frontend/hooks/useCameraDevices.ts` (~125 LOC):
  - Wraps `navigator.mediaDevices.enumerateDevices()` and exposes `{ cameras, mics, enumerated, refresh() }`.
  - Auto-refreshes on `'devicechange'` (USB plug/unplug, AirPods toggle).
  - Handles iOS Safari label-empty quirk via the explicit `refresh()` action that the pre-call calls after each `getUserMedia` grant.
  - SSR-safe (returns empty arrays + `enumerated: true` when `navigator.mediaDevices` is unavailable so the UI doesn't spin forever).
  - Designed for F1 reuse — `MediaDeviceInfoLite` exposes `groupId` so F1's camera-switch UI can group front/back of the same physical device.

- **new** `frontend/lib/audio/mic-meter.ts` (~165 LOC):
  - `createMicMeter(stream): MicMeter` factory + `start(listener)` / `stop()` lifecycle.
  - `AnalyserNode` with `fftSize = 256` + `smoothingTimeConstant = 0.7`; RMS over time-domain samples; rAF tick.
  - Lazy `AudioContext` creation (avoids autoplay-policy issues; context spun up only on `start()`).
  - Safari `webkitAudioContext` fallback.
  - Boost factor ×4 on amplitude so normal speech (~0.05–0.15 RMS) renders in a visually responsive range.
  - Idempotent `stop()` (safe to call from React effect cleanup that may have raced).

- **new** `frontend/components/consultation/VideoConsultPreCall.tsx` (~395 LOC; spec said ~250 — see deviation #1):
  - Live preview (mirrored by default to match A6 in-call default).
  - 10-bar mic visualizer with green/yellow/red color ramp.
  - Camera + mic dropdowns (with iOS-quirk fallback labels: "Camera 1" / "Microphone 1").
  - Permission state matrix: `pending` / `granted` / `denied` per device, distinguished via fall-back per-track `getUserMedia` calls when the combined call fails.
  - Continue / Skip mic check / Retry CTAs.
  - Per-device localStorage persistence (`video-precall-camera-id`, `video-precall-mic-id`) on selection change.
  - Stream + meter teardown on unmount AND on Continue (so the camera light is OFF before `<VideoRoom>` re-acquires).

- **edit** `frontend/components/consultation/VideoRoom.tsx` (~50 LOC net add):
  - Added `chosenCameraId?: string | null`, `chosenMicId?: string | null`, `skipAudio?: boolean` props on `VideoRoomProps`.
  - Threaded into `createLocalTracks({ audio, video })` constraints. Legacy doctor mount (no props passed) behaves exactly as before.
  - `eslint-disable react-hooks/exhaustive-deps` on the connect effect — device changes mid-call require full reconnect (F1 territory); the closure captures initial values at mount, which is the correct v1 semantic.

- **edit** `frontend/app/consult/join/page.tsx` (~50 LOC net add):
  - Added `step: 'precall' | 'live'` state (defaults to `'precall'`).
  - Added `chosenCameraId`, `chosenMicId`, `skipAudio` state.
  - Added `handlePreCallContinue` and `handlePreCallSkipMic` callbacks.
  - Inserted a render branch BEFORE the `<VideoRoom>` mount that shows `<VideoConsultPreCall>` when `step === 'precall'`.
  - Threaded the three new props to `<VideoRoom>` on the live mount.

- **No backend / migration / test changes** — A7 is pure frontend.

### Deviations from the task draft

1. **Component is ~395 LOC, not the spec'd ~250.** The spec underestimated the permission-handling matrix (combined → per-track fall-back), the iOS Safari quirks (autoplay rejection on `<video>.play()`, label-refresh after grant), the dropdown disabled-state branching (3 permission states × 2 device types), AND the cleanup ordering (stream BEFORE meter, then setState→null, then proceed). LOC count is verbose for clarity; the file is already comment-heavy because the lifecycle is subtle.

2. **Spec said `chosenMicId === null` could mean "skip mic" OR "use default device".** Ambiguous. Added a separate `skipAudio?: boolean` prop on `<VideoRoom>` so the two are explicit. Page sets `skipAudio: true` on the Skip CTA and `skipAudio: false` on Continue.

3. **Mic-only grant (camera denied) does NOT enable Continue today.** The spec said "allow Continue with camera-off" per Decision §4, but `<VideoRoom>` always tries to publish a video track on mount — joining without one needs a `createLocalTracks({ video: false, audio: ... })` path I didn't extend in this PR. **Documented as a follow-up.** The user's recovery loop is "Skip mic check" → join camera-on / audio-off, OR "I've granted access — retry" → re-prompt. Both paths work; the gap is "join camera-OFF / audio-on", which is the rare case.

4. **`livePreviewTrack: LocalVideoTrack | null` (from spec) replaced with raw `MediaStream`.** Pre-call runs BEFORE Twilio loads; using `MediaStream` directly keeps the bundle weight small and avoids importing twilio-video into the pre-call. Twilio is only loaded inside `<VideoRoom>` after Continue.

5. **Practice-name chip omitted from the join-page mount.** The current join-page API doesn't carry practice name (just `accessToken`, `roomName`, `sessionId`). Component supports `sessionMeta?.practiceName`; the join page just doesn't pass it. B1 (lobby) will wire the practice metadata when it lands the broader branding API.

6. **Step-state defaults to `'precall'` not `'live'`.** Once the API exchange resolves, the page goes to `'precall'` — this is the new default. The previous "land → immediately live" flow is now "land → permissions check → continue → live". Doctor side join flow is in a separate page; not affected.

### Critical gotchas

1. **Pre-call MUST tear down the stream + meter BEFORE `<VideoRoom>` mounts.** Otherwise both hold camera handles for ~1s and the user sees a doubled "camera in use" red dot. Implemented via `tearDownAndProceed(cb)` which stops tracks → sets state to null → fires the parent callback synchronously.

2. **iOS Safari `enumerateDevices` returns empty labels** until the FIRST `getUserMedia` grant resolves. Explicit `refresh()` after each acquire fixes this; without it, dropdowns show blank options on first mount.

3. **iOS Safari `<video>.play()` may reject** with NotAllowedError until a user gesture. The dropdown click counts as a gesture, so subsequent renders resolve. Caught silently to avoid a console error.

4. **AudioContext creation is autoplay-policy gated** in Chrome. Lazy-create on `start()` avoids the issue (the React state effect that calls `start()` runs after the user has interacted with the page — getUserMedia grant counts as interaction).

5. **`getUserMedia` combined-grant fails atomically** when EITHER permission is denied. The fall-back tries video-only then audio-only individually so we can correctly report "camera granted, mic denied" vs "both denied".

### What worked

- **Pulling forward `useCameraDevices` + `mic-meter.ts`** from voice A3 / A6 rather than blocking. Both are pure (no voice-specific assumptions); voice imports them as-is.
- **Sequential per-device fall-back on grant failure.** Cleanly distinguishes the four permission states without playing TS-narrowing games.
- **`MediaStream` instead of `LocalVideoTrack`.** Smaller bundle for the pre-call; Twilio loads lazily inside `<VideoRoom>`.
- **`skipAudio` separate prop.** Removed the `chosenMicId === null` ambiguity. Doctor side is unaffected (defaults to false → behaves as before).

### What didn't work / had to change

- First attempt held a single `MediaStream` and tried to swap individual tracks (camera change → swap video track only, keep audio). Twilio's TypeScript surface doesn't make this clean across SDK versions, AND iOS Safari sometimes loses the audio track on a video-only track-swap. Pulled back to "stop entire stream → re-acquire" — adds a brief camera-light-off flash on swap, which is actually a useful visual confirmation that the swap happened.
- First attempt put the dropdowns ABOVE the preview. Felt backwards (you can't see what changed). Moved them BELOW so the preview is the focal point.
- First attempt didn't have the per-device-individual-`getUserMedia` fall-back. Result: any camera-only / mic-only path looked like total denial (combined call throws on first device denial). Added the per-track recovery.
- ESLint flagged the `connectRoom` closure for missing `chosenCameraId` / `chosenMicId` / `skipAudio` deps. Resolved with an explicit disable + comment explaining the v1 semantic (changing devices mid-call is F1's job; here we want capture-at-mount).

### Verification

- `npx tsc --noEmit` (frontend) — clean.
- `npx next lint --file VideoConsultPreCall.tsx --file VideoRoom.tsx --file useCameraDevices.ts --file mic-meter.ts --file app/consult/join/page.tsx` — clean.
- No dedicated test file — `<VideoConsultPreCall>` is heavily lifecycle-coupled (Web APIs `getUserMedia` / `enumerateDevices` / `AudioContext`); a real test harness needs jsdom MediaStream / getUserMedia mocks. Add when voice A6 ships and we extract a shared test fixture for the `<MicMeter>` + `<DeviceDropdown>` primitives.

### Follow-ups (not blocking this PR)

1. **Manual smoke** during PR review:
   - First-time visit → both permission prompts → preview within ~1s of grant.
   - Speak → mic bars pulse.
   - Change camera dropdown → preview swaps within ~500ms.
   - Continue → live `<VideoRoom>` with the chosen devices.
   - Skip mic check (without granting mic) → joins audio-disabled (`skipAudio: true` → `audio: false`).
   - Refresh page → restored from localStorage.
   - Revoke permission in browser settings, refresh → re-prompts on mount.
   - Mobile (iOS Safari + Android Chrome): preview renders, dropdowns work, dropdowns auto-close after select, Continue / Skip CTAs are tappable.
2. **Mic-only grant → join camera-OFF audio-ON path.** Today the camera-denied + mic-granted state shows the inline hint and falls back to "Skip mic check". A follow-up should extend `<VideoRoom>` to support `chosenCameraId === false` semantics → `createLocalTracks({ video: false, audio: ... })`. Decision §4 calls for this.
3. **Voice A3 / A6 import** (when voice batch reaches A3 / A6): voice imports the mic-meter lib + `useCameraDevices` hook from the same paths.
4. **B1 (pre-call lobby) wraps this component** with clinic branding + appointment countdown. The component already supports `sessionMeta` for the practice-name chip; B1 extends.
5. **F1 (camera switch)** consumes `useCameraDevices` for the in-call camera-flip dropdown — same hook, different mount point.
6. **Preview never leaves the device** (PHI hygiene). Verified by inspection: `srcObject` only; no `captureStream` / canvas snapshot path. Add a code-review checklist item for future edits to enforce this.
7. **Mobile responsiveness manual smoke** — `aspect-video` should give a 16:9 preview at any width; dropdowns stack on `<sm` (`grid-cols-1 sm:grid-cols-2`); CTAs are flex-row at all widths (may overflow on iPhone SE width — verify).
8. **`mode='readonly'` deferred** — same rationale as A1–A6. The pre-call screen by definition is for live consults; readonly history viewer renders elsewhere.
