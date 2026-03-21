# Task 6: Frontend — Appointment Detail + Video UI
## 2026-03-21 — Teleconsultation Initiative

---

## 📋 Task Overview

Add "Start consultation" button to appointment detail page. On click, call backend to start consultation; display embedded Twilio Video room for doctor; show patient join link for sharing. Support "Mark as completed" + clinical notes for in-clinic or manual completion.

**Estimated Time:** 6–8 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-21

**Change Type:**
- [ ] **Update existing** — Extend appointment detail page

**Current State:**
- ✅ **What exists:** `frontend/app/dashboard/appointments/[id]/page.tsx` (read-only); getAppointmentById; AppointmentsListWithFilters
- ❌ **What's missing:** Start consultation button; Twilio Video embed; patient link display; PATCH for status/notes
- ⚠️ **Notes:** Appointment detail is server component; video needs client component (use "use client" for VideoRoom)

**Scope Guard:**
- Expected files touched: ≤ 6

**Reference Documentation:**
- [FRONTEND_RECIPES](../../../Reference/FRONTEND_RECIPES.md) if exists
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)
- Twilio Video React: @twilio/video-react-sdk or @twilio/video

---

## ✅ Task Breakdown (Hierarchical)

### 1. API Client
- [ ] 1.1 Add to `frontend/lib/api.ts`
  - [ ] 1.1.1 `startConsultation(token, appointmentId)` → POST /api/v1/consultation/start; returns { roomSid, roomName, doctorToken, patientJoinUrl, expiresAt }
  - [ ] 1.1.2 `patchAppointment(token, id, { status?, clinical_notes? })` → PATCH /api/v1/appointments/:id
  - [ ] 1.1.3 Types for response (StartConsultationData, etc.)
- [ ] 1.2 Update `frontend/types/appointment.ts` with optional consultation fields (room_sid, patient_join_url, etc.) if returned by GET

### 2. Appointment Detail Page
- [ ] 2.1 Update `frontend/app/dashboard/appointments/[id]/page.tsx`
  - [ ] 2.1.1 Add client component section for actions (Start consultation, Mark completed)
  - [ ] 2.1.2 Pass appointment, token to client child
  - [ ] 2.1.3 Show "Start consultation" when status is confirmed/pending and no consultation_room_sid
  - [ ] 2.1.4 Show "Mark as completed" + clinical notes textarea for in-clinic or when video already ended
- [ ] 2.2 Conditional UI: if consultation started, show VideoRoom + patient link; else show Start button

### 3. Video Room Component
- [ ] 3.1 Create `frontend/components/consultation/VideoRoom.tsx` (client)
  - [ ] 3.1.1 Props: accessToken, roomName, onDisconnect callback
  - [ ] 3.1.2 Use @twilio/video-react-sdk or @twilio/video Room, Video, AudioTrack
  - [ ] 3.1.3 Handle connecting, disconnecting, error states
  - [ ] 3.1.4 Local video (doctor) + remote participant video
- [ ] 3.2 Install @twilio/video and @twilio/video-react-sdk (or preferred SDK)
- [ ] 3.3 Responsive: works on desktop; mobile may have constraints

### 4. Patient Link Section
- [ ] 4.1 Create `frontend/components/consultation/PatientJoinLink.tsx`
  - [ ] 4.1.1 Display patientJoinUrl with Copy button
  - [ ] 4.1.2 Short instruction: "Share this link with your patient to join the video call"
  - [ ] 4.1.3 Optional: SMS/email send (defer to e-task-8)

### 5. Mark Completed Form
- [ ] 5.1 Create `frontend/components/consultation/MarkCompletedForm.tsx` (client)
  - [ ] 5.1.1 Textarea for clinical_notes
  - [ ] 5.1.2 Button "Mark as completed"
  - [ ] 5.1.3 On submit: patchAppointment with status: 'completed', clinical_notes
  - [ ] 5.1.4 Success: refresh or show confirmation

### 6. Verification & Testing
- [ ] 6.1 Run build, type-check
- [ ] 6.2 Manual: start consultation, join room, verify patient link works
- [ ] 6.3 Manual: mark completed with notes

---

## 📁 Files to Create/Update

```
frontend/
├── package.json                         (UPDATE - @twilio/video, @twilio/video-react-sdk)
├── lib/
│   └── api.ts                           (UPDATE - startConsultation, patchAppointment)
├── types/
│   └── appointment.ts                   (UPDATE - consultation fields)
├── app/
│   └── dashboard/
│       └── appointments/
│           └── [id]/
│               └── page.tsx             (UPDATE - actions, video, link)
└── components/
    └── consultation/
        ├── VideoRoom.tsx                (NEW)
        ├── PatientJoinLink.tsx          (NEW)
        └── MarkCompletedForm.tsx        (NEW)
```

---

## 🧠 Design Constraints

- Use "use client" only where needed (video, forms)
- No PHI in client logs
- Follow existing UI patterns (Tailwind, form styling)
- Accessible: focus states, labels

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y — displays appointment data)
  - [ ] **RLS verified?** (Y — API enforces)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y — Twilio Video in browser)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Doctor can start consultation from appointment detail
- [x] Doctor sees embedded video room and can join
- [x] Patient join link is displayed and copyable
- [x] Doctor can mark appointment completed with clinical notes
- [x] UI handles loading, error states

---

## 🔗 Related Tasks

- [e-task-3-consultation-api](./e-task-3-consultation-api.md)
- [e-task-5-patch-appointment](./e-task-5-patch-appointment.md)
- [e-task-7-patient-join-page](./e-task-7-patient-join-page.md)

---

**Last Updated:** 2026-03-21
