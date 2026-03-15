# 2026-03-18 — Booking for Others & Appointment Limits

**Date:** 2026-03-18  
**Theme:** Context-aware booking and spam prevention

---

## Overview

Two related improvements to the appointment booking flow:

1. **Booking for someone else** — When a user says "book for my mother" (or similar), the bot should collect the *other* person's details and book under their name, not reuse the conversation's patient.
2. **Appointment limit per day** — Enforce 1 appointment per patient per day (per doctor) to prevent spam and accidental double-booking.

---

## Task Order

| Order | Task | Dependency |
|-------|------|------------|
| 1 | [e-task-1: Booking for someone else](./e-task-1-booking-for-someone-else.md) | — |
| 2 | [e-task-2: Appointment limit per person per day](./e-task-2-appointment-limit-per-day.md) | — |

Tasks can be implemented in parallel; e-task-2 is simpler and may be done first if preferred.

---

## Reference

- [BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md](../../../Reference/BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md) — Design and semantics
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md) — Main booking flow
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md) — Intent map

---

**Last Updated:** 2026-03-18
