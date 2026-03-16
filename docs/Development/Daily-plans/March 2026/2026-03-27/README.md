# 2026-03-27 — Patient Identity & Matching

**Date:** 2026-03-27  
**Theme:** Patient identification, matching, deduplication, and Patients tab

---

## Overview

Implement patient identity and matching so that:
- Patients who book appear in the Patients tab
- Repeat bookings can link to the same patient (phone search + confirm)
- Doctors can merge duplicates in the dashboard
- Patient ID (MRN) is assigned and shown as an optional shortcut

---

## Task Order

| Order | Task | Dependency |
|-------|------|------------|
| 1 | [e-task-1: Add patient_id (MRN) column](./e-task-1-patient-mrn-column.md) | — |
| 2 | [e-task-2: Patient matching service](./e-task-2-patient-matching-service.md) | — |
| 3 | [e-task-3: List patients API](./e-task-3-list-patients-api.md) | — |
| 4 | [e-task-4: Patients tab UI](./e-task-4-patients-tab-ui.md) | e-task-3 |
| 5 | [e-task-5: Booking flow — match confirmation](./e-task-5-booking-match-confirmation.md) | e-task-2 |
| 6 | [e-task-6: Merge patients (dashboard)](./e-task-6-merge-patients.md) | e-task-3, e-task-4 |
| 7 | [e-task-7: Patient ID in confirmation](./e-task-7-patient-id-in-confirmation.md) | e-task-1 |

**Recommended order:** e-task-1, e-task-2, e-task-3 can run in parallel. e-task-4 after e-task-3. e-task-5 after e-task-2. e-task-6 after e-task-4. e-task-7 after e-task-1.

---

## Reference

- [PATIENT_IDENTITY_AND_MATCHING.md](../../../Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md) — Master planning doc
- [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-03-27
