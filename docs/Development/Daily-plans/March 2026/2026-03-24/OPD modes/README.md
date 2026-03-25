# OPD modes — implementation initiative



**Theme:** Implement **two** doctor-selectable OPD models — **`slot`** (fixed calendar) and **`queue`** (token + ETA + optional soft-time UX) — per [opd-systems-plan.md](./opd-systems-plan.md).



**Status:** ✅ **Complete** (2026-03-24)  

**Task management:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md) · [TASK_TEMPLATE.md](../../../../../task-management/TASK_TEMPLATE.md) · [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)



---



## Codebase reality (pre-flight)



| Area | Today | Gap vs plan |

|------|--------|-------------|

| **Scheduling** | Slot-first: `availability`, `blocked_times`, `getAvailableSlots`, `appointments.appointment_date` | **Queue** mode needs token/session model + ETA pipeline. |

| **Doctor config** | `doctor_settings` (interval, buffers, fees, payout…) — no `opd_mode` | Add mode + policy fields (see tasks). |

| **Appointments** | `pending` / `confirmed` / `cancelled` / `completed`; Twilio room fields | May need statuses or sidecar rows for **in_queue**, **missed**, **no_show**, **early_invite_pending** — task decides minimal extend. |

| **“Queue” in repo** | BullMQ job types — **not** patient OPD queue | Naming collision: use **opd_session** / **opd_token** in new code. |

| **Patient UI** | Public `book/*`, dashboard doctor-side | Plan **§6.4** patient detail states — may extend `book` + notifications first. |



> **Note:** The table above reflects the **pre-flight** state (March 2026). Implementation has since landed — see [opd-systems-plan.md](./opd-systems-plan.md) §13 and [OPD_SUPPORT_RUNBOOK.md](../../../../../Reference/OPD_SUPPORT_RUNBOOK.md).



**Reference docs:** [DB_SCHEMA.md](../../../../../Reference/DB_SCHEMA.md) · [API_DESIGN.md](../../../../../Reference/API_DESIGN.md) · [APPOINTMENT_BOOKING_FLOW_V2.md](../../../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md) · [DOCTOR_SETTINGS_PHASES.md](../../../../../Reference/DOCTOR_SETTINGS_PHASES.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../Reference/MIGRATIONS_AND_CHANGE.md) · [RLS_POLICIES.md](../../../../../Reference/RLS_POLICIES.md)



---



## Task index (recommended order)



| Order | File | Focus |

|-------|------|--------|

| 1 | [e-task-opd-01-domain-model-and-database-migrations.md](./e-task-opd-01-domain-model-and-database-migrations.md) | Schema: `opd_mode`, queue/session/token, telemetry; RLS; **DB_SCHEMA.md** sync |

| 2 | [e-task-opd-02-doctor-settings-api-and-practice-ui.md](./e-task-opd-02-doctor-settings-api-and-practice-ui.md) | GET/PATCH settings, practice UI for mode + policies |

| 3 | [e-task-opd-03-backend-opd-services-and-routing.md](./e-task-opd-03-backend-opd-services-and-routing.md) | Services: branch slot vs queue; ETA; snapshot inputs |

| 4 | [e-task-opd-04-patient-session-apis.md](./e-task-opd-04-patient-session-apis.md) | Authenticated/public snapshot, early join, delay |

| 5 | [e-task-opd-05-frontend-patient-appointment-ui.md](./e-task-opd-05-frontend-patient-appointment-ui.md) | §6.4 screens: list + detail by mode |

| 6 | [e-task-opd-06-frontend-doctor-dashboard-opd-controls.md](./e-task-opd-06-frontend-doctor-dashboard-opd-controls.md) | Queue board, slot controls, overflow actions |

| 7 | [e-task-opd-07-booking-bot-and-public-book-flows.md](./e-task-opd-07-booking-bot-and-public-book-flows.md) | DM/booking copy; `book/*` by mode |

| 8 | [e-task-opd-08-edge-cases-policies-reschedule-payment.md](./e-task-opd-08-edge-cases-policies-reschedule-payment.md) | Missed, overflow, post-consult return; payment transfer rules |

| 9 | [e-task-opd-09-notifications-observability-testing-docs.md](./e-task-opd-09-notifications-observability-testing-docs.md) | Push, polling/SSE, tests, observability, doc drift |



**Parallelism:** After **opd-01**, **opd-02** can overlap with **opd-03** design; **opd-04** depends on **opd-03**; frontends depend on **opd-04** APIs.



---



## Product source of truth



- [opd-systems-plan.md](./opd-systems-plan.md) — product rules **§5–§7**, patient UI **§6** (including **§6.4** dashboard plan).



---



*Initiative folder created for OPD implementation tracking. Initiative completed 2026-03-24.*

