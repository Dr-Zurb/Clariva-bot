# Task OPD-09: Notifications, observability, testing & documentation

## 2026-03-24 — OPD initiative

---

## 📋 Task Overview

Close the OPD initiative with **push/in-app notifications** for delay, early invite, turn soon; **observability** (metrics/logs for mode, queue depth, ETA errors); **automated tests** (integration + critical e2e); and **documentation** updates: [DB_SCHEMA.md](../../../../../Reference/DB_SCHEMA.md), [APPOINTMENT_BOOKING_FLOW_V2.md](../../../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md), [ARCHITECTURE.md](../../../../../Reference/ARCHITECTURE.md) if new modules — per [AI_AGENT_RULES.md](../../../../../Reference/AI_AGENT_RULES.md) Doc Drift Guard.

**Estimated Time:** 10–16 hours  
**Status:** ✅ **DONE** (2026-03-24)

**Change Type:**
- [x] **Update existing** + new test files

**Current State:**
- ✅ In-app **hint types** on session snapshot: `delay_broadcast`, `early_invite`, `your_turn_soon` (+ `queue_position_changed` in contract for client-side diff); **TurnSoonBanner** when `your_turn_soon`.
- ✅ **Observability:** structured log lines `opd_booking_total`, `opd_eta_computed_total`, `opd_queue_reinsert_total` ([OBSERVABILITY.md](../../../../../Reference/OBSERVABILITY.md)).
- ✅ **Tests:** `opd-notification-hints.test.ts`; snapshot tests updated for `inAppNotifications`.
- ✅ **Docs:** [OPD_SUPPORT_RUNBOOK.md](../../../../../Reference/OPD_SUPPORT_RUNBOOK.md), README OPD folder, [CONTRACTS.md](../../../../../Reference/CONTRACTS.md), [opd-systems-plan.md](./opd-systems-plan.md) §13.

**Scope Guard:** MVP = **polling** + snapshot hints; no Meta DM for OPD live status.

**Reference Documentation:**
- [OBSERVABILITY.md](../../../../../Reference/OBSERVABILITY.md) · [TESTING.md](../../../../../Reference/TESTING.md)
- [DEFINITION_OF_DONE.md](../../../../../Reference/DEFINITION_OF_DONE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Notifications

- [x] 1.1 Event list: `delay_broadcast`, `early_invite`, `your_turn_soon`; `queue_position_changed` documented for **client diff** (token/ahead between polls).
- [x] 1.2 Consumer: **`inAppNotifications`** on GET snapshot + patient UI banner for turn soon.
- [x] 1.3 Doctor browser push — **deferred** (optional).

### 2. Observability

- [x] 2.1 Log-derived counters: `opd_booking_total{mode}`, `opd_eta_computed_total`, `opd_queue_reinsert_total{strategy}`.
- [x] 2.2 No PHI in metric labels; `correlationId` only.

### 3. Testing

- [x] 3.1 Unit tests: notification hints + snapshot shape; full DB integration path deferred (existing snapshot mocks).
- [x] 3.2 Regression: `opd-snapshot-service.test.ts`, `appointment-service.test.ts` run clean.

### 4. Documentation

- [x] 4.1 [README.md](./README.md) — **Done** + date.
- [x] 4.2 **ERROR_CATALOG** — no new HTTP codes in this task.
- [x] 4.3 **ARCHITECTURE** — `services/opd/` noted.

### 5. Handoff

- [x] 5.1 [OPD_SUPPORT_RUNBOOK.md](../../../../../Reference/OPD_SUPPORT_RUNBOOK.md)

---

## 📁 Files to Create/Update

```
backend/src/services/opd/opd-metrics.ts
backend/src/services/opd/opd-notification-hints.ts
backend/src/services/opd-snapshot-service.ts
backend/src/services/appointment-service.ts
backend/src/services/opd/opd-queue-service.ts
backend/src/types/opd-session.ts
backend/tests/unit/services/opd-notification-hints.test.ts
backend/tests/unit/services/opd-snapshot-service.test.ts
frontend/components/opd/TurnSoonBanner.tsx
frontend/components/opd/PatientVisitSession.tsx
frontend/types/opd-session.ts
docs/Reference/OBSERVABILITY.md, CONTRACTS.md, ARCHITECTURE.md, APPOINTMENT_BOOKING_FLOW_V2.md
docs/Reference/OPD_SUPPORT_RUNBOOK.md
docs/Development/.../OPD modes/README.md, opd-systems-plan.md
```

---

## 🌍 Global Safety Gate

- [x] **No PHI** in metrics labels
- [x] **Load tests** — optional; not required for MVP

---

## 🔗 Related Tasks

- Depends on: core tasks **opd-01** through **opd-08** (incremental delivery OK)

---

## ✅ Acceptance (initiative-level)

- [x] OPD task files **opd-01–opd-09** marked complete with dates (see each file)
- [x] `opd-systems-plan.md` **§13** implementation notes + links

---

**Last Updated:** 2026-03-24
