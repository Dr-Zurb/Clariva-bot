# AI Receptionist — Service matching, staff review & payments (v1)

**Purpose:** Implement the **2026-04-01** plan: complaint-driven **service matching** (no patient price-shopping), **mandatory “Other / not listed”** catalog row, **high vs low confidence** routing, **doctor/staff inbox** with **audit**, **24h SLA**, **no slot** until staff confirm on low-confidence path, **capture only** when policy allows (**single final payment**; no v1 incremental/holding fees).

**Status:** Planning  
**Created:** 2026-04-02  
**Plan:** [plan-ai-receptionist-service-matching-and-booking.md](../Development/Daily-plans/April%202026/01-04-2026/plan-ai-receptionist-service-matching-and-booking.md)  
**Task files:** [tasks/README.md](../Development/Daily-plans/April%202026/01-04-2026/tasks/README.md)

---

## Task list (execution order)

| Order | Task |
|-------|------|
| 1 | [e-task-arm-01](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-01-mandatory-other-not-listed-catalog.md) — Mandatory Other / not listed |
| 2 | [e-task-arm-02](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-02-matcher-hints-catalog-fields.md) — Matcher hint fields (optional) |
| 3 | [e-task-arm-03](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-03-conversation-state-match-and-review.md) — Conversation state |
| 4 | [e-task-arm-06](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-06-pending-review-persistence-and-apis.md) — DB + APIs (before DM can persist pending) |
| 5 | [e-task-arm-04](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-04-service-matcher-engine.md) — Matcher engine |
| 6 | [e-task-arm-05](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-05-dm-flow-high-vs-pending-staff.md) — DM branching |
| 7 | [e-task-arm-07](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-07-doctor-review-inbox-ui.md) — Doctor inbox |
| 8 | [e-task-arm-08](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-08-sla-timeout-and-patient-notify.md) — SLA + notify |
| 9 | [e-task-arm-09](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-09-slot-page-info-and-book-prefill.md) — slot-page-info + /book |
| 10 | [e-task-arm-10](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-10-pay-after-staff-confirm.md) — Pay after confirm |
| 11 | [e-task-arm-11](../Development/Daily-plans/April%202026/01-04-2026/tasks/e-task-arm-11-catalog-quote-fallback-safety.md) — Quote fallback safety |

---

## Locked decisions (from plan §0)

- **Catch-all label:** Other / not listed; stable **`service_key`** (e.g. `other`).  
- **Slots:** No hold until staff confirm for low-confidence path.  
- **SLA:** 24h default.  
- **Payments v1:** High confidence → existing capture pattern; low/ambiguous → **no capture** until staff resolution; **no** incremental charges or holding fees.  
- **Reject:** No structured reject-reason taxonomy; **confirm / reassign / cancel**; catalog defines modalities.  
- **Audit:** Mandatory on staff resolution.

---

## Related

- [AI_RECEPTIONIST_PLAN.md](./AI_RECEPTIONIST_PLAN.md) — broader human-like bot (extraction/response); **orthogonal** to this initiative’s **service routing + staff queue**.
- SFU catalog / quote: `docs/Development/Daily-plans/March 2026/2026-03-27/services-and-follow-ups/`

---

**Last Updated:** 2026-04-02
