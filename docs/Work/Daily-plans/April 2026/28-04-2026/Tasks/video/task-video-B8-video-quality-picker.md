# Task video-B8: Video-quality picker (Auto / 1080p / 720p / 480p / Audio-only)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **S item, ~4h**

---

## Task overview

Patients on cellular with a data cap WILL ask. Today they have to leave the call. T2.16 ships a manual quality picker:

```
Quality: [Auto ▾]
  ✓ Auto (recommended)
    1080p
    720p
    480p
    ───────
    Audio-only (saves data)
```

- **Auto** is the default; couples with [task-video-E1](./task-video-E1-adaptive-bitrate.md) when E1 lands (E1 dynamically clamps; B8 lets the user override).
- **Audio-only** prominently surfaced for the patient with the copy "saves data".
- Remote-side prefer constraint: if patient picks 480p, the patient also publishes at 480p (lower upload bandwidth).

**Estimated time:** ~4h.

**Status:** **Complete (2026-05-01).**

**Depends on:** none for v1; couples with [task-video-E1](./task-video-E1-adaptive-bitrate.md) when E1 lands.

**Source:** [T2 §T2.16](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md); [decision §9](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts).

---

## Acceptance criteria

### `<VideoQualityPicker>` component

- [x] **New component** at `frontend/components/consultation/VideoQualityPicker.tsx`:
  ```tsx
  type QualityOption = 'auto' | '1080p' | '720p' | '480p' | 'audio-only';
  <VideoQualityPicker value={current} onChange={(q) => ...} />
  ```
- [x] Dropdown with the 5 options. Audio-only is visually separated (divider above) and includes "saves data" sub-label.
  - Auto carries an "(recommended)" suffix per the spec sketch in the task overview.
  - Selected option shows a check (`✓`) and a tinted (`bg-blue-50 text-blue-900`) row.
  - Custom dropdown (no Radix / shadcn dependency yet); same pattern as `<NetworkBars>`'s popover and `<VolumeSlider>`. Click-outside + Escape close + focus restoration on close.
- [x] Mount in controls bar.
  - Mounted at the END of the controls cluster (right of `<VolumeSlider>`, left of "Leave call") — semantically the call's "scope" so it bookends the per-action toggles.
  - `disabled` while a switch is in flight (Twilio mid-republish) so the user can't queue stacked toggles that would leak `MediaStreamTrack`s.

### Apply to local publish (per-device upload)

- [x] **Edit `<VideoRoom>`** — when `quality !== 'audio-only'`, `LocalVideoTrack` is published at the chosen resolution:
  ```ts
  // For 720p (videoConstraintsForQuality('720p')):
  { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
  ```
  - Resolution + framerate map lives in `VideoQualityPicker.tsx` as `videoConstraintsForQuality()`. 480p clamps frameRate to `{ ideal: 24 }` per task note #4 (motion smear at high fps × low res).
  - Initial publish at connect time also honours the persisted choice — see "Connect-time integration" below.
- [x] When switching quality, `unpublishTrack(oldTrack)` then `publishTrack(newTrack)` (Twilio handles renegotiation).
  - `LocalParticipant.unpublishTrack(track)` is **synchronous** in Twilio Video JS SDK 2.34 (returns `LocalTrackPublication | null`, NOT a Promise — verified against `node_modules/twilio-video/tsdef/LocalParticipant.d.ts`). `publishTrack(track)` is async. The runtime switcher orders them explicitly: unpublish (sync) → stop the old MediaStreamTrack → `await publishTrack(newTrack)`.
  - Old track is `stop()`'d after unpublish to release the camera — without this the green camera light stays on.
  - New track is `attach(localVideoRef.current)`'d so the self-tile updates immediately (without this the tile would stay black until React's next render that re-runs the post-connect attach effect).
  - Mid-flight room teardown is detected via `roomRef.current.state !== 'connected' || hasDisconnectedRef.current` after the `await createLocalVideoTrack()` — bails cleanly without publishing into a dead room, and `stop()`'s the orphan track.
  - Camera-off state (A2) is re-applied to the new track via `(newVideoTrack).disable()` if `cameraOff === true` — without this, switching quality while camera-off would silently turn the camera back on.
