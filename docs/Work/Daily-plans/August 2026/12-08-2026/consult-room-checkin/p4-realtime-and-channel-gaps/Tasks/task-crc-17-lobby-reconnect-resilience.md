# Task crc-17: Lobby reconnect + network-drop resilience

## 13 Aug 2026 — Batch [p4-realtime-and-channel-gaps](../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md) — Wave 3 — **M, ~3h**

---

## Task overview

Patients sit in the lobby for up to 30 minutes on a phone, on mobile data, with the screen locking. Today a network blip means failed polls, a failed heartbeat, a **Stepped away** tag on the doctor's board, and — worst case — a patient staring at a stale screen while the doctor starts without them.

Make the lobby survive a drop (CRC4-D6).

**Estimated time:** ~3h
**Status:** ✅ Code done 2026-08-13 — founder 30s-drop smoke is crc-18.
**Hard deps:** crc-15 merged — reconnect must cover both the poll and Realtime paths.
**Source:** CRC-D8, CRC-D9, CRC4-D3, CRC4-D6.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `frontend/app/consult/join/page.tsx` — lobby as restructured by crc-10.
- `frontend/app/c/voice/[sessionId]/page.tsx` — voice lobby after crc-12.
- `frontend/components/opd/PatientVisitSession.tsx` — poll + heartbeat after crc-07/crc-08.
- crc-14's presence channel client.
- `backend/src/utils/lobby-presence.ts` — `LOBBY_FRESH_MS = 2 * 60 * 1000`; the window you are trying to stay inside.

**Estimated turns:** 3–4.

---

## Acceptance criteria

### 1. Survive the drop

- [x] Network loss in the lobby does **not** navigate away, blank the screen, or drop to an error page. The last known state stays rendered.
- [x] A calm, non-alarming offline indicator appears. This is a patient about to see a doctor — "Reconnecting…" not a red error.
- [x] On recovery: heartbeat resumes, snapshot/token poll refetches **immediately**, and the presence channel resubscribes. Do not wait for the next scheduled tick.
- [x] A drop shorter than the 2-minute freshness window must not produce a **Stepped away** tag once recovered. Recovery inside the window should be invisible to the doctor.

### 2. Backoff, don't hammer

- [x] Failed polls and heartbeats back off rather than retrying at full cadence against a dead network. Return to normal cadence on recovery.
- [x] Backoff must not exceed the 2-minute freshness window while the tab is visible — backing off to 3 minutes would mark a present patient as stepped away, which is worse than the retries.

### 3. Screen lock and background

- [x] Returning from a locked screen or a backgrounded tab triggers an immediate heartbeat **and** an immediate refetch (this is the same trigger as p2's visibility handling — reuse it, do not add a second listener).
- [x] If the doctor started while the patient was backgrounded, the patient is pulled into the call on return without a manual tap.

### 4. Don't lose the device check

- [x] A reconnect must not discard the completed device check from p3. The patient re-verifying their camera because their train went through a tunnel defeats the whole phase.

### Out of scope

- Server-side "patient disconnected" events or any new server state (CRC4-D6).
- In-call reconnect — Twilio owns that and it is not a lobby concern.
- Changing the 2-minute freshness constant.

---

## Scope Guard

- Expected files touched: **≤ 6** (join page, voice page, `/my-visit`, a shared reconnect/backoff hook, tests).
- **DO NOT** add a backend endpoint or column.
- **DO NOT** change `LOBBY_FRESH_MS`.
- **DO NOT** add a second visibility listener — extend p2's.

---

## Done when

- A ~30s drop self-recovers with the patient still checked in and no Stepped-away flicker; recovery refetches immediately rather than on the next tick; the p3 device check survives; backoff stays inside the freshness window; tests + typecheck + lint green.

## Implementation (2026-08-13)

- Shared `useLobbyReconnect` owns the 5s timer, visibility listener (replaces p2's on `/my-visit` — no second listener), and `online`/`offline`. Failed ticks exponential-backoff, cap **90s** (`LOBBY_RECONNECT_MAX_MS`) so retries cannot themselves mark the patient stepped-away (`LOBBY_FRESH_MS` is unchanged at 2 min).
- Surfaces: video join lobby, voice holding/precall, `/my-visit`. Overlay is amber **Reconnecting…** (`role="status"`); last lobby UI stays. Heartbeat and token/companion poll throw so backoff works; snapshot is best-effort when a last snapshot exists.
- Presence channel `enabled: inLobby && isOnline` so offline tears it down and recovery remounts. `lobbyCheckDone` is never reset by a tick.
- Tests: backoff cap < 120s; failure → reconnecting; immediate tick on `online` and `visibilitychange → visible`; hidden skips ticks.
