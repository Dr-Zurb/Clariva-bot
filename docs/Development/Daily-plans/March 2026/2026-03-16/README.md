# 2026-03-16 — Reason for Visit & Notes Separation

**Date:** 2026-03-16  
**Theme:** Separate appointment columns for proper data structure

---

## Overview

Split appointment data into two patient-provided columns:
- **reason_for_visit** — Patient's main complaint/symptom (required)
- **notes** — Extra context patient shares during conversation (optional)

---

## Task Order

| Order | Task | Dependency |
|-------|------|------------|
| 1 | [e-task-1: Add reason_for_visit column + wiring](./e-task-1-reason-for-visit-column.md) | — |
| 2 | [e-task-2: Collect patient extras (notes)](./e-task-2-collect-patient-extras.md) | e-task-1 |

**e-task-1** adds the schema and ensures reason_for_visit is always populated. **e-task-2** adds optional collection of patient extras into notes.

---

## Reference

- [APPOINTMENT_REASON_AND_NOTES.md](../../../Reference/APPOINTMENT_REASON_AND_NOTES.md) — Column semantics and flow
- [DB_SCHEMA.md](../../../Reference/DB_SCHEMA.md) — Schema documentation
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md) — Booking flow

---

**Last Updated:** 2026-03-16