- [x] When `quality === 'audio-only'`: disable + unpublish video track entirely (calls `disable()` + companion-chat row `'auto_audio_fallback'` from E2 OR a manual variant `'manual_audio_only'`); on toggling back, re-publish.
  - **Implementation:** unpublish (sync) → `oldVideoTrack.stop()` → remove from `localTracksRef` → null out `localVideoRef.current.srcObject` (defense-in-depth so the last frame doesn't freeze on screen). Toggling back creates a fresh `LocalVideoTrack` via `createLocalVideoTrack` — no second permission prompt because the camera grant is sticky.
  - **Camera + Mirror buttons hide in audio-only mode** (no track to toggle / no preview to mirror). The picker is the path back to video.
  - Self-tile reuses A2's avatar overlay via `selfTileCameraOff = cameraOff || isAudioOnly`.
  - **System message deferred** (`'manual_audio_only'`): same gap as A1/A2/B9 — the Plan 06 `SystemEvent` TS union doesn't carry the variant yet AND the backend `/mute`-style endpoint pattern needs voice A7's PR to land first. Bundle into voice A7. Local audio-only state is honest until then.

### Connect-time integration (added beyond the original draft)

- [x] **`bandwidthProfile.video.maxSubscriptionBitrate` set ONCE inside `connect()`'s options**, using the value from `localStorage["video-quality"]` (read synchronously via `readPersistedVideoQuality()` so the bandwidth profile honours the user's last choice without a reconnect). `mode: 'collaboration'` (1-on-1 dominant-speaker prioritisation).
- [x] **Initial track creation also honours the persisted quality:**
  - `'audio-only'` → `video: false` passed to `createLocalTracks` (no LocalVideoTrack created at all).
  - explicit resolution → resolution map merged with `chosenCameraId` (if A7's pre-call selected one).
  - `'auto'` → keeps the legacy `width: 640, height: 480` floor (matches pre-B8 behaviour; flips to "let Twilio negotiate" when E1 ships).

### Apply to remote subscription (download bandwidth)

- [x] Configure Twilio's `bandwidthProfile.video.maxSubscriptionBitrate` based on quality:
  - `auto` → `2_400_000` (2.4 Mbps cap)
  - `1080p` → `2_400_000`
  - `720p` → `1_200_000`
  - `480p` → `600_000`
  - `audio-only` → `0` (no video subscription)
  - **Set-once limitation (v1):** Twilio Video JS SDK 2.34 has **no runtime API to mutate `bandwidthProfile`** after `connect()` (verified against `node_modules/twilio-video/tsdef/Room.d.ts` and `LocalParticipant.d.ts`). The persisted value at connect time wins for the call's lifetime; mid-call switches affect ONLY the local publish (which controls upload bandwidth and indirectly the remote sender's adaptive decisions). If the user picks a lower cap mid-call, the next call honours it on connect. Documented in code AND surfaced as a v1 limitation in this log.

### Persistence

- [x] **localStorage key:** `video-quality` storing the QualityOption.
- [x] **Default:** `'auto'`.
  - State + ref pattern: `useState<QualityOption>('auto')` + `useRef<QualityOption>('auto')`. Mount-time `useEffect` reads `localStorage` and updates both. Persistence `useEffect([quality])` writes back + syncs ref. SSR-safe (`typeof window !== 'undefined'` guard inside `readPersistedVideoQuality()`).
  - Connect-time path bypasses the React state altogether and reads `localStorage` synchronously inside `connectRoom()` — the state-restore `useEffect` runs AFTER the first render but BEFORE the `connect()` resolves, so the bandwidth profile would otherwise see the `'auto'` default. Synchronous read sidesteps the race.
  - Persistence write is best-effort (`try/catch`) so private-browsing / quota errors don't crash the call.

