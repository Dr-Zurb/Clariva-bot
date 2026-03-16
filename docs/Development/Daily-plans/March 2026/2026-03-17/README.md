# Task Management — Tasks

Task files for development initiatives. See [TASK_MANAGEMENT_GUIDE.md](../TASK_MANAGEMENT_GUIDE.md) for process.

---

## Cancel & Reschedule Initiative

**Goal:** Patients can cancel or reschedule upcoming appointments via the bot (Instagram DM).

**Reference:** [FEATURE_PRIORITY.md](../../Business%20files/FEATURE_PRIORITY.md) §12–13

| # | Task | File | Est. |
|---|------|------|------|
| 1 | Appointment Cancellation | [e-task-cancel-appointment.md](./e-task-cancel-appointment.md) | 4–6 h |
| 2 | Appointment Rescheduling | [e-task-reschedule-appointment.md](./e-task-reschedule-appointment.md) | 5–7 h |

**Dependencies:** e-task-cancel-appointment → e-task-reschedule-appointment (reschedule reuses patient-ID and list-upcoming patterns from cancel)

---

## AI Receptionist Tasks

Task files for the [AI Receptionist — Human-Like Bot](../AI_RECEPTIONIST_PLAN.md) initiative.

| # | Task | File | Est. |
|---|------|------|------|
| 1 | AI-first extraction with context | [ai-receptionist-e-task-1-ai-first-extraction.md](./ai-receptionist-e-task-1-ai-first-extraction.md) | 4–5 h |
| 2 | Conversation-aware extraction | [ai-receptionist-e-task-2-conversation-aware-extraction.md](./ai-receptionist-e-task-2-conversation-aware-extraction.md) | 3–4 h |
| 3 | Human-like response generation | [ai-receptionist-e-task-3-human-like-responses.md](./ai-receptionist-e-task-3-human-like-responses.md) | 4–5 h |
| 4 | Simplify regex to fast-path only | [ai-receptionist-e-task-4-regex-fast-path.md](./ai-receptionist-e-task-4-regex-fast-path.md) | 2–3 h |

**Dependencies:** e-task-1 → e-task-2, e-task-3; e-task-1 + e-task-2 → e-task-4

---

**Last Updated:** 2026-03-28
