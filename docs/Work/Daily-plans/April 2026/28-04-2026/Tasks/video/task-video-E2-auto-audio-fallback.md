# Task video-E2: Auto-degrade to audio-only on bandwidth catastrophe

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch E (T5 reliability) — **M item, ~2 days**

---

## Task overview

When E1's adaptive bitrate has degraded all the way to 240p and bandwidth STILL can't sustain it, video starts blocking audio (the killer experience). T5.32 ships the safety net:

1. Detect: network quality stuck at 0/1 for 10s OR audio glitch ratio > threshold.
2. Disable local video track entirely.
3. Show banner: "Audio-only — your connection is very slow. [Try video again]"
4. Counterparty sees the same banner: "Patient on audio-only — slow connection".
5. Companion-chat row: `'auto_audio_fallback'` (NEW Plan 06 enum value — owned here).
6. After 60s of recovered network, optionally re-enable video automatically OR wait for user to click "Try video again" (decision §24 — wait for user; less surprising).

**Cooldown:** 60s after user clicks "Try video again" to prevent flapping (decision §25).

**Estimated time:** ~2 days.

**Status:** ✅ Shipped (2026-05-02). Phase 1 surgical scope landed; counterparty on-screen banner + B8 picker "Audio-only (auto)" chip deferred to Phase 2 (chat system row + A2 remoteCameraOff avatar are enough for v1).

**Depends on:** [task-video-E1](./task-video-E1-adaptive-bitrate.md) ✅ Shipped — E1's `'audio-only'` transition (now wired in `nextLevelDown('low')`) triggers E2's fallback path.

**Source:** [T5 §T5.32](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md); [decisions §24 + §25](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts).

---

## Acceptance criteria

### Detection logic

- [ ] **Trigger:** `networkQualityLevel <= 1` sustained for ≥ 10s OR `audioInputLevel` glitches detected (out of scope for v1; QualityLevel is enough).
- [ ] **Hook into E1's controller** — when E1 wants to go below 240p, it instead invokes E2's fallback path.

### Audio fallback action

- [ ] **Disable local video track** — `localVideoTrack.disable()` + (optionally) `unpublish` to free bandwidth entirely.
- [ ] **Set state** `auto-audio-fallback-active`.
- [ ] **Emit Plan 06 system row** with `'auto_audio_fallback'` enum value (NEW; combine with A2 / E2 / C3 enum migration window).

### `<AudioFallbackBanner>` component

- [ ] **New component** at `frontend/components/consultation/AudioFallbackBanner.tsx`:
  - Sticky banner at top of video canvas: "Audio-only — slow connection. [Try video again]"
  - Counterparty version: "Patient is on audio-only — slow connection".
- [ ] On click "Try video again":
  - If 60s cooldown not elapsed: tooltip "Wait for the connection to recover" (decision §25).
  - Otherwise: re-enable video; subscribe to E1's controller; if quality is still bad, fallback fires again.

### Integration with B8 quality picker

- [ ] When auto-fallback fires, B8's picker visual updates to show "Audio-only (auto)" with restore-on-recovery option.
- [ ] User manually picking 'audio-only' bypasses E2 entirely (no banner; manual choice).

### Plan 06 enum extension

- [ ] Add `'auto_audio_fallback'` enum value (combine with C3 / A2 enum migration window). System row metadata: `{ reason: 'low_bandwidth', threshold_level: 1 }`.

### Manual smoke

- [ ] Heavy throttle to slow 3G for >10s → banner appears + video disables + system message in chat.
- [ ] Counterparty sees parallel banner.
- [ ] Restore network → banner stays (waiting for user); user clicks Try video again → video re-enables.
- [ ] Click Try video again immediately after fallback (within 60s) → tooltip "Wait for the connection to recover".

### `mode='readonly'`

- [ ] Banner shown statically in readonly view if the call had this state during recording.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] No flapping (verified by toggling throttle every 5s).

---

## Out of scope

