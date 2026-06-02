# Tasks: Voice consult — Selected features batch (2026-04-28)

**Initiative status:** **Sub-batch 0 (video companion gate) — implementation complete (2026-04-30).** Remaining voice tasks (A–C) are **Drafted**; per the execution order, recommended next is **task-voice-A1** (Wave 1 Lane α, Composer 2 Fast warm-up).

**▶ Execution order (who-runs-what-when + model picks):** [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) — wave plan, lane assignment, per-task model recommendation (Auto / Composer 2 / Opus 4.7), acceptance gates, cost estimate. **Read this before opening any task file.** Documents the foundation work video Sub-batches E.5 / E.6 / F.4 / F.5 already shipped that voice C4 / C5 / C6 / C10 now just mount.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — when to escalate to Opus, when Auto suffices, when Composer 2 Fast wins. The hard-rules list drives B5 + C2 → Opus in this batch.

**Wave / lane conventions:** [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — the shape every exec-order doc must follow.

**Parent batch plan:** [plan-voice-consult-selected-features.md](../Plans/plan-voice-consult-selected-features.md)
**Sibling batches:**
- **Text** ([README.md (text consult tasks)](../text/README.md)) — Sub-batch D's `task-text-D6a-web-push-migration-and-service.md` is the cross-batch coordination point for **task-voice-C3** (browser-push when remote joins). Sibling exec-order: [EXECUTION-ORDER-text.md](../text/EXECUTION-ORDER-text.md).
- **Video** ([README-video.md](./README-video.md)) — historical retrospective exec-order: [EXECUTION-ORDER-video.md](./EXECUTION-ORDER-video.md). Video Sub-batches E.5 / E.6 / F.4 / F.5 shipped modality-agnostic foundations this batch consumes.

**Source product plans (single source of truth for each item's contract):**

- [Voice T1 — Quick wins](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)
- [Voice T2 — Real polish](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md)
- [Voice T3 — Clinical workflow](../../../../Product%20plans/voice-consult/plan-t3-voice-clinical-workflow.md)
- [Voice T4 — Post-call](../../../../Product%20plans/voice-consult/plan-t4-voice-post-call.md)
- [Voice T5 — Reliability / safety](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md)
- [Voice T6 — Mobile native niceties](../../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md)
- [Voice consult roadmap index](../../../../Product%20plans/voice-consult/plan-00-voice-consult-roadmap.md)

**Foundation invariants every task respects** (DO NOT subvert):

- **`safe_uuid_sub()`** in every new RLS policy ([plan-f04](../../../../Product%20plans/text-consult/plan-f04-text-foundation-status.md)) — applies whether the new RLS lives in voice or text schema.
- **Plan 06 Decision 9** — every voice/video session must carry a working companion text channel on **both** doctor AND patient sides (the bug Sub-batch 0 fixes).
- **Three-host parity** — voice surface ships in `standalone` (mobile patient) / `panel` (split-with-chat) / `canvas` (canvas-fallback when chat unavailable) layouts.
- **Plan 07 `mode='readonly'`** — post-call summary, recording playback, and any future replay surface use readonly mounts; new mutation affordances introduced in Sub-batch B never fire in readonly.
- **Principle 8 (medical UX)** — no PSTN-phone metaphors. Ringtone is a 0.5 s soft "ding"; disconnect splash is informational not alarming.
- **No PHI in logs** — call quality telemetry, push payloads, and any new logs do not carry message body, patient identifiers beyond session ID, or audio content.

**Prefix:** `task-voice-XN-` where `X` is the sub-batch (`0` / `A` / `B` / `C`) and `N` is the order within the sub-batch. Sub-batch 0 is the P0 hotfix and ships first; C ships last.

---

## Dependency graph (recommended order)

```text
Sub-batch 0 — P0 companion-chat hotfix. ~1 day. HARD GATE for everything below.
  0A (backend: relax modality guard in exchangeTextConsultTokenHandler;
      force text-adapter mint so JWT type matches)         ── 30 min
       │
       ├──► 0T (backend integration test: patient HMAC →   ── 1h; would have
       │      /text-token for voice/video → RLS-passing      caught the bug
       │      INSERT)                                        the day Plan 06
       │                                                     shipped
       │
       ├──► 0B (frontend: patient /consult/join wires the   ── 3h; mirrors
       │      companion exchange + passes companion= to       voice page
       │      VideoRoom)                                      pattern
       │
       └──► 0C (frontend: stop silent-swallowing the         ── 1h; surfaces
              companion exchange failure on both voice         "Chat unavailable
              + video patient pages)                            — retry" tile
       │
       ▼
Sub-batch A — "Polished call". 9 frontend items, no schema, one Plan 06 enum touch.
  A1 (T1.1 — duration timer)             ──┐
  A2 (T1.5 — end-call confirm modal)     ──┤
  A3 (T1.4 — mic-level meter)            ──┤  Items independent of each other;
  A4 (T1.3 — network-quality bars)       ──┤  sequence smallest-first if solo.
  A5 (T1.6 + T1.7 — audio output picker; ──┤  A8 consumes A1 + A4.
       shared useAudioOutputDevice hook)   │
  A6 (T1.2 — pre-call mic check screen)  ──┤
  A7 (T1.8 — counterparty mute notif;     ──┤  Plan 06 enum: 'mute_changed'.
       requires Sub-batch 0 complete)      │
  A8 (T2.10 — caller-card header)        ──┘  Consumes A1 timer + A4 bars.
       │
       ▼
  A9 (T2.16 — disconnect-reason splash)      Standalone; ship any time in A.

Sub-batch B — "Robust call". 6 items. Some backend; no schema.
  B1 (T2.15 — reconnection UX banner)              ── frontend; useTwilioReconnectState hook
       │
       ▼
  B2 (T2.9 — pre-call lobby; extends A6)           ── consumes A6 mic-check
       │
       ▼
  B3 (T2.11 — hold call; Plan 06 'hold_changed')   ── requires Sub-batch 0
       │
       ▼
  B4 (T2.13 — volume slider + ×1.5 amplitude       ── WebAudio gainNode
       boost via WebAudio gainNode)
       │
       ▼
  B5 (T4.25 — post-call summary screen;            ── reads A9 disconnect reason
       backend GET /:id/post-call-summary)            + Plan 07 recording flag
       │
       ▼
  B6 (T4.28 — recording playback link;             ── HARD-DEP on Plan 07
       gated on Plan 07; ships as disabled            GET /:id/replay; degrades
       placeholder if Plan 07 not yet shipped)        to placeholder otherwise

Sub-batch C — "Production-grade". 10 items. Includes the only schema work
              in the entire batch + the Krisp/RNNoise vendor decision.
  C1 (T5.31 — audible ringtone on patient join)    ── 2h; cheapest item; ship first
       │
       ▼
  C2 (T5.33 — QoS health metrics:                  ── ONE migration:
       voice_call_quality table + 30s sampling +     0XX_voice_call_quality.sql
       backend ingest endpoint + frontend reporter)
       │
       ▼
  C3 (T5.32 — browser-push when remote joins;      ── CONSUMES text-consult
       reuses text-consult D6a's                      D6a's web_push_subscriptions
       push-notification-service.ts)                  + service. If text D6a
                                                      hasn't shipped, C3 ships
                                                      it instead (file ownership
                                                      = whichever batch lands
                                                      first).
  C4 (T5.29 — multi-tab/multi-device kick;         ── Coordinate with C5;
       Supabase Realtime presence)                    cache must respect kick.
       │
       ▼
  C5 (T5.30 — crash-recovery rejoin;               ── sessionStorage token cache;
       sessionStorage token cache + idempotent        if THIS tab was kicked,
       backend rejoin)                                cache must not be reused.

  C6 (T6.35 — hardware volume key verification)    ── 1h; smoke-only

  C7 (T6.34 — Bluetooth/AirPods auto-relay;        ── extends A5
       extends A5's useAudioOutputDevice hook)        useAudioOutputDevice

  C8 (T6.37 — proximity sensor auto-screen-off;    ── Chrome Android only
       useProximityWakeLock hook)

  C9 (T3.19 — background-noise suppression;        ── VENDOR DECISION required
       Krisp ($150/mo) vs RNNoise (free) vs           before commit-start
       per-doctor opt-in)                             (decision §9 in batch plan)

  C10 (T6.36 — Android persistent foreground       ── L item; PWA
        notification via PWA MediaSession API)       MediaSession ONLY; no
                                                     Capacitor/RN shell
```

**Cross-batch coordination point:**

- **C3 ↔ text-consult D6a/b/c.** Both batches ship Web Push for the same user. The push-notification-service.ts file + `web_push_subscriptions` table + VAPID keys are shared infrastructure. **Whichever batch ships first owns the file**; the other batch consumes. Set the `tag` to `session_id:{modality}` so text and voice pushes don't replace each other in the OS tray.

---

## Task index (29 implementation tasks + this README)

### Sub-batch 0 — P0 companion-chat hotfix (4 tasks, ~1 day)

| Order | Task file | Item | Effort | Files touched | Status |
|------:|-----------|------|-------:|---------------|--------|
| 0A | [task-voice-0A-relax-modality-guard.md](./task-voice-0A-relax-modality-guard.md) | P0.A | 30 min | `backend/src/controllers/consultation-controller.ts` | ✅ Complete |
| 0T | [task-voice-0T-text-token-integration-test.md](./task-voice-0T-text-token-integration-test.md) | P0.T | 1h | `backend/tests/integration/consultation/text-token.test.ts` (new) | ✅ Complete |
| 0B | [task-voice-0B-patient-video-companion-wiring.md](./task-voice-0B-patient-video-companion-wiring.md) | P0.B | 3h | `frontend/app/consult/join/page.tsx` | ✅ Complete |
| 0C | [task-voice-0C-companion-error-surfacing.md](./task-voice-0C-companion-error-surfacing.md) | P0.C | 1h | `frontend/app/c/voice/[sessionId]/page.tsx`, `frontend/components/consultation/VoiceConsultRoom.tsx` | ✅ Complete |

### Sub-batch A — "Polished call" (9 tasks, ~5 days)

| Order | Task file | Item | Effort |
|------:|-----------|------|-------:|
| A1 | [task-voice-A1-duration-timer.md](./task-voice-A1-duration-timer.md) | T1.1 | 30 min |
| A2 | [task-voice-A2-end-call-confirmation.md](./task-voice-A2-end-call-confirmation.md) | T1.5 | 45 min |
| A3 | [task-voice-A3-mic-level-meter.md](./task-voice-A3-mic-level-meter.md) | T1.4 | 2h |
| A4 | [task-voice-A4-network-quality-bars.md](./task-voice-A4-network-quality-bars.md) | T1.3 | 2h |
| A5 | [task-voice-A5-audio-output-device-picker.md](./task-voice-A5-audio-output-device-picker.md) | T1.6 + T1.7 | 5h (combined) |
| A6 | [task-voice-A6-precall-mic-check.md](./task-voice-A6-precall-mic-check.md) | T1.2 | 3h |
| A7 | [task-voice-A7-counterparty-mute-notification.md](./task-voice-A7-counterparty-mute-notification.md) | T1.8 | 2h |
| A8 | [task-voice-A8-caller-card-header.md](./task-voice-A8-caller-card-header.md) | T2.10 | 4h |
| A9 | [task-voice-A9-disconnect-reason-splash.md](./task-voice-A9-disconnect-reason-splash.md) | T2.16 | 3h |

### Sub-batch B — "Robust call" (6 tasks, ~8 days)

| Order | Task file | Item | Effort |
|------:|-----------|------|-------:|
| B1 | [task-voice-B1-reconnection-ux.md](./task-voice-B1-reconnection-ux.md) | T2.15 | 6h |
| B2 | [task-voice-B2-precall-lobby.md](./task-voice-B2-precall-lobby.md) | T2.9 | 5h |
| B3 | [task-voice-B3-hold-call.md](./task-voice-B3-hold-call.md) | T2.11 | 5h |
| B4 | [task-voice-B4-volume-slider-and-boost.md](./task-voice-B4-volume-slider-and-boost.md) | T2.13 | 4h |
| B5 | [task-voice-B5-post-call-summary.md](./task-voice-B5-post-call-summary.md) | T4.25 | 2 days |
| B6 | [task-voice-B6-recording-playback-link.md](./task-voice-B6-recording-playback-link.md) | T4.28 | 1 day |

### Sub-batch C — "Production-grade" (10 tasks, ~17 days)

| Order | Task file | Item | Effort |
|------:|-----------|------|-------:|
| C1 | [task-voice-C1-audible-ringtone.md](./task-voice-C1-audible-ringtone.md) | T5.31 | 2h |
| C2 | [task-voice-C2-qos-health-metrics.md](./task-voice-C2-qos-health-metrics.md) | T5.33 | 3 days (incl. migration) |
| C3 | [task-voice-C3-browser-push-remote-joins.md](./task-voice-C3-browser-push-remote-joins.md) | T5.32 | 2 days (consumes text D6a) |
| C4 | [task-voice-C4-multi-tab-kick.md](./task-voice-C4-multi-tab-kick.md) | T5.29 | 3 days |
| C5 | [task-voice-C5-crash-recovery-rejoin.md](./task-voice-C5-crash-recovery-rejoin.md) | T5.30 | 3 days |
| C6 | [task-voice-C6-hardware-volume-key.md](./task-voice-C6-hardware-volume-key.md) | T6.35 | 1h |
| C7 | [task-voice-C7-bluetooth-airpods-relay.md](./task-voice-C7-bluetooth-airpods-relay.md) | T6.34 | 2 days |
| C8 | [task-voice-C8-proximity-sensor.md](./task-voice-C8-proximity-sensor.md) | T6.37 | 3 days |
| C9 | [task-voice-C9-noise-suppression.md](./task-voice-C9-noise-suppression.md) | T3.19 | 3 days |
| C10 | [task-voice-C10-android-foreground-notification.md](./task-voice-C10-android-foreground-notification.md) | T6.36 | 1 week |

---

## Convention reminders

- Every task file has its own **Acceptance criteria**, **Out of scope**, **Files touched**, **Notes / open decisions**, **References**.
- The **Source plan** (T1 / T2 / ... section) remains the contract; if there's a conflict between this README's effort estimate and the source plan, source plan wins.
- **Plan 06 enum extensions** (`mute_changed`, `hold_changed`) are owned by Plan 06 formally; the consuming task file (A7 for `mute_changed`, B3 for `hold_changed`) carries the actual one-line enum addition.
- **Cross-batch share** for C3 ↔ text-consult D6a — the `push-notification-service.ts` and migration `0XX_web_push_subscriptions.sql` ship in whichever batch lands first; coordinate at PR time.
- **Vendor decision for C9** (Krisp vs RNNoise) blocks C9 commit-start. Recommendation in batch plan §9: Krisp behind per-doctor opt-in, defaulted ON.

---

**Owner:** TBD (one or two devs depending on slicing).  
**Created:** 2026-04-29.  
**Status:** Drafted; **start with Sub-batch 0** (P0 hotfix, single day). Then A → B → C. Total ~32 dev-days at solo pace.
