# Voice consult — Selected features batch (2026-04-28)

## The 26 voice-consult items committed for implementation, pulled from across all six tier plans

> **Source plans (single source of truth for each item):**
> - [Voice T1 — Quick wins](../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)
> - [Voice T2 — Real polish](../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md)
> - [Voice T3 — Clinical workflow](../../../Product%20plans/voice-consult/plan-t3-voice-clinical-workflow.md)
> - [Voice T4 — Post-call](../../../Product%20plans/voice-consult/plan-t4-voice-post-call.md)
> - [Voice T5 — Reliability / safety](../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md)
> - [Voice T6 — Mobile native niceties](../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md)
> - [Roadmap index](../../../Product%20plans/voice-consult/plan-00-voice-consult-roadmap.md)
>
> Each item below is implemented per the contract spelled out in its source plan. This file is the **batch backlog and sequencing doc** — it does not redefine items; it commits them.

---

## What this is

A user-curated cross-tier slice of the voice-consult roadmap, selected on 2026-04-28. Spans almost every tier (only T2.12 / T2.14 / T2.17 / T4.26 / T4.27 are explicitly NOT in this batch).

This is a **commitment**, not a wish-list. Each item below has its source plan, its effort estimate, and its dependencies. The sequencing in this doc respects those dependencies so we don't build things twice.

