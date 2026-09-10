# Task crc-15: Doctor board instant presence

## 13 Aug 2026 — Batch [p4-realtime-and-channel-gaps](../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md) — Wave 2 / Lane α — **M, ~4h**

---

## Task overview

Consume crc-14's presence channel on the OPD board so **Waiting** appears in under ~2s instead of on the next 30s poll. The poll stays as the fallback and the source of truth (CRC4-D2, CRC4-D3).

**Estimated time:** ~4h
**Status:** ✅ Code done 2026-08-13 — poll remains the source of truth.
**Hard deps:** crc-14 merged — the channel topic and payload contract must be locked before this starts.
**Source:** CRC-D8, CRC4-D1, CRC4-D2, CRC4-D3.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- crc-14's channel contract module (topic format + payload type).
- `frontend/components/opd/OpdTodayClient.tsx` — the 30s poll and board composition.
- `frontend/hooks/queries/useOpdSessionQuery.ts` — React Query poll config.
- `frontend/lib/query/polling.ts` — `POLL_INTERVAL.COUNTS`, `pollingOptions`.
- `backend/src/services/opd/opd-slot-status.ts` L119–125 and `backend/src/services/opd-doctor-service.ts` L173–179 — where `patient_waiting` / `patient_stepped_away` are derived server-side.
- The board chip components from crc-05.

**Estimated turns:** 3–5.

---

## Acceptance criteria

### 1. Instant signal

- [x] The board subscribes to the presence channel for the appointments currently on screen.
- [x] A patient entering the lobby flips their row to **Waiting** in under ~2s, without waiting for the poll.
- [x] The chip rendering is **identical** to crc-05's. Realtime changes *when* the tag appears, never *how* it looks. A doctor must not be able to tell which transport delivered it.

### 2. Poll remains authoritative

- [x] The 30s poll continues unchanged and its server-derived tags **win** on every refresh. Realtime is an optimistic overlay that the next poll reconciles (CRC4-D2).
- [x] Stale-away transitions still come from the server's 2-minute freshness rule (CRC-D8). Do not reimplement the freshness window client-side — a client-side timer would drift from `resolveLobbyPresence` and produce two different truths.

### 3. Degradation is invisible

- [x] Blocking websockets leaves the board fully functional on the poll path (CRC4-D3).
- [x] Subscription failure, drop, or reconnect surfaces **no error** to the doctor. No toast, no banner, no red dot.
- [x] Subscriptions are cleaned up on unmount and on date change — no leaked channels when the doctor pages through days.

### 4. Scale sanity

- [x] A board with a full day of appointments does not open one channel per row if that is avoidable. Prefer a single doctor-scoped topic over N appointment-scoped ones; if crc-14's contract forces per-appointment topics, cap concurrent subscriptions to the visible rows and document the cap.

### 5. Tests

- [x] Coverage for: presence event flips the chip; poll result overrides the optimistic state; subscribe failure leaves poll behaviour intact.

### Out of scope

- Changing server-side tag derivation.
- Device readiness on the board (deferred, CRC3-D5).
- Patient-side channel work (crc-14).
- Reconnect (crc-17).

---

## Scope Guard

- Expected files touched: **≤ 6** (board client, a presence subscription hook, tests).
- **DO NOT** change `deriveTags` or any backend file.
- **DO NOT** reduce or remove the 30s poll.
- **DO NOT** reimplement the 2-minute freshness rule on the client.

---

## Done when

- Waiting appears in <2s; the poll still reconciles and wins; websockets blocked leaves the board working with no doctor-visible error; no channel leaks across date changes; tests + typecheck + lint green.

## Implementation (2026-08-13)

- crc-14 topics are appointment-scoped, so the board cannot use one doctor channel. **Cap: 40** soonest-scheduled rows for the viewed date (`LOBBY_PRESENCE_BOARD_MAX_CHANNELS`). Past dates do not subscribe.
- Overlay adds the existing `patient_waiting` tag only. Chip components are untouched.
- Each poll snapshot (`dataUpdatedAt`) clears the overlay so server tags win. Stepped-away still comes only from the server freshness rule — no client timer.
- Subscribe / websocket failure is silent; the 30s poll is unchanged.
