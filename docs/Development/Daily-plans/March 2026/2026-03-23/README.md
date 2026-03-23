# 2026-03-23 — Consultation Verification v2

**Date:** 2026-03-23  
**Theme:** "Who left first" + 1-minute rule for payout eligibility

---

## Overview

Update video consultation verification so doctors are paid only when they fulfil their role. Track when doctor and patient leave; reject payout if doctor left first before 1 minute. Patient no-show or patient-left-first → pay doctor.

### Goals

- Add `doctor_left_at`, `patient_left_at` to appointments
- Handle Twilio `participant-disconnected` webhook
- Update `tryMarkVerified` with new eligibility logic
- Reduce MIN_VERIFIED to 60 seconds (from 120)

---

## Plan & Task Order

| Order | Task | Dependency | Est. |
|-------|------|-------------|------|
| 1 | [e-task-1: Migration](./e-task-1-consultation-left-at-migration.md) | — | 0.5 h |
| 2 | [e-task-2: Env MIN_VERIFIED 60](./e-task-2-min-verified-60.md) | — | 0.25 h |
| 3 | [e-task-3: participant-disconnected](./e-task-3-participant-disconnected.md) | e-task-1 | 1.5 h |
| 4 | [e-task-4: tryMarkVerified logic](./e-task-4-try-mark-verified-who-left-first.md) | e-task-1, 3 | 2 h |

---

## Reference

- [CONSULTATION_VERIFICATION_STRATEGY.md](../../../task-management/CONSULTATION_VERIFICATION_STRATEGY.md)
- [CONSULTATION_VERIFICATION_V2.md](../../../task-management/CONSULTATION_VERIFICATION_V2.md)
- [consultation-verification-service.ts](../../../../backend/src/services/consultation-verification-service.ts)

---

**Last Updated:** 2026-03-23
