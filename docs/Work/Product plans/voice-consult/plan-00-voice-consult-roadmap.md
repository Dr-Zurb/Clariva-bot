# Plan 00 — Voice consult UX roadmap (master index for tiers T1–T6)

## Make the existing audio-only Twilio room feel like a proper telemed product, in tiered slices

> **Foundation reference:** [plan-05-voice-consultation-twilio.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md) — Decision 2 LOCKED (voice = Twilio Video audio-only, no PSTN), Principle 8 LOCKED (booking/DM copy says "audio only, no phone call"). Plan 05 shipped the bones. **This roadmap is everything that comes _after_ Plan 05** — i.e. the polish, clinical workflow, post-call, reliability and mobile-native layers that turn the bones into a product.
>
> **Companion text channel:** [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) is already wired (Task 24c LOCKED) — the voice room main canvas hosts `<TextConsultRoom layout='canvas'>`. None of the tiers below replace that companion chat; they layer additional capabilities on top.

---

## Goal

Take `frontend/components/consultation/VoiceConsultRoom.tsx` from "MVP that works" to "feels like Google Meet / WhatsApp call quality of polish, but clinical". Each tier is an independently shippable slice with its own plan file.

---

## What already exists (so the tier plans don't re-propose it)

Pulled from `frontend/components/consultation/VoiceConsultRoom.tsx` (~640 lines) and `frontend/app/c/voice/[sessionId]/page.tsx`:

| Capability | Where | Notes |
|------------|-------|-------|
| Audio-only Twilio room (`createLocalAudioTrack`) | `VoiceConsultRoom.tsx` | No camera permission prompt; defense-in-depth vs backend audio-only Recording Rules. |
| Mute / Unmute, End-call | `VoiceConsultRoom.tsx` | Imperative on local audio track + `room.disconnect()`. |
| Connection state machine | `VoiceConsultRoom.tsx` | `connecting` → `connected` → `reconnecting` → `disconnected`. Drives header pill. |
| Remote-speaking pulse dot | `VoiceConsultRoom.tsx` | Subscribes to `RemoteAudioTrack` `enabled`/`disabled`. |
| "Patient hasn't joined" doctor-side surface | `VoiceConsultRoom.tsx` | First 3 min after doctor join; Resend-link buttons (SMS / IG DM). |
| Recording controls + paused banner | `<RecordingControls>` + `<RecordingPausedIndicator>` | Plan 02 + Plan 05 wiring. |
| Companion text chat in main canvas | `<TextConsultRoom layout='canvas'>` mounted via the `companion` prop | Plan 06 / Task 24c LOCKED. |
| Wake Lock | `VoiceConsultRoom.tsx` (`navigator.wakeLock`) | Best-effort; noop on unsupported browsers. |
| Twilio's built-in 30s reconnect window | Twilio SDK | Surfaced via `connecting` state. |
| Voice-variant DM copy + booking copy | `backend/src/utils/dm-copy.ts` | Principle 8 disambiguation. |
| Audio Composition + transcription pipeline | `backend/src/services/voice-transcription-*.ts` | Whisper-EN / Deepgram-Indic routing. |

**Anything outside this table is fair game for a tier below.** The tier plans assume this baseline and will not re-propose any of it.

---

## Tier overview

> **2026-04-28 batch:** 26 of 37 items SELECTED across all 6 tiers — see [plan-voice-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md) for the consolidated batch backlog and sub-batch sequencing.

| Tier | Theme | Items total | Selected 2026-04-28 | Effort (rough) | Status snapshot |
|------|-------|-------------|---------------------|----------------|-----------------|
| [T1 — Quick wins](./plan-t1-voice-quick-wins.md) | Same-day polish that lifts the call from "basic" to "feels like a proper telemed product". | 8 | **8 / 8** | ~1.5 days | **SELECTED in full** — sub-batch A of 2026-04-28 batch. |
| [T2 — Real polish](./plan-t2-voice-real-polish.md) | Next-sprint clinical UX — pre-call lobby, caller card, hold, reconnection UX, volume slider, etc. | 9 | **6 / 9** (15, 9, 10, 16 + 11, 13 promoted from T2-Later) | ~3.5 days | **Partial SELECT** — items 15 / 9 / 10 / 16 / 11 / 13 selected; item 12 (auto-extend) NOT selected; items 14 / 17 remain `T2-Later`. |
| [T3 — Clinical workflow](./plan-t3-voice-clinical-workflow.md) | Live captions, noise suppression, in-call quick actions (Rx / labs / follow-up), 3-way calls, vitals, doc share. | 7 | **1 / 7** (T3.19 only) | ~3 days for T3.19 alone | **Partial SELECT** — only T3.19 (background-noise suppression) selected; rest remain `Deferred`. |
| [T4 — Post-call](./plan-t4-voice-post-call.md) | Post-call summary, patient rating + review, one-click rebook, recording playback. | 4 | **2 / 4** (T4.25 + T4.28) | ~3 days | **Partial SELECT** — summary screen + recording playback selected; T4.26 rating + T4.27 rebook NOT selected. |
| [T5 — Reliability / safety](./plan-t5-voice-reliability-safety.md) | Multi-tab kick, crash-recovery rejoin, audible ringtone, push notifications, QoS metrics. | 5 | **5 / 5** | ~10 days | **SELECTED in full** — sub-batch C of 2026-04-28 batch. Original ≥10-doctors trigger overridden. |
| [T6 — Mobile native niceties](./plan-t6-voice-mobile-native.md) | Bluetooth/AirPods routing, hardware volume keys, Android persistent notification, proximity sensor. | 4 | **4 / 4** | ~10 days | **SELECTED in full** (PWA paths only — no native shell in this batch). |