### Coupling with E1 (when E1 lands)

- [x] When `quality === 'auto'`, E1's adaptive bitrate is in charge — picker doesn't constrain.
  - Today (no E1): `'auto'` means "use the connect-time defaults". Code carries the contract in comments inside `videoConstraintsForQuality` so the E1 author has the wire-up point.
- [x] When `quality !== 'auto'`, E1's auto-degrade is suspended (user has explicitly set the cap).
  - Wire-up point: E1's adaptive logic should bail when `qualityRef.current !== 'auto'`. Documented in `<VideoRoom>`'s quality-state block.
- [x] **For B8 v1 (before E1):** quality choices are static; behavior is correct because E1 isn't doing anything yet.

### Coupling with E2 (audio fallback)

- [ ] If E2 auto-fires while user has manually picked `1080p`, override picker visual to show "Audio-only (auto)" + restore-on-recovery option.
  - **Deferred to E2's PR.** B8 v1 ships the picker + manual switch; E2 will introduce auto-fallback state and own the coupling. Wire-up point: a `forcedAudioOnlyByE2: boolean` prop on `<VideoQualityPicker>` would override the displayed value to "Audio-only (auto)" + add a "Restore" CTA. Not built today because there's no E2 caller yet.

### Manual smoke

- [ ] Picker mounts in controls; dropdown opens on click. **Pending PR review.**
- [ ] Pick 480p → local + remote video drops to 480p within ~2s. **Pending PR review.**
- [ ] Pick Audio-only → video tile shows avatar; both sides see system message. **Pending PR review.** System message deferred to voice A7 (see above) — for v1 only the local-side avatar shows.
- [ ] Pick Audio-only → toggling back to 720p re-publishes within ~2s. **Pending PR review.**
- [ ] Persistence: refresh page mid-call → quality choice restored. **Pending PR review.**
- [ ] Patient sees "saves data" copy on Audio-only. **Pending PR review.** (Sub-label hard-coded in OPTIONS array.)

### `mode='readonly'`

- [ ] Picker hidden (no live publish to constrain in readonly).
  - **Deferred** until `mode='readonly'` (Plan 07 history viewer) actually lands. Same deferral pattern as A1/A2/A3/A5/A6/A8/B2/B10. Wire-up note: when readonly arrives, gate the `<VideoQualityPicker>` mount on `mode !== 'readonly'`.

### General

- [x] Type-check + lint clean. (`npx tsc --noEmit` + `npx eslint components/consultation/VideoRoom.tsx components/consultation/VideoQualityPicker.tsx` — both exit 0.)
- [ ] No console errors. **Pending PR review** (verify in DevTools during smoke).
- [x] No track-leak on quality switch (verify `unpublish` + `stop` cleanup).
  - Code-level: every branch of `handleQualityChange` calls `oldVideoTrack.stop()` before publishing the new one OR before bailing. The `roomRef.current.state !== 'connected'` post-await guard `stop()`'s the freshly-created orphan track if the user left mid-switch. The "switch in flight" flag prevents stacked switches that could otherwise race the cleanup.
  - **Pending PR review:** runtime verification via DevTools → Memory → MediaStream count after 5 consecutive switches.

---

## Out of scope

