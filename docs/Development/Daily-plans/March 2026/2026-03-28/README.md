# 2026-03-28 — Prescription V1 Implementation

**Date:** 2026-03-28  
**Theme:** Prescription & EHR-lite — doctor sends prescription to patient after video call  
**Status:** ✅ Complete

---

## Overview

Implement V1 prescription workflow: structured SOAP template (CC, HOPI, diagnosis, plan, medications) and/or photo upload (handwritten parchi). Store under patient; send to patient via Instagram DM and email; show previous prescriptions on appointment view.

### Goals

- Doctor creates prescription (structured / photo / both) after video call
- Prescription stored under patient; linked to appointment
- Send prescription to patient (DM, email)
- Previous prescriptions visible when viewing appointment
- Save draft; Save & send; integrate with Mark Completed flow

---

## Plan & Task Order

| Order | Task | Status | Est. |
|-------|------|--------|------|
| 1 | [e-task-1: Prescription migration](./e-task-1-prescription-migration.md) | ✅ | 1.5 h |
| 2 | [e-task-2: Prescription service & API](./e-task-2-prescription-service-api.md) | ✅ | 2.5 h |
| 3 | [e-task-3: Photo storage (Supabase)](./e-task-3-prescription-photo-storage.md) | ✅ | 1.5 h |
| 4 | [e-task-4: Prescription form UI](./e-task-4-prescription-form-ui.md) | ✅ | 3 h |
| 5 | [e-task-5: Send to patient](./e-task-5-prescription-send-to-patient.md) | ✅ | 2 h |
| 6 | [e-task-6: Previous prescriptions view](./e-task-6-prescription-previous-view.md) | ✅ | 1.5 h |
| 7 | [e-task-7: Integration & README](./e-task-7-prescription-integration-readme.md) | ✅ | 1 h |

**Total estimated:** ~13 hours

---

## Setup (Before First Use)

1. **Run migrations** in Supabase SQL Editor (or psql):
   - `backend/migrations/026_prescriptions.sql`
   - `backend/migrations/027_prescription_attachments_bucket.sql`
2. **Storage bucket** `prescription-attachments` is created by 027 (private, JPEG/PNG/WebP/PDF).
3. **Instagram** and **email** (Resend) must be configured for Send to patient.

---

## Appointment Page Section Order

1. Start consultation (when applicable)
2. Video call + Patient join link (when consultation started)
3. Previous prescriptions (when patient linked)
4. Prescription & clinical note
5. Mark as completed

PrescriptionForm and MarkCompletedForm are independent; doctor can mark completed with or without prescription.

---

## Reference

- [PRESCRIPTION_EHR_PLAN.md](../2026-03-23/PRESCRIPTION_EHR_PLAN.md) — Full feature plan, SOAP structure, V2/V3 roadmap
- [DB_SCHEMA.md](../../../Reference/DB_SCHEMA.md) — prescriptions, prescription_medicines, prescription_attachments
- [MarkCompletedForm](../../../../frontend/components/consultation/MarkCompletedForm.tsx)
- [AppointmentConsultationActions](../../../../frontend/components/consultation/AppointmentConsultationActions.tsx)
- [notification-service.ts](../../../../backend/src/services/notification-service.ts) — Send patterns

---

## Related Initiatives

- [Consultation Verification v2](../2026-03-23/README.md) — Video call payout eligibility
- [Teleconsultation](../2026-03-21/README.md) — Video call flow

---

**Last Updated:** 2026-03-28  
**Completed:** 2026-03-28
