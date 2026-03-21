# Teleconsultation Feature Plan
## Twilio Video Integration

**Date:** 2026-03-21  
**Status:** Planning  
**Provider:** Twilio Video

---

## Overview

Implement in-app video teleconsultation so doctors can conduct verified video calls with patients from the Clariva dashboard. Uses Twilio Video for WebRTC. Verification (doctor + patient joined, duration) enables future payout logic.

**Goals:**
- Doctor can start a video consultation from the appointment detail page
- Patient receives a link and joins in browser (no app install)
- Platform verifies both joined and records duration for payout eligibility
- Support in-clinic appointments via "Mark as completed" + clinical notes (non-video path)

---

## Architecture

### Flow

```
Doctor → "Start consultation" → Backend creates Twilio room
       → Backend stores room_sid on appointment
       → Backend returns access token + room name

Doctor → Joins room (embedded or new tab) via Twilio Video SDK
Patient → Receives link (SMS/email/copy) → Opens /consult/join?token=...
        → Gets access token (validates token) → Joins room

Twilio → room/participant status webhooks → Backend records:
         doctor_joined_at, patient_joined_at, consultation_ended_at
       → When both joined + duration >= threshold → set verified_at
       → Update appointment status to completed
```

### Data Model (appointments table additions)

| Column | Type | Purpose |
|--------|------|---------|
| consultation_room_sid | TEXT | Twilio room SID |
| consultation_started_at | TIMESTAMPTZ | When room was created |
| doctor_joined_at | TIMESTAMPTZ | When doctor connected |
| patient_joined_at | TIMESTAMPTZ | When patient connected |
| consultation_ended_at | TIMESTAMPTZ | When room ended |
| consultation_duration_seconds | INTEGER | Duration (for verification) |
| verified_at | TIMESTAMPTZ | When consultation was verified (both joined, min duration) |
| clinical_notes | TEXT | Doctor notes (for in-clinic or post-call) |

### Twilio Video Requirements

- **Account SID + Auth Token:** Create rooms via REST API
- **API Key SID + API Key Secret:** Generate access tokens for participants (Video requires API Key, not Account SID)
- **Status webhooks:** Room and participant events for verification

### Patient Join Token

- JWT or signed token containing: `appointment_id`, `patient_identifier` (phone hash or patient_id), expiry
- Validates patient has right to join this appointment's room
- Token in URL: `/consult/join?token=xxx`

---

## Task Dependencies

```
e-task-1 (Migration)
    ↓
e-task-2 (Twilio Video service)
    ↓
e-task-3 (Consultation API)
    ↓
e-task-4 (Twilio webhook) ←── can run in parallel with 5, 6, 7
e-task-5 (PATCH appointment)
    ↓
e-task-6 (Frontend: doctor video UI)
e-task-7 (Frontend: patient join page)
    ↓
e-task-8 (Send link to patient)
```

---

## Verification Criteria

- [ ] Doctor can start consultation from appointment detail
- [ ] Doctor joins video room from dashboard
- [ ] Patient can join via shared link (no login)
- [ ] Twilio webhooks record join/end times
- [ ] `verified_at` set when both joined and duration >= configurable minimum (e.g. 2 min)
- [ ] Appointment status updates to `completed` when verified (or doctor marks manually for in-clinic)
- [ ] In-clinic: Doctor can mark completed + add clinical notes (PATCH)

---

## Compliance Notes

- No PHI in logs (appointment_id, room_sid only)
- Consultation link token: short expiry (e.g. 24h from appointment time)
- Audit log: consultation_started, consultation_verified
- Video: Twilio handles media; we store only metadata

---

## Related Docs

- [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)

---

**Last Updated:** 2026-03-21
