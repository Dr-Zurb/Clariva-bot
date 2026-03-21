# Teleconsultation Initiative

**Purpose:** In-app video consultations using Twilio Video. Doctors conduct video calls from the Clariva dashboard; patients join via shared link. Platform verifies both participated for future payout eligibility.

**Status:** Planning  
**Created:** 2026-03-21  
**Location:** [docs/Development/Daily-plans/March 2026/2026-03-21/](../Development/Daily-plans/March%202026/2026-03-21/)

---

## Summary

| Item | Detail |
|------|--------|
| **Provider** | Twilio Video |
| **Flow** | Doctor starts → Backend creates room → Patient gets link → Both join → Webhooks verify |
| **Tasks** | 8 (migration, service, API, webhook, PATCH, frontend doctor, patient join, send link) |
| **Est. Total** | ~28–36 hours |

---

## Task List

1. [e-task-1: Consultation migration](../Development/Daily-plans/March%202026/2026-03-21/e-task-1-consultation-migration.md)
2. [e-task-2: Twilio Video service](../Development/Daily-plans/March%202026/2026-03-21/e-task-2-twilio-video-service.md)
3. [e-task-3: Consultation API](../Development/Daily-plans/March%202026/2026-03-21/e-task-3-consultation-api.md)
4. [e-task-4: Twilio status webhook](../Development/Daily-plans/March%202026/2026-03-21/e-task-4-twilio-status-webhook.md)
5. [e-task-5: PATCH appointment](../Development/Daily-plans/March%202026/2026-03-21/e-task-5-patch-appointment.md)
6. [e-task-6: Frontend appointment + video](../Development/Daily-plans/March%202026/2026-03-21/e-task-6-frontend-appointment-video.md)
7. [e-task-7: Patient join page](../Development/Daily-plans/March%202026/2026-03-21/e-task-7-patient-join-page.md)
8. [e-task-8: Send consultation link](../Development/Daily-plans/March%202026/2026-03-21/e-task-8-send-consultation-link.md)

---

## Key Design Decisions

- **Twilio Video** (not Daily.co/Whereby): Better control; future Twilio SMS integration
- **Verification:** Webhooks record doctor_joined_at, patient_joined_at, consultation_ended_at → set verified_at when both joined + duration >= threshold
- **In-clinic:** PATCH appointment with status + clinical_notes (no video verification)
- **Patient link:** JWT/signed token with appointmentId, expiry; public /consult/join page

---

## Reference

- [TELECONSULTATION_PLAN.md](../Development/Daily-plans/March%202026/2026-03-21/TELECONSULTATION_PLAN.md)
- [README.md](../Development/Daily-plans/March%202026/2026-03-21/README.md)

---

**Last Updated:** 2026-03-21