> **2026-04-28 addendum — P0 companion-chat hotfix.** Live testing on 2026-04-28 surfaced a backend bug that breaks Plan 06 Decision 9 on the patient side: the patient phone hits the voice-only fallback canvas with no chat surface, while the doctor laptop sees the companion chat fine. Root cause is a too-strict modality guard in `exchangeTextConsultTokenHandler`. This is now [**Sub-batch 0**](#sub-batch-0--companion-chat-hotfix-p0-1-day) and **must ship before Sub-batch A** because seven items in this batch (T1.8 mute notification, T2.11 hold banner, plus all of Plan 06's value prop) silently degrade without it. It also fixes an adjacent gap: the patient-side video page (`/consult/join`) never even attempts the companion exchange today, so video has the same dead-canvas problem. See the new sub-batch section + dependency-graph update below.

---

## Status

`Drafted, awaiting commit start` — 2026-04-28.

Once implementation starts, this file is updated in-place: items move from `pending` → `in-progress` → `shipped` (with dated check-marks). Each tier source plan keeps its own `[SELECTED 2026-04-28]` markers so the cross-reference is always traceable in either direction.

---

## What's NOT in this batch (explicitly deferred)

So we don't accidentally pull these in:

| Item | Source | Why excluded |
|------|--------|--------------|
| T2.12 | Auto-extend prompt | Wait until usage data tells us doctors actually run over slot. |
| T2.14 | Doctor-side scratchpad | Wait for Plan 10 (AI clinical assist) to define the SOAP-draft surface so we don't build twice. |
| T2.17 | Permission-denied recovery UX | T1.2 pre-call mic check largely prevents this; revisit if telemetry shows it. |
| T3.18 | Live captions / live transcript | Whole T3 caption surface waits for Plan 10. |
| T3.20 | In-call quick actions (Rx / labs / follow-up / consent) | Big lift; Rx exists already, the others wait for separate plans. |
| T3.21 | Clinical templates panel | Wait for specialty taxonomy to land. |
| T3.22 | Patient-side document share button | Wait for Plan 06 attachments to ship the pipeline. |
| T3.23 | Three-way call (interpreter / family) | Schema work; wait for clear demand. |
| T3.24 | Vitals input panel | Cheap but nobody's asked yet. |
| T4.26 | Patient rating + free-text review | Existing service-reviews path covers it for now. |
| T4.27 | One-click follow-up rebook | Existing `/book` flow with prefill works for now. |

If priorities shift, we move items from this excluded list into a future batch — we don't redefine the source plans.

---

## The 26 selected items

Grouped by tier; sequencing is below in [§ Implementation order](#implementation-order).

### Tier 1 — Quick wins (8 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T1.1 | Call duration timer in header (`mm:ss`) | XS (~30 min) | [T1 §T1.1](../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md) |
| T1.2 | Pre-call mic check screen | S (~3h) | T1 §T1.2 |
| T1.3 | Network-quality 4-bar indicator | S (~2h) | T1 §T1.3 |
| T1.4 | Local mic-level meter | S (~2h) | T1 §T1.4 |
| T1.5 | End-call confirmation modal (shift-click bypass) | XS (~45 min) | T1 §T1.5 |
| T1.6 | Speaker / earpiece toggle (mobile) | S (~3h) | T1 §T1.6 |
| T1.7 | Headset / output device picker (desktop) | S (~2h) | T1 §T1.7 |
| T1.8 | Counterparty mute notification (system message in companion chat) | S (~2h) | T1 §T1.8 |

**Tier-1 subtotal:** ~1.5 days. Frontend-only, no schema, no backend changes (T1.8 reuses Plan 06's existing system-message channel with one new `system_subtype` value).

### Tier 2 — Real polish (6 of 9 items selected; includes 2 promoted from T2-Later)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T2.15 | Reconnection UX — countdown banner + "Try now" + "Rejoin call" CTA | M (~6h) | [T2 §T2.15](../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md) |
| T2.9 | Pre-call lobby (clinic branding + countdown) — extends T1.2 | M (~5h) | T2 §T2.9 |
| T2.10 | Caller-card header (replaces minimal pill) | S (~4h) | T2 §T2.10 |
| T2.16 | Disconnect reason (local / remote / connection_lost / timeout / token_expired / unknown) | S (~3h) | T2 §T2.16 |
| T2.11 | Hold call (both mics muted + banner) — **promoted from T2-Later** | S–M (~5h estimated; T2 file lists it under T2-Later without a number) | T2 §T2.11 (under T2-Later) |
| T2.13 | Volume slider + amplitude boost (×1.5 via WebAudio gainNode) — **promoted from T2-Later** | S (~4h estimated) | T2 §T2.13 (under T2-Later) |

**Tier-2 subtotal:** ~3.5 days. T2.11 and T2.13 are pulled forward from T2-Later because they round out the in-call control surface alongside the curated subset.

### Tier 3 — Clinical workflow (1 of 7 items selected)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T3.19 | Background-noise suppression (Twilio Krisp plugin OR open-source RNNoise WASM) | M (~3 days) | [T3 §T3.19](../../../Product%20plans/voice-consult/plan-t3-voice-clinical-workflow.md) |

**Tier-3 subtotal:** ~3 days. **Gating decision:** Krisp is paid (~$0.005/min, ~$150/mo at 1000 consults × 30 min). Decision needed before commit-start whether we ship Krisp (recommended), RNNoise (free, lower quality + heavier CPU), or a per-doctor opt-in for Krisp with RNNoise as the default. See [§ Open decisions](#open-decisions-needed-before-commit-start).

### Tier 4 — Post-call (2 of 4 items selected)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T4.25 | Post-call summary screen (duration, recorded?, attachments count, prescription sent, CTAs) | M (~2 days) | [T4 §T4.25](../../../Product%20plans/voice-consult/plan-t4-voice-post-call.md) |
| T4.28 | Recording playback link ("Listen to your consult" CTA) | S (~1 day) | T4 §T4.28 |

**Tier-4 subtotal:** ~3 days. **T4.28 hard-depends on Plan 07 (recording replay infrastructure).** If Plan 07 hasn't shipped by the time we get to T4.28, T4.28 ships as a disabled placeholder with the tooltip "Recording will be available soon" and lights up automatically once Plan 07's `GET /api/v1/consultations/:id/replay` endpoint exists.

### Tier 5 — Reliability / safety (5 of 5 items selected)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T5.29 | Multi-tab / multi-device kick (Supabase Realtime presence) | M (~3 days) | [T5 §T5.29](../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md) |
| T5.30 | Crash-recovery rejoin (sessionStorage token cache + idempotent backend rejoin) | M (~3 days) | T5 §T5.30 |
| T5.31 | Audible ringtone when patient connects (doctor side) | XS (~2h) | T5 §T5.31 |
| T5.32 | Browser-push / desktop-notification when remote joins | S (~2 days) | T5 §T5.32 |
| T5.33 | QoS health metrics (`voice_call_quality` table + 30s sampling + ingest endpoint) | M (~3 days) | T5 §T5.33 |

**Tier-5 subtotal:** ~10 days (~2 weeks). Includes 1 small additive table (`voice_call_quality`) and 1 new ingest endpoint.

### Tier 6 — Mobile native niceties (4 of 4 items selected)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T6.34 | Bluetooth / AirPods auto-relay detection + UI | M (~2 days) | [T6 §T6.34](../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md) |
| T6.35 | Hardware volume key support (verify + minor cleanup) | XS (~1h) | T6 §T6.35 |
| T6.36 | Persistent foreground notification on Android (PWA `MediaSession` path only — no native shell in this batch) | L (~1 week) | T6 §T6.36 |
| T6.37 | Proximity sensor auto-screen-off (Chrome Android only) | M (~3 days) | T6 §T6.37 |

**Tier-6 subtotal:** ~10 days (~2 weeks). PWA-only — T6.36 explicitly does NOT spin up a Capacitor / React Native shell in this batch (that's a separate strategic decision).

---

## Total effort estimate

| Tier | Items | Effort |
|------|-------|--------|
| **P0 hotfix** (Sub-batch 0) | **3** | **~1 day** |
| T1 | 8 | ~1.5 days |
| T2 | 6 | ~3.5 days |
| T3 | 1 | ~3 days |
| T4 | 2 | ~3 days |
| T5 | 5 | ~10 days |
| T6 | 4 | ~10 days |
| **Total** | **29** | **~32 dev-days (~6 calendar weeks at solo pace, ~3 weeks at 2-dev pace)** |

This is a **multi-month commitment for a solo dev**. Recommend slicing the implementation into 4 deliverable sub-batches (Sub-batch 0 first, then A → B → C) so we can validate each before moving to the next. Sub-batch 0 is a single-day pre-flight; everything else is real feature work.

---

## Implementation order

Sequencing respects:

1. **Hard dependencies** between selected items (T2.9 builds on T1.2; T6.34 builds on T1.7; T4.25 reads T2.16's disconnect reason; T1.8 / T2.11 reuse Plan 06's system-message channel).
2. **Risk locality** — ship local-only, no-schema items first so we can iterate without migration overhead.
3. **User-visible step changes first** — T1 + T2 polish is what doctors and patients SEE; T5 reliability is what they FEEL only when something goes wrong.

### Sub-batch 0 — Companion chat hotfix (P0) (~1 day)

**Why first.** Live testing on 2026-04-28 (voice consult, doctor-on-laptop / patient-on-phone) confirmed: doctor side renders the companion chat correctly, patient side renders the voice-only fallback canvas with no chat. Backend trace pinned the bug to `exchangeTextConsultTokenHandler`'s modality guard, which was written for text-only sessions and never relaxed when Plan 06 (Decision 9) added the companion chat to voice/video. Patient phone calls `POST /api/v1/consultation/:sessionId/text-token`, gets a 400, frontend swallows the error, room renders no chat.

**Why it blocks Sub-batch A and beyond.** Seven items in this batch consume Plan 06's companion-chat surface — most directly **T1.8** (counterparty-mute system message) and **T2.11** (hold banner emits a system message). Both ship correctly only when the patient actually receives those messages. T2.10's caller-card header and T4.25's post-call summary also expect chat to be live during the call. Without Sub-batch 0, those items SHIP "green" but silently degrade for every patient.

**Exact failure path** (full diagnosis in the conversation transcript; reproducible with `curl` against the local dev API):

```
patient /c/voice/[sessionId]?t=…
  → frontend POST /api/v1/consultation/:sessionId/text-token
    → exchangeTextConsultTokenHandler verifies HMAC ✓
    → finds session ✓
    → fails on:  if (session.modality !== 'text') throw ValidationError
  → backend returns 400 "Cannot exchange text-token for voice session"
  → frontend exchangeCompanion() catch → returns null
  → companionProp = undefined
  → <VoiceConsultRoom companion={undefined}> renders the voice-only fallback
```

**Doctor side works** because doctor never hits this endpoint — `<VoiceConsultRoom>` reuses the doctor's dashboard Supabase session via `createClient().auth.getSession()` (`frontend/components/consultation/VoiceConsultRoom.tsx:218-248`). Only patients depend on `/text-token`.

#### Items in Sub-batch 0

| ID | Item | Effort | Touches |
|----|------|--------|---------|
| P0.A | **Backend: relax modality guard + force text-adapter mint in `exchangeTextConsultTokenHandler`.** Allow `text` / `voice` / `video` modalities (reject only future-unknown modalities). Replace the `facadeGetJoinToken(...)` call with a direct call to the text adapter's `getJoinToken` so the JWT is a Supabase JWT regardless of session modality (the facade dispatches by modality and returns a Twilio access token for voice/video — wrong token type for chat). | XS (~30 min) | `backend/src/controllers/consultation-controller.ts` (lines 361-378) |
| P0.B | **Frontend: wire patient-side video page to the companion exchange.** `frontend/app/consult/join/page.tsx` mounts `<VideoRoom>` today with no `companion` prop and never calls `requestTextSessionToken`. Mirror the pattern from `frontend/app/c/voice/[sessionId]/page.tsx:130-139` (parallel exchange, pass through to `<VideoRoom companion={...}>`). | S (~3h) | `frontend/app/consult/join/page.tsx` |
| P0.C | **Frontend: stop silent-swallowing the patient companion-token failure.** Today `exchangeCompanion()` returns `null` on any error and the patient sees no indication chat was meant to be there. At minimum log to console; ideally surface a small "Chat unavailable — retry" tile in `<VoiceConsultRoom>`'s canvas-fallback path (mirror the existing `chatAuth.status === "unavailable"` UI at `VoiceConsultRoom.tsx:659-665`). | XS (~1h) | `frontend/app/c/voice/[sessionId]/page.tsx` (lines 130-139), `frontend/components/consultation/VoiceConsultRoom.tsx` (canvas branch) |
| P0.T | **Backend test: patient HMAC for a voice session can exchange `/text-token` and the resulting JWT passes `consultation_messages_insert_live_participants` RLS.** This test would have caught the bug the day Plan 06 shipped. | XS (~1h) | `backend/tests/integration/consultation/text-token.test.ts` (new) |

**Sub-batch 0 acceptance:**

- [ ] Patient phone hits `/c/voice/[sessionId]` → DevTools shows `POST /text-token` returning 200 with `{ token, currentUserId }` for a voice session.
- [ ] Patient phone canvas shows the chat panel (not the green-pulse audio-only fallback) after companion exchange succeeds.
- [ ] Patient phone hits `/consult/join?…&t=…` for a video session → companion chat renders in the side-panel / mobile-tab layout.
- [ ] Doctor side regression: companion chat still renders (it never went through the broken endpoint, but verify nothing in the controller changes broke its `livesession.companion` triplet).
- [ ] Backend integration test green.
- [ ] T1.8 / T2.11's source-plan acceptance criteria are unblocked (they don't ship in Sub-batch 0; they ship in A / B respectively, but their `consult is testable end-to-end` precondition now holds).

After Sub-batch 0 ships, **Plan 06 Decision 9 is honored end-to-end for the first time** — every voice / video consult has a live companion chat on both doctor and patient sides.

---

### Sub-batch A — "Polished call" (~5 days)

User-visible quality jump. All frontend, no schema, one Plan 06 enum touch.

1. T1.1 — duration timer
2. T1.5 — end-call confirmation
3. T1.4 — mic-level meter
4. T1.3 — network-quality bars
5. T1.6 + T1.7 — speaker toggle + output device picker (one shared hook)
6. T1.2 — pre-call mic check screen
7. T1.8 — counterparty mute notification (Plan 06 enum touch: `mute_changed`)
8. T2.10 — caller-card header (replaces the minimal pill; consumes T1.1 timer + T1.3 bars)
9. T2.16 — disconnect reason splash

**Sub-batch A acceptance:** T1 + T2.10 + T2.16 from the source plans; manual smoke per source-plan acceptance criteria; no regression on existing voice flow.

### Sub-batch B — "Robust call" (~8 days)

Lifecycle + control polish. Some backend; no schema yet.

10. T2.15 — reconnection UX (cousin of the chat-flicker fix doctrine)
11. T2.9 — pre-call lobby (extends T1.2 from sub-batch A with branding + countdown)
12. T2.11 — hold call (Plan 06 enum touch: `hold_changed`)
13. T2.13 — volume slider + amplitude boost
14. T4.25 — post-call summary screen (consumes T2.16 disconnect reason)
15. T4.28 — recording playback link (gated on Plan 07; ships as placeholder if needed)

**Sub-batch B acceptance:** all source-plan acceptance criteria for the items above; recording continuity verified across reconnect + hold; T4.25 surface reachable both as post-call splash and from `appointments/:id`.

### Sub-batch C — "Production-grade" (~17 days)

Reliability, mobile native, noise suppression. Includes the only schema work in the entire batch.

16. T5.31 — audible ringtone (cheapest item; ~2h)
17. T5.33 — QoS health metrics (`voice_call_quality` table — the batch's only new schema)
18. T5.32 — browser-push when remote joins
19. T5.29 — multi-tab / multi-device kick
20. T5.30 — crash-recovery rejoin
21. T6.35 — hardware volume key verification (~1h)
22. T6.34 — Bluetooth / AirPods auto-relay (extends T1.7 hook from sub-batch A)
23. T6.37 — proximity sensor (Chrome Android)
24. T3.19 — background-noise suppression (Krisp/RNNoise — vendor decision required first)
25. T6.36 — Android persistent foreground notification (PWA `MediaSession` path)

**Sub-batch C acceptance:** all source-plan acceptance criteria; ops can run "median RTT by clinic this month" against `voice_call_quality` in <1s; no recording artifact corruption on multi-tab kick or crash recovery; mobile parity test pass on iOS Safari + Android Chrome (with documented degradations on iOS for T6.34 / T6.36 / T6.37).

---

## Dependency graph (selected-items only)

```
Sub-batch 0 ──┐ HARD GATE for everything that touches companion chat:
              │   T1.8 (mute notif) cannot ship green without it
              │   T2.11 (hold banner) cannot ship green without it
              │   T2.10 (caller card) and T4.25 (post-call) lose chat
              │   context if companion is dead
              ▼
Sub-batches A / B / C

T1.2 ─────┐                                  T2.16 ─────┐
          ▼                                              ▼
T2.9 (lobby) extends T1.2                           T4.25 (summary) reads T2.16 reason
                                                         │
                                                         ▼
                                                    T4.28 (replay) — Plan 07 dep
T1.7 ─────┐
          ▼
T6.34 (Bluetooth auto-relay) extends T1.7

T1.1 (timer) ──┐
T1.3 (bars)  ──┤
                ▼
                T2.10 (caller card) consumes both

T1.8 ───┐
T2.11 ──┴──→ Plan 06 system-message enum extensions
              (mute_changed, hold_changed)
              ── effective only after Sub-batch 0 lands

T5.29 (multi-tab kick) ──┐
T5.30 (crash recovery) ──┤  Both touch the same join-flow surface;
                         │   coordinate so they don't interfere.
                         ▼
T5.30 cache must respect T5.29 kick:
  if THIS tab was kicked, cache must not be reused by THIS tab
  on rejoin (the kick is the source of truth, not the cache).

Plan 06 ──→ Sub-batch 0 (companion-chat hotfix completes Plan 06's patient side)
        ──→ T1.8 + T2.11 (system-message enum)
            T3.22 NOT selected — no Plan 06 attachment dep here
Plan 07 ──→ T4.28 hard dep
```

No selected item depends on Plan 10, so there's no AI-clinical-assist blocker.

---

## Cross-cutting decisions needed before commit-start

These are decisions the source plans flagged as "decide at commit time". For this batch, we owe answers before sub-batch boundaries:

### Before sub-batch 0 starts

0a. **Modality allow-list shape** (P0.A) — explicit allow-list `['text','voice','video']` (recommended; rejects future-unknown modalities cleanly) vs. removing the guard entirely. Recommendation: allow-list.
0b. **Patient-side video page error UX** (P0.B) — silent fallback to no-companion (matches today's voice page) vs. inline "Chat unavailable — retry" tile. Recommendation: inline tile, mirroring the proposed fix in P0.C; consistent UX across modalities.
0c. **Backend test layer** (P0.T) — full integration (mint patient HMAC, exchange, INSERT a `consultation_messages` row, assert RLS pass) vs. unit-only (assert handler returns Supabase JWT for voice modality). Recommendation: integration — RLS is the actual contract, only integration covers it.

### Before sub-batch A starts

1. **End-call confirmation default focus** (T1.5) — focus on `Cancel` (recommended in source plan).
2. **Mic-check skip path** (T1.2) — telemetered? — yes; track skip rate vs. permission-grant rate.
3. **iOS Safari `setSinkId`** (T1.6) — fallback to "use system controls" hint. Re-verify on iOS 17+ at PR time.

### Before sub-batch B starts

4. **Hold semantics** (T2.11) — on hold, do BOTH parties see the banner, or only the non-initiating party? Recommendation: BOTH see it ("On hold — Dr. Sharma stepped away" / "On hold — you stepped away") so neither side is uncertain.
5. **Volume amplitude boost cap** (T2.13) — cap at ×2.0? ×1.5? Recommendation: ×1.5 in v1; revisit if doctors with quiet patients ask for more.
6. **Reconnection cached-token boundary** (T2.15) — verify HMAC + JWT + Twilio access-token TTLs at PR time. Cache window = min of the three.
7. **Lobby branding source** (T2.9) — `clinic.branding.logoUrl`. Confirm field is populated for all current clinics; fall back to text-only if not.
8. **Post-call summary persistence** (T4.25) — yes, reachable from `appointments/:id` indefinitely. Component is mounted twice — as splash and as detail view.

### Before sub-batch C starts

9. **Krisp vs RNNoise vs neither** (T3.19) — needs explicit budget sign-off if Krisp. Recommendation: Krisp behind a per-doctor opt-in toggle, defaulted ON; doctors with quiet clinics can turn it off if it adds latency. Budget: ~$150/mo at 1000 consults × 30 min.
10. **Multi-tab kick semantics** (T5.29) — newest wins, but with explicit confirm on the kicked tab. Avoids accidental kicks.
11. **Ringtone asset** (T5.31) — must NOT sound like a PSTN phone (Principle 8). 0.5s soft "ding". UX/audio designer review.
12. **Push opt-in scope** (T5.32) — doctor only, not patient, in v1.
13. **QoS sample cadence** (T5.33) — 10s for first minute, then 30s. Caps storage at ~120 rows per 30-min call.
14. **MediaSession actions** (T6.36) — Pause = mute-only, NOT full hold (T2.11 owns the hold semantics).

---

## Files expected to touch (consolidated across all 26 items)

### Frontend (~15 new files, ~4 extends)

**New components:**
- `frontend/components/consultation/VoiceConsultPreCall.tsx` — T1.2 + T2.9
- `frontend/components/consultation/NetworkBars.tsx` — T1.3
- `frontend/components/consultation/MicMeterBar.tsx` — T1.4
- `frontend/components/consultation/CallerCardHeader.tsx` — T2.10
- `frontend/components/consultation/VoicePostCallSplash.tsx` — T2.16
- `frontend/components/consultation/VoicePostCallSummary.tsx` — T4.25
- `frontend/components/consultation/RecordingPlaybackPlayer.tsx` — T4.28
- `frontend/components/consultation/MultiTabKickBanner.tsx` — T5.29
- `frontend/components/consultation/HoldCallBanner.tsx` — T2.11
- `frontend/components/consultation/VolumeSlider.tsx` — T2.13

**New hooks:**
- `frontend/hooks/useNetworkQuality.ts` — T1.3
- `frontend/hooks/useAudioOutputDevice.ts` — T1.6 + T1.7 + T6.34
- `frontend/hooks/useTwilioReconnectState.ts` — T2.15
- `frontend/hooks/useProximityWakeLock.ts` — T6.37

**New libraries:**
- `frontend/lib/audio/mic-meter.ts` — T1.4
- `frontend/lib/audio/output-router.ts` — T6.34 (Bluetooth label heuristics)
- `frontend/lib/audio/gain-node.ts` — T2.13
- `frontend/lib/voice/quality-reporter.ts` — T5.33
- `frontend/lib/clinic/branding.ts` — T2.9

**New assets:**
- `frontend/public/audio/patient-joined-chime.mp3` — T5.31

**Extends:**
- `frontend/components/consultation/VoiceConsultRoom.tsx` — every item touches this; **Sub-batch 0 / P0.C** also surfaces a "Chat unavailable — retry" tile in the canvas-fallback branch
- `frontend/app/c/voice/[sessionId]/page.tsx` — **Sub-batch 0 / P0.C** stop silent-swallowing the companion exchange error (lines 130-139); also T1.2 / T2.9 mount order
- `frontend/app/consult/join/page.tsx` — **Sub-batch 0 / P0.B** wire patient-side video to the companion exchange (mirror voice page) and pass `companion={...}` into `<VideoRoom>`
- `frontend/lib/api.ts` — T4.25 (`getPostCallSummary`), T4.28 (`getReplayUrl` — consumes Plan 07)
- Service worker — T5.32 push handler

### Backend (~6 new files, ~5 extends)

**New:**
- `backend/src/routes/api/v1/voice-quality.ts` — T5.33
- `backend/src/services/voice-call-quality-service.ts` — T5.33
- `backend/src/services/post-call-summary-service.ts` — T4.25 (aggregation only; reuses repo queries)
- `backend/src/routes/api/v1/post-call-summary.ts` — T4.25 (`GET /:id/post-call-summary`)
- (Plan 07 owns) `backend/src/routes/api/v1/consultation.ts` `GET /:id/replay` — T4.28 consumes; doesn't ship in this batch

**Extends:**
- `backend/src/controllers/consultation-controller.ts` — **Sub-batch 0 / P0.A** modality-guard relaxation + force text-adapter mint (lines 361-378)
- `backend/src/services/notification-service.ts` — T5.32 push to doctor on `participant-connected`
- `backend/src/controllers/twilio-webhook-controller.ts` — T5.32 webhook → enqueue push
- `backend/src/services/consultation-session-service.ts` — T5.30 already-idempotent contract; no functional change

**New tests:**
- `backend/tests/integration/consultation/text-token.test.ts` — Sub-batch 0 / P0.T (patient HMAC for voice/video session → Supabase JWT → RLS-passing INSERT)

### Plan 06 system-message enum extensions (single line each)

- `'mute_changed'` — T1.8
- `'hold_changed'` — T2.11

(Owned formally by Plan 06; T1.8 + T2.11 are first consumers.)

### Schema (only one new table in the entire batch)

- `voice_call_quality` table — T5.33 only.

### What does NOT change

- No DM-copy changes (T2.12 auto-extend would have needed copy; not selected).
- No new vendor (Krisp is optional; if approved it's a Twilio plugin, no separate vendor relationship).
- No native shell (T6.36 uses PWA `MediaSession` only).
- No new authentication / authorization surface.
- No RLS rewrites (T3.23 three-way would have needed it; not selected).

---

## Acceptance for the whole batch

When all 29 items (3 P0 + 26 features) have shipped:

- [ ] **Sub-batch 0 acceptance closed** (see [§ Sub-batch 0](#sub-batch-0--companion-chat-hotfix-p0-1-day) — patient-side companion chat verified on both voice and video).
- [ ] All 26 source-plan acceptance criteria pass.
- [ ] Manual smoke: doctor + patient on different devices for a ~30-min call exercises every item without hitting a console error.
- [ ] Mobile parity verified on at least one iOS Safari device and one Chrome Android device.
- [ ] Recording continuity verified across reconnect, hold, multi-tab kick, and crash recovery.
- [ ] Backend + frontend type-check + lint clean.
- [ ] Backend + frontend test suites green.
- [ ] One docs PR adds a brief "voice consult features" runbook to `docs/Work/runbooks/` covering doctor-side "patient hasn't joined", "hold the call", "send post-call summary", "review QoS metrics".

---

## Documentation hygiene

When an item ships:

1. Mark it ✓ in this file's tier section (with date).
2. Update the source plan's `Status` row for that item from `[SELECTED 2026-04-28]` → `[SHIPPED YYYY-MM-DD]`.
3. Update the [roadmap index](../../../Product%20plans/voice-consult/plan-00-voice-consult-roadmap.md) tier row's status snapshot if the whole tier (or the selected subset) is done.
4. If an item is dropped mid-batch, add a "Dropped" row in this doc with the reason, and revert the source plan's `[SELECTED]` marker to `[DEFERRED]` with a note pointing here.

---

## References

- [Voice consult roadmap index](../../../Product%20plans/voice-consult/plan-00-voice-consult-roadmap.md)
- [T1 — Quick wins](../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)
- [T2 — Real polish](../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md)
- [T3 — Clinical workflow](../../../Product%20plans/voice-consult/plan-t3-voice-clinical-workflow.md)
- [T4 — Post-call](../../../Product%20plans/voice-consult/plan-t4-voice-post-call.md)
- [T5 — Reliability / safety](../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md)
- [T6 — Mobile native niceties](../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md)
- [Foundation: Plan 05 — Voice consultation Twilio](../../19-04-2026/Plans/plan-05-voice-consultation-twilio.md)
- [Companion: Plan 06 — Companion text channel](../../19-04-2026/Plans/plan-06-companion-text-channel.md) (system-message channel reused by T1.8 + T2.11)
- [Companion: Plan 07 — Recording replay & history](../../19-04-2026/Plans/plan-07-recording-replay-and-history.md) (T4.28 hard dep)

---

**Owner:** TBD (one or two devs depending on slicing).  
**Created:** 2026-04-28.  
**Last updated:** 2026-04-28 — added Sub-batch 0 (companion-chat hotfix) after live testing surfaced the patient-side text-token bug.  
**Status:** Drafted; awaiting commit-start. Recommended order: **Sub-batch 0 first** (single-day P0 hotfix unblocking Plan 06 Decision 9 on patient side for both voice and video), then A → B → C. Tell me which to start with and I'll switch to Agent mode and begin.
