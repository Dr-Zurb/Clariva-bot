# Task crc-02: Heartbeat API + presence tags

## 12 Aug 2026 — Batch [p1-lobby-presence](../plan-p1-consult-room-checkin-lobby-presence-batch.md) — Wave 2 — **M, ~3–4h**

---

## Task overview

Patient lobby pages need a way to stamp presence. Doctor board needs tags derived from those stamps (CRC-D2, CRC-D8).

**Estimated time:** ~3–4h  
**Status:** ⏳ Pending  
**Hard deps:** crc-01 applied (types exist).  
**Source:** CRC-D2, CRC-D8, CRC-D9, CRC1-D2, CRC1-D7.

---

## Model & execution guidance

**Recommended model:** Auto after crc-01; **Opus** if you touch RLS or expand past Scope Guard.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `backend/src/utils/consultation-token.ts`
- `backend/src/controllers/consultation-controller.ts` (HMAC exchange patterns)
- `backend/src/routes/api/v1/consultation.ts` or bookings/opd-session routes (pick existing patient HMAC surface)
- `backend/src/services/opd/opd-slot-status.ts` (`deriveTags`, `SlotTag`)
- `backend/src/services/opd-slot-session-service.ts` / `opd-doctor-service.ts` (what fields reach the board)
- `backend/src/services/opd/opd-snapshot-service.ts` (patient snapshot)
- Frontend tag types if mirrored (`frontend/components/opd/shared/slotAxes.ts` or types)

---

## Acceptance criteria

### 1. Heartbeat endpoint

- [ ] `POST` (or `PATCH`) patient-authenticated endpoint, e.g.  
  `POST /api/v1/bookings/session/lobby-heartbeat` body `{ token }`  
  **or** under `/consultation/...` — match existing HMAC booking/consult patterns.

- [ ] Controller: Zod validate → service; `asyncHandler`; no try/catch; no DB in controller.

- [ ] Service:
  - Verify HMAC (`verifyConsultationToken` or allow-expired variant — **prefer strict unexpired** for heartbeat).
  - Set `patient_checked_in_at = COALESCE(patient_checked_in_at, now())`.
  - Set `patient_lobby_last_seen_at = now()`.
  - Return `{ checkedInAt, lastSeenAt, presence: 'waiting' | 'stepped_away' | 'unknown' }` using 2-minute freshness (CRC-D8). Constant in one place (env optional; hardcoded 120s OK for p1).

- [ ] Never log token, name, phone, or raw request.

### 2. Tag derivation (OSM axis 3)

- [ ] Extend `SlotTag` with `'patient_waiting' | 'patient_stepped_away'`.

- [ ] `deriveTags`:
  - If `patient_lobby_last_seen_at` within 2 min → `patient_waiting` (not both).
  - Else if `patient_checked_in_at` set → `patient_stepped_away`.
  - Else neither.

- [ ] Wire columns through slot/queue session loaders so doctor board DTOs include the new tags (and raw timestamps if needed for FE).

- [ ] Unit tests for `deriveTags` presence cases + mutual exclusion.

### 3. Patient snapshot (optional but preferred)

- [ ] Include presence on `/my-visit` snapshot so patient UI can show “You’re checked in” if already built there — keep minimal; do not redesign hub.

### Out of scope

- Cron / DM send (crc-03).
- Video lobby UI (crc-04).
- Board chip styling (crc-05) — tags must appear in API payload only.
- Creating consultation sessions.

---

## Scope Guard

- Expected files touched: ≤ 8 (route + controller + service + types + opd-slot-status + one loader + tests). If larger, stop and split.
- **DO NOT** change Twilio create path.
- **DO NOT** add RLS.

---

## Done when

- Heartbeat stamps columns; tags appear on doctor session payload; unit tests green; no PHI logs.
