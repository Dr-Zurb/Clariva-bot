# Task 4: Twilio Status Webhook
## 2026-03-21 — Teleconsultation Initiative

---

## 📋 Task Overview

Handle Twilio Video room and participant status webhooks to record doctor_joined_at, patient_joined_at, consultation_ended_at. When both joined and room ended, compute duration and set verified_at if duration >= threshold. Update appointment status to completed when verified.

**Estimated Time:** 4–5 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-21

**Change Type:**
- [x] **New feature** — New webhook endpoint, service logic

**Current State:**
- ✅ **What exists:** Webhook patterns (instagram, razorpay, paypal); webhook-verification; routes structure
- ❌ **What's missing:** Twilio status callback endpoint; consultation verification logic
- ⚠️ **Notes:** Twilio sends Room and Participant status callbacks. Need to map room SID → appointment. Use consultation_room_sid to find appointment.

**Scope Guard:**
- Expected files touched: ≤ 5

**Reference Documentation:**
- [RECIPES.md](../../../Reference/RECIPES.md) - Add webhook
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)
- Twilio Video Status Callbacks: https://www.twilio.com/docs/video/api/status-callbacks

---

## ✅ Task Breakdown (Hierarchical)

### 1. Webhook Endpoint
- [x] 1.1 Create `backend/src/controllers/twilio-webhook-controller.ts`
  - [x] 1.1.1 Single POST handler; Twilio sends all events to one URL; filter by StatusCallbackEvent
  - [x] 1.1.2 Events: participant-connected, room-ended (others ignored)
  - [x] 1.1.3 Twilio sends application/x-www-form-urlencoded; express parses to req.body
  - [x] 1.1.4 Return 200 quickly; process async via setImmediate to avoid Twilio timeout
- [x] 1.2 Add route: POST /webhooks/twilio/room-status
  - [x] 1.2.1 Mount in webhooks.ts; webhookLimiter applied
  - [x] 1.2.2 No auth (Twilio server-side)

### 2. Verification Service
- [x] 2.1 Create `backend/src/services/consultation-verification-service.ts`
  - [x] 2.1.1 handleRoomEnded — fetch by room_sid; set consultation_ended_at, duration; call tryMarkVerified
  - [x] 2.1.2 handleParticipantConnected — participant-connected: identity doctor-{id} or patient-{aptId}; update doctor_joined_at or patient_joined_at
  - [x] 2.1.3 tryMarkVerified — when doctor+patient joined, ended, duration >= MIN_VERIFIED_CONSULTATION_SECONDS; set verified_at, status=completed
  - [x] 2.1.4 Use getSupabaseAdminClient (webhook has no user context)
- [x] 2.2 Identity: doctor-{doctorId}, patient-{appointmentId} (slice by prefix length)

### 3. Config
- [x] 3.1 Add MIN_VERIFIED_CONSULTATION_SECONDS (default 120), WEBHOOK_BASE_URL
- [x] 3.2 When creating room, pass statusCallback + statusCallbackMethod: POST if WEBHOOK_BASE_URL set

### 4. Update Room Creation
- [x] 4.1 consultation-room-service: create room with statusCallback: `${WEBHOOK_BASE_URL}/webhooks/twilio/room-status`
- [x] 4.2 Twilio sends all room/participant events to single URL

### 5. Verification & Testing
- [x] 5.1 Run type-check
- [x] 5.2 Unit test: handleParticipantConnected sets doctor_joined_at/patient_joined_at
- [x] 5.3 Unit test: tryMarkVerified sets verified_at when conditions met
- [ ] 5.4 Manual: send mock Twilio webhook, verify DB updated

---

## 📁 Files to Create/Update

```
backend/src/
├── config/
│   └── env.ts                      (UPDATE - MIN_VERIFIED_CONSULTATION_SECONDS, BASE_URL if needed)
├── controllers/
│   └── twilio-webhook-controller.ts (NEW)
├── routes/
│   └── webhooks.ts or twilio.ts    (UPDATE - add twilio routes)
├── services/
│   ├── consultation-room-service.ts (UPDATE - StatusCallback when creating room)
│   └── consultation-verification-service.ts (NEW - or extend consultation-room-service)
└── index.ts                        (mount twilio webhook route)
```

---

## 🧠 Design Constraints

- Webhook must return 200 quickly; process async
- No PHI in logs (RoomSid, ParticipantSid, appointment_id only)
- Idempotent: multiple callbacks for same event should not double-update
- Use admin client (no RLS) for webhook updates

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y — appointments)
  - [ ] **RLS verified?** (N/A — service role for webhook)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N — we receive webhook)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Participant connected → doctor_joined_at or patient_joined_at updated
- [x] Room completed → consultation_ended_at, duration set
- [x] When both joined + duration >= threshold → verified_at, status=completed
- [x] Webhook returns 200; processing does not block

---

## 🔗 Related Tasks

- [e-task-2-twilio-video-service](./e-task-2-twilio-video-service.md)
- [e-task-3-consultation-api](./e-task-3-consultation-api.md)
- [TELECONSULTATION_PLAN.md](./TELECONSULTATION_PLAN.md)

---

**Last Updated:** 2026-03-21
