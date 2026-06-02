# Plan 00 — Video consult UX roadmap (master index for tiers T1–T6)

## Take the existing audio-and-video Twilio room from "MVP that works" to a clinical-grade telemed product

> **Foundation reference:** `frontend/components/consultation/VideoRoom.tsx` (~630 lines) is the current baseline — Twilio Programmable Video, audio + video, fixed 640×480, two-tile layout, companion chat (Plan 06 Decision 9 LOCKED), recording (Plan 02 + 08).
>
> **This roadmap is everything that comes _after_ that baseline** — i.e. the polish, clinical workflow, post-call, reliability and mobile-native layers that turn a working video call into a product doctors and patients want to use every day.
>
> **Why this matters now:** video is expected to be the **most-used modality** going forward (richer information per minute; visual examination is core to many specialties). Today's `<VideoRoom>` is materially behind WhatsApp / Google Meet / Doximity in basic call ergonomics; tier T1 alone closes ~60% of that gap.

---

## Goal

Take `frontend/components/consultation/VideoRoom.tsx` from "works for one happy-path consult" to "feels like the production telemed app of a top-tier provider, with clinical features Meet doesn't have." Each tier is an independently shippable slice with its own plan file.

---

## What already exists (so the tier plans don't re-propose it)

Pulled from `frontend/components/consultation/VideoRoom.tsx` and `frontend/app/consult/join/page.tsx`:

| Capability | Where | Notes |
|------------|-------|-------|
| Audio + video Twilio room (`createLocalTracks({ audio, video })`) | `VideoRoom.tsx` | Fixed 640×480 video; no resolution adapt yet. |
| Connection state machine | `VideoRoom.tsx` | `connecting` → `connected` → `disconnected` → `error`. Trivial three-state UI. |
| Self-view + remote-view tiles | `VideoRoom.tsx` | Two equal `aspect-video` tiles, side-by-side `md:grid-cols-2`. Mobile stacks. |
| Companion text chat (always-on) | `<TextConsultRoom layout='panel'>` mounted via `companion` prop | Plan 06 Task 38 LOCKED — desktop two-pane / mobile tab-switcher. |
| Recording controls + paused indicator | `<RecordingControls>` + `<RecordingPausedIndicator>` | Plan 02 + 05. Same surface as voice. |
| Patient consent modal for video recording | `<VideoConsentModal>` | Plan 08 Task 41 LOCKED — patient grants/denies the doctor's escalation request. |
| Doctor-side video escalation button | `<VideoEscalationButton>` | Plan 08 Task 40 LOCKED — doctor requests video recording mid-consult. |
| Active video-recording indicator | `<VideoRecordingIndicator>` | Plan 08 Task 42 LOCKED — pulsing red dot when video is being recorded. |
| Replay OTP + warning modals | `<VideoReplayOtpModal>`, `<VideoReplayWarningModal>` | Plan 07 / replay flow. |
| Companion-chat unread-count badge on mobile | `<VideoRoom>` `unreadCount` state | Plan 06 Task 38. |
| Twilio's built-in 30s reconnect window | Twilio SDK | Surfaced via `connecting` state. |
| Audio Composition + transcription pipeline (audio track only) | `backend/src/services/voice-transcription-*.ts` | Same audio pipeline as voice; video tracks not transcribed. |
| Video-variant DM copy + booking copy | `backend/src/utils/dm-copy.ts` | Disambiguates from voice-only. |
| Patient-side companion exchange (Sub-batch 0 hotfix shipping 2026-04-28) | `frontend/app/consult/join/page.tsx` | Once shipped, video patients see chat panel just like doctors. |

**Anything outside this table is fair game for a tier below.** The tier plans assume this baseline and will not re-propose any of it.

---

## What's broken today (P0 / pre-tier work)

Listed here so we don't lose track. NOT part of any tier; these are bugs to fix before T1 ships.

| Issue | Where | Owner |
|-------|-------|-------|
| Patient `/consult/join` page never calls the companion exchange — patient gets no chat panel on video sessions. | `frontend/app/consult/join/page.tsx` | Voice batch Sub-batch 0 (`task-voice-0B`) — same fix unblocks video patients. |
| `<VideoRoom>` has no mute button (mic OR camera). User can only hang up. | `VideoRoom.tsx` lines 488-494 | T1.1 + T1.2. |
| Status `'disconnected'` shows a static "Call ended" placeholder; no reason, no rejoin. | `VideoRoom.tsx` lines 392-399 | T2.13. |

