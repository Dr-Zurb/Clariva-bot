# 2026-03-21 — Teleconsultation Initiative

**Date:** 2026-03-21  
**Theme:** In-app video consultations with Twilio Video; verified consultations for payout eligibility

---

## Overview

Implement end-to-end teleconsultation: doctor starts video call from appointment detail, patient joins via shared link, platform verifies both participated. Supports future payout logic (verified consultations) and in-clinic path (mark completed + clinical notes).

### Goals

- Doctor can start video consultation from Clariva dashboard
- Patient joins via link (no app install)
- Twilio webhooks verify consultation (both joined, duration)
- In-clinic: doctor marks completed with clinical notes

---

## Plan & Task Order

| Order | Task | Dependency | Est. |
|-------|------|------------|------|
| — | [TELECONSULTATION_PLAN.md](./TELECONSULTATION_PLAN.md) | Master plan | — |
| 1 | [e-task-1: Consultation migration](./e-task-1-consultation-migration.md) | — | 1–2 h |
| 2 | [e-task-2: Twilio Video service](./e-task-2-twilio-video-service.md) | e-task-1 | 3–4 h |
| 3 | [e-task-3: Consultation API](./e-task-3-consultation-api.md) | e-task-1, 2 | 4–5 h |
| 4 | [e-task-4: Twilio status webhook](./e-task-4-twilio-status-webhook.md) | e-task-2 | 4–5 h |
| 5 | [e-task-5: PATCH appointment](./e-task-5-patch-appointment.md) | e-task-1 | 2–3 h |
| 6 | [e-task-6: Frontend appointment + video](./e-task-6-frontend-appointment-video.md) | e-task-3, 5 | 6–8 h |
| 7 | [e-task-7: Patient join page](./e-task-7-patient-join-page.md) | e-task-3, 6 | 4–5 h |
| 8 | [e-task-8: Send consultation link](./e-task-8-send-consultation-link.md) | e-task-3, 6 | 3–4 h |

**Parallel work:** e-task-4 can run alongside 5, 6, 7. e-task-5 is independent and can be done early.

---

## Dependencies

```
e-task-1 (Migration)
    │
    ├──► e-task-2 (Twilio Video service)
    │         │
    │         ├──► e-task-3 (Consultation API)
    │         │         │
    │         │         ├──► e-task-6 (Frontend doctor)
    │         │         ├──► e-task-7 (Patient join)
    │         │         └──► e-task-8 (Send link)
    │         │
    │         └──► e-task-4 (Twilio webhook)
    │
    └──► e-task-5 (PATCH appointment) ──► e-task-6
```

---

## Reference

- [TELECONSULTATION_PLAN.md](./TELECONSULTATION_PLAN.md) — Architecture, flow, data model
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)
- [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Last Updated:** 2026-03-21
