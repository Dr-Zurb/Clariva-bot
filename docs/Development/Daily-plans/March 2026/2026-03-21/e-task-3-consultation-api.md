# Task 3: Consultation API
## 2026-03-21 — Teleconsultation Initiative

---

## 📋 Task Overview

Add API endpoints for starting a consultation and obtaining access tokens. Doctor starts consultation → backend creates Twilio room, stores on appointment, returns doctor token + room name + patient link. Doctor and patient request tokens to join.

**Estimated Time:** 4–5 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-21

**Change Type:**
- [x] **New feature** — New routes, controller, service integration

**Current State:**
- ✅ **What exists:** appointment-service (getAppointmentById, updateAppointmentStatus); appointment-controller (GET list, GET by id); authenticateToken middleware
- ❌ **What's missing:** POST start-consultation; GET token endpoint; appointment update for consultation fields
- ⚠️ **Notes:** Requires e-task-1 (migration), e-task-2 (consultation-room-service)

**Scope Guard:**
- Expected files touched: ≤ 6

**Reference Documentation:**
- [RECIPES.md](../../../Reference/RECIPES.md) - Add route, controller, validation
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md) - Layer boundaries
- [STANDARDS.md](../../../Reference/STANDARDS.md) - successResponse, asyncHandler

---

## ✅ Task Breakdown (Hierarchical)

### 1. Appointment Service Extension
- [x] 1.1 Add to `backend/src/services/appointment-service.ts`
  - [x] 1.1.1 `startConsultation(appointmentId, correlationId, userId)` — validate ownership; create room; update appointment with room_sid, consultation_started_at; return { roomSid, roomName, doctorToken, patientJoinUrl, patientJoinToken, expiresAt }
  - [x] 1.1.2 Validate: appointment exists, doctor owns it, status is pending or confirmed; idempotent: if room exists, return existing with fresh tokens
  - [x] 1.1.3 Call consultation-room-service.createTwilioRoom, generateVideoAccessToken for doctor
  - [x] 1.1.4 Generate patient join token via consultation-token utility (CONSULTATION_TOKEN_SECRET)
- [x] 1.2 Add `getConsultationToken(appointmentId, correlationId, { userId } | { patientToken })` — doctor: validate ownership; patient: verify join token
  - [x] 1.2.1 Doctor path: requires auth, returns token for room
  - [x] 1.2.2 Patient path: token query param, verify via verifyConsultationToken, return patient token for room

### 2. Controller
- [x] 2.1 Create `backend/src/controllers/consultation-controller.ts`
  - [x] 2.1.1 `startConsultationHandler` — POST; validate appointmentId; auth required; call startConsultation; return successResponse
  - [x] 2.1.2 `getConsultationTokenHandler` — GET; query: appointmentId, token (patient) or auth (doctor); return { token, roomName }
  - [x] 2.1.3 Use asyncHandler, successResponse
- [x] 2.2 Zod validation for params/body

### 3. Routes
- [x] 3.1 Create `backend/src/routes/api/v1/consultation.ts`
  - [x] 3.1.1 POST /consultation/start — auth required; body: { appointmentId }
  - [x] 3.1.2 GET /consultation/token — optionalAuthenticateToken; doctor (auth) or patient (?appointmentId=&token=)
- [x] 3.2 Mount in `backend/src/routes/api/v1/index.ts`

### 4. Patient Join Token
- [x] 4.1 Design: signed payload { appointmentId, exp, role: 'patient' } with CONSULTATION_TOKEN_SECRET (consultation-token.ts)
- [x] 4.2 Add CONSULTATION_TOKEN_SECRET and CONSULTATION_JOIN_BASE_URL to env
- [x] 4.3 patientJoinUrl = `${CONSULTATION_JOIN_BASE_URL}?token=${signedToken}`

### 5. Verification & Testing
- [x] 5.1 Run type-check
- [ ] 5.2 Integration test: start consultation, get token (or unit with mocks)
- [x] 5.3 Verify no PHI in response or logs

---

## 📁 Files Created/Updated

```
backend/src/
├── config/
│   └── env.ts                      (UPDATE - CONSULTATION_TOKEN_SECRET, CONSULTATION_JOIN_BASE_URL)
├── controllers/
│   └── consultation-controller.ts  (NEW)
├── middleware/
│   └── auth.ts                     (UPDATE - optionalAuthenticateToken)
├── routes/
│   └── api/v1/
│       ├── consultation.ts         (NEW)
│       └── index.ts                (UPDATE - mount consultation)
├── services/
│   ├── appointment-service.ts      (UPDATE - startConsultation, getConsultationToken)
│   └── consultation-room-service.ts (from e-task-2)
└── utils/
    ├── consultation-token.ts       (NEW)
    └── validation.ts               (UPDATE - consultation schemas)
```

---

## 🧠 Design Constraints

- Controller uses successResponse per STANDARDS
- No PHI in logs or response (appointmentId, roomSid OK)
- Patient token: short expiry (e.g. 24h from appointment_date)
- RLS: appointment ownership validated in service

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y — appointments)
  - [ ] **RLS verified?** (Y — via service, ownership check)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y — Twilio via consultation-room-service)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] POST /api/v1/consultation/start creates room, updates appointment, returns tokens
- [x] GET /api/v1/consultation/token returns valid token for doctor (auth) or patient (token)
- [x] Idempotent: second start returns existing room if already started
- [x] Patient token invalid after expiry or wrong appointment

---

## 🔗 Related Tasks

- [e-task-1-consultation-migration](./e-task-1-consultation-migration.md)
- [e-task-2-twilio-video-service](./e-task-2-twilio-video-service.md)
- [e-task-6-frontend-appointment-video](./e-task-6-frontend-appointment-video.md)
- [e-task-7-patient-join-page](./e-task-7-patient-join-page.md)

---

**Last Updated:** 2026-03-21
