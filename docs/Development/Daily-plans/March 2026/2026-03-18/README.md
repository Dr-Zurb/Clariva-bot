# 2026-03-18 — Booking for Others, Appointment Limits & Comments Management

**Date:** 2026-03-18  
**Theme:** Context-aware booking, spam prevention, and comment-based lead acquisition

---

## Overview

### Booking & Limits (Existing)

1. **Booking for someone else** — When a user says "book for my mother" (or similar), the bot should collect the *other* person's details and book under their name, not reuse the conversation's patient.
2. **Appointment limit per day** — Enforce 1 appointment per patient per day (per doctor) to prevent spam and accidental double-booking.

### Comments Management (New)

3. **Comment-based leads** — Detect high-intent comments (booking, availability, pricing, medical queries) on Instagram posts; send public reply ("Check your DM") + proactive DM with doctor details. Connect only with genuine medical/practice-related inquiries; filter out jokes, memes, vulgar, spam.

---

## Task Order

### Booking & Limits

| Order | Task | Dependency |
|-------|------|------------|
| 1 | [e-task-1: Booking for someone else](./e-task-1-booking-for-someone-else.md) | — |
| 2 | [e-task-2: Appointment limit per person per day](./e-task-2-appointment-limit-per-day.md) | — |

Tasks can be implemented in parallel; e-task-2 is simpler and may be done first if preferred.

### Comments Management

| Order | Task | Dependency |
|-------|------|------------|
| — | [COMMENTS_MANAGEMENT_PLAN.md](./COMMENTS_MANAGEMENT_PLAN.md) | Master plan |
| 1 | [e-task-3: Comment leads migration](./e-task-3-comment-leads-migration.md) | — |
| 2 | [e-task-4: Comment webhook types and routing](./e-task-4-comment-webhook-types-and-routing.md) | — |
| 3 | [e-task-5: Comment doctor–media mapping](./e-task-5-comment-doctor-media-mapping.md) | — |
| 4 | [e-task-6: Comment intent classifier](./e-task-6-comment-intent-classifier.md) | — |
| 5 | [e-task-7: Comment worker and outreach](./e-task-7-comment-worker-and-outreach.md) | 3, 4, 5, 6 |

**Dependencies:** e-task-3 and 4 can run in parallel; e-task-5 and 6 can run in parallel; e-task-7 depends on all.

---

## Reference

- [BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md](../../../Reference/BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md) — Design and semantics
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md) — Main booking flow
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md) — Intent map
- [PROBLEM_STATEMENTS.md](../../../Business%20files/PROBLEM_STATEMENTS.md) — Comment volume (20–50/week)
- [COMMENTS_MANAGEMENT_PLAN.md](./COMMENTS_MANAGEMENT_PLAN.md) — Comment leads: intents, flow, templates

---

**Last Updated:** 2026-03-18
