# Task 2: Twilio Video Service
## 2026-03-21 — Teleconsultation Initiative

---

## 📋 Task Overview

Create backend service and config for Twilio Video: create rooms, generate access tokens for doctor and patient. Uses Twilio REST API for rooms and JWT for access tokens. Depends on e-task-1 (migration applied).

**Estimated Time:** 3–4 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-21

**Change Type:**
- [x] **New feature** — New service and config

**Current State:**
- ✅ **What exists:** `env.ts` has TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (SMS)
- ❌ **What's missing:** TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET (required for Video access tokens); twilio package; consultation-room service
- ⚠️ **Notes:** Twilio Video access tokens require API Key credentials (not Account SID). Create API Key in Twilio Console for Video.

**Scope Guard:**
- Expected files touched: ≤ 5

**Reference Documentation:**
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md) - Service layer
- [RECIPES.md](../../../Reference/RECIPES.md) - Add service, env var
- [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Environment & Config
- [x] ✅ 1.1 Add to `backend/src/config/env.ts` - **Completed: 2026-03-21**
  - [x] ✅ 1.1.1 TWILIO_API_KEY_SID (optional; required when consultation enabled)
  - [x] ✅ 1.1.2 TWILIO_API_KEY_SECRET (optional)
- [x] ✅ 1.2 Update `.env.example` with new vars and comment (Video uses API Key)
- [x] ✅ 1.3 Install `twilio` package (npm) — already in package.json

### 2. Consultation Room Service
- [x] ✅ 2.1 Create `backend/src/services/consultation-room-service.ts` - **Completed: 2026-03-21**
  - [x] ✅ 2.1.1 `createTwilioRoom(roomName: string, correlationId: string)` → { roomSid, roomName }
  - [x] ✅ 2.1.2 Use Twilio REST API: `client.video.v1.rooms.create({ uniqueName: roomName })`
  - [x] ✅ 2.1.3 Handle errors (rate limit, invalid creds); throw appropriate AppError
- [x] ✅ 2.2 `generateVideoAccessToken(identity: string, roomName: string, correlationId: string)` → string
  - [x] ✅ 2.2.1 Use twilio.jwt.AccessToken with VideoGrant for room
  - [x] ✅ 2.2.2 Identity = 'doctor-{doctorId}' or 'patient-{appointmentId}' (no PHI)
  - [x] ✅ 2.2.3 TTL: 4 hours (covers consultation window)
  - [x] ✅ 2.2.4 Requires TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET
- [x] ✅ 2.3 Fail gracefully when Twilio not configured (return null or log warn)

### 3. Types
- [x] ✅ 3.1 Add types in service file - **Completed: 2026-03-21**
  - [x] ✅ 3.1.1 CreateRoomResult { roomSid, roomName }
  - [x] ✅ 3.1.2 No PHI in any type

### 4. Verification & Testing
- [x] ✅ 4.1 Run type-check
- [x] ✅ 4.2 Unit test: createTwilioRoom (mock Twilio client)
- [x] ✅ 4.3 Unit test: generateVideoAccessToken (mock)

---

## 📁 Files to Create/Update

```
backend/
├── package.json                    (UPDATE - add twilio)
├── src/
│   ├── config/
│   │   └── env.ts                  (UPDATE - TWILIO_API_KEY_SID, SECRET)
│   ├── services/
│   │   └── consultation-room-service.ts  (NEW)
│   └── types/
│       └── consultation.ts         (NEW - optional, or inline in service)
```

**Existing Code Status:**
- ✅ `backend/src/config/env.ts` - EXISTS (Twilio SID, Auth Token, Phone)
- ❌ `consultation-room-service.ts` - MISSING
- ❌ Twilio package - May exist; verify

---

## 🧠 Design Constraints

- Service layer: no Express types; correlationId for logging
- No PHI in logs (roomName, roomSid, identity pattern only)
- Use existing error classes (ValidationError, InternalError)
- Follow STANDARDS.md for async, error handling

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y — Twilio REST API)
  - [ ] **Consent + redaction confirmed?** (N/A — no PHI sent to Twilio)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] createTwilioRoom creates room via Twilio API
- [ ] generateVideoAccessToken returns valid JWT for Video SDK
- [ ] Service fails gracefully when env vars missing
- [ ] No PHI in logs
- [ ] Unit tests cover main paths

---

## 🔗 Related Tasks

- [e-task-1-consultation-migration](./e-task-1-consultation-migration.md)
- [e-task-3-consultation-api](./e-task-3-consultation-api.md)
- [TELECONSULTATION_PLAN.md](./TELECONSULTATION_PLAN.md)

---

**Last Updated:** 2026-03-21
