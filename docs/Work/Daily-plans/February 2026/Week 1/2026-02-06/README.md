# Daily Development Tasks - February 6, 2026
## MVP Completion: Connect Instagram + Doctor Setup

---

## 🎯 Goal

Implement the two MVP must-haves from [MVP completion planning](../../Future%20Planning/MVP%20completion%20planning.md):

1. **Must-have 1: In-app “Connect Instagram”** — Per-doctor Instagram (or Facebook Page) connection; webhook resolves `page_id` → `doctor_id`; no single `DEFAULT_DOCTOR_ID`.
2. **Must-have 2: Doctor setup** — Profile, availability, appointment methods & fees, services; single Setup/Settings area; booking and payment use these settings.

All work must follow [Reference docs](../../Reference/) (STANDARDS, ARCHITECTURE, RECIPES, COMPLIANCE) and [task-management](../../task-management/) (TASK_TEMPLATE, TASK_MANAGEMENT_GUIDE, CODE_CHANGE_RULES when updating existing code).

---

## 📋 Tasks Overview

### Must-have 1: Connect Instagram
1. **[e-task-1: Doctor Instagram storage & migration](./e-task-1-doctor-instagram-storage-migration.md)** ✅ — Table/columns, RLS, types for per-doctor Instagram link.
2. **[e-task-2: Webhook resolution page_id → doctor_id](./e-task-2-webhook-resolution-page-id-to-doctor-id.md)** — Resolve doctor from webhook payload; use in worker.
3. **[e-task-3: Connect flow (OAuth / callback)](./e-task-3-instagram-connect-flow-oauth.md)** — Backend OAuth redirect + callback; save token and page id for authenticated doctor.
4. **[e-task-4: Disconnect endpoint](./e-task-4-instagram-disconnect-endpoint.md)** — API to clear Instagram link for current doctor.
5. **[e-task-5: Frontend Settings Instagram UI](./e-task-5-frontend-settings-instagram-ui.md)** — Status, Connect, Disconnect with warning.
6. **[e-task-6: Remove DEFAULT_DOCTOR_ID reliance](./e-task-6-remove-default-doctor-id-reliance.md)** — Worker and config use page_id resolution only; document fallback if any.

### Must-have 2: Doctor Setup
7. **[e-task-7: Doctor profile backend](./e-task-7-doctor-profile-backend.md)** — Schema (if needed), GET/PUT profile API, Zod, RLS.
8. **[e-task-8: Availability & blocked_times API](./e-task-8-availability-blocked-times-api.md)** — Expose existing availability and blocked_times; timezone in profile/settings.
9. **[e-task-9: Appointment methods & fees](./e-task-9-appointment-methods-and-fees.md)** — Extend doctor_settings; API GET/PUT; Zod, RLS.
10. **[e-task-10: Services table & CRUD API](./e-task-10-services-table-and-crud-api.md)** — Services table (if missing), CRUD for doctor’s services.
11. **[e-task-11: Frontend Setup/Settings flow](./e-task-11-frontend-setup-settings-flow.md)** — Profile, Availability, Methods & fees, Services UI (wizard or tabs).
12. **[e-task-12: Booking & payment use doctor settings](./e-task-12-booking-payment-use-doctor-settings.md)** — Booking slots and payment fee/currency from doctor setup.

---

## ✅ Deliverables (MVP completion)

- **Connect Instagram:** Each doctor can connect one Instagram/Page; DMs attributed to that doctor; no global default doctor ID in code paths.
- **Doctor setup:** Each doctor can set profile, availability, methods & fees, services; booking and payment use these settings end-to-end.

---

## 📊 Progress Tracking

**Tasks completed:** 1 / 12

**Blockers:** [ ] No blockers

**Status:** 🟡 In progress

---

## 🔗 Related Docs

- [MVP completion planning](../../Future%20Planning/MVP%20completion%20planning.md) — Scope and acceptance criteria.
- [2025-01-09 1-month dev plan](../../Future%20Planning/2025-01-09_1month_dev_plan.md) — Phase 0 context.
- [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md) — Task execution.
- [TASK_TEMPLATE.md](../../task-management/TASK_TEMPLATE.md) — Task structure.
- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) — When changing existing code.

---

**Last updated:** 2026-02-06  
**Task management:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
