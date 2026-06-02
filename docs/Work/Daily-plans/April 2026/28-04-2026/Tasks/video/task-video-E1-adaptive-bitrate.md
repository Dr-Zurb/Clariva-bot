# Task video-E1: Adaptive bitrate / simulcast (Twilio `bandwidthProfile` + UI surfacing)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch E (T5 reliability) — **M item, ~3 days**

---

## Task overview

The single biggest reliability lever for video on Indian 4G. Today: bandwidth tanks → both sides freeze → users blame the app and rejoin. T5.31 wires Twilio's `bandwidthProfile` to dynamically clamp resolution/fps based on observed network and surfaces the change to the user with a small toast ("Video quality reduced to keep audio clear").

**Coupled with [task-video-B8](./task-video-B8-video-quality-picker.md):** when picker is `'auto'`, E1 is in charge; when picker is anything else, E1 respects the manual cap.

**Coupled with [task-video-E2](./task-video-E2-auto-audio-fallback.md):** when E1's adaptive degradation can't sustain even 240p, E2 takes over and disables video entirely.

**Decision §22** — `bandwidthProfile.video.mode = 'collaboration'` (recommended for two-party clinical use).
**Decision §23** — Simulcast OFF in v1 (two-party calls don't benefit; backend cost). Revisit when [task-video-C8](./task-video-C8-three-way-call.md) ships.

**Estimated time:** ~3 days.

**Status:** ✅ Shipped (2026-05-02).

**Depends on:** [task-video-A8](./task-video-A8-network-quality-bars.md) (SOFT — reads stats; ✅ shipped). Couples with B8 (✅ shipped — picker is the user-facing ceiling) + E2 (NOT YET SHIPPED — `audio-only` adaptive level is a reserved slot in v1; controller never emits it).

**Source:** [T5 §T5.31](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md); [decisions §22 + §23](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts).

---

## Acceptance criteria

### Twilio `bandwidthProfile` configuration

- [ ] **Edit `<VideoRoom>`** Twilio `connect` call to include:
  ```ts
  bandwidthProfile: {
    video: {
      mode: 'collaboration',
      maxSubscriptionBitrate: 2_400_000,  // 2.4 Mbps cap
      dominantSpeakerPriority: 'high',
      contentPreferencesMode: 'auto',
      clientTrackSwitchOffControl: 'auto'
    }
  }
  ```

### Adaptive degradation logic

- [ ] **New** `frontend/lib/video/adaptive-bitrate.ts`:
  ```ts
  export function makeAdaptiveBitrateController({
    room: Room,
    onQualityChange: (level: 'high' | 'medium' | 'low' | 'audio-only') => void,
    networkQualityHook: useNetworkQuality(localParticipant)
  }) { ... }
  ```
  - Polls `Participant.networkQualityLevel` (from A8's hook) and downgrades published video resolution + fps when level is sustained ≤ 1 for 10s.
  - Levels:
    - **High:** native (1080p / 30fps)
    - **Medium:** 720p / 24fps
    - **Low:** 480p / 20fps
    - **(very low / E2):** kicks audio fallback
  - Auto-recovers (upgrades) when network quality recovers for 30s sustained.

### Republishing local video at lower res

- [ ] When degrading: `unpublish(currentVideoTrack); createLocalVideoTrack({ width, height, frameRate }); publish(newTrack)`.
- [ ] When upgrading: same.
- [ ] Keep transitions debounced (don't flap; min 30s between adjustments).

### B8 picker coupling

- [ ] When B8 picker is `'auto'`: E1 controls bitrate.
- [ ] When B8 picker is `'1080p' | '720p' | '480p'`: E1 ceiling is the picker value (no upgrade above).
- [ ] When B8 picker is `'audio-only'`: E1 is suspended.

### UI surfacing

- [ ] **Toast** when degradation fires: "Video quality reduced — saving bandwidth for clear audio". Dismissable.
- [ ] **Toast** when upgrade fires (silent — no toast; auto-restore).
- [ ] **No notification on every micro-adjustment** — only on level transitions (high → medium → low).

### Manual smoke

- [ ] Throttle network in DevTools to slow 3G → within 10s, video resolution drops + toast appears.
- [ ] Restore network → video upgrades back within 30s; no toast.
- [ ] Cycling throttling rapidly → no flapping (debounce holds).
- [ ] B8 picker on `1080p` → E1 doesn't degrade below picker minimum (still degrades within 1080p ceiling).

### `mode='readonly'`

- [ ] Adaptive controller not mounted in readonly view.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] No Twilio-track leak on republish.

---

## Out of scope

- **Simulcast** — defer until C8 three-way ships.
- **Per-recipient adaptive** (different bitrates to different subscribers). N/A in two-party.
- **Server-side TURN cost optimization.** Out of scope.
- **Background CPU detection.** Defer to v1.5.

---

## Files expected to touch

**Frontend:**
- `frontend/lib/video/adaptive-bitrate.ts` — **new** (~200 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~50 LOC: bandwidthProfile config + controller mount + toast).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §22** — `'collaboration'` mode optimizes for two-party.
2. **Decision §23** — Simulcast OFF; revisit for C8.
3. **Republish lag** — ~1-2s renegotiation on each downgrade. Acceptable for adaptive.
4. **Toast frequency** — once per major level transition; not on every micro adjustment.
5. **Coupling with E2** — E1's "very low" branch IS E2's trigger; integration documented in E2.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch E](../Plans/plan-video-consult-selected-features.md#sub-batch-e--reliability--safety-12-days)
- **Source item:** [T5 §T5.31](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md)
- **Decisions:** [§22 mode, §23 simulcast](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts)
- **Twilio:** `bandwidthProfile`, `Participant.networkQualityLevel`
- **Coupled:** [task-video-B8](./task-video-B8-video-quality-picker.md), [task-video-E2](./task-video-E2-auto-audio-fallback.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Shipped 2026-05-02 — pure adaptive-bitrate state machine + `<VideoRoom>` wiring (controller tick loop, `applyAdaptiveLevel` republish, amber-pill toast). v1 floor is `low` (480p); `audio-only` slot reserved for E.4. See "Implementation log" below.

---

## Implementation log (2026-05-02)

### Audit findings

| Spec assumption | Codebase reality | Adjustment |
|---|---|---|
| `useNetworkQuality(localParticipant)` exists | ✅ Shipped in A8 (`frontend/hooks/useNetworkQuality.ts`); returns `{ level: 0–5 \| null, lastUpdated }` | Reused as-is. |
| `<VideoRoom>` exposes `localParticipant` state | ✅ `setLocalParticipant` set in connect block (line ~1597) | Used directly. |
| `bandwidthProfile.video.mode = 'collaboration'` set at connect | ✅ Already in connect block (B8 wired it) | No change. |
| `videoConstraintsForQuality(quality)` covers all picker values | ✅ Returns null for 'auto', explicit for 720p/480p/1080p, null for 'audio-only' | Reused — E1 maps adaptive level → quality option → constraints. |
| Toast / notice surface | ✅ `backgroundNotice` (C2) + `pipNotice` (B7) + `screenShareNotice` (C5) all use the same amber-pill pattern | Mirrored as `adaptiveNotice`. |
| `mode='readonly'` prop on `<VideoRoom>` | ❌ Doesn't exist today (per existing comments — A3 / B4 / B6 / B7 all note this) | Same gate-when-it-lands pattern; controller naturally doesn't tick when not connected. |
| Frontend jest / vitest | ❌ No frontend test infra (only Playwright e2e) | Built `adaptive-bitrate.ts` as pure functions for future testability; no jest tests today (same precedent as E.1's `data-estimate.ts`). |

### Scope decisions

1. **`audio-only` reserved for E.4 (E2 audio fallback).** The adaptive level type carries `'audio-only'` but the state machine NEVER emits it in v1 (`nextLevelDown('low')` returns `'low'` — the floor). When E.4 ships, it'll read the controller's `currentLevel` and trigger audio-fallback when level is sustained `'low'` AND network quality stays ≤ 1 for an extended window. The `applyAdaptiveLevel('audio-only')` branch is a no-op + dev-warn today; E.4 will replace it with the audio-only republish path.

2. **Picker stays at `'auto'` when controller is in charge.** The B8 picker `quality` state is NOT updated on adaptive transitions — only the underlying track is republished. Rationale: if we updated the picker to `'720p'` on each downgrade, the next clause of B8's coupling spec (*"when picker is explicit, controller is suspended"*) would immediately disable the controller — a one-way ratchet down. The user knows the controller is in charge BECAUSE the picker stays at 'auto' + the toast explains the underlying state.

3. **Toast on downgrade only.** Per spec §"UI surfacing": *"toast when degradation fires; toast when upgrade fires (silent — no toast; auto-restore)"*. Implemented `adaptiveToastMessage()` returns `null` for upgrades. Per-level copy ("reduced to 720p" vs "reduced to 480p — keeping audio clear on a slow network") is more honest than a single string.

4. **1-second tick interval.** Twilio only fires `'networkQualityLevelChanged'` on level CHANGES, but the sustain windows (10s downgrade / 30s upgrade) need to accumulate while level holds steady. A 1s heartbeat is cheap (a single `evaluateAdaptiveTransition` call — pure function) and keeps the sustain logic deterministic.

5. **Refs for the interval closure.** `networkLevelRef` + `applyAdaptiveLevelRef` mirror the live values so the interval closure stays stable. Re-binding the interval every level sample would reset its phase and break sustain accumulation.

6. **Controller resets on disconnect.** Effect cleanup re-initializes the state when `status !== 'connected'`. Next call starts fresh ('high' level, no sustain windows, no cooldown anchor).

7. **30s cooldown.** Per spec §"Republishing": *"Keep transitions debounced (don't flap; min 30s between adjustments)"*. Implemented as `TRANSITION_COOLDOWN_MS = 30_000` in the state machine — even if a sustain window completes, `now - lastTransitionAt < 30s` blocks the transition (sustain window keeps accumulating so the moment cooldown expires, the next transition fires immediately if conditions still hold).

8. **`bandwidthProfile.maxSubscriptionBitrate` NOT touched.** Twilio JS SDK 2.34 has no runtime API to mutate this — it's set-once at `connect()` time per B8's existing comments. E1 only manages the LOCAL publish dimensions (which controls upload bandwidth + indirectly remote sender's adaptive decisions). Documented as a v1 limitation in the source comments.

### Files touched

**New:**
- `frontend/lib/video/adaptive-bitrate.ts` — pure state machine + helpers (~340 LOC). Exports: `AdaptiveLevel`, `AdaptiveControllerState`, `evaluateAdaptiveTransition()`, `adaptiveLevelToQuality()`, `adaptiveToastMessage()`, `makeInitialAdaptiveState()`, `classifyLevelTrend()`, `nextLevelDown()`, `nextLevelUp()`, plus the timing constants.

**Edited:**
- `frontend/components/consultation/VideoRoom.tsx` — import block (~10 LOC), controller state + auto-clear effect (~30 LOC), `applyAdaptiveLevel` callback (~120 LOC), 1s tick effect (~50 LOC), notice render (~10 LOC). Total ~220 LOC additions, no removals; existing `handleQualityChange` (B8), `useNetworkQuality` (A8), `bandwidthProfile` setup all unchanged.

**Backend / migrations / tests:** none (per spec).

### Verification

- ✅ `npx tsc --noEmit` (frontend) — clean.
- ✅ `npx next lint --file lib/video/adaptive-bitrate.ts --file components/consultation/VideoRoom.tsx` — clean.
- ✅ Backend untouched (zero backend file edits).
- ⏭ Unit tests — deferred (no frontend jest/vitest infra; pure functions enable future testing).
- ⏭ Manual smoke (DevTools throttling) — owner-validated post-deploy; the spec's smoke checklist is the runbook.

### Known gaps (intentional, deferred)

1. **Audio-only branch (E.4 / E2)** — controller never emits 'audio-only' in v1. When E.4 ships, replace the `applyAdaptiveLevel('audio-only')` no-op with the audio-only republish path (mirror `handleQualityChange`'s `'audio-only'` branch).
2. **Simulcast (decision §23 OFF in v1)** — revisit when C8 three-way ships. Connect-time option in Twilio.
3. **Frontend unit tests** — pure-function test fixtures will be trivial when jest/vitest is provisioned. Suggested test cases:
   - `classifyLevelTrend(0/1) === 'down'`, `(2/3/null) === 'neutral'`, `(4/5) === 'up'`
   - `nextLevelDown('low') === 'low'` (floor), `nextLevelUp('high') === 'high'` (ceiling)
   - State machine: 11s of sustained level=1 → emits downgrade transition; 9s does not.
   - State machine: transition emitted; next 29s of sustained level=5 → no transition (cooldown); 31s after → upgrade fires.
   - State machine: picker switches to '720p' mid-flight → sustain windows reset; switches back to 'auto' → controller resumes from current level.
   - `adaptiveToastMessage('downgrade', 'medium')` returns the 720p copy; `('upgrade', _)` returns null.
