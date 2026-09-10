# Task crc-10: Hoist the device pre-check into the lobby

## 13 Aug 2026 — Batch [p3-device-precheck](../plan-p3-consult-room-checkin-device-precheck-batch.md) — Wave 1 — **L, ~5–6h**

---

## Task overview

Today the patient does their camera/mic check **after** the doctor clicks Start, because the rich pre-call screen only renders at `step === 'precall'` while the lobby renders a bare text card. Move the check into the waiting time, cache the result, and auto-connect straight into the room (CRC3-D1, CRC3-D2, CRC3-D3).

This is the task that makes the charter's success metric — "doctor clicks Start → sees patient within ~0–5s" — actually true for video.

**Estimated time:** ~5–6h
**Status:** ⏳ Pending
**Hard deps:** p2 closed (heartbeat behaviour is settled).
**Source:** CRC-D1, CRC-D7, CRC-D10, CRC1-D5, CRC1-D6, CRC3-D1…D4.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet. Escalate a single message to **Opus** if the `status` × `step` state machine fights you — do not switch the whole chat.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `frontend/app/consult/join/page.tsx` — the whole file. Key anchors: token exchange + lobby poll effect (~L400–490), `status === 'lobby'` branch L502–528, `step === 'precall'` branch L572–618, `handlePreCallContinue` L153, `handlePreCallSkipMic` L166.
- `frontend/components/consultation/VideoConsultPreCall.tsx` — read the file-level doc block (L1–51); it states the permission matrix and what is deliberately out of scope.
- `frontend/components/consultation/VideoConsultLobbyHeader.tsx`, `VideoConsultLobbyCountdown.tsx`.
- `frontend/hooks/useCameraDevices.ts`, `frontend/lib/audio/mic-meter.ts` — existing primitives; **reuse, do not reimplement**.
- `frontend/components/consultation/VideoRoom.tsx` — how chosen device IDs are threaded into `createLocalTracks`.

**Estimated turns:** 5–7.

---

## Acceptance criteria

### 1. Lobby renders the device check

- [ ] The `status === 'lobby'` branch renders the same chrome the pre-call step does today: `VideoConsultLobbyHeader`, `VideoConsultLobbyCountdown`, `VideoConsultPreCall`, `CellularDataWarning`.
- [ ] Keep the lobby's reassurance copy ("Stay on this page. We'll open the call as soon as the doctor starts.") — the patient needs to know the wait is expected. Do not lose it in the restructure.
- [ ] **No Twilio connect and no room creation** from this path (CRC-D1). `getUserMedia` only.
- [ ] The 5s lobby poll and the 5s heartbeat both keep running while the check is on screen. Running the device check must not pause presence.

### 2. Cache the verified choice

- [ ] Completing the check in the lobby records "device check done" plus the chosen `cameraId` / `micId` in component state.
- [ ] `VideoConsultPreCall` already persists device IDs to `localStorage` (`video-precall-camera-id`, `video-precall-mic-id`). **Reuse that**; do not add a parallel persistence layer.
- [ ] "Skip mic check" is treated as a completed check with `micId = null` — the patient made a choice.

### 3. Auto-connect skips the gate

- [ ] When the lobby poll flips to live **and** the lobby check was completed → go straight to `VideoRoom` with the cached device IDs. No second Continue tap (CRC3-D2).
- [ ] When the patient arrives **after** Start (no lobby check completed) → the existing `step === 'precall'` gate renders exactly as it does today (CRC3-D3).
- [ ] The transition into the room does not re-prompt for permissions when they were already granted in the lobby.

### 4. Degraded paths still join

- [ ] Camera denied → preview shows the blocked placeholder, Continue still works, patient joins audio-only.
- [ ] Mic denied → bars stay dead, Continue passes `micId = null`, inline hint shows.
- [ ] Both denied → the retry affordance renders **and** the patient can still wait in the lobby and be pulled in. A denied permission must never strand them on a dead-end screen (CRC3-D4).
- [ ] A patient who never interacts with the check at all is still auto-connected on Start, using browser defaults. Never require the check to have been completed in order to be pulled in.

### 5. Tests

- [ ] Unit/component coverage for: lobby renders pre-call; completed-check + live → room without gate; no-check + live → gate; each permission-denied path reaches a join.

### Out of scope

- Connection/bandwidth probe (crc-11).
- Voice (crc-12).
- Reporting readiness to the doctor board (CRC3-D5).
- Doctor's display name (CRC3-D6).
- Any backend change.

---

## Scope Guard

- Expected files touched: **≤ 5** (join page, possibly small prop additions to the lobby chrome components, tests). If `VideoConsultPreCall` itself needs structural surgery, **stop and split** — it is a shipped, tested component with a documented permission matrix.
- **DO NOT** create Twilio rooms from the lobby path.
- **DO NOT** change the permission matrix.
- **DO NOT** touch the heartbeat or poll cadences settled in p2.

---

## Done when

- Opening a video link before Start shows the device check; no Twilio room exists until Start; doctor Start → patient is in the call with their chosen devices and zero extra taps; late openers still get the gate; every permission-denied combination still reaches a join; tests + typecheck + lint green.
