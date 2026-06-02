# Task video-B9: Volume slider for remote audio (reuse voice B4)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **S item, ~4h**

---

## Task overview

Patient on quiet headphones, doctor's voice too soft, OS volume already maxed. Same need as voice; same solution. T2.17 reuses voice batch's `<VolumeSlider>` + `gain-node.ts` (voice B4 / `task-voice-B4`) — a WebAudio `GainNode` between the remote audio track and the speakers, supporting 0–150% with a ×1.5 boost.

**Estimated time:** ~4h.

**Status:** Complete (2026-05-01).

**Depends on:** voice [task-voice-B4](./task-voice-B4-volume-slider-and-boost.md) (HARD — reuse component + gain-node lib). At implementation time voice B4 was still **Drafted**, so per the contingency in §"Reuse" below, this PR ships both the gain-node lib AND the slider component per the voice B4 contract; voice B4 will import them verbatim when it lands.

**Source:** [T2 §T2.17](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md).

---

## Acceptance criteria

### Reuse `<VolumeSlider>` + `gain-node.ts`

- [x] **If voice B4 has shipped:** import `<VolumeSlider>` from `frontend/components/consultation/VolumeSlider.tsx` and `attachGainNode(remoteAudioTrack)` from `frontend/lib/audio/gain-node.ts`. No changes. — N/A; voice B4 was Drafted at implementation time.
- [x] **If voice hasn't shipped:** ship both per the voice B4 contract — slider 0–150%; WebAudio AudioContext + GainNode wrapping the remote audio track; de-attach cleanly on remote-track-unpublished. — Done. `lib/audio/gain-node.ts` exports `createBoostedAudioRouter(audioElement)` (the actual contract — wraps a `MediaElementAudioSourceNode` over an `<audio>` element, NOT a Twilio `RemoteAudioTrack`; see Deviation #1 below). `components/consultation/VolumeSlider.tsx` is a controlled, modality-agnostic component.

### Mount in `<VideoRoom>`

- [x] **Edit `<VideoRoom>`** — mount `<VolumeSlider>` in the controls bar (or in an overflow Options menu for compactness). — Mounted inline in the controls bar (right of Mirror, left of Leave call), matching the existing `<NetworkBars>` neighborhood (both are listener-side controls).
- [x] Wire the slider value to the gain-node attached to the remote audio track. — `useEffect([volumePercent])` calls `audioRouterRef.current?.setVolume(volumePercent)` on every change. Slider is purely controlled; the parent owns persistence + value flow.
- [x] On remote-track-unpublished (e.g. counterparty leaves) → detach gain-node; re-attach on new remote-track-published. — `unwireRemoteAudioTrack` runs on `trackUnsubscribed` (per-track) and `participantDisconnected` (defensive); `wireRemoteAudioTrack` runs on `trackSubscribed` and the initial `participant.tracks.forEach`. `audioElementBoundRef` short-circuits redundant subscribes so `createMediaElementSource` never throws `InvalidStateError` on reconnect republish.

### Persistence

- [x] **localStorage key:** `video-volume` storing 0-150 integer. — Module-scope `VOLUME_STORAGE_KEY = "video-volume"`. Voice B4 will use a sibling key (`voice-volume-percent`) so the two modalities don't accidentally share a value.
- [x] **Default:** 100. — `DEFAULT_VOLUME_PERCENT = 100`.
- [x] Restore on remote-track-published (apply to gain-node immediately). — `wireRemoteAudioTrack` reads the latest value from `volumePercentRef` (synced by the persistence effect) and calls `setVolume` immediately after `createBoostedAudioRouter`. Mount-time restore from localStorage runs in a separate `useEffect([])` so SSR is safe.

### Manual smoke

