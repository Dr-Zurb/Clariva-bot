# 2026-03-27 — Patient Identity & Matching

**Date:** 2026-03-27  
**Theme:** Patient identification, matching, deduplication, and Patients tab

---

## Overview

Phone search + confirm (no ID required); Patient ID (MRN) as optional shortcut; doctor can merge duplicates. Patients tab in dashboard.

### Goals

- MRN column for human-readable patient ID
- Patient matching service (fuzzy by phone + name)
- List patients API
- Patients tab UI
- Booking match confirmation
- Merge patients (doctor action)
- Patient ID in confirmation

---

## Plan & Task Order

| Order | Task | Dependency | Est. |
|-------|------|-------------|------|
| 1 | [e-task-1: MRN column](./e-task-1-patient-mrn-column.md) | — | 2–3 h |
| 2 | [e-task-2: Patient matching service](./e-task-2-patient-matching-service.md) | e-task-1 | — |
| 3 | [e-task-3: List patients API](./e-task-3-list-patients-api.md) | e-task-1 | — |
| 4 | [e-task-4: Patients tab UI](./e-task-4-patients-tab-ui.md) | e-task-3 | — |
| 5 | [e-task-5: Booking match confirmation](./e-task-5-booking-match-confirmation.md) | e-task-2 | — |
| 6 | [e-task-6: Merge patients](./e-task-6-merge-patients.md) | e-task-4 | — |
| 7 | [e-task-7: Patient ID in confirmation](./e-task-7-patient-id-in-confirmation.md) | e-task-1 | — |

---

## Reference

- [PATIENT_IDENTITY_AND_MATCHING.md](../../../Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md)

---

**Last Updated:** 2026-03-27