---

## Tier overview

> **2026-04-29 selection:** **All six tiers T1–T6 — full roadmap — SELECTED.** Every item in each tier plan is marked **`[SELECTED 2026-04-29]`** for traceability. Next step: consolidate into a Daily-plans batch file (same pattern as voice/text selected-features) when implementation sequencing is locked.

| Tier | Theme | Items | Effort (rough) | Status |
|------|-------|-------|----------------|--------|
| [T1 — Quick wins](./plan-t1-video-quick-wins.md) | Same-day polish that lifts the call from "MVP" to "feels like a proper telemed product" — basic mute/cam/timer/end-confirm/self-view/network-bars. | **8 / 8** | ~2 days | **`[SELECTED 2026-04-29]`** — full tier |
| [T2 — Real polish](./plan-t2-video-real-polish.md) | Next-sprint clinical UX — pre-call lobby with selfie preview, layout swap (gallery/speaker view), PiP, hold, reconnect, disconnect splash, video-quality picker. | **10 / 10** | ~5 days | **`[SELECTED 2026-04-29]`** — full tier |
| [T3 — Clinical workflow](./plan-t3-video-clinical-workflow.md) | Snapshot capture, freeze-frame annotations, screen share, virtual background, captions (Plan 10 dep), three-way call, in-call quick actions. | **8 / 8** | ~10 days | **`[SELECTED 2026-04-29]`** — full tier *(Plan 10 / schema deps unchanged)* |
| [T4 — Post-call](./plan-t4-video-post-call.md) | Post-call summary with snapshots, recording + transcript playback, snapshot review-and-attach to clinical record, patient rating. | **4 / 4** | ~3 days | **`[SELECTED 2026-04-29]`** — full tier |
| [T5 — Reliability / safety](./plan-t5-video-reliability-safety.md) | Adaptive bitrate / simulcast, auto-degrade-to-audio on bad bandwidth, multi-tab kick, crash-recovery rejoin, browser push, QoS metrics, cellular-data warning. | **7 / 7** | ~12 days | **`[SELECTED 2026-04-29]`** — full tier |
| [T6 — Mobile native niceties](./plan-t6-video-mobile-native.md) | Front/back camera swap, orientation lock, persistent foreground notification, battery-saver auto-downgrade, hardware-key + `MediaSession`. | **5 / 5** | ~10 days | **`[SELECTED 2026-04-29]`** — full tier *(PWA-only unless native shell decision lands)* |

**Total roadmap:** ~42 items, ~42 dev-days at solo pace (~6 calendar weeks).

---

## Sequencing recommendation

```
Now              Next sprint             After Plans 07 + 10           Late v1 / v2
 │                  │                        │                            │
 ▼                  ▼                        ▼                            ▼
Pre-tier P0  →  T1 (full)  →  T2 picks  →  T3 + T4 picks            →  T5 + T6
(mute, cam,                  (lobby,        (snapshot, screen
disconnect)                   PiP,          share, virtual bg,
                              layout)       captions if Plan 10)
```

Rationale (decisions to be made at PR / commit-start time):

- **Pre-tier P0 first** — mute mic + mute camera + disconnect-reason aren't optional polish; the call surface today lacks fundamental controls every video product has. Roll these into T1 if T1 commits early; otherwise ship as a 1-day stand-alone hotfix.
- **T1 full** — every item is local to `VideoRoom.tsx` (and small adjacent components). Two days of work, biggest perceived-quality lift in the roadmap.
- **T2 selected picks** — pre-call lobby (T2.9) and layout swap (T2.14) sell the professional surface to first-time patients. PiP (T2.16) is a power-user love-letter. Hold + reconnect + disconnect splash are the lifecycle-quality items inherited from voice doctrine.
- **T3 deferred mostly** — items 25 (live captions) and 24 (in-call quick actions) want Plan 10 (AI clinical assist) and the specialty-templates work first. Items 21 (snapshot) + 22 (annotations) + 23 (screen share) are Plan-10-independent and high-clinical-value; consider promoting to a clinical batch.
- **T4** — depends on Plan 07 (recording replay) for replay; the rest is small but better batched once Plan 07 is live.
- **T5 + T6** — these are "scale" and "wrap-as-native" concerns. Real but premature against current load; T5.31 (adaptive bitrate) + T5.32 (audio fallback) become urgent the moment we onboard a clinic on flaky 4G.

---

