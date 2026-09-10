# Task crc-03: Check-in cron + DM copy

## 12 Aug 2026 — Batch [p1-lobby-presence](../plan-p1-consult-room-checkin-lobby-presence-batch.md) — Wave 3 — **M, ~3–4h**

---

## Task overview

Send the patient into the lobby **before** the doctor starts — slot T−30 and queue ahead≤3 — without creating Twilio rooms (CRC-D1, CRC-D4, CRC-D5, CRC1-D3, CRC1-D4).

**Estimated time:** ~3–4h  
**Status:** ⏳ Pending  
**Hard deps:** crc-01 (dedupe column), crc-02 optional (cron can ship before heartbeat; lobby still useful). Prefer after crc-02 so copy can say “waiting room.”  
**Source:** CRC-D4, CRC-D5, CRC-D6, CRC-D11, CRC-D12, CRC1-D3, CRC1-D4.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `backend/src/services/consultation-pre-ping-job.ts` (pattern to mirror — **do not** call `createSession` for video/voice)
- `backend/src/routes/cron.ts`
- `backend/src/services/notification-service.ts` (`sendConsultationReadyToPatient`, `dispatchFanOut`)
- `backend/src/utils/dm-copy.ts` (add check-in copy; localize if program requires — prefer reuse locale-arm path if Start copy already localized)
- `backend/src/config/env.ts`, `backend/.env.example`
- HMAC URL minting for video/voice/text (appointment-service / text-session-supabase / notification-service)

---

## Acceptance criteria

### 1. Env

- [ ] `CONSULTATION_CHECKIN_LEAD_MINUTES` default **30** via `config/env.ts` + `.env.example`.
- [ ] Document: distinct from `CONSULTATION_PRE_PING_LEAD_MINUTES` (text session create).

### 2. Job

- [ ] New job module e.g. `consultation-checkin-job.ts` (name flexible).
- [ ] Cron route `POST /cron/consultation-checkin` (auth matching other crons).
- [ ] **Slot mode:** appointments with `appointment_date` in `[now, now + lead]`, status bookable (pending/confirmed — match pre-ping), `patient_checkin_notified_at IS NULL`, send once then stamp notified_at.
- [ ] **Queue mode:** for today’s queue, appointments with computed `aheadCount <= 3`, same dedupe, send once.
- [ ] **Must not** create Twilio rooms / call video `createSession`. Text: may reuse existing session row if present to mint `/c/text/...` URL; if no session yet, mint using same token pattern as Start or link `/my-visit` + later exchange — prefer minting modality lobby URL per CRC-D6. If text URL requires sessionId, create **text** session only (existing pre-ping behavior OK) — never video/voice rooms.
- [ ] Fan-out: reuse SMS + email + IG DM parallel pattern (CRC-D12). Do not add Facebook in this task.
- [ ] Idempotent under cron retries (notified_at stamp before or after send with clear dedupe semantics; document choice).

### 3. Copy

- [ ] New DM/SMS/email copy: invite to check in / enter waiting room; include join URL; no PHI in logs.
- [ ] Do not break existing consult-ready copy on Start (CRC-D11).

### 4. Tests

- [ ] Unit tests: lead window selection, dedupe skip, “no Twilio create” assertion via mocked session facade if applicable.
- [ ] Queue ahead≤3 selection logic tested with fixtures.

### Out of scope

- Video lobby UI (crc-04).
- Board chips (crc-05).
- Facebook fan-out.
- Changing Start-time `sendConsultationReadyToPatient`.

---

## Scope Guard

- Expected files: job + cron route + env + dm-copy (+ locale if required) + notification helper + tests ≤ ~8 files.
- **DO NOT** provision Twilio rooms.
- **DO NOT** change OPD mode conversion.

---

## Done when

- Cron sends once per appointment; slot ~T−30; queue ≤3 ahead; no video/voice room at check-in; tests green.
