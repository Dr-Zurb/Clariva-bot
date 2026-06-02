# Task 3: Handle participant-disconnected
## 2026-03-23 — Consultation Verification v2

---

## 📋 Task Overview

Handle Twilio `participant-disconnected` webhook. Set `doctor_left_at` or `patient_left_at` on the appointment. Required for "who left first" verification in e-task-4.

**Estimated Time:** 1.5 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-23

**Change Type:**
- [x] **Update existing** — Extend consultation-verification-service, Twilio webhook routing

**Current State:**
- ✅ **What exists:** handleTwilioStatusCallback handles participant-connected, participant-disconnected, room-ended; handleParticipantConnected, handleParticipantDisconnected, handleRoomEnded
- ✅ **Done:** participant-disconnected handler; doctor_left_at, patient_left_at updates
- ✅ **Notes:** Twilio sends StatusCallbackEvent=participant-disconnected with ParticipantIdentity, Timestamp, ParticipantDuration

**Scope Guard:**
- Expected files touched: 2 (consultation-verification-service, possibly types)

**Reference Documentation:**
- [Twilio Status Callbacks](https://www.twilio.com/docs/video/api/status-callbacks)
- [consultation-verification-service.ts](../../../../backend/src/services/consultation-verification-service.ts)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Payload Type
- [x] 1.1 Extend TwilioRoomCallbackPayload (or reuse) — participant-disconnected has ParticipantIdentity, Timestamp, ParticipantDuration
  - [x] 1.1.1 ParticipantDuration is optional (seconds that participant was in room)

### 2. Handler
- [x] 2.1 Create `handleParticipantDisconnected(payload, correlationId)`
  - [x] 2.1.1 Find appointment by RoomSid
  - [x] 2.1.2 If ParticipantIdentity starts with 'doctor-': update doctor_left_at = Timestamp (only if not already set)
  - [x] 2.1.3 If ParticipantIdentity starts with 'patient-': update patient_left_at = Timestamp (only if not already set)
  - [x] 2.1.4 Idempotent: only set if column is null (first disconnect wins)
- [x] 2.2 Add case 'participant-disconnected' to handleTwilioStatusCallback switch

### 3. Verification & Testing
- [x] 3.1 Unit test: handleParticipantDisconnected sets doctor_left_at for doctor identity
- [x] 3.2 Unit test: handleParticipantDisconnected sets patient_left_at for patient identity
- [x] 3.3 Run type-check

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── consultation-verification-service.ts  (UPDATE)
└── tests/unit/services/
    └── consultation-verification-service.test.ts  (UPDATE)
```

---

## 🧠 Design Constraints

- Idempotent: multiple disconnect callbacks (if any) should not overwrite
- No PHI in logs (appointment_id, roomSid ok)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — appointments)
  - [x] **RLS verified?** (N/A — service role)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] participant-disconnected (doctor) → doctor_left_at set
- [x] participant-disconnected (patient) → patient_left_at set
- [x] Existing participant-connected, room-ended still work

---

## 🔗 Related Tasks

- [e-task-1: Migration](./e-task-1-consultation-left-at-migration.md)
- [e-task-4: tryMarkVerified logic](./e-task-4-try-mark-verified-who-left-first.md)

---

**Last Updated:** 2026-03-23