## Cross-cutting principles (apply to every tier)

1. **No new vendor.** Each tier MUST work on the existing Twilio Video stack. Krisp Noise Cancellation (T3.19; same as voice) is the only exception and shares the voice-batch budget decision.
2. **Camera publishability is intentional.** Unlike voice (where a camera track is NEVER published), video sessions DO publish video. But camera-on must always be a deliberate user choice surfaced in the UI (T1.2 mute-camera; T2.9 selfie preview). No silent camera capture.
3. **Companion chat is the secondary surface.** All system messages (mute, hold, recording started, captions, snapshot taken, etc.) flow through the existing `<TextConsultRoom layout='panel'>` instance via Plan 06's system-message kind enum. Do not invent a new in-room overlay system.
4. **Recording boundary preserved.** Anything user-facing that toggles per-call state (mute, hold, volume, snapshot) MUST NOT bleed into the recording artifact unintentionally. Recording is governed by Plan 02 + 08 consent rules; tiers add UX, never new recording paths. T3.21 snapshot is the one exception — it explicitly produces a clinical-record artifact and is gated by Plan 02 / 08 consent.
5. **Mobile parity from day one.** Every tier item must work on iOS Safari + Android Chrome at parity with desktop, or explicitly degrade with a documented fallback. No tier item ships "desktop-only" except where the OS doesn't support it (e.g. PiP on iOS Safari pre-iOS 14; document).
6. **Bandwidth is a first-class concern.** Unlike voice (~16 KB/s), video is 0.5–2 MB/s. Every UI element must surface bandwidth/QoS prominently (T1.8 enriched network bars), and every feature must degrade gracefully when bandwidth collapses (T5.31 adaptive bitrate; T5.32 auto audio-only fallback).
7. **PHI in frame.** Faces, body, screen contents — everything visible is PHI. Snapshots (T3.21) and screen share (T3.23) need explicit guardrails: no autosave to local disk; signed URLs only; on-screen notice when a snapshot fires.
8. **Locked Principle 8 stays locked.** No tier item may add phone-handset iconography, dial pads, phone-number-style inputs, or ring-tones-that-sound-like-PSTN. This is a clinical surface, not a phone replacement.

---

## How to consume this folder

- The user picks a tier (or a subset of items inside a tier).
- The corresponding tier plan is the source of truth for that slice — it lists every item with its own task ID, effort, and acceptance criteria.
- For T1 / T2, items are already small enough that they don't need their own task files; the plan IS the task list. T3+ items will spawn their own task files when committed (same pattern as voice and text batches).
- When a tier is committed, this index is updated to flip its status from `Drafted` → `Committed` → `Shipped`.

---

## Files expected to touch (across all tiers, for forward planning)

**Frontend (will own ~85% of changes across tiers):**

- `frontend/components/consultation/VideoRoom.tsx` — every tier touches this.
- `frontend/components/consultation/VideoConsultPreCall.tsx` (**new**, T1 + T2) — pre-call camera + mic check + lobby. Symmetric with `VoiceConsultPreCall`.
- `frontend/components/consultation/VideoLayoutSwitcher.tsx` (**new**, T2.14) — gallery / speaker / sidebar.
- `frontend/components/consultation/VideoSelfTile.tsx` (**new**, T1.5 + T1.6) — draggable / corner-positionable self-view.
- `frontend/components/consultation/VideoControlsBar.tsx` (**new**, T1) — consolidated mute/cam/end controls.
- `frontend/components/consultation/SnapshotPreview.tsx` (**new**, T3.21).
- `frontend/components/consultation/AnnotationCanvas.tsx` (**new**, T3.22).
- `frontend/components/consultation/ScreenShareTile.tsx` (**new**, T3.23).
- `frontend/components/consultation/VirtualBackgroundPicker.tsx` (**new**, T3.20).
- `frontend/components/consultation/VideoPostCallSummary.tsx` (**new**, T4.27).
- `frontend/hooks/useNetworkQuality.ts` (**shared with voice**, T1.8) — extends with video-specific stats (resolution, fps, frames dropped).
- `frontend/hooks/useCameraDevices.ts` (**new**, T6.38) — front/back enumeration + switch.
- `frontend/hooks/useScreenOrientation.ts` (**new**, T6.39).
- `frontend/lib/video/adaptive-bitrate.ts` (**new**, T5.31).
- `frontend/lib/video/snapshot-capture.ts` (**new**, T3.21) — `<canvas>` frame extraction + signed-URL upload.
- `frontend/lib/video/virtual-background.ts` (**new**, T3.20) — MediaPipe Selfie Segmentation OR Twilio's built-in plugin.