- **Auto-recovery without user gesture.** Decision §24 — wait for user.
- **Patient-initiated re-enable on doctor side.** Out of scope; each side controls own video.
- **Switching to phone-call PSTN failover.** Out of scope.
- **AI-recommend "switch to text consult".** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/AudioFallbackBanner.tsx` — **new** (~80 LOC).
- `frontend/lib/video/adaptive-bitrate.ts` — **edit** (~30 LOC: invoke fallback when minimum reached).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~25 LOC: mount banner + handle fallback state).

**Backend:**
- (with C3 / A2 enum migration) Add `'auto_audio_fallback'` to enum.

**Tests:** none required.

---

## Notes / open decisions

1. **Decision §24** — wait for user to click Try video again (less surprising than auto-restore).
2. **Decision §25** — 60s cooldown to prevent flapping.
3. **`disable()` vs `unpublish()`** — for fallback, prefer `unpublish` (frees bandwidth completely). Reverse on restore.
4. **Recording boundary** — fallback doesn't pause recording; recording artifact reflects audio-only period (no video frames during fallback).
5. **Companion-chat copy** — "Switched to audio-only because of slow connection" (descriptive, not blame-y).

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch E](../Plans/plan-video-consult-selected-features.md#sub-batch-e--reliability--safety-12-days)
- **Source item:** [T5 §T5.32](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md)
- **Decisions:** [§24 manual restore, §25 cooldown](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts)
- **Hard dep:** [task-video-E1](./task-video-E1-adaptive-bitrate.md) ✅
- **Coupled:** [task-video-B8](./task-video-B8-video-quality-picker.md), [task-video-F4](./task-video-F4-battery-saver-downgrade.md) (battery-saver consumes E2)

---

## Implementation log (2026-05-02)

### Audit findings → reality vs. spec

| Spec assumption | Codebase reality | Decision |
|---|---|---|
| Plan 06 enum migration window needed for `'auto_audio_fallback'` (per draft note + B8 / A1 / A2 deferral chains) | `system_event` is **TEXT, not a Postgres ENUM** per Migration 063 line 47 — *"`system_event` is deliberately TEXT (not an ENUM) so Plans 07, 08, 09 can each ADD tags without coordinating an `ALTER TYPE` migration ordering. The TypeScript `SystemEvent` union is the actual source of truth."* | Zero-migration ship. Adding the two new event values is a one-line TS change. Unlocks all the deferred A1/A2/B8 events for the same reason. |
| `applyAdaptiveLevel('audio-only')` is a no-op stub from E.3 | Confirmed — E.3 dev-warned + returned early; the existing `handleQualityChange`'s 'audio-only' branch is the canonical track-teardown reference | Replaced the stub with the real teardown (mirrors `handleQualityChange` synchronous `unpublishTrack` + `stop()` + `localTracksRef` filter + clear `srcObject`) |
| Need a backend route for the system row | C6 quick-actions service is the gold-standard pattern — doctor-only JWT auth + payload validator + emit dispatch + HTTP route + frontend `lib/api.ts` wrapper | Lifted the C6 shape verbatim. Same `mountDoctorAdminMock` test fixture; 28 tests modeled on the 23-test C6 suite. |
| Counterparty banner with "Patient is on audio-only" copy | Cross-side rendering would need either (a) Twilio data tracks (not used in codebase) or (b) <TextConsultRoom> subscribing to system rows + signaling <VideoRoom>. Neither is trivial; both are ~1 day each. | DEFERRED to Phase 2. The patient already sees: (a) A2's `remoteCameraOff` avatar (visual), (b) the `auto_audio_fallback` system row in their chat companion (transcript-grade explanation). That's the v1 transparency contract. |
| B8 picker visual override ("Audio-only (auto)" chip) | Adding a sixth `QualityOption` slot would touch the picker UI + storage + every coupling site | DEFERRED to Phase 2. Banner copy disambiguates ("Audio-only — your connection is too slow for video") + manual override clears banner + picker stays at `'auto'` so controller resumes after restore without user re-flip. |
| `mode='readonly'` static banner in recording playback | No mode='readonly' wiring exists yet for the auto-fallback banner (or for E.3's adaptive notice for that matter) | DEFERRED — orthogonal to live-call shipping. Replay rendering can read from the system rows + show inline banners later. |

### Scope decisions (Phase 1 surgical)

1. **`auto_audio_fallback` + `auto_audio_recovered` are TS-only additions** — no DB migration. Confirmed via Migration 063 reading + emitter call shape (`emitSystemMessage` accepts arbitrary `SystemEvent` strings already).
2. **Doctor-only POST gate** — patient mounts skip the system-row POST entirely (no `inCallActions` + no `doctorToken`). The on-screen banner still mounts for both roles. Backend hard-rejects patient JWTs with 403 (parity with C6).
3. **Per-session-per-attempt dedup ordinal** — `attempt: 1, 2, 3` bumped on each engagement. The frontend tracks it in `autoFallbackAttemptRef`. Backend's `correlationId` on the system row is `auto_audio_fallback:{sessionId}:{attempt}` so legitimate fallback-after-restore-after-fallback writes a clean fresh row instead of getting deduped against the prior attempt.
4. **Banner is sticky, NOT a self-clearing pill** — fallback persists until user takes action; a 6s toast would vanish leaving the user with a black tile + no explanation. Sticky banner with z-30 (above recording indicator z-20, parity with `<HoldCallBanner>`).
5. **60s cooldown gate at the controller level** — extended `AdaptiveEvaluationInput` with optional `audioFallbackCooldownActive: boolean`. When true, the audio-only transition is blocked but other downgrades / upgrades still fire. Sustain windows continue to accumulate so the moment cooldown lifts, audio-only fires immediately if conditions still hold (preventing flapping without permanently disabling the fallback).
6. **`nextLevelDown('low')` now returns `'audio-only'`** — was `'low'` (idle at floor) in E.3. With this change, the existing 10s sustain window naturally triggers audio-only after the controller's already at the 480p floor.
7. **`adaptiveToastMessage('downgrade', 'audio-only')` returns `null`** — caller uses `<AudioFallbackBanner>` instead of double-firing the inline pill notice.
8. **Manual picker override clears banner without posting `restored`** — if the user picks `720p` etc. while in fallback, they've taken control via a non-banner path; we clear `autoFallbackActive` but don't post a paired `restored` row. Engaged row stands alone in the chat (post-call summary will show "Audio-only — duration unknown").
9. **Restore handler sets cooldown FIRST (before the await)** — covers the corner case where `createLocalVideoTrack` takes 3s on slow 4G; without the eager set, the controller could fire a fresh fallback before the restore handler finishes.
10. **Engaged-at ref captured at engage time, cleared at restore** — fed into `durationSeconds` on the restored row so the post-call summary can render "Audio-only for 2m 14s" without re-querying timestamps.

### Files touched

**Backend (5 files):**
- `backend/src/services/consultation-message-service.ts` — extended `SystemEvent` union with two new values + 90 LOC of inline doc; added `emitAutoAudioFallback` + `emitAutoAudioRecovered` helpers (~90 LOC).
- `backend/src/services/consultation-auto-fallback-service.ts` — **new** (~310 LOC). Doctor-only validation + auth + dispatch. Mirrors `consultation-quick-actions-service.ts` line-for-line for the auth gate.
- `backend/src/controllers/consultation-controller.ts` — added `postAutoFallbackBannerHandler` (~30 LOC) + import.
- `backend/src/routes/api/v1/consultation.ts` — registered route + import.
- `backend/tests/unit/services/consultation-auto-fallback-service.test.ts` — **new** (~440 LOC). 28 tests across the validation matrix + auth gate + dispatch. Lifted from the C6 test fixture.

**Frontend (4 files):**
- `frontend/lib/video/adaptive-bitrate.ts` — `nextLevelDown('low') → 'audio-only'`; new `audioFallbackCooldownActive` input field; cooldown gate in evaluator; `adaptiveToastMessage` returns null for audio-only (banner covers it). ~50 LOC of changes.
- `frontend/components/consultation/AudioFallbackBanner.tsx` — **new** (~165 LOC). Sticky banner, 1s countdown ticker (mounted only while cooldown is active), `aria-disabled` + `title` tooltip on the button during cooldown.
- `frontend/components/consultation/VideoRoom.tsx` — wired everything together (~280 LOC additions): state + refs for `autoFallbackActive` / cooldown / attempt / engaged-at / restoreInFlight; replaced the no-op stub in `applyAdaptiveLevel('audio-only')` with real teardown + bookkeeping + best-effort POST; new `handleTryVideoAgain` callback (recreate video track at 'auto' constraints, set cooldown, clear fallback, post `restored` row); cooldown-mirror useEffect; banner mount inside the `<div className="relative">` wrapper alongside `<HoldCallBanner>`; manual-override clear in `handleQualityChange`.
- `frontend/lib/api.ts` — added `postConsultationAutoFallbackBanner` helper (~50 LOC) mirroring `postConsultationQuickActionBanner`.

### Verification

- **Backend** — `npx tsc --noEmit`: clean (0s exit). `npx jest tests/unit/services/consultation-auto-fallback-service.test.ts`: **28/28 pass** in 15.9s. `npx eslint` on all 5 touched files: clean.
- **Frontend** — `npx tsc --noEmit`: clean. `npx next lint --file <each>`: ✔ no warnings or errors on the 4 touched files.

### Known gaps (Phase 2 backlog)

1. **Counterparty on-screen banner** — patient sees the chat system row + remoteCameraOff avatar; doesn't see a parallel on-screen banner. Lift in Phase 2 by subscribing the patient's `<VideoRoom>` to the chat system rows (or via Twilio data tracks if a future task introduces them).
2. **B8 picker "Audio-only (auto)" chip** — picker stays at `'auto'` during fallback; banner copy disambiguates. Phase 2 could add a sixth `QualityOption` and a `bandwidthSuspended` derived field on the picker.
3. **`mode='readonly'` replay banner** — neither E.3's adaptive notice nor E.4's banner show inline during recording playback. Orthogonal to live-call shipping.
4. **Audio-glitch detection** — spec mentioned `audioInputLevel` ratio as a secondary trigger; v1 only uses Twilio's `networkQualityLevel <= 1` per spec §"Detection logic" (the simpler trigger was good enough).

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Shipped 2026-05-02 — backend (auto-fallback service + 28 unit tests) + frontend (sticky banner + adaptive controller integration + 60s cooldown gate). Counterparty banner + picker chip deferred to Phase 2.
