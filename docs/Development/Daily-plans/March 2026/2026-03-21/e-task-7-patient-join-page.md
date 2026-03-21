# Task 7: Patient Join Page
## 2026-03-21 — Teleconsultation Initiative

---

## 📋 Task Overview

Create public page at `/consult/join` where patients join the video consultation. Page validates token from URL, fetches access token from backend, and connects to Twilio Video room. No login required.

**Estimated Time:** 4–5 hours  
**Status:** ⏳ **PENDING**  
**Completed:** (when completed)

**Change Type:**
- [x] **New feature** — New page and API integration

**Current State:**
- ✅ **What exists:** Similar token-based flow for /book (bookingToken); Next.js app router
- ❌ **What's missing:** /consult/join page; GET /consultation/token for patient (public)
- ⚠️ **Notes:** Patient passes ?token=xxx. Backend validates token, returns Video access token. Frontend uses same VideoRoom component or simplified version.

**Scope Guard:**
- Expected files touched: ≤ 4

**Reference Documentation:**
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)
- e-task-3: patient token design, GET /consultation/token
- e-task-6: VideoRoom component

---

## ✅ Task Breakdown (Hierarchical)

### 1. Backend: Patient Token Endpoint
- [ ] 1.1 Ensure GET /api/v1/consultation/token supports patient flow (from e-task-3)
  - [ ] 1.1.1 Query: appointmentId, token (signed patient token)
  - [ ] 1.1.2 Verify token; return { token: videoAccessToken, roomName }
  - [ ] 1.1.3 CORS: allow frontend origin for public endpoint
- [ ] 1.2 No auth required for this path when token present

### 2. Frontend: Join Page
- [ ] 2.1 Create `frontend/app/consult/join/page.tsx`
  - [ ] 2.1.1 Read token from searchParams (?token=)
  - [ ] 2.1.2 If no token: show "Invalid or missing link"
  - [ ] 2.1.3 Call backend: GET /consultation/token?token=xxx (or decode token to get appointmentId, then call with both)
  - [ ] 2.1.4 On success: render VideoRoom with accessToken, roomName
  - [ ] 2.1.5 On error: show "Link expired or invalid"
- [ ] 2.2 Client component (needs useState, useEffect for fetch)
- [ ] 2.3 Layout: minimal (no dashboard shell); doctor/practice name if available

### 3. API Client
- [ ] 3.1 Add to `frontend/lib/api.ts`
  - [ ] 3.1.1 `getConsultationTokenForPatient(token: string)` — GET with token; public, no Bearer
  - [ ] 3.1.2 Returns { token, roomName }
  - [ ] 3.1.3 Backend may need appointmentId from decoded token; or backend decodes token and fetches appointmentId internally
- [ ] 3.2 Token in URL: ensure backend accepts token in query; design from e-task-3

### 4. Reuse VideoRoom
- [ ] 4.1 Reuse VideoRoom from e-task-6 or create ConsultPatientVideo (simplified: patient sees doctor, sends local video)
- [ ] 4.2 Identity for patient: 'patient-{appointmentId}' so webhook can set patient_joined_at

### 5. Verification & Testing
- [ ] 5.1 Run build, type-check
- [ ] 5.2 Manual: open /consult/join?token=invalid → error
- [ ] 5.3 Manual: open with valid token → fetch token, join room

---

## 📁 Files to Create/Update

```
frontend/
├── app/
│   └── consult/
│       └── join/
│           └── page.tsx              (NEW)
├── lib/
│   └── api.ts                        (UPDATE - getConsultationTokenForPatient)
└── components/
    └── consultation/
        └── VideoRoom.tsx             (reuse from e-task-6)
```

**Backend:** e-task-3 must implement GET /consultation/token for patient.

---

## 🧠 Design Constraints

- Public page: no auth
- Token short-lived; clear error for expired
- Minimal layout: focus on video
- Mobile-friendly (patient may use phone)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N — read-only for patient)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y — Twilio Video, backend token fetch)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Patient opens link with valid token → joins video room
- [ ] Invalid/expired token → clear error message
- [ ] Patient video and doctor video both visible when connected

---

## 🔗 Related Tasks

- [e-task-3-consultation-api](./e-task-3-consultation-api.md)
- [e-task-6-frontend-appointment-video](./e-task-6-frontend-appointment-video.md)
- [e-task-8-send-consultation-link](./e-task-8-send-consultation-link.md)

---

**Last Updated:** 2026-03-21