**Backend (small, only where tiers genuinely require it):**

- `backend/src/services/video-call-quality-service.ts` (**new**, T5.36) — video QoS telemetry persistence (extends voice's `voice-call-quality-service.ts`).
- `backend/src/services/snapshot-service.ts` (**new**, T3.21) — accept snapshots, attach to consultation_messages or a new clinical_attachments table.
- `backend/src/services/screen-share-service.ts` (**maybe new**, T3.23) — if doctor-side screen-share needs server tracking; otherwise frontend-only.
- Companion chat system-message kinds (**extend Plan 06's enum**, multiple tiers) — `mute_changed`, `hold_changed`, `caption_chunk` (shared with voice), `screen_share_started` / `screen_share_stopped`, `snapshot_taken`.

**Schema (only T5):**

- One small additive table `video_call_quality` (T5.36) — extends voice's pattern with video-specific columns: `resolution_width`, `resolution_height`, `fps_avg`, `frames_dropped_pct`, `bitrate_kbps_send`, `bitrate_kbps_receive`. Same RLS doctrine (Plan F04 `safe_uuid_sub()`).
- Maybe one snapshot table `clinical_snapshots` (T3.21) if snapshots aren't reused into `consultation_messages` attachments.

---

## Status legend (used by every tier plan)

- `Drafted` — plan exists; no implementation started.
- `Committed` — owner assigned; implementation in progress.
- `Shipped` — merged + verified in production.
- `Deferred` — explicitly parked with rationale; revisit trigger documented.
- `Killed` — decided against; rationale documented.

---

## Cross-modality coordination

Several video tier items are **siblings of voice items** — same hook, same backend service, same migration. Coordinate so we don't ship the same code twice:

| Video item | Voice sibling | Coordination |
|------------|---------------|--------------|
| T1.1 mute mic | Voice T1 (already shipped in voice) | Reuse the same hook / same icon. |
| T1.8 network bars | Voice T1.3 | `useNetworkQuality` is shared; video extends with bandwidth stats. |
| T2.10 caller-card header | Voice T2.10 | Different layout (overlay on remote tile, not separate header) but same data shape. |
| T2.11 hold call | Voice T2.11 | Plan 06 enum `hold_changed` already added by voice batch B3. |
| T2.12 reconnection UX | Voice T2.15 | Same `useTwilioReconnectState` hook. |
| T2.13 disconnect-reason splash | Voice T2.16 | Same `classifyDisconnect` classifier; different mount surface. |
| T3.19 noise suppression | Voice T3.19 | Same Krisp plugin; same vendor decision. |
| T4.27 post-call summary | Voice T4.25 | Same `<PostCallSummary>` component with `modality='video'` variant. |
| T4.28 recording playback | Voice T4.28 | Same player; supports both audio-only and audio+video URLs. |
| T5.33 multi-tab kick | Voice T5.29 | Same `useTabPresenceClaim` hook. |
| T5.34 crash-recovery | Voice T5.30 | Same `useVoiceRejoinCache` (rename to `useCallRejoinCache`); video adds camera-permission re-acquire on rejoin. |
| T5.35 browser push | Voice T5.32 + text D6a | Shared `push-notification-service.ts` and `web_push_subscriptions` table. |
| T5.36 QoS table | Voice T5.33 | Sibling table `video_call_quality`; same ingest pattern. |
| T6.40 persistent foreground | Voice T6.36 | Same MediaSession + SW notification; video extends with video-track keep-alive. |
| T6.42 hardware keys / MediaSession | Voice T6.35 + C10 | Same wiring. |

When a voice item has shipped, the video sibling is mostly a re-mount or a small extension. When neither has shipped, ship the shared infrastructure with whichever batch goes first.

---

**Owner:** TBD (each tier picks its own owner at commit time).
**Created:** 2026-04-29.
**Last updated:** 2026-04-29 — **full roadmap SELECTED** (all tiers + all ~42 items).
**Status:** Drafted + **`[SELECTED 2026-04-29]`** for every tier and item (see tier plans). **Awaiting commit-start** — recommend a consolidated Daily-plans batch file next for sequencing (e.g. `plan-video-consult-selected-features.md`). P0 pre-tier work (mute, cam, disconnect-reason) should ship before or alongside T1.
