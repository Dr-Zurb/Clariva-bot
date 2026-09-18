# Task crc-04: Video lobby + auto-connect (+ heartbeat wiring)

## 12 Aug 2026 — Batch [p1-lobby-presence](../plan-p1-consult-room-checkin-lobby-presence-batch.md) — Wave 4 — **L, ~4–5h**

---

## Task overview

Video patients who open the join link before Start currently error out. Match voice/text holding UX, fire heartbeat, and auto-enter the room when the doctor starts (CRC-D7, CRC1-D5, CRC1-D6).

**Estimated time:** ~4–5h  
**Status:** ⏳ Pending  
**Hard deps:** crc-02 (heartbeat API). crc-03 optional for end-to-end DM.  
**Source:** CRC-D1, CRC-D7, CRC-D10, CRC1-D5, CRC1-D6.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `backend/src/services/appointment-service.ts` — `getConsultationTokenForPatient` (~L1879 “has not been started”)
- `frontend/app/consult/join/page.tsx`
- `frontend/app/c/voice/[sessionId]/page.tsx` (holding + 30s poll — tighten to ~5s in lobby per CRC-D10)
- `frontend/app/c/text/[sessionId]/page.tsx`
- Existing lobby pieces: `VideoConsultLobbyCountdown`, `VideoConsultPreCall`, voice pre-lobby
- Heartbeat client call site from crc-02

---

## Acceptance criteria

### 1. Backend — video early exchange

- [ ] When consultation not started, **do not throw** a hard failure for patient HMAC exchange.
- [ ] Return a structured lobby payload, e.g. `{ status: 'lobby', appointmentId, scheduledStartAt, … }` without Twilio JWT.
- [ ] When started / live, existing token path unchanged.
- [ ] Slot join window (`assertSlotJoinAllowedForPatient`): lobby entry should be allowed in the check-in window (at least from T−lead). Document whether grace-past-end still applies for lobby vs media. **Media join** still respects policy; lobby can be looser for checked-in patients (CRC-D9).
- [ ] Unit/integration coverage for lobby vs live responses.

### 2. Frontend — video lobby

- [ ] `/consult/join` renders holding UI when `status === 'lobby'` (reuse voice copy patterns: scheduled time, “Waiting for the doctor…”, device prep if already available without Twilio connect).
- [ ] Poll session/token endpoint ~**5s** while in lobby (CRC-D10).
- [ ] Call lobby heartbeat on enter + on each successful poll (or dedicated interval).
- [ ] When status becomes live / token available → **auto-connect** into `VideoRoom` without requiring a second “Join” click (CRC1-D6). Optional one-time “Allow camera” browser prompt is fine.

### 3. Voice + text alignment

- [ ] Wire heartbeat into existing voice/text holding screens.
- [ ] Prefer auto-connect on `live` if not already (voice/text already transition — ensure no extra tap).
- [ ] Poll interval in holding state ~5s (was 30s) for p1 pull-in latency.

### Out of scope

- Board chips (crc-05).
- Realtime (p2).
- Device quality scoring (p3).
- Changing doctor Start APIs.

---

## Scope Guard

- Touch video join page + token service path + voice/text holding poll/heartbeat. Stay off cockpit doctor launcher unless required for status polling helpers.
- **DO NOT** create Twilio rooms from the lobby path.

---

## Done when

- Opening video link before Start shows lobby; heartbeat stamps; Start → patient in call without second CTA; tests for lobby payload green.