---

## Sequencing recommendation

```
Now              Next sprint             After Plans 07 + 10           Late v1 / v2
 │                  │                        │                            │
 ▼                  ▼                        ▼                            ▼
T1 (full)  →   T2 picks: 15→9→10→16→12  →  T3 + T4              →   T5 + T6
                        rest of T2 → T2-Later
```

Rationale (recap of decisions made during 2026-04-26 review):

- **T1 first** — every item is local to `VoiceConsultRoom.tsx`, no backend changes, no schema, no RLS. All eight items together still ship in under two days. The marginal product-quality lift is the largest in the roadmap.
- **T2 selected picks** — item 15 (reconnection UX) is the audio cousin of the chat-flicker fix that already shipped, so it carries forward the same UX doctrine. Items 9 / 10 (lobby + caller card) sell the professional surface to first-time patients. Items 16 / 12 (disconnect reason + auto-extend) round off the call lifecycle.
- **T3 deferred** — items 18 (live captions) and 20 (in-call quick actions) are large pieces of work that benefit massively from Plan 10 (AI clinical assist) being in place first. Item 22 (camera-capture document share) overlaps with Plan 06's attachments — re-evaluate scope when Plan 06 attachments lands.
- **T4 deferred** — depends on Plan 07 (post-consult replay) for the recording-playback piece; the rest is small but better batched once the recording surface exists.
- **T5 + T6 deferred** — these are "scale-out" and "wrap-as-native" concerns. Both are real but premature against current load.

**This file is the single source of truth for tier status.** Each tier plan links back here.

---

## Cross-cutting principles (apply to every tier)

1. **No new vendor.** Each tier MUST work on the existing Twilio Video stack. Krisp Noise Cancellation (T3 item 19) is the only exception and is gated on a dedicated cost decision.
2. **Audio-only invariant.** Camera tracks are NEVER published. Any tier that adds a "share screen / camera" button must explicitly upgrade the modality via Plan 09 (mid-consult modality switching) rather than mutating the voice room.
3. **Companion chat is the secondary surface.** All system messages (mute notifications, hold banners, captions, quick-action acknowledgments, etc.) flow through the existing `<TextConsultRoom layout='canvas'>` instance via Plan 06's system-message kind enum. Do not invent a new in-room overlay system.
4. **Recording boundary preserved.** Anything user-facing that toggles per-call state (mute, hold, volume) MUST NOT bleed into the recording artifact. Recording is governed by Plan 02 consent rules; tiers add UX, never new recording paths.
5. **Mobile parity from day one.** Every tier item must work on iOS Safari + Android Chrome at parity with desktop, or explicitly degrade with a documented fallback. No tier item ships "desktop-only".
6. **Locked Principle 8 stays locked.** No tier item may add phone-handset iconography, dial pads, phone-number-style inputs, or ring-tones-that-sound-like-PSTN. This is a clinical surface, not a phone replacement.

---

## How to consume this folder

- The user picks a tier (or a subset of items inside a tier).
- The corresponding tier plan is the source of truth for that slice — it lists every item with its own task ID, effort, and acceptance criteria.
- For T1 / T2, items are already small enough that they don't need their own task files; the plan IS the task list. T3+ items will spawn their own task files when committed.
- When a tier is committed, this index is updated to flip its status from `Deferred` → `Active` → `Shipped`.

---

## Files expected to touch (across all tiers, for forward planning)

**Frontend (will own ~90% of changes across tiers):**

- `frontend/components/consultation/VoiceConsultRoom.tsx` — every tier touches this.
- `frontend/components/consultation/VoiceConsultPreCall.tsx` (**new**, T1 + T2) — pre-call mic check + lobby.
- `frontend/components/consultation/VoicePostCallSummary.tsx` (**new**, T4).
- `frontend/hooks/useNetworkQuality.ts` (**new**, T1).
- `frontend/hooks/useAudioOutputDevice.ts` (**new**, T1).
- `frontend/lib/audio/mic-meter.ts` (**new**, T1) — Web Audio meter helper.

**Backend (small, only where tiers genuinely require it):**

- `backend/src/services/voice-call-quality-service.ts` (**new**, T5 item 33) — QoS telemetry persistence.
- `backend/src/utils/dm-copy.ts` (**extend**, T2 item 12) — auto-extend prompt copy variant.
- Companion chat system-message kinds (**extend Plan 06's enum**, T1 item 8 + T2 item 11 + T3 item 18) — `mute_changed`, `hold_changed`, `caption_chunk`.

**Schema (only T5):**

- One small additive table `voice_call_quality` (T5 item 33). All other tiers are schema-free.

---

## Status legend (used by every tier plan)

- `Drafted` — plan exists; no implementation started.
- `Committed` — owner assigned; implementation in progress.
- `Shipped` — merged + verified in production.
- `Deferred` — explicitly parked with rationale; revisit trigger documented.
- `Killed` — decided against; rationale documented.

---

**Owner:** TBD (each tier picks its own owner at commit time).  
**Created:** 2026-04-27.  
**Status:** Drafted. Tier plans T1–T6 are also drafted and linked above. **2026-04-28: 26 of 37 items SELECTED** across all 6 tiers — see [plan-voice-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). Awaiting commit-start on sub-batch A.