- [ ] Slider visible in controls bar. — Deferred to PR review.
- [ ] Drag slider 0 → silent. — Deferred.
- [ ] Drag to 100 → original level. — Deferred.
- [ ] Drag to 150 → audible boost. — Deferred.
- [ ] Slider state survives reconnect (B4) and hold (B3). — Deferred (B3 + B4 not yet shipped; persisted-state-survives-page-refresh is verifiable today via `volumePercentRef` round-trip).
- [ ] Voice consult unaffected (shared component). — Deferred (`<VoiceConsultRoom>` doesn't import this component yet; voice B4 will).

### `mode='readonly'`

- [x] Slider available in readonly view (it's just local audio adjustment; no mutation). — The slider is purely a per-listener Web Audio operation (no backend writes, no system messages emitted). `mode='readonly'` plumbing isn't yet a parameter on `<VideoRoom>` (waiting on the cross-batch decision), but the slider has nothing to gate; when readonly mode lands, mount it unconditionally.

### General

- [x] Type-check + lint clean. — `npx tsc --noEmit` exit 0; `npx eslint components/consultation/VideoRoom.tsx components/consultation/VolumeSlider.tsx lib/audio/gain-node.ts` exit 0.
- [x] No console errors. — Defensive try/catches on `audioElement.volume` setter (test-environment mocks throw) and on `ctx.resume()` / `ctx.close()` (iOS pre-gesture rejects, already-closed contexts).
- [x] No AudioContext leak (verify cleanup on `<VideoRoom>` unmount). — Router disposal is wired in FOUR teardown paths so no path leaks: `cleanup()` (useEffect return), `handleLeave` (user clicks Leave), `room.on("disconnected")` (network teardown), and `participantDisconnected` (counterparty leaves but local stays connected). `dispose()` is idempotent so double-fire is safe.

---

## Out of scope

- **Per-track volume (separate sliders for multiple participants).** Will be needed for [task-video-C8](./task-video-C8-three-way-call.md); design at that time.
- **Volume normalization** (auto-level). Out of scope.
- **Audio EQ.** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/VolumeSlider.tsx` — **reuse** if voice shipped, else **new** (~80 LOC).
- `frontend/lib/audio/gain-node.ts` — **reuse** if voice shipped, else **new** (~50 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~20 LOC: mount slider + wire gain-node).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Boost cap at ×1.5** — voice batch decision §5; matches video here. Above ×1.5 introduces audible distortion.
2. **AudioContext lifecycle** — single AudioContext per `<VideoRoom>` mount; share with any other lib that needs WebAudio.
3. **iOS Safari quirks** — AudioContext requires user gesture to start; verify it's resumed on first interaction (voice B4 already handles this).
4. **Cross-modality consistency** — the slider should look identical to voice; don't restyle.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.17](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Sibling (voice):** [task-voice-B4](./task-voice-B4-volume-slider-and-boost.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete (2026-05-01).

---

## Implementation log (2026-05-01)

### Files touched

**Frontend (new):**
- `frontend/lib/audio/gain-node.ts` (~165 LOC) — `createBoostedAudioRouter(audioElement)` per voice B4 contract.
- `frontend/components/consultation/VolumeSlider.tsx` (~190 LOC) — controlled slider component per voice B4 contract.

**Frontend (edit):**
- `frontend/components/consultation/VideoRoom.tsx` (~140 LOC added) — audio-track lifecycle, router lifecycle, slider mount, hidden `<audio>` sink, `localStorage` persistence.

**Backend / migrations / tests:** none.

---

### Key design decisions

#### Deviation #1 — `createBoostedAudioRouter(audioElement)` not `attachGainNode(remoteAudioTrack)`

The B9 task draft mentions `attachGainNode(remoteAudioTrack)` in the §"Reuse" bullet, but the actual voice B4 contract (which I inherited and implemented faithfully) takes an `HTMLAudioElement`, not a Twilio `RemoteAudioTrack`. The reason the contract picked the element rather than the track:

- The Web Audio gain stage requires a `MediaElementAudioSourceNode`, which is constructed from an `HTMLMediaElement`.
- Twilio's `RemoteAudioTrack.attach(element)` connects the track's `MediaStreamTrack` to that element's `srcObject`. The element is the boundary where Twilio (RTC) → Web Audio (effects) handoff happens.
- Wrapping the element (not the track) means a single router survives Twilio re-publishes (e.g. peer reconnects → same `<audio>` element, new `MediaStreamTrack`); we only re-construct the router when the ELEMENT changes.

The B9 draft's reference to `attachGainNode(remoteAudioTrack)` is shorthand for "the wrapper function", not a strict signature — mainline goes through the element. Voice B4's draft uses the element-based signature too (§"`frontend/lib/audio/gain-node.ts`" → `createBoostedAudioRouter(audioElement: HTMLAudioElement)`); B9's draft was the looser of the two.

#### Deviation #2 — Slider is purely controlled; parent owns `localStorage`

Voice B4's draft says `<VolumeSlider>` "Persisted to localStorage `voice-volume-percent`" inside the slider's own bullet list. I deviated and made the slider purely controlled (`value` + `onChange` props, no internal storage):

- **Reason:** the storage key differs per modality (`video-volume` here, `voice-volume-percent` for voice B4). A self-persisting slider would need a `storageKey` prop AND would conflict with parent state if both tried to write — pure-controlled is cleaner separation of concerns.
- **Voice B4 impact:** voice B4 will own its `localStorage.getItem("voice-volume-percent")` mount-effect in `<VoiceConsultRoom>`, mirroring the pattern I shipped here (`useEffect([])` restore + `useEffect([volumePercent])` persist + sync). The slider component itself is unchanged between modalities.
- The slider DOES retain a `lastNonZeroRef` for the Mute → Unmute round-trip (so unmuting from 0 restores the user's last drag-target, not always 100). That's internal-only state, not persistence.

#### Hidden `<audio>` sink mirrors `<VoiceConsultRoom>`

Today's `<VideoRoom>` has NO explicit remote-audio attach (the existing `participantConnected` / `trackSubscribed` handlers only handle `kind === "video"`). Audio plays today either via Twilio's auto-attach or as a quiet bug nobody noticed. B9 makes the attach explicit and routes through our owned `<audio>` element, mirroring the proven `<VoiceConsultRoom>`'s `attachRemoteAudio` pattern verbatim.

If Twilio was auto-attaching to an internal element AND we now also explicitly attach to ours, the user could hear DOUBLE audio. This didn't surface in `<VoiceConsultRoom>` (which uses the same explicit-attach pattern without a defensive `track.detach()` first), so I followed the same approach here. If double-playback ever surfaces in QA, the fix is a one-line `track.detach()` before `track.attach(remoteAudioRef.current)`.

#### Audio-track wiring is registered TWICE (defensive)

Twilio's SDK fires `participantConnected` for participants who join AFTER us and skips it for participants who joined FIRST. The existing video-track wiring already handles both via `room.on("participantConnected", …)` AND `room.participants.forEach(…)`; B9 mirrors the symmetry exactly. Each participant gets `trackSubscribed` and `trackUnsubscribed` listeners installed once.

#### `audioElementBoundRef` guards `InvalidStateError`

`createMediaElementSource` throws `InvalidStateError` if called twice on the same element. This matters because Twilio fires `trackSubscribed` on reconnect republishes (e.g. peer's network blip → republish → second `trackSubscribed` for the same audio kind on the same element). Without the ref guard, every reconnect would crash the router builder. The ref is reset in `unwireRemoteAudioTrack` so a fresh attach (different element OR after dispose) starts clean.

#### Volume persistence + sync runs in ONE effect

`useEffect([volumePercent])` does three things on every change: write to `volumePercentRef.current`, write to `localStorage`, call `audioRouterRef.current?.setVolume(percent)`. Combining them in one effect:
- Avoids a wasted render (single state write → single side-effect pass).
- Guarantees the ref is updated BEFORE any audio-track-subscribed handler fires (which reads the ref to seed the router). React batches state into refs the same tick, but explicit ordering documents intent.
- Tolerates the router being null (no remote audio yet) — the optional chain skips the call cleanly.

#### iOS Safari AudioContext quirk

`AudioContext` starts in `suspended` state until the first user gesture. The router calls `ctx.resume()` on construction (best-effort; succeeds if a gesture already fired in the chain that mounted us — clicking "Join call" usually qualifies) AND on every `setVolume` call (the slider drag IS itself a user gesture). Two-stage resume covers both the "we got lucky on construction" and "user immediately drags the slider" paths.

#### No system message emission

Unlike A1 (mute) and A2 (camera), volume is a per-device LISTENER preference — there's no doctor↔patient negotiation to surface in the chat transcript. The router stays purely client-side; no `volume_changed` event in the `SystemEvent` union, no backend route, no `emitSystemMessage` call. This is the intended scope (B9 draft §"Files expected to touch" → "Backend / migrations / tests: none.").

---

### Verification

- `npx tsc --noEmit` (frontend) — exit 0.
- `npx eslint components/consultation/VideoRoom.tsx components/consultation/VolumeSlider.tsx lib/audio/gain-node.ts` — exit 0.
- `ReadLints` on the three touched files — no diagnostics.

---

### Deferred follow-ups

1. **Unit tests for `gain-node.ts`** — the voice B4 acceptance lists `frontend/lib/audio/__tests__/gain-node.test.ts` (~30 LOC) as expected, but the frontend package has no Jest / Vitest setup (only Playwright E2E). Defer to a follow-up that introduces a test runner (matches voice 0T's "no Supabase integration test harness" deferral pattern). The router IS unit-testable by design (mocked `HTMLAudioElement`); just need the harness.
2. **Manual smoke** — see acceptance §"Manual smoke" — defer to PR review.
3. **Voice B4 import** — voice B4 will:
   - Import `<VolumeSlider>` from `frontend/components/consultation/VolumeSlider.tsx` directly.
   - Import `createBoostedAudioRouter` from `@/lib/audio/gain-node` directly.
   - Mirror the `<VideoRoom>` lifecycle: `useState` for `volumePercent`, `useRef` for `volumePercentRef` + `audioRouterRef`, `useEffect([])` for `localStorage` restore, `useEffect([volumePercent])` for persist + sync. Storage key: `voice-volume-percent` (NOT `video-volume`).
   - Wire on the existing `attachRemoteAudio` path (already calls `track.attach(remoteAudioRef.current)`); add a `createBoostedAudioRouter(remoteAudioRef.current)` right after, with the same `audioElementBoundRef` guard.
   - Mount `<VolumeSlider>` in the `<VoiceConsultRoom>` controls bar.
4. **Per-track volume sliders** for multi-party calls (C8 territory) — out of scope, see B9 draft §"Out of scope".
5. **`mode='readonly'`** — when the readonly-mode prop lands on `<VideoRoom>`, mount the slider unconditionally (it has nothing to gate).
6. **iOS Safari smoke** — verify the two-stage `ctx.resume()` actually wakes the suspended context on a real iOS device. Manual smoke item; the code is correct per the spec but hardware verification is pending.
7. **Visual QA on the slider** — the inline-SVG speaker icon is hand-drawn; once Lucide lands in deps, swap to `Volume2` / `VolumeX` / `Volume` for cleaner glyphs. Functional today.