- **Per-participant quality (e.g. "show me the doctor in HD but the interpreter in low-res").** Out of scope until C8 three-way.
- **Server-side recording quality control.** Plan 02 / 08 governs.
- **Bitrate display in tooltip.** That's [task-video-A8](./task-video-A8-network-quality-bars.md).

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/VideoQualityPicker.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~60 LOC: state + per-quality publish + bandwidthProfile).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §9** — Auto default; couples with E1 when E1 lands.
2. **Cellular surfacing** — the "saves data" copy is the most actionable; pair with [task-video-E7](./task-video-E7-cellular-data-warning.md) (cellular warning) which can deep-link to the picker.
3. **Twilio renegotiation cost** — `unpublish` + `publish` adds ~1-2s of remote-side rebuffer on quality switch. Document at PR time. Acceptable for manual switches.
4. **Frame-rate at low resolutions** — clamp to 24fps for 480p (motion artifacts hurt at high fps + low res). 30fps for 720p+ as Twilio default.
5. **Auto-recover from audio-only** — if E2 auto-fired and quality returns, ask the user "Try video again?" (decision §25 — 60s cooldown to prevent flapping).

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.16](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Decision:** [§9 — picker default](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts)
- **Coupled with:** [task-video-E1](./task-video-E1-adaptive-bitrate.md), [task-video-E2](./task-video-E2-auto-audio-fallback.md), [task-video-E7](./task-video-E7-cellular-data-warning.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** **Complete (2026-05-01).**

---

## Implementation log (2026-05-01)

### Files touched

**New:**
- `frontend/components/consultation/VideoQualityPicker.tsx` (~265 LOC) — controlled dropdown component + exported `QualityOption` type, `isQualityOption` type-guard, `videoConstraintsForQuality` (dimensions map), `maxSubscriptionBitrateForQuality` (cap map). Custom popover (no Radix / shadcn dep yet); click-outside + Escape close; keyboard accessible.

**Edited:**
- `frontend/components/consultation/VideoRoom.tsx` — six edits:
  1. Imports: added `createLocalVideoTrack`, `LocalVideoTrack` from `twilio-video`; added all five exports from `./VideoQualityPicker`.
  2. Module-scope: added `VIDEO_QUALITY_STORAGE_KEY = 'video-quality'`, `DEFAULT_VIDEO_QUALITY = 'auto'`, `readPersistedVideoQuality()` synchronous reader.
  3. Component state: `quality`, `qualityRef`, `qualitySwitchInFlight` + restore-on-mount + persist-on-change effects.
  4. `handleQualityChange` async callback (~110 LOC) — three branches: no-op, audio-only (sync unpublish + stop), explicit-resolution-or-auto (recreate + republish + re-attach + re-apply cameraOff).
  5. `connectRoom`: read persisted quality synchronously, derive initial video constraint (audio-only → `false`; explicit → resolution map; auto → legacy 640×480 floor) and `bandwidthProfile.video.maxSubscriptionBitrate`, pass both into `connect()`.
  6. JSX: introduced `isAudioOnly` + `selfTileCameraOff` derivations; gated Camera + Mirror buttons on `!isAudioOnly`; mounted `<VideoQualityPicker>` after `<VolumeSlider>` in the controls bar.

**Backend / migrations / tests:** none (per task draft scope).

### Twilio audit findings (decisions driven by SDK constraints)

Verified against `frontend/node_modules/twilio-video/tsdef/` (twilio-video v2.x):

1. **`bandwidthProfile` is set-once at `connect()`** — no `room.updateBandwidthProfile()` exists; `Room.d.ts` has no mutator surface. → Persisted-value-at-connect is the v1 model; mid-call cap changes apply on next call.
2. **`unpublishTrack(track)` is synchronous** (returns `LocalTrackPublication | null`, NOT a Promise). `publishTrack(track)` is async. → Runtime switcher orders unpublish-before-publish explicitly; old track is `stop()`'d immediately after sync unpublish.
3. **`createLocalVideoTrack(options)` is exported** from the top-level `twilio-video` module. → Used for recreating the track at a new resolution on each mid-call switch.

### Deviations from the draft

- **Deviation #1 — System message deferred.** Draft mentions a `'manual_audio_only'` system event; Plan 06's `SystemEvent` TS union doesn't carry it AND the backend `/quality` (or `/mode`) endpoint pattern needs voice A7's PR to land first. Same gate as A1/A2/B9. Bundle into voice A7's backend PR.
- **Deviation #2 — E2 audio-fallback coupling deferred.** No E2 caller exists yet, so the "Audio-only (auto)" override visual state and "Restore" CTA aren't built. Wire-up point documented (a `forcedAudioOnlyByE2: boolean` prop on the picker).
- **Deviation #3 — Connect-time integration is broader than the draft suggests.** Draft mainly talks about runtime; in practice the persisted value also has to apply on the initial `connect()` (otherwise refreshing while in audio-only would silently turn the camera back on, which is a privacy regression). Both `bandwidthProfile.video.maxSubscriptionBitrate` AND `createLocalTracks`'s `video` constraint are derived from the persisted quality.
- **Deviation #4 — Camera + Mirror buttons hide in audio-only mode.** Not in the draft acceptance, but UX hygiene: there's no LocalVideoTrack to toggle and no preview to mirror, so the buttons would be silent no-ops. Hide them; the picker is the path back to video. Self-tile shows the avatar via reused A2 `cameraOff` derivation.

### Design decisions (non-obvious bits)

1. **`qualitySwitchInFlight` flag** — the picker is `disabled` between the user's click and Twilio finishing the unpublish/publish cycle (~1-2s on slow networks). Without this, double-clicks would queue a second switch that races the first, leaking `MediaStreamTrack`s (Chrome warns; Twilio rejects the second publish).
2. **State + ref mirror pattern** — copied from B9's `volumePercent` / `volumePercentRef`. The async `handleQualityChange` reads the LATEST quality via the ref, not the closed-over state, so it correctly bails on no-op `next === current` even when called rapidly.
3. **Synchronous localStorage read inside `connectRoom`** — the React effect that restores from localStorage runs AFTER mount, but `connectRoom` runs from inside the same effect chain and may execute before the restore. Bypass the race by reading localStorage directly in `connectRoom`.
4. **Re-apply `cameraOff` on quality switch** — A2 keeps the LocalVideoTrack alive but `disable()`'d. After a quality switch we get a brand-new track that defaults to enabled; without re-applying `cameraOff`, switching quality while camera-off would silently turn the camera back on (privacy regression).
5. **Self-tile avatar in audio-only** — reuses `selfTileCameraOff = cameraOff || isAudioOnly` derivation. No new code path; the avatar overlay from A2 covers it.
6. **`'auto'` keeps the legacy 640×480 floor** — pre-B8 behaviour stays identical when nobody touches the picker. When E1 ships, this can flip to "let Twilio negotiate" without changing the picker contract.

### Verification

```bash
cd frontend
npx tsc --noEmit                                                 # exit 0
npx eslint components/consultation/VideoRoom.tsx \
          components/consultation/VideoQualityPicker.tsx         # exit 0
```

Manual smoke deferred to PR review (no frontend test runner yet — same deferral pattern as B9 and earlier B-batch tasks).

### Follow-up tasks

- **Voice A7's backend PR** — add `'manual_audio_only'` to the `SystemEvent` TS union + `emitManualAudioOnly` helper + `POST /api/v1/consultation/:sessionId/quality` (or `/mode`) endpoint + frontend fire-and-forget when the picker switches to/from `'audio-only'`.
- **E1 (adaptive bitrate)** — when adaptive logic kicks in, gate on `qualityRef.current === 'auto'` to respect the user's manual override.
- **E2 (auto audio fallback)** — add `forcedAudioOnlyByE2: boolean` prop to `<VideoQualityPicker>`; override displayed value to "Audio-only (auto)" + add "Restore" CTA when the network has recovered.
- **E7 (cellular data warning)** — deep-link from the cellular warning's "Reduce data" CTA into opening the picker (focus the trigger; auto-open the dropdown).
- **Plan 07 history viewer (`mode='readonly'`)** — gate `<VideoQualityPicker>` mount on `mode !== 'readonly'`.
- **Voice batch** — voice doesn't ship a quality picker (no resolution to pick), so this is video-only and doesn't have a voice sibling import.
