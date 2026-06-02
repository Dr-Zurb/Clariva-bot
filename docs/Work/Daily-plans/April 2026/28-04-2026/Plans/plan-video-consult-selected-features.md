# Video consult — Selected features batch (2026-04-28)

## The 42 video-consult items committed for implementation, pulled from across all six tier plans (T1–T6, full roadmap)

> **Source plans (single source of truth for each item):**
> - [Video T1 — Quick wins](../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
> - [Video T2 — Real polish](../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
> - [Video T3 — Clinical workflow](../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
> - [Video T4 — Post-call](../../../Product%20plans/video-consult/plan-t4-video-post-call.md)
> - [Video T5 — Reliability / safety](../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md)
> - [Video T6 — Mobile native niceties](../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md)
> - [Roadmap index](../../../Product%20plans/video-consult/plan-00-video-consult-roadmap.md)
>
> Each item below is implemented per the contract spelled out in its source plan. This file is the **batch backlog and sequencing doc** — it does not redefine items; it commits them.

---

## What this is

A user-curated cross-tier slice of the video-consult roadmap, selected on 2026-04-28 (marked `[SELECTED 2026-04-29]` across the source plans). **Spans the full roadmap — every tier T1 through T6, every item.** This is the largest single-modality commitment to date and is intentionally sliced into six sub-batches (A–F) that match the source tiers 1:1, so each can be validated before the next ships.

This is a **commitment**, not a wish-list. Each item below has its source plan, its effort estimate, and its dependencies. Sequencing in this doc respects those dependencies.

> **2026-04-28 cross-batch context.** The voice-consult batch's [Sub-batch 0](./plan-voice-consult-selected-features.md#sub-batch-0--companion-chat-hotfix-p0-1-day) is a **HARD GATE** for this batch too — the same `exchangeTextConsultTokenHandler` modality guard and the same patient-side `/consult/join` page wiring break video's companion chat the exact same way they break voice's. Sub-batch 0 P0.B is literally the patient-side video page wiring. **This batch's Sub-batch A cannot ship green until voice Sub-batch 0 ships.** No work duplicated here; flagged as a precondition.

---

## Status

`Drafted, awaiting commit start` — 2026-04-28.

Once implementation starts, this file is updated in-place: items move from `pending` → `in-progress` → `shipped` (with dated check-marks). Each tier source plan keeps its own `[SELECTED 2026-04-29]` markers so the cross-reference is always traceable in either direction.

---

## What's NOT in this batch (explicitly deferred)

Nothing from the video roadmap is deferred — **all 42 items across T1–T6 are in this batch**. What IS deferred is everything that falls outside the roadmap:

| Concern | Why excluded |
|---------|--------------|
| Native shell (Capacitor / React Native wrap) | Strategic decision; out of scope. T6 ships the PWA-only path with documented iOS degradations. |
| End-to-end encryption beyond Twilio's default | Out of scope; no current threat model demands it. |
| Cross-device call handoff (start phone → finish laptop) | Out of scope; rare clinical need. |
| Plan 10 features that aren't gated through T3.25 | Plan 10 (AI clinical assist) is parked; T3.25 captions ships once Plan 10 lands and is the sole consumer of its transcript pipeline in this batch. |
| Recording editing / clipping / sharing | Plan 07 owns. |

If priorities shift, we don't re-define the source plans — we open a new batch.

---

## The 42 selected items

Grouped by tier (= sub-batch); sequencing is below in [§ Implementation order](#implementation-order).

### Tier 1 — Quick wins (8 of 8 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T1.1 | Mute / unmute mic (companion-chat `mute_changed`) | XS (~30 min) | [T1 §T1.1](../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md) |
| T1.2 | Camera off / on (companion-chat `camera_changed` — new enum) | S (~2h) | T1 §T1.2 |
| T1.3 | Call duration timer in header (`mm:ss`) | XS (~30 min) | T1 §T1.3 |
| T1.4 | End-call confirmation (reuse voice `<EndCallConfirmModal>`) | XS (~30 min) | T1 §T1.4 |
| T1.5 | Self-view position toggle (PiP-corner; persisted) | S (~3h) | T1 §T1.5 |
| T1.6 | Self-view mirror toggle (default ON; persisted) | XS (~30 min) | T1 §T1.6 |
| T1.7 | Pre-call camera + mic check screen | M (~5h) | T1 §T1.7 |
| T1.8 | Network-quality 4-bar indicator + video-stats tooltip | S (~3h) | T1 §T1.8 |

**Tier-1 subtotal:** ~2 days. **One Plan 06 enum addition** (`camera_changed`); otherwise frontend-only, no schema. Voice batch's `mute_changed` enum is reused for T1.1.

### Tier 2 — Real polish (10 of 10 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T2.9 | Pre-call lobby (clinic branding + countdown; extends T1.7) | M (~5h) | [T2 §T2.9](../../../Product%20plans/video-consult/plan-t2-video-real-polish.md) |
| T2.10 | Caller-card overlay header (translucent over remote tile) | S (~4h) | T2 §T2.10 |
| T2.11 | Hold call (mics + cameras paused; reuses voice `hold_changed`) | M (~5h) | T2 §T2.11 |
| T2.12 | Reconnection UX (countdown + Try-now / Rejoin) | M (~6h) | T2 §T2.12 |
| T2.13 | Disconnect-reason splash (reuse voice `classifyDisconnect`) | S (~3h) | T2 §T2.13 |
| T2.14 | Layout swap (gallery / speaker / sidebar; persisted) | M (~6h) | T2 §T2.14 |
| T2.15 | Picture-in-picture (browser PiP API) | M (~5h) | T2 §T2.15 |
| T2.16 | Video-quality picker (Auto / 1080p / 720p / 480p / Audio-only) | S (~4h) | T2 §T2.16 |
| T2.17 | Volume slider for remote audio (reuse voice `<VolumeSlider>`) | S (~4h) | T2 §T2.17 |
| T2.18 | Recording-status pill in caller card | XS (~1h) | T2 §T2.18 |

**Tier-2 subtotal:** ~5 days. **No new schema; no new backend.** Reuses voice batch's lifecycle hooks + components heavily.

### Tier 3 — Clinical workflow (8 of 8 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T3.19 | Background-noise suppression (Krisp; sibling of voice T3.19) | M (~3 days) | [T3 §T3.19](../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md) |
| T3.20 | Virtual background / blur (`@twilio/video-processors`) | M (~3 days) | T3 §T3.20 |
| T3.21 | Snapshot capture (`<canvas>` extraction → signed-URL upload → clinical record) | M (~3 days) | T3 §T3.21 |
| T3.22 | Freeze-frame + annotations (point / circle / text overlay) | M (~3 days) | T3 §T3.22 |
| T3.23 | Screen share (bidirectional; new layout tile) | M (~3 days) | T3 §T3.23 |
| T3.24 | In-call quick actions (Rx / labs / follow-up / consent panels) | L (~5 days) | T3 §T3.24 |
| T3.25 | Live captions (Plan 10 hard dep) | L (~5 days) | T3 §T3.25 |
| T3.26 | Three-way call (interpreter / family member; multi-participant RLS) | L (~5 days) | T3 §T3.26 |

**Tier-3 subtotal:** ~10 days. **One vendor decision (Krisp budget) and one Plan 10 hard dep (T3.25).** T3.21 introduces the snapshot artifact pipeline — clinical-record consequences; PHI-gated end to end (Plan 02 / 08 consent applies).

### Tier 4 — Post-call (4 of 4 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T4.27 | Post-call summary screen (reuse voice T4.25 component as `<CallPostCallSummary modality='video'>`) | M (~1.5 days) | [T4 §T4.27](../../../Product%20plans/video-consult/plan-t4-video-post-call.md) |
| T4.28 | Recording + transcript playback (HTML5 `<video>` + transcript sidebar when Plan 10 ships) | M (~1 day) | T4 §T4.28 |
| T4.29 | Snapshot review-and-attach (doctor only; consumes T3.21) | M (~1 day) | T4 §T4.29 |
| T4.30 | Patient rating + free-text feedback (existing service-reviews surface) | S (~4h) | T4 §T4.30 |

**Tier-4 subtotal:** ~3 days. **Hard dep on T3.21 for T4.29.** Plan 07 (recording infra) and Plan 10 (transcript) are SOFT — T4.28 ships with placeholder if either isn't live yet.

### Tier 5 — Reliability / safety / scale (7 of 7 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T5.31 | Adaptive bitrate / simulcast (Twilio `bandwidthProfile` + UI surfacing) | M (~3 days) | [T5 §T5.31](../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md) |
| T5.32 | Auto-degrade to audio-only on bandwidth catastrophe | M (~2 days) | T5 §T5.32 |
| T5.33 | Multi-tab kick (reuse voice `useTabPresenceClaim`) | M (~3 days) | T5 §T5.33 |
| T5.34 | Crash-recovery rejoin (camera-permission re-acquire on rejoin) | M (~3 days) | T5 §T5.34 |
| T5.35 | Browser push when remote joins (shared `push-notification-service.ts` with text D6a / voice T5.32) | S (~2 days) | T5 §T5.35 |
| T5.36 | QoS health metrics — `video_call_quality` table + ingest + sampler (10s × 6, then 30s) | M (~3 days) | T5 §T5.36 |
| T5.37 | Cellular-data warning (one-time prompt on first cellular video session) | S (~3h) | T5 §T5.37 |

**Tier-5 subtotal:** ~12 days. **One new migration** (`video_call_quality`); reuses voice batch's `web_push_subscriptions` table from voice C3 / text D6a (whichever shipped first). T5.31 + T5.32 are the **single biggest reliability levers in the entire video roadmap** — they make the modality usable on real-world Indian 4G.

### Tier 6 — Mobile native niceties (5 of 5 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T6.38 | Front / back camera switch (`enumerateDevices` + `getUserMedia({ deviceId })`) | M (~2 days) | [T6 §T6.38](../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md) |
| T6.39 | Orientation lock + landscape-aware layout | M (~3 days) | T6 §T6.39 |
| T6.40 | Persistent foreground notification (Android; reuse voice C10 path) | L (~1 week) | T6 §T6.40 |
| T6.41 | Battery-saver auto-downgrade (15% prompt; 5% force audio-only) | S (~3h) | T6 §T6.41 |
| T6.42 | Hardware volume keys + MediaSession (sibling of voice T6.35 / C6) | XS (~1h) | T6 §T6.42 |

**Tier-6 subtotal:** ~10 days. PWA-only — T6.40 explicitly does NOT spin up a Capacitor / React Native shell in this batch (that's a separate strategic decision). iOS PWA persistent foreground is documented as not viable.

---

## Total effort estimate

| Tier | Items | Effort |
|------|-------|--------|
| T1 | 8 | ~2 days |
| T2 | 10 | ~5 days |
| T3 | 8 | ~10 days |
| T4 | 4 | ~3 days |
| T5 | 7 | ~12 days |
| T6 | 5 | ~10 days |
| **Total** | **42** | **~42 dev-days (~8 calendar weeks at solo pace, ~4 weeks at 2-dev pace)** |

This is the **largest single-modality commitment to date**. Recommend slicing into the six sub-batches A–F (which mirror T1–T6) so each tier can be validated before the next ships. Sub-batch A is risk-free; Sub-batch E carries the only schema change.

---

## Implementation order

Sequencing respects:

1. **Hard cross-batch dep:** voice [Sub-batch 0](./plan-voice-consult-selected-features.md#sub-batch-0--companion-chat-hotfix-p0-1-day) ships before A starts (P0.B IS the patient-side video page wiring).
2. **Hard intra-batch deps** between selected items (T2.9 builds on T1.7; T2.13 reuses voice `classifyDisconnect`; T4.29 builds on T3.21; T6.41 builds on T5.32).
3. **Risk locality** — ship local-only, no-schema items first; the only migration (E6) sits late in Sub-batch E.
4. **User-visible step changes first** — A + B is what doctors and patients SEE; C is what they REACH FOR; D is what they READ AFTER; E + F is what they FEEL only when something goes wrong.

### Sub-batch A — Quick wins (~2 days)

User-visible quality jump. **Frontend-only, one Plan 06 enum touch (`camera_changed`).** Voice Sub-batch 0 must have shipped.

1. A1 — T1.1 mute / unmute mic (cheapest; reuses voice `mute_changed` enum)
2. A4 — T1.4 end-call confirmation (reuse voice `<EndCallConfirmModal>`; ~30 min)
3. A6 — T1.6 self-view mirror toggle (~30 min CSS)
4. A3 — T1.3 call duration timer (reuse voice `useCallDuration` if available)
5. A2 — T1.2 camera off / on (`camera_changed` enum first consumer; `<VideoSelfTile>` placeholder)
6. A5 — T1.5 self-view position toggle (PiP corners; persisted)
7. A8 — T1.8 network-quality 4-bar indicator + video-stats tooltip
8. A7 — T1.7 pre-call camera + mic check (largest A item; ~5h; precondition for B1)

**Sub-batch A acceptance:** all 8 source-plan acceptance criteria; manual smoke on doctor + patient; `mode='readonly'` (Plan 07 history viewer) hides every new control / placeholder; Plan 06 `camera_changed` enum migration forward + reverse cleanly.

### Sub-batch B — Real polish (~5 days)

Lifecycle + layout + control polish. **No schema; no backend.** Heavy reuse of voice batch components.

9. B10 — T2.18 recording-status pill (cheapest; ~1h; reads existing recording state)
10. B5 — T2.13 disconnect-reason splash (reuse voice A9 `classifyDisconnect`)
11. B2 — T2.10 caller-card overlay header (consumes A3 timer + A8 bars)
12. B9 — T2.17 volume slider (reuse voice B4 `<VolumeSlider>` + `gain-node.ts`)
13. B8 — T2.16 video-quality picker (manual override only in v1; couples with E1 when E1 lands)
14. B1 — T2.9 pre-call lobby (extends A7 with branding + countdown)
15. B3 — T2.11 hold call (reuse voice B3 `<HoldCallBanner>` + voice `hold_changed` enum)
16. B4 — T2.12 reconnection UX (reuse voice B1 `useTwilioReconnectState`)
17. B6 — T2.14 layout swap (gallery / speaker / sidebar; consumes A5)
18. B7 — T2.15 picture-in-picture (W3C PiP API; iOS Safari degradation documented)

**Sub-batch B acceptance:** all 10 source-plan acceptance criteria; layout swap persists per-device; PiP works on Chrome desktop / Android, degrades cleanly on iOS Safari pre-iOS 14; reconnect + hold + disconnect all consume voice-batch hooks 1:1.

### Sub-batch C — Clinical workflow (~10 days)

Snapshot capture, freeze-frame annotations, screen share, virtual background, captions, three-way. **Vendor decision (Krisp) before C1; Plan 10 hard dep before C7.**

19. C2 — T3.20 virtual background / blur (`@twilio/video-processors`; cheapest non-vendor item)
20. C5 — T3.23 screen share (Twilio screen-share track; new layout tile)
21. C3 — T3.21 snapshot capture (`<canvas>` extraction; signed-URL upload; PHI-gated; clinical-record artifact)
22. C4 — T3.22 freeze-frame + annotations (consumes C3)
23. C1 — T3.19 background-noise suppression (Krisp; sibling of voice T3.19; vendor decision needed)
24. C6 — T3.24 in-call quick actions (Rx exists; rest behind separate plans — ship Rx + Schedule v1)
25. C8 — T3.26 three-way call (multi-participant RLS work; UI complexity)
26. C7 — T3.25 live captions (**ships only after Plan 10 lands**)

**Sub-batch C acceptance:** all 8 source-plan acceptance criteria, with C7 as a stub if Plan 10 hasn't shipped. Snapshot pipeline + RLS verified end-to-end on doctor and patient. Krisp decision captured in PR (per-doctor opt-in default ON or per-doctor opt-in default OFF).

### Sub-batch D — Post-call (~3 days)

Summary, replay, snapshot review, rating. **Hard dep on C3 (snapshot capture) for D3.**

27. D4 — T4.30 patient rating + feedback (~4h; cheapest D item; existing service-reviews surface)
28. D1 — T4.27 post-call summary screen (rename voice's `<VoicePostCallSummary>` → `<CallPostCallSummary>` with modality variant; extends backend aggregation)
29. D2 — T4.28 recording + transcript playback (extends voice B6 `<RecordingPlaybackPlayer>` with `<video>` element + transcript sidebar)
30. D3 — T4.29 snapshot review-and-attach (doctor-only gallery; consumes C3 capture pipeline)

**Sub-batch D acceptance:** all 4 source-plan acceptance criteria; D2 ships with audio-only player if Plan 07 hasn't grown video; D3 hides snapshots-section if C3 hasn't shipped (degraded but not broken).

### Sub-batch E — Reliability / safety (~12 days)

Adaptive bitrate, audio fallback, multi-tab kick, crash-recovery, push, QoS, cellular warning. **Includes the only schema work in the entire video batch.**

31. E7 — T5.37 cellular-data warning (~3h; cheapest; one-time prompt)
32. E5 — T5.35 browser push when remote joins (reuses shared infrastructure from voice C3 or text D6a)
33. E1 — T5.31 adaptive bitrate / simulcast (Twilio `bandwidthProfile` + UI surfacing; biggest single-lever impact)
34. E2 — T5.32 auto-degrade to audio-only on bandwidth catastrophe (consumes E1; new Plan 06 enum `auto_audio_fallback`)
35. E3 — T5.33 multi-tab kick (reuse voice C4 `useTabPresenceClaim`)
36. E4 — T5.34 crash-recovery rejoin (reuse voice C5; extends with camera-permission re-acquire)
37. E6 — T5.36 QoS health metrics (**migration** `0XX_video_call_quality.sql` + ingest endpoint + frontend reporter)

**Sub-batch E acceptance:** all 7 source-plan acceptance criteria; bandwidth-throttle test confirms adaptive degradation + auto audio fallback within 10s of network drop; ops query "median fps by clinic this month" runs in <1s on populated DB; recording continuity preserved across multi-tab kick + crash recovery.

### Sub-batch F — Mobile native (~10 days)

Camera switch, orientation, persistent foreground, battery saver, MediaSession. **PWA-only; iOS degradations documented per item.**

38. F5 — T6.42 hardware volume keys + MediaSession (~1h; sibling of voice T6.35 / C6; verify + minor cleanup)
39. F4 — T6.41 battery-saver auto-downgrade (~3h; consumes E2)
40. F1 — T6.38 front / back camera switch (single flip button on mobile; dropdown on desktop)
41. F2 — T6.39 orientation lock + landscape-aware layout
42. F3 — T6.40 persistent foreground notification (reuse voice C10 path; video adds video-track keep-alive)

**Sub-batch F acceptance:** all 5 source-plan acceptance criteria; camera switch works on Android Chrome + iOS Safari (post-permission); orientation lock works on installed PWA; persistent foreground works on Android (iOS degradation documented).

---

## Dependency graph (selected-items only)

```text
Voice Sub-batch 0 (P0.B = patient video page wiring) ─── HARD GATE for video Sub-batch A

Sub-batch A — frontend-only, one Plan 06 enum touch
   A1 (mute) ─┐
   A2 (cam)  ─┴─→ Plan 06 enum: 'camera_changed' (new); 'mute_changed' (reused from voice)
   A3 (timer) ── consumed by B2
   A4 (end-call) — reuse voice <EndCallConfirmModal>
   A5 (self-view position) ── consumed by B6 (layout swap)
   A6 (mirror) — pure CSS toggle
   A7 (pre-call check) ── precondition for B1 (lobby extends A7)
   A8 (network bars + video stats) ── consumed by B2 (caller card)

Sub-batch B — heavy reuse of voice batch
   B1 (lobby)            ── extends A7
   B2 (caller card)      ── consumes A3 + A8
   B3 (hold)             ── reuses voice <HoldCallBanner> + 'hold_changed' enum
   B4 (reconnect)        ── reuses voice useTwilioReconnectState
   B5 (disconnect splash) ── reuses voice classifyDisconnect
   B6 (layout swap)      ── consumes A5
   B7 (PiP)              ── independent
   B8 (quality picker)   ── couples with E1 when E1 lands
   B9 (volume slider)    ── reuses voice <VolumeSlider> + gain-node
   B10 (recording pill)  ── reads existing useRecordingState

Sub-batch C — clinical
   C1 (Krisp)            ── vendor decision; sibling of voice T3.19
   C2 (virtual bg)       ── independent
   C3 (snapshot)         ── PHI-gated (Plan 02 / 08 consent)
        ▼
   C4 (annotations)      ── consumes C3
   C5 (screen share)     ── independent (verify Twilio support)
   C6 (quick actions)    ── consumes existing Rx + scheduling services
   C7 (live captions)    ── HARD DEP on Plan 10
   C8 (three-way)        ── multi-participant RLS work

Sub-batch D — post-call
   D1 (summary)          ── extends voice <CallPostCallSummary>
   D2 (replay player)    ── soft dep on Plan 07
   D3 (snapshot review)  ── HARD DEP on C3
   D4 (rating)           ── existing service-reviews surface

Sub-batch E — reliability
   E1 (adaptive bitrate) ──┐
   E2 (audio fallback)   ──┴─→ Plan 06 enum: 'auto_audio_fallback' (new)
   E3 (multi-tab kick)   ── reuses voice useTabPresenceClaim
   E4 (crash recovery)   ── reuses voice useCallRejoinCache (renamed from useVoiceRejoinCache)
   E5 (browser push)     ── shared web_push_subscriptions table with voice/text
   E6 (QoS migration)    ── new video_call_quality table; only schema work in batch
   E7 (cellular warning) ── independent

Sub-batch F — mobile
   F1 (camera switch)    ── independent
   F2 (orientation)      ── independent
   F3 (foreground)       ── reuses voice C10 path
   F4 (battery-saver)    ── consumes E2
   F5 (MediaSession)     ── sibling of voice T6.35 / C6; verify + minor cleanup

Cross-modality coordination:
   Voice T3.19 (Krisp) ── share decision + vendor contract with C1
   Voice C3 / Text D6a (push) ── share push-notification-service.ts + web_push_subscriptions table with E5
   Voice C5 (crash recovery) ── share useCallRejoinCache (rename from useVoiceRejoinCache) with E4
   Voice C10 (foreground) ── share MediaSession + SW notification with F3

Plan 02 / 08 ── C3 (snapshot is a clinical artifact; consent applies)
Plan 06 ── A1 / A2 / B3 / E2 (system-message enum extensions)
Plan 07 ── D2 (recording playback; soft dep)
Plan 10 ── C7 (live captions; HARD dep)
```

No selected item EXCEPT C7 hard-blocks on Plan 10.

---

## Cross-cutting decisions needed before commit-start

These are decisions the source plans flagged as "decide at commit time". For this batch, we owe answers before sub-batch boundaries:

### Before sub-batch A starts

1. **`camera_changed` enum rollout** (A2) — combine with any other in-flight Plan 06 enum migration (e.g. text consult) to save a migration file. Recommendation: own one-line migration; coordinate at PR time.
2. **Self-view default on mobile portrait** (A5) — bottom-right corner overlay (recommended; matches WhatsApp / Meet) vs full-width below remote.
3. **Camera-off avatar source** (A2) — initials-on-colored-hash (recommended; no remote fetch) vs `doctor_settings.avatar_url` if available.
4. **Pre-call permission denial** (A7) — proceed with camera-off if user denies camera but grants mic (recommended; surface inline hint) vs block.
5. **Mute system-message debounce** (A1) — collapse mute+unmute within 5s into single message (recommended; matches voice doctrine).

### Before sub-batch B starts

6. **Lobby branding source** (B1) — `clinic.branding.logoUrl`; fall back to text-only. Same as voice batch.
7. **Layout swap default** (B6) — speaker (recommended for two-party clinical use) vs gallery.
8. **PiP iOS degradation** (B7) — hide PiP button entirely on iOS pre-14 (recommended) vs show + warn on click.
9. **Quality picker default** (B8) — `Auto` (recommended; couples with E1's adaptive bitrate when E1 lands; manual override always available).
10. **Hold semantics for video** (B3) — disable BOTH local mic AND local video on hold (recommended; "stepped away" implies away from camera).

### Before sub-batch C starts

11. **Krisp budget sign-off** (C1) — same decision as voice T3.19. Per-doctor opt-in defaulted ON (recommended). Confirm budget shared across modalities.
12. **Virtual background plugin** (C2) — `@twilio/video-processors` (recommended; supported, GPU-accelerated) vs MediaPipe Selfie Segmentation custom pipeline.
13. **Snapshot artifact storage** (C3) — `consultation_messages` attachment row (recommended; reuses Plan 06 attachment pipeline) vs new `clinical_snapshots` table.
14. **Snapshot patient visibility** (C3) — patients can see snapshots THEY took; cannot see snapshots doctor took. Decision flag for product review.
15. **Quick-actions v1 scope** (C6) — Rx + Schedule (recommended; both have existing services); defer Order labs + Request consent to follow-up.
16. **Three-way call invite mechanism** (C8) — per-call invite link (recommended) vs participant-id pre-registration.
17. **Captions surface** (C7) — overlay on video tile (recommended; sticky to bottom) vs companion-chat scroll only vs both.

### Before sub-batch D starts

18. **Post-call summary component name** (D1) — rename voice's `<VoicePostCallSummary>` → `<CallPostCallSummary>` with modality variant. Coordinate with voice batch ownership.
19. **Snapshot "Add to section" UX** (D3) — radio-list of canonical sections (Subjective / Objective / Assessment / Plan / Attachments — recommended) vs free-text section name.
20. **Patient rating required-ness** (D4) — skipping is acceptable (recommended; matches voice T4.26 deferral doctrine).
21. **Recording auto-fetch on summary mount** (D2) — yes (recommended; degrades gracefully if Plan 07 not shipped).

### Before sub-batch E starts

22. **Adaptive bitrate `bandwidthProfile.video.mode`** (E1) — `'collaboration'` (recommended; optimizes two-party calls) vs `'grid'`.
23. **Simulcast on/off** (E1) — OFF in v1 (recommended; two-party calls don't benefit; backend cost). Revisit when C8 three-way lands.
24. **Audio-fallback bandwidth threshold** (E2) — network quality 0/1 stuck for 10s (recommended; tested in source plan).
25. **Audio-fallback re-try cooldown** (E2) — 60s after user clicks "Try video again" (recommended; prevents flapping).
26. **QoS sample cadence** (E6) — 10s × 6 (first minute) then 30s (recommended; same as voice C2; caps storage at ~120 rows / 30 min call).
27. **`video_call_quality` vs reusing `voice_call_quality`** (E6) — separate tables (recommended; different columns; cleaner ops queries).
28. **Push opt-in scope** (E5) — doctor only for v1 (recommended; same as voice C3).
29. **Multi-tab kick on doctor side** (E3) — no kick; show "Open in 2 tabs" badge (recommended; doctors legitimately use multi-monitor).
30. **Cellular MB/min figure** (E7) — show estimate based on current quality picker (e.g. "~6 MB/min at 720p"); update copy as picker changes.

### Before sub-batch F starts

31. **Camera switch UI placement** (F1) — single flip button on mobile; dropdown on desktop (recommended; UA/viewport detect).
32. **Default landscape behavior** (F2) — auto-rotate (unlocked) (recommended; lock is opt-in).
33. **Battery thresholds** (F4) — 15% prompt, 5% force (recommended; tested in source plan).
34. **MediaSession artwork** (F5) — static icon (recommended; cheap) vs last-known video frame.
35. **iOS PWA persistent foreground** (F3) — out of scope; document degradation (Apple gates it).
36. **PWA install gating** (F2 + F3) — encourage install via in-app prompt (orientation lock + persistent fg only work properly on installed PWA).

---

## Files expected to touch (consolidated across all 42 items)

### Frontend (~25 new files, ~5 extends)

**New components:**
- `frontend/components/consultation/VideoSelfTile.tsx` — A2 + A5 + A6
- `frontend/components/consultation/VideoControlsBar.tsx` — A1 + A2 + B6 + B8 (controls bar refactor scattered across several A/B items)
- `frontend/components/consultation/VideoConsultPreCall.tsx` — A7
- `frontend/components/consultation/VideoConsultPreLobby.tsx` — B1 (or extends VideoConsultPreCall in-place)
- `frontend/components/consultation/CallerCardOverlay.tsx` — B2
- `frontend/components/consultation/CallDisconnectSplash.tsx` — B5 (rename voice `<VoicePostCallSplash>` to modality-agnostic)
- `frontend/components/consultation/VideoLayoutSwitcher.tsx` — B6
- `frontend/components/consultation/VideoQualityPicker.tsx` — B8
- `frontend/components/consultation/VirtualBackgroundPicker.tsx` — C2
- `frontend/components/consultation/SnapshotControls.tsx` — C3
- `frontend/components/consultation/AnnotationCanvas.tsx` — C4
- `frontend/components/consultation/ScreenShareTile.tsx` — C5
- `frontend/components/consultation/InCallQuickActions.tsx` — C6
- `frontend/components/consultation/LiveCaptionsOverlay.tsx` — C7
- `frontend/components/consultation/ThreeWayInvitePanel.tsx` — C8
- `frontend/components/consultation/CallPostCallSummary.tsx` — D1 (rename + modality variant)
- `frontend/components/consultation/SnapshotReviewPanel.tsx` — D3
- `frontend/components/consultation/AudioFallbackBanner.tsx` — E2
- `frontend/components/consultation/CellularDataWarning.tsx` — E7

**New hooks:**
- `frontend/hooks/useCameraDevices.ts` — F1 + extends A7
- `frontend/hooks/useScreenOrientation.ts` — F2
- `frontend/hooks/useBatteryStatus.ts` — F4
- `frontend/hooks/useCallRejoinCache.ts` — E4 (rename from voice `useVoiceRejoinCache`)

**New libraries:**
- `frontend/lib/video/snapshot-capture.ts` — C3
- `frontend/lib/video/quality-reporter.ts` — E6 (analog to voice `quality-reporter.ts`)
- `frontend/lib/video/adaptive-bitrate.ts` — E1
- `frontend/lib/audio/output-router.ts` — verify shared with voice T6.34 / Bluetooth

**Extends:**
- `frontend/components/consultation/VideoRoom.tsx` — every item touches this
- `frontend/app/consult/join/page.tsx` — wires through pre-call (A7) + lobby (B1) + companion (voice Sub-batch 0 P0.B)
- `frontend/lib/api.ts` — D1 (post-call summary), D2 (replay URL), E6 (`postVideoQuality`)
- `frontend/public/sw.js` — E5 push handler + F3 foreground notification
- `frontend/public/manifest.json` — F3 (web app capable; orientation hint)

### Backend (~5 new files, ~3 extends)

**New:**
- `backend/src/routes/api/v1/video-quality.ts` — E6
- `backend/src/services/video-call-quality-service.ts` — E6
- `backend/src/services/snapshot-storage-service.ts` — C3 (signed-URL upload + RLS-gated insert)
- `backend/src/routes/api/v1/snapshots.ts` — C3
- (extends voice's) `backend/src/services/post-call-summary-service.ts` — D1 (add video-specific fields: `snapshotsCount`, `recordingHasVideo`, `peakResolution`)

**Extends:**
- `backend/src/services/notification-service.ts` — E5 (`participant-connected` push enqueue, doctor-only)
- `backend/src/services/push-notification-service.ts` — E5 (shared with voice C3 / text D6a; consume here)
- `backend/src/controllers/twilio-webhook-controller.ts` — E5 (webhook → enqueue push)

### Migrations (1 total)

- `backend/migrations/0XX_video_call_quality.sql` — E6 (table + 2 RLS policies via `safe_uuid_sub()` invariant)

### Plan 06 system-message enum extensions

- `'camera_changed'` — A2 (new; first consumer)
- `'mute_changed'` — A1 (already shipped in voice batch; reuse)
- `'hold_changed'` — B3 (already shipped in voice batch; reuse)
- `'auto_audio_fallback'` — E2 (new; first consumer)

(Owned formally by Plan 06; A2 / E2 are first consumers of new enum values. Combine A2 + E2 into a single enum migration where possible.)

### Ops

**Vendor decision (one):**
- Krisp Audio Plugin — same decision as voice T3.19 (~$0.005/min; ~$300/mo at 1000 voice + 1000 video × 30 min combined). Per-doctor opt-in default ON (recommended).

**No new env vars** (E5 reuses VAPID keys provisioned for voice C3 / text D6a).

**No new npm deps** beyond Twilio's official `@twilio/video-processors` (C2) and `@twilio/krisp-audio-plugin` (C1, same as voice).

### What does NOT change

- No DM-copy changes.
- No new authentication / authorization surface.
- No RLS rewrites that bypass `safe_uuid_sub()` (Plan F04 invariant LOCKED).
- No native shell.

---

## Acceptance for the whole batch

When all 42 items have shipped:

- [ ] Voice Sub-batch 0 has shipped (HARD GATE; companion chat works on patient-side video).
- [ ] All 42 source-plan acceptance criteria pass.
- [ ] Manual smoke: doctor + patient on different devices for a 30-min video consult exercises every item without hitting a console error.
- [ ] Mobile parity verified on iOS Safari + Android Chrome (with documented degradations: B7 PiP iOS pre-14, F3 persistent foreground iOS, F2 orientation lock without PWA install).
- [ ] Bandwidth-throttle test: 4G throttle (~500 kbps) → adaptive bitrate degrades + auto audio fallback within 10s of network drop.
- [ ] Recording continuity verified across reconnect, hold, multi-tab kick, and crash recovery.
- [ ] PHI hygiene: snapshots only via consent flow; cellular warning surfaces estimated MB/min before patient commits; QoS samples never include transcript.
- [ ] Migration `0XX_video_call_quality.sql` forward + reverse cleanly; new `safe_uuid_sub()` policies pass `backend/scripts/diagnose-text-consult-jwt.ts` regression check.
- [ ] All Plan 06 enum extensions (`camera_changed`, `auto_audio_fallback`) live; voice / text consumers unaffected.
- [ ] Backend + frontend type-check + lint clean.
- [ ] Backend + frontend test suites green.
- [ ] One docs PR adds a brief "video consult features" runbook to `docs/Work/runbooks/` covering doctor-side: snapshot review + "Add to section", quality picker triage, screen share, three-way invite, replay-and-transcript playback.

---

## Documentation hygiene

When an item ships:

1. Mark it ✓ in this file's tier section (with date).
2. Update the source plan's `Status` row for that item from `[SELECTED 2026-04-29]` → `[SHIPPED YYYY-MM-DD]`.
3. Update the [video-consult roadmap index](../../../Product%20plans/video-consult/plan-00-video-consult-roadmap.md) tier row's status snapshot if the whole tier is done.
4. If an item is dropped mid-batch, add a "Dropped" row in this doc with the reason, and revert the source plan's `[SELECTED]` marker to `[DEFERRED]` with a note pointing here.

---

## References

- [Video consult roadmap index](../../../Product%20plans/video-consult/plan-00-video-consult-roadmap.md)
- [T1 — Quick wins](../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
- [T2 — Real polish](../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- [T3 — Clinical workflow](../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
- [T4 — Post-call](../../../Product%20plans/video-consult/plan-t4-video-post-call.md)
- [T5 — Reliability / safety](../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md)
- [T6 — Mobile native niceties](../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md)
- [Sibling batch: Voice consult selected features](./plan-voice-consult-selected-features.md) (Sub-batch 0 P0 hotfix is HARD GATE)
- [Sibling batch: Text consult selected features](./plan-text-consult-selected-features.md) (push backend share)
- [Foundation: Plan 02 — Recording consent](../../19-04-2026/Plans/plan-02-recording-consent.md) (snapshot consent gate)
- [Foundation: Plan 06 — Companion text channel](../../19-04-2026/Plans/plan-06-companion-text-channel.md) (system-message enum)
- [Foundation: Plan 07 — Recording replay & history](../../19-04-2026/Plans/plan-07-recording-replay-and-history.md) (D2 soft dep)
- [Foundation: Plan 08 — Doctor-initiated video escalation](../../19-04-2026/Plans/plan-08-video-recording-doctor-control.md) (consent gating for snapshots)
- [Foundation: Plan 10 — AI clinical assist](../../../Product%20plans/text-consult/plan-f10-ai-clinical-assist-status.md) (C7 captions HARD dep)

---

**Owner:** TBD (one or two devs depending on slicing).  
**Created:** 2026-04-28.  
**Last updated:** 2026-04-30 — added 42-task index across Sub-batches A–F; cross-batch coordination with voice Sub-batch 0 + voice C3 / text D6a push backend.  
**Status:** Drafted; awaiting commit-start. Recommended order: **voice Sub-batch 0 ships first**, then **A → B → C → D → E → F**. Tell me which sub-batch to start with and I'll switch to Agent mode and begin.
