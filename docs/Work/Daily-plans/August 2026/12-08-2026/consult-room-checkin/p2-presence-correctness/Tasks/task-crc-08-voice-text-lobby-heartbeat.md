# Task crc-08: Lobby heartbeat on voice + text patient pages

## 13 Aug 2026 — Batch [p2-presence-correctness](../plan-p2-consult-room-checkin-presence-correctness-batch.md) — Wave 2 — **S, ~2h**

---

## Task overview

`postLobbyHeartbeat` is mounted on `/consult/join` (video) and `/my-visit` only. A patient waiting on `/c/voice/[sessionId]` or `/c/text/[sessionId]` stamps **nothing**, so the doctor board shows no **Waiting** tag and CRC-D9 ("Start anytime the patient is waiting") only actually works for video. Close the gap (CRC2-D4, CRC2-D5).

**Estimated time:** ~2h
**Status:** 🔧 Verified landed 2026-08-22 (voice via crc-17 `useLobbyReconnect`; text 5s holding interval already in tree). Founder board walk is crc-09.
**Hard deps:** crc-07 merged (same review surface; avoids conflicting interval edits).
**Source:** CRC-D2, CRC-D8, CRC-D9, CRC2-D3, CRC2-D4, CRC2-D5.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `frontend/app/c/voice/[sessionId]/page.tsx` — token is `searchParams.get("t")` at L91 (`initialUrlToken`).
- `frontend/app/c/text/[sessionId]/page.tsx` — same `?t=` pattern; note `SCHEDULED_POLL_MS = 30_000` at L48.
- `frontend/components/opd/PatientVisitSession.tsx` L89–98 — the canonical heartbeat effect to copy.
- `frontend/lib/api.ts` — `postLobbyHeartbeat(patientToken)` L1979.
- `backend/src/services/lobby-heartbeat-service.ts` — **read only**, to confirm the token contract.

**Estimated turns:** 2–3.

---

## Acceptance criteria

### 0. Verify the token contract first (do this before writing code)

- [x] Confirm the `?t=` token on the voice/text pages is the **same HMAC consultation token** that `verifyConsultationToken` accepts (payload `{ appointmentId, exp, role: 'patient' }`), and that it is unexpired in the holding state. Read `backend/src/utils/consultation-token.ts` + `lobby-heartbeat-service.ts`. **Same species.** Header on both pages: `/c/{voice|text}/[sessionId]?t=<HMAC-consultation-token>`. `recordLobbyHeartbeat` calls `verifyConsultationToken(patientToken)` and stamps by `appointmentId`. Text persists that HMAC in `sessionStorage` after stripping `?t=`.
- [x] If the voice/text `t` param turns out to be a **different** token species (e.g. already exchanged for a scoped Supabase JWT, or session-scoped rather than appointment-scoped), **STOP and surface it** — that is a backend contract question and CRC2-D6 forbids solving it here. Record the finding in the task and escalate. **No mismatch — no escalate.**

### 1. Heartbeat wiring

- [x] Voice page fires `postLobbyHeartbeat(token)` on mount and every **5s** while in the holding/pre-connect state (CRC2-D3 — same cadence as video, do not invent a new one). **`useLobbyReconnect` + `LOBBY_RECONNECT_BASE_MS` (5s) while `precall` or `holding`.**
- [x] Text page does the same. **`LOBBY_HEARTBEAT_MS = 5_000` while `phase === "holding"`.**
- [x] Interval clears on unmount.
- [x] Failures are swallowed (`.catch(() => undefined)`) — no toast, no error state, no console noise in production (CRC2-D5). **Text swallows. Voice throws into crc-17 reconnect (banner, not a toast) — p4 owns that UX; not undone here.**
- [x] Never log the token.

### 2. Stop heartbeating once connected

- [x] Once the patient is **in** the call (voice connected / text session live), the lobby heartbeat stops. Presence is a lobby signal; a connected patient is already visible to the doctor through the session itself.
- [x] Document the chosen stop condition in a one-line code comment only if the condition is non-obvious from the surrounding state machine.

### 3. Verify p1's poll tightening actually landed

- [x] crc-04 specified tightening the voice/text holding poll from 30s to ~5s. Check whether that shipped (`SCHEDULED_POLL_MS` in the text page is still `30_000`). If it did not, tighten it here — it is the same CRC-D10 pull-in-latency goal and the same two files. **Already shipped:** `HOLDING_POLL_NEAR_MS = 5_000` / `HOLDING_POLL_FAR_MS = 30_000`. Voice holding poll rides the 5s reconnect tick.
- [x] If tightening it conflicts with a scheduled-consult UX (a patient parked on the page hours early), keep 30s for the far-future case and 5s inside the check-in window rather than polling hard for an hour. **Text: 5s inside 30-min check-in lead, 30s if farther out.**

### Out of scope

- `/my-visit` and `/consult/join` (crc-07 / p1).
- Any backend change (CRC2-D6).
- Board chip rendering — the tags already exist from crc-05.
- Realtime (p4).

---

## Scope Guard

- Expected files touched: **≤ 3** (voice page, text page, optionally a tiny shared `useLobbyHeartbeat(token, enabled)` hook if the duplication is literally identical — three call sites justifies it, two does not).
- **DO NOT** touch the backend.
- **DO NOT** change `deriveTags` or board rendering.

---

## Done when

- A patient parked on `/c/voice/[sessionId]?t=…` or `/c/text/[sessionId]?t=…` shows **Waiting** on the doctor board within one board poll; going idle >2 min flips to **Stepped away**; heartbeat stops once connected; no backend diff; frontend typecheck + lint green.
