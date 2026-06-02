# voice-consult-selected-features — execution order

> Sibling document of [`plan-voice-consult-selected-features.md`](../../Plans/plan-voice-consult-selected-features.md) and the task index [`README-voice.md`](./README-voice.md). The plan covers what and why; the README enumerates the task files; **this doc covers who-runs-what-when and which model.**

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

**Wave / lane / shape conventions:** [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md)

**Execution playbook:** [EXECUTION-ORDER-GUIDELINES.md §13.5 — Operating playbook](../../../../../EXECUTION-ORDER-GUIDELINES.md#135-operating-playbook-how-to-execute-a-batch-from-these-docs)

**Sibling batches that have already shipped reusable foundation work:**

- **Video Sub-batch E.5** shipped [`frontend/hooks/useTabPresenceClaim.ts`](../../../../../../frontend/hooks/useTabPresenceClaim.ts) + `<MultiTabKickBanner>` — **voice C4** is now mostly mount + smoke (~1 day, not 3).
- **Video Sub-batch E.6** shipped [`frontend/hooks/useCallRejoinCache.ts`](../../../../../../frontend/hooks/useCallRejoinCache.ts) — **voice C5** is now mostly mount + smoke (~1 day, not 3).
- **Video Sub-batch F.4** shipped `useCallMediaSession` (modality-agnostic) + `/sw.js` + `<IOSPWABanner>` — **voice C10** is now mostly mount + smoke (~2–3 days, not 1 week).
- **Video Sub-batch F.5** shipped MediaSession `playbackState='playing'` declaration — **voice C6** (hardware-volume verification) is now pure smoke (already ~1h in the spec; confirm and move on).

**Status:** Sub-batch 0 is **Shipped** (2026-04-30). Everything else is **Drafted**. Sub-batches A → B → C below.

---

## Wave plan (8 waves + 1 shipped pre-flight)

```
Wave 0 (Pre-flight — companion-chat hard gate, SHIPPED 2026-04-30):
  Lane α  ──── 0A ✅ ──> 0T ✅ ──> 0B ✅ ──> 0C ✅

Wave 1 (Sub-batch A primitives — ~9h, 2 parallel lanes — fully independent):
  Lane α  ──── A1 (XS, Composer 2) ──> A2 (XS, Composer 2) ──> A3 (S, Auto) ──> A4 (S, Auto)        [small chips: timer / end-call modal / mic meter / network bars]
  Lane β  ──── A6 (S, Auto) ──> A5 (M, Auto) ──> A9 (S, Auto)                                          [precall mic check / audio output picker / disconnect splash]

Wave 2 (Sub-batch A counterparty notif + caller card — ~6h, single lane sequential):
  Lane α  ──── A7 (S, Auto) ──> A8 (S, Auto)
                                                                                                       [A7 = counterparty mute notif (Plan 06 'mute_changed', needs Wave 0 ✅); A8 = caller-card header (consumes A1 + A4 from Wave 1)]

Wave 3 (Sub-batch B local UX — ~19h, 2 parallel lanes — fully independent):
  Lane α  ──── B1 (M, Auto) ──> B4 (S, Auto)                                                          [reconnection-UX banner + volume slider/boost]
  Lane β  ──── B2 (M, Auto) ──> B3 (M, Auto)                                                          [precall lobby (extends A6) + hold call (Plan 06 'hold_changed', needs Wave 0 ✅)]

Wave 4 (Sub-batch B post-call surfaces — ~3 days, single lane sequential):
  Lane α  ──── B5 (L, Opus 4.7) ──> B6 (M, Auto)
                                                                                                       [B5 = post-call summary backend aggregator (PHI from ≥3 tables → hard-rules #2); B6 = recording playback link (Plan 07 ✅ shipped)]

Wave 5 (Sub-batch C cheap items + foundation-consumer wire-up — ~3.5 days, 2 parallel lanes — fully independent):
  Lane α  ──── C1 (XS, Composer 2) ──> C6 (XS, Composer 2) ──> C8 (M, Auto)                            [audible ringtone + hw-volume verify + proximity sensor]
  Lane β  ──── C4 (S, Auto) ──> C5 (S, Auto) ──> C7 (M, Auto)                                          [multi-tab kick (mounts video E.5 hook) + crash-recovery rejoin (mounts video E.6 hook) + BT/AirPods relay (extends A5)]

Wave 6 (Sub-batch C migration + push backend coordination — ~5 days, 2 parallel lanes after C2):
  Lane α  ──── C2 (L, Opus 4.7) ──> C10 (M, Auto)
                                                                                                       [voice_call_quality migration + RLS; C10 mounts video F.4 useCallMediaSession with modality='voice']
  Lane β  ──── (waits on text D6a) ──> C3 (M, Auto)
                                                                                                       [browser-push remote joins — consumes text D6a's push-notification-service.ts + web_push_subscriptions table. If text D6a hasn't shipped at Wave 6 start, this lane is deferred until it does — see "Cross-batch coordination" below.]

Wave 7 (Sub-batch C vendor-gated polish — SHIPPED 2026-05-24, single lane sequential):
  Lane α  ──── ✅ [Krisp + per-side opt-in, defaulted ON; RNNoise selectable via env] ──> C9 ✅ (M, Auto)
                                                                                                       [noise suppression — decision §9 LOCKED; Twilio 2.27+ built-in noiseCancellationOptions wired; WASM bundle gated behind NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH for budget-controlled rollout]
```

**Total wall-clock with parallelism:** ~17 dev-days for Waves 1–6 if everything runs to plan (one engineer running both lanes via worktrees; the natural slack is in Waves 3 + 5 where the two lanes finish at slightly different times).

**Total agent-time (sequential equivalent):** ~22 dev-days for Waves 1–6 if a single engineer runs every lane back-to-back.

**Wave 7 (C9) is excluded from the totals** — it's vendor-decision-gated; once the decision lands, allow ~3 days for the Krisp implementation or ~3 days for an RNNoise WASM build, but neither is on the critical path for the rest of the batch.

The bottleneck is **Wave 6 (~5 days)** — Lane α is single-lane sequential because the `voice_call_quality` migration (Opus) must ship before C10 starts wiring telemetry into the foreground notification banner. Lane β is independent but its entry is gated on **text D6a** — coordinate at PR time.

**Why Shape B (parallel) lanes in Waves 1, 3, 5, 6 are legitimate:**

- **Wave 1 (Sub-batch A primitives):** Lane α (`A1` / `A2` / `A3` / `A4`) lives in `<VoiceConsultRoom>` header + bottom-bar controls + new tiny `frontend/hooks/useCallDuration.ts`, `frontend/hooks/useMicLevel.ts`, `frontend/hooks/useNetworkQuality.ts` files. Lane β (`A6` / `A5` / `A9`) lives in a new `<VoiceConsultPreCall>` component (~`frontend/components/consultation/VoiceConsultPreCall.tsx`) + new `frontend/hooks/useAudioOutputDevice.ts` + new `frontend/lib/call/classify-disconnect.ts`. The §5 lane gate passes all six points: (1) Lane β can start from t=0 against `main` — A6's precall surface is a brand-new component, no read of Lane α's WIP. (2) Disjoint files. (3) Neither lane reads the other's WIP mid-wave. (4) Symmetric. (5) A8 lives in **Wave 2**, not Wave 1 — that's the convergence task that consumes A1 + A4 — so no task in Wave 1 consumes outputs from both lanes. (6) Each lane is ≥ 7h. ✓
- **Wave 3 (Sub-batch B local UX):** Lane α (`B1` reconnection banner + `B4` volume slider) lives in `<VoiceConsultRoom>` bottom-bar + a new `useTwilioReconnectState` hook + `<ReconnectionBanner>` + a new `<VolumeSlider>` + `frontend/lib/audio/gain-node.ts`. Lane β (`B2` precall lobby + `B3` hold call) lives in the `<VoiceConsultPreCall>` extension + `<HoldCallBanner>` + `useHoldState` hook + Plan 06 enum addition. The bottom-bar overlap is a single low-churn line per §5.2 footnote. Lane α and Lane β converge only at the wave's acceptance gate.
- **Wave 5 (Sub-batch C cheap items + foundation-consumer wire-up):** Lane α (`C1` audible ringtone + `C6` hw-volume verify + `C8` proximity sensor) lives in tiny new files: `frontend/lib/audio/ringtone.ts` + a smoke-only manual verification PR for hw-volume + new `frontend/hooks/useProximityWakeLock.ts`. Lane β (`C4` multi-tab kick + `C5` crash-recovery + `C7` BT/AirPods relay) lives in `<VoiceConsultRoom>` mount points for the already-shipped video E.5 / E.6 hooks + an extension to A5's `useAudioOutputDevice` for BT auto-relay. Both lanes converge only at the wave gate.
- **Wave 6 (Sub-batch C migration + push):** Lane α (`C2` + `C10`) lives entirely in `backend/migrations/0XX_voice_call_quality.sql` + new `backend/src/services/voice-call-quality-service.ts` + new `backend/src/controllers/voice-call-quality-controller.ts` + the mount of `useCallMediaSession({modality:'voice', …})` in `<VoiceConsultRoom>`. Lane β (`C3` browser-push) lives in a new `frontend/lib/push/voice-push.ts` + `<VoiceConsultRoom>` mount + the SW handler extension at `frontend/public/sw.js` (already extended by F.4). Lane β's `(waits on text D6a)` entry is satisfied either by text D6a having shipped beforehand OR by deferring Lane β to a follow-up PR — Lane α can ship without Lane β.

**Why every other wave is single-lane (no parallelism):** Wave 2 (A7 + A8) is sequential because A8 consumes the Plan 06 enum that A7 adds (one chat owning the enum landing → caller card mount is cleanest). Wave 4 (B5 → B6) is sequential because B6's recording playback link mounts inside the `<CallPostCallSummary>` surface that B5 lights up — and B5 is Opus while B6 is Auto, so swapping chats at the boundary respects the cost-guide's "one topic per chat" rule. Wave 7 is by definition a single deferred lane.

---

## Lane-by-lane details

### Wave 0 — Pre-flight (HISTORICAL, SHIPPED 2026-04-30)

Documented for completeness — do NOT re-execute. See [`README-voice.md`](./README-voice.md) § Sub-batch 0 and the four task files for the verbatim implementations.

| Step | Task | Size | Model | Status |
|---|---|---|---|---|
| 0 | [0A](./task-voice-0A-relax-modality-guard.md) | XS | (shipped pre-guidelines) | ✅ Shipped 2026-04-30 |
| 1 | [0T](./task-voice-0T-text-token-integration-test.md) | XS | (shipped pre-guidelines) | ✅ Shipped 2026-04-30 |
| 2 | [0B](./task-voice-0B-patient-video-companion-wiring.md) | S | (shipped pre-guidelines) | ✅ Shipped 2026-04-30 |
| 3 | [0C](./task-voice-0C-companion-error-surfacing.md) | XS | (shipped pre-guidelines) | ✅ Shipped 2026-04-30 |

### Wave 1 — Sub-batch A primitives (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [A1](./task-voice-A1-duration-timer.md) | XS | Composer 2 Fast | This task file; `frontend/components/consultation/VoiceConsultRoom.tsx` (the header section to extend); source plan T1.1. | New `frontend/hooks/useCallDuration.ts` (~40 LOC) + render chip in header. Cheapest warm-up. Composer's sweet spot per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § Tier 4](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#tier-4--composer-2-fast-use-heavily-15-25-of-turns). |
| 1 (Lane α) | [A2](./task-voice-A2-end-call-confirmation.md) | XS | Composer 2 Fast | This task file; `<VoiceConsultRoom>` end-call handler; `frontend/components/consultation/VideoRoom.tsx` (the `<EndCallConfirmModal>` precedent shipped by video A.2 — REUSE verbatim); source plan T1.5. | Component reuse from video. Composer-tier: extract + mount + smoke. |
| 2 (Lane α) | [A3](./task-voice-A3-mic-level-meter.md) | S | Auto | This task file; `<VoiceConsultRoom>` mic-button area; source plan T1.4. | New `frontend/hooks/useMicLevel.ts` (~60 LOC, WebAudio analyser node) + tiny meter component. |
| 3 (Lane α) | [A4](./task-voice-A4-network-quality-bars.md) | S | Auto | This task file; `<VoiceConsultRoom>` header area; `frontend/components/consultation/VideoRoom.tsx` (the bars component shipped by video A.8 — REUSE verbatim); source plan T1.3. | Hook + bars reuse from video A.8. |
| 0 (Lane β) | [A6](./task-voice-A6-precall-mic-check.md) | S | Auto | This task file; `frontend/app/c/voice/[sessionId]/page.tsx` (the patient mount point); `<VideoConsultPreCall>` precedent from video A.7; source plan T1.2. | New `<VoiceConsultPreCall>` component (~150 LOC). Pre-load video's precall task spec for visual parity. |
| 1 (Lane β) | [A5](./task-voice-A5-audio-output-device-picker.md) | M | Auto | This task file; post-A6 (`<VoiceConsultPreCall>` exists); `<VoiceConsultRoom>` controls bar (mount in-call picker); source plan T1.6 + T1.7. | New `frontend/hooks/useAudioOutputDevice.ts` shared with C7. Picker in both pre-call + in-call. |
| 2 (Lane β) | [A9](./task-voice-A9-disconnect-reason-splash.md) | S | Auto | This task file; `frontend/lib/call/classify-disconnect.ts` (the classifier shipped by video B.5 — REUSE verbatim); `<VoiceConsultRoom>` disconnect-handler; source plan T2.16. | Classifier already exists from video B.5. Voice-side splash mount + copy customization. |

**Branch suggestion:** `feature/voice-A-primitives-alpha` (Lane α) and `feature/voice-A-primitives-beta` (Lane β), both branched from `main`. Merge to `feature/voice-A-primitives-merge` at the wave gate; Wave 2 stacks on the merged branch.

### Wave 2 — Sub-batch A counterparty notif + caller card (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [A7](./task-voice-A7-counterparty-mute-notification.md) | S | Auto | This task file; `backend/src/services/consultation-system-events-service.ts` (where `SystemEvent` TEXT union lives — extend with `'mute_changed'`); `backend/migrations/063_*.sql` header (confirms `system_event` is TEXT, NOT a Postgres ENUM — zero migration); `<VoiceConsultRoom>` companion-chat row renderer; source plan T1.8. | Plan 06 system event addition is **one-line TS change** to the `SystemEvent` union per video E.4's audit (Migration 063 confirms `system_event` column is TEXT not ENUM). No migration. |
| 1 | [A8](./task-voice-A8-caller-card-header.md) | S | Auto | This task file; post-Wave 1 (Lane α gives `useCallDuration` + Lane α gives network bars); `<VoiceConsultRoom>` header; source plan T2.10. | Convergence task per [`EXECUTION-ORDER-GUIDELINES.md` §1](../../../../../EXECUTION-ORDER-GUIDELINES.md#1-vocabulary) — consumes A1 (timer) + A4 (network bars) from Wave 1. Sits in Wave 2 single lane because per-guideline convergence tasks don't live inside any lane that fed them. |

**Branch suggestion:** `feature/voice-A-caller-card` stacked on Wave 1's merged branch.

### Wave 3 — Sub-batch B local UX (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [B1](./task-voice-B1-reconnection-ux.md) | M | Auto | This task file; `frontend/hooks/useTwilioReconnectState.ts` (the hook shipped by video B.4 — REUSE verbatim); `<ReconnectionBanner>` (also shipped by video B.4); `<VoiceConsultRoom>` mount point; source plan T2.15. | Hook + banner reuse from video B.4. Voice-side mount is the only new code. |
| 1 (Lane α) | [B4](./task-voice-B4-volume-slider-and-boost.md) | S | Auto | This task file; `frontend/components/consultation/VolumeSlider.tsx` (the component shipped by video B.9 — REUSE verbatim); `frontend/lib/audio/gain-node.ts` (the gainNode helper shipped by video B.9); `<VoiceConsultRoom>` bottom-bar; source plan T2.13. | Component + lib reuse from video B.9. Voice uses its own `voice-volume-percent` storage key. |
| 0 (Lane β) | [B2](./task-voice-B2-precall-lobby.md) | M | Auto | This task file; post-A6 (`<VoiceConsultPreCall>` exists); video `<VideoConsultPreCall>`'s lobby extension as reference; source plan T2.9. | Extends Wave 1 Lane β's `<VoiceConsultPreCall>`. Branding lib + lobby copy. |
| 1 (Lane β) | [B3](./task-voice-B3-hold-call.md) | M | Auto | This task file; `<VoiceConsultRoom>` mount point; `consultation-system-events-service.ts` (extend `SystemEvent` union with `'hold_changed'` — one-line TS change, no migration per Wave 2's pattern); source plan T2.11. | New `frontend/hooks/useHoldState.ts` + `<HoldCallBanner>` (both reusable by video B.3 backend pickup later). |

**Branch suggestion:** `feature/voice-B-local-ux-alpha` (Lane α) and `feature/voice-B-local-ux-beta` (Lane β), both stacked on Wave 2's branch.

### Wave 4 — Sub-batch B post-call surfaces (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [B5](./task-voice-B5-post-call-summary.md) | L | **Opus 4.7 Extra High** | This task file; `frontend/components/consultation/CallPostCallSummary.tsx` (the modality-aware component shipped by video D.2 — extend with `modality='voice'` branch); `backend/src/controllers/consultation-controller.ts` (the post-call summary handler shipped by video D.2 — verify modality-handling); `backend/src/services/post-call-summary-service.ts` (the aggregator shipped by video D.2 — extend to read voice-specific sources: A9 disconnect reason, Plan 07 recording flag); source plan T4.25. | **Opus per hard-rules list rule #2** (PHI aggregation across Plan 06 messages + Plan 07 recording metadata + A9 disconnect classification). Backend aggregator is the riskiest surface in the batch. Voice variant **extends** video D.2's already-shipped `<CallPostCallSummary>` — no rename, just add `modality='voice'` branch + voice-specific source wiring. |
| 1 | [B6](./task-voice-B6-recording-playback-link.md) | M | Auto | This task file; post-B5 (`<CallPostCallSummary>` voice variant exists); `frontend/components/consultation/RecordingReplayPlayer.tsx` (already extended for audio + video by Plan 07 + Plan 08 / Task 44 — REUSE); source plan T4.28. | Player already works for audio. This task is deep-link wire + Plan 10 transcript placeholder (mirroring video D.3's reduced-scope pattern). |

**Branch suggestion:** `feature/voice-B-post-call`. Opus chat for B5; switch to Auto for B6.

### Wave 5 — Sub-batch C cheap items + foundation-consumer wire-up (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [C1](./task-voice-C1-audible-ringtone.md) | XS | Composer 2 Fast | This task file; `<VoiceConsultRoom>` `participant-connected` callback; source plan T5.31. | New `frontend/lib/audio/ringtone.ts` (~30 LOC, single short ding per Principle 8). Composer-tier. |
| 1 (Lane α) | [C6](./task-voice-C6-hardware-volume-key.md) | XS | Composer 2 Fast | This task file; `frontend/hooks/useCallMediaSession.ts` (shipped by video F.4 + F.5 — verify `playbackState='playing'` declaration routes hw-volume input to call audio); source plan T6.35. | **Smoke-only PR.** Once C10 mounts `useCallMediaSession({modality:'voice', …})`, hw-volume routing is automatic (Android Chrome browser default). This task confirms it on real device + writes the verification note in the task file. |
| 2 (Lane α) | [C8](./task-voice-C8-proximity-sensor.md) | M | Auto | This task file; `<VoiceConsultRoom>` mount point; Chrome Android proximity-sensor API docs; source plan T6.37. | New `frontend/hooks/useProximityWakeLock.ts` (~80 LOC). Chrome Android only; silent-degrade everywhere else. |
| 0 (Lane β) | [C4](./task-voice-C4-multi-tab-kick.md) | S | Auto | This task file; `frontend/hooks/useTabPresenceClaim.ts` (shipped by video E.5 — REUSE verbatim with `role='patient'` for voice patient page, `role='doctor'` for doctor mount); `frontend/components/consultation/MultiTabKickBanner.tsx` (shipped by video E.5 — REUSE); `<VoiceConsultRoom>` mount point; source plan T5.29. | Hook + banner already shipped by video E.5 per [E.5 spec "ship the foundation here per voice C4 contract"](./EXECUTION-ORDER-video.md). This task is mount + smoke + hook unit tests (E.5 deferred them to voice C4 pickup). |
| 1 (Lane β) | [C5](./task-voice-C5-crash-recovery-rejoin.md) | S | Auto | This task file; `frontend/hooks/useCallRejoinCache.ts` (shipped by video E.6 — REUSE verbatim); `<VoiceConsultRoom>` mount point; `frontend/app/c/voice/[sessionId]/page.tsx` (the patient mount point); source plan T5.30. | Hook already shipped by video E.6 per [E.6 spec "modality-agnostic from day one"](./EXECUTION-ORDER-video.md). This task is doctor-side cache write + voice C5 mount + hook unit tests (E.6 deferred them here). |
| 2 (Lane β) | [C7](./task-voice-C7-bluetooth-airpods-relay.md) | M | Auto | This task file; post-A5 (`useAudioOutputDevice` hook from Wave 1); WebAudio `setSinkId` + `mediaDevices.addEventListener('devicechange', …)` docs; source plan T6.34. | Extends A5's hook with BT-detection + auto-relay. Bluetooth media-button mapping inherits from video F.5's MediaSession via `useCallMediaSession` (no extra wiring needed). |

**Branch suggestion:** `feature/voice-C-cheap-alpha` (Lane α) and `feature/voice-C-foundation-beta` (Lane β), both stacked on Wave 4's branch.

### Wave 6 — Sub-batch C migration + push backend coordination (2 parallel lanes after C2)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [C2](./task-voice-C2-qos-health-metrics.md) | L | **Opus 4.7 Extra High** | This task file; `backend/migrations/086_video_call_quality.sql` (the precedent shipped by video E.7 — mirror the pattern for `voice_call_quality.sql`); `backend/src/services/video-call-quality-service.ts` (the precedent shipped by video E.7 — mirror); `backend/src/utils/safe-uuid-sub.ts` (the RLS invariant per Plan F04); `frontend/lib/video/quality-reporter.ts` (the reporter shipped by video E.7 — mirror for voice); source plan T5.33. | **Opus per hard-rules list #1 + #3** (new migration with RLS policies + `safe_uuid_sub()` invariant + service-role admin client INSERT pattern). Migration number: claim next free after text Sub-batch D's last migration; coordinate at PR time. **Voice quality reporter** mirrors video E.7's pattern minus the video-specific stats (no fps, no resolution; keeps audio level + packet-loss + network-quality-level + jitter). |
| 1 (Lane α) | [C10](./task-voice-C10-android-foreground-notification.md) | M | Auto | This task file; `frontend/hooks/useCallMediaSession.ts` (shipped by video F.4 — modality-agnostic; mount with `modality:'voice'`); `frontend/public/sw.js` (shipped by video F.4 — message handler already supports voice/video); `frontend/components/consultation/IOSPWABanner.tsx` (shipped by video F.4 — REUSE); `<VoiceConsultRoom>` mount point; source plan T6.36. | F.4 already shipped the modality-aware foundation per [F.4 spec "bears voice C10 foundation"](./EXECUTION-ORDER-video.md). This task is mount + voice-specific notification body copy + smoke matrix. **Significantly reduced scope** (~2–3 days, not the original 1 week). |
| 0 (Lane β) | [C3](./task-voice-C3-browser-push-remote-joins.md) | M | Auto | **Sync gate:** waits on text D6a's `push-notification-service.ts` + `web_push_subscriptions` migration shipping first. This task file; post-text-D6a — `backend/src/services/push-notification-service.ts` (REUSE); `frontend/public/sw.js` (extend with `'voice-join'` payload handler — already extended for video F.4 messaging, plus push handler from text D6b); source plan T5.32. | Cross-batch coordination — see [README-voice.md § Cross-batch coordination point](./README-voice.md#cross-batch-coordination-point). **If text D6a has not shipped at Wave 6 start, Lane β is DEFERRED to a follow-up PR;** Lane α (C2 + C10) can ship without Lane β. |

**Branch suggestion:** `feature/voice-C-migration-alpha` (Lane α, includes Opus chat for C2 then Auto chat for C10) and `feature/voice-C-push-beta` (Lane β, only opens after text D6a is in `main`). Stacked on Wave 5's branch.

### Wave 7 — Sub-batch C vendor-gated polish (SHIPPED 2026-05-24, single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | ✅ Decision | — | — | [plan-voice-consult-selected-features.md §9](../../Plans/plan-voice-consult-selected-features.md) (Krisp vs RNNoise vs per-doctor opt-in). | **LOCKED 2026-05-24:** Krisp + per-side opt-in (defaulted ON for both doctor + patient). RNNoise selectable via `NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR=rnnoise`. Budget sign-off shifted to deployment-time (operator stages the WASM bundle when ready). |
| 1 | [C9](./task-voice-C9-noise-suppression.md) ✅ | M | Auto | This task file; `<VoiceConsultRoom>` audio-publish path; Twilio 2.27+ `noiseCancellationOptions` docs; source plan T3.19. | **Shipped 2026-05-24.** Used Twilio's built-in `noiseCancellationOptions` on `createLocalAudioTrack` (supersedes the `@twilio/krisp-audio-plugin` package the original spec called for — Twilio 2.27+ deprecated that path). New `frontend/lib/audio/noise-suppression.ts` + `useNoiseSuppressionPreference` hook; toggle surfaces in `<VoiceConsultPreCall>` + `<VoiceConsultRoom>` for both doctor + patient mounts; localStorage persistence per spec; WASM bundle gated behind `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH` for budget-controlled rollout. 26 unit tests green. |

**Branch suggestion:** `feature/voice-C-noise-suppression` — opens only after the decision.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| A1 | XS | Composer 2 Fast | New 40-LOC hook + chip render. Smallest item; well-precedented (video A.3 shipped the same pattern). |
| A2 | XS | Composer 2 Fast | Pure component reuse from video A.2's `<EndCallConfirmModal>`. Extract + mount. |
| A3 | S | Auto | WebAudio analyser-node pattern; bounded; per-message escalate to Opus only if the analyser-disconnect lifecycle surprises. |
| A4 | S | Auto | Hook + bars reuse from video A.8. |
| A5 | M | Auto | `setSinkId` + `mediaDevices.enumerate` + persistence. Two surfaces (precall + in-call). |
| A6 | S | Auto | New precall component; visual parity with video `<VideoConsultPreCall>`. |
| A7 | S | Auto | Plan 06 system-event addition is one-line TS (Migration 063 audit) + small companion-chat row renderer. |
| A8 | S | Auto | Caller-card composition; consumes A1 + A4 outputs that are now in `main`. |
| A9 | S | Auto | Classifier already exists (video B.5). Splash UI + copy customization. |
| B1 | M | Auto | Hook + banner reuse from video B.4. Voice-side mount. |
| B2 | M | Auto | Lobby extension on top of A6's precall surface. |
| B3 | M | Auto | New hook + banner + Plan 06 enum string addition. No migration. |
| B4 | S | Auto | Component + lib reuse from video B.9. |
| B5 | L | **Opus 4.7 Extra High** | Backend aggregator across ≥ 3 PHI sources (messages, recording metadata, disconnect classification). RLS predicates must align across joins. Hard-rules #1 + #2. |
| B6 | M | Auto | Deep-link wire + Plan 10 placeholder. Reduced scope (Plan 07 player already shipped). |
| C1 | XS | Composer 2 Fast | ~30 LOC ringtone lib + connect-callback wire. |
| C2 | L | **Opus 4.7 Extra High** | New migration + RLS policies + `safe_uuid_sub()` invariant + service-role INSERT pattern. Hard-rules #1 + #3. Mirrors video E.7 — pre-load that exact precedent. |
| C3 | M | Auto | Push wire-up reusing text D6a's already-shipped service. Cross-batch coordination — Lane gated on D6a. |
| C4 | S | Auto | Hook (video E.5) already exists. Mount + smoke + unit tests. |
| C5 | S | Auto | Hook (video E.6) already exists. Mount + smoke + unit tests. |
| C6 | XS | Composer 2 Fast | Smoke verification only. No code change beyond a smoke-test note (or trivial smoke test). |
| C7 | M | Auto | Extends A5's `useAudioOutputDevice` hook with BT-detection. |
| C8 | M | Auto | New proximity hook. Chrome Android only; silent-degrade elsewhere. |
| C9 | M | Auto | ✅ Shipped 2026-05-24. Used Twilio 2.27+ built-in `noiseCancellationOptions` (no extra npm dep). |
| C10 | M | Auto | F.4 foundation already shipped. Mount + voice notification copy + smoke. Reduced from L to M. |

**Opus caps:** ≤ 1 per wave (Wave 4: B5; Wave 6: C2 in Lane α; one Opus chat per lane). ≤ 2 per batch (B5 + C2 = exactly 2). Strict cap met.

**Composer 2 Fast budget:** A1, A2, C1, C6 = 4 tasks (~13% of batch by count, well within the 15–25% Tier-4 guidance).

---

## Acceptance gates per wave

### Wave 0 gate (HISTORICAL — already green 2026-04-30)

Documented for completeness only. See the four Sub-batch 0 task files for the original sign-off.

### Wave 1 gate (after A1 + A2 + A3 + A4 + A5 + A6 + A9)

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] **Lane α surfaces:** `<VoiceConsultRoom>` renders the call-duration chip in the header (within ~1s of `participant-connected`); end-call button opens `<EndCallConfirmModal>`; mic-level meter pulses when speaking; network-quality bars render and update.
- [ ] **Lane β surfaces:** `<VoiceConsultPreCall>` renders with a mic-level preview and an audio-output device picker; in-call output-picker is also mountable in the controls bar; disconnect splash classifies and renders for all five disconnect categories (graceful, network drop, kicked, error, timeout).
- [ ] `mode='readonly'` (Plan 07 history viewer) hides every new control / preview.
- [ ] Voice consult unaffected by video Sub-batch A's already-shipped surfaces; companion chat continues to deliver system messages.

### Wave 2 gate (after A7 + A8)

- [ ] All Wave 1 gates still green.
- [ ] Counterparty mute notification fires within ~1s of remote mute toggle; system message displays in companion chat.
- [ ] Caller-card header renders with avatar + name + duration timer (Wave 1's A1) + network bars (Wave 1's A4).
- [ ] **No new migration applied** — Plan 06 `mute_changed` ships as a one-line TS addition to the `SystemEvent` union (confirms Migration 063 invariant).

### Wave 3 gate (after B1 + B4 + B2 + B3)

- [ ] All Wave 2 gates still green.
- [ ] **Lane α surfaces:** Reconnection banner appears on Twilio `reconnecting` event and dismisses on `reconnected`; volume slider persists per-device (`voice-volume-percent` localStorage key) and routes through gainNode for the ×1.5 boost.
- [ ] **Lane β surfaces:** Pre-call lobby renders branding + mic check + connect button; hold call surfaces `<HoldCallBanner>` to both parties via `hold_changed` system event (one-line TS addition).
- [ ] All four new affordances respect `mode='readonly'`.

### Wave 4 gate (after B5 + B6)

- [ ] All Wave 3 gates still green.
- [ ] `GET /api/v1/consultation/:sessionId/post-call-summary` returns the full PHI-aggregated shape for voice (snapshot of A9 disconnect reason + Plan 07 recording metadata + Plan 06 message tally). Authenticates via both doctor JWT and patient HMAC.
- [ ] **RLS smoke** — probe doctor JWT for Doctor A returns 404 on Patient B's session (Patient B belongs to Doctor B). No cross-tenant data leak in the aggregator's joins.
- [ ] `<CallPostCallSummary modality='voice'>` mounts in `<VoiceConsultRoom>` post-call + dashboard appointment detail (history view).
- [ ] Recording playback link from B6 expands `<RecordingReplayPlayer>` inline for voice (audio mode). Plan 10 transcript placeholder card renders if Plan 10 still unshipped.

### Wave 5 gate (after C1 + C6 + C8 + C4 + C5 + C7)

- [ ] All Wave 4 gates still green.
- [ ] **Lane α:** Audible ringtone plays on patient `participant-connected` (~0.5s soft ding per Principle 8); hardware volume keys route to call audio on Android Chrome (smoke verification documented in C6 task file); proximity sensor blanks screen during ear-against-phone (Chrome Android only).
- [ ] **Lane β:** Multi-tab kick — opening voice consult in a second patient tab kicks the older tab (`<MultiTabKickBanner>` with [Take over] CTA renders correctly). Crash-recovery — refreshing the patient page mid-call rejoins via `useCallRejoinCache` within ~3s. BT/AirPods auto-relay — connecting AirPods mid-call routes audio to them within ~1s.
- [ ] Hook unit tests added to `frontend/hooks/__tests__/useTabPresenceClaim.test.ts` + `useCallRejoinCache.test.ts` (deferred by video E.5 + E.6 to voice C4 + C5 pickup — close the loop here).

### Wave 6 gate (after C2 + C10, optionally C3 if text D6a shipped)

- [ ] All Wave 5 gates still green.
- [ ] Migration `0XX_voice_call_quality.sql` applies cleanly on fresh DB AND on DB with rows; reverse migration verified.
- [ ] Two new RLS policies on `voice_call_quality` use `safe_uuid_sub()` invariant; run `backend/scripts/diagnose-text-consult-jwt.ts` to verify no regression.
- [ ] `POST /api/v1/consultation/:sessionId/voice-quality` ingests samples successfully (doctor JWT + patient HMAC both pass auth).
- [ ] Frontend reporter samples every 10s for first 60s then every 30s; PHI-clean payload only (network + audio metrics + Twilio room SID).
- [ ] Android foreground notification appears when `<VoiceConsultRoom>` is backgrounded (verified on Pixel + Samsung Galaxy real devices); body copy reads "Voice consult — tap to return".
- [ ] **If text D6a shipped:** browser push fires when remote joins; SW notification tag `session_id:voice` does not collide with text or video pushes; clicking notification focuses or opens the call page. **If text D6a NOT shipped:** Lane β explicitly marked DEFERRED in the wave's close note; Wave 6 still passes on Lane α alone.
- [ ] Ops query "median packet loss by clinic this month" runs in < 1s on populated DB.

### Wave 7 gate (after C9 — SHIPPED 2026-05-24)

- [x] Vendor decision captured in task PR (Krisp + per-side opt-in defaulted ON; RNNoise selectable via env vendor flag; preference persisted to `localStorage` per spec, not `doctor_settings` in v1).
- [x] Noise suppression toggle persists; UI surfaces in `<VoiceConsultPreCall>` + `<VoiceConsultRoom>` in-call controls (both doctor + patient mounts). Hidden when `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH` is unset (graceful degrade).
- [ ] **Optional Opus close-gate review** — one fresh Opus 4.7 Extra High chat with the full Wave 1–7 diff grading against this exec-order's gates. Skip if every deterministic gate passes cleanly.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 0 | 4 | — | — | — | (shipped) |
| Wave 1 | 7 | 5/7 | 2/7 | 0/7 | ~9h (parallel) / ~14h (sequential) |
| Wave 2 | 2 | 2/2 | 0/2 | 0/2 | ~6h |
| Wave 3 | 4 | 4/4 | 0/4 | 0/4 | ~19h (parallel) / ~22h (sequential) |
| Wave 4 | 2 | 1/2 | 0/2 | 1/2 | ~3 days |
| Wave 5 | 6 | 4/6 | 2/6 | 0/6 | ~3.5 days (parallel) / ~5 days (sequential) |
| Wave 6 | 3 | 2/3 | 0/3 | 1/3 | ~5 days (parallel) / ~6 days (sequential) |
| Wave 7 | 1 | 1/1 | 0/1 | 0/1 | ~3 days (after decision) |
| **Total (Waves 1–6)** | **24** | **18** | **4** | **2** | **~17 dev-days (parallel) / ~22 (sequential)** |
| **Total (incl. Wave 7)** | **25** | **19** | **4** | **2** | **~20 dev-days (parallel) / ~25 (sequential)** |

**Opus budget:** B5 (~80–120k input + ~40–60k output ≈ $20–30 from the API pool) + C2 (~60–100k input + ~30–50k output ≈ $15–25). **Total Opus spend: ~$35–55** for the batch (excluding optional close-gate review).

**Auto + Composer budget:** ~1.5M input + ~800k output across 22 Auto/Composer chats. **Total Auto+Composer spend: ~$5–8** drawn from the cheaper Auto+Composer pool.

**Total batch spend (Waves 1–6): ~$40–65** plus the optional close-gate Opus turn (~$10–15).

---

## References

- [plan-voice-consult-selected-features.md](../../Plans/plan-voice-consult-selected-features.md) — the *what / why* sibling.
- [README-voice.md](./README-voice.md) — task index + dep graph + cross-batch coordination map.
- [EXECUTION-ORDER-video.md](./EXECUTION-ORDER-video.md) — sibling video exec-order; documents the foundation work video E.5 / E.6 / F.4 / F.5 shipped that Sub-batch C consumes.
- [`Daily-plans/May 2026/18-05-2026/patients-redesign/Tasks/EXECUTION-ORDER-patients-redesign.md`](../../../../May%202026/18-05-2026/patients-redesign/Tasks/EXECUTION-ORDER-patients-redesign.md) — recent exec-order using the same conventions; visual / structural template.
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; the hard-rules list that drives B5 + C2 → Opus.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft this doc.

---

**Owner:** TBD  
**Created:** 2026-05-19  
**Status:** Drafted; Sub-batch 0 already Shipped; recommended next chat = Wave 1 Lane α (start with A1 in a fresh Composer 2 Fast chat).
