# Task 05 (optional): Analytics — intake complete vs registered
## 2026-04-15 — Open question backlog

---

## Task Overview

Explore **funnel metrics** distinguishing **intake complete (unpaid)** from **registered (MRN / visible in roster)** for product and ops. Not required for Phases A–D; pick up when analytics tooling or dashboards are prioritized.

**Estimated Time:** TBD (discovery + implementation)  
**Status:** DISCOVERY DONE — implementation deferred until product prioritizes  
**Completed:** 2026-04-15 (discovery + reference doc)

**Change Type:**
- [x] **Documentation / discovery** — [ANALYTICS_INTAKE_VS_REGISTERED.md](../../../../Reference/ANALYTICS_INTAKE_VS_REGISTERED.md)
- [ ] **New feature** — Metrics/events/schema — deferred

**Current State:**
- **What exists:** Webhook/OPD/DM metrics per [OBSERVABILITY.md](../../../../Reference/OBSERVABILITY.md); no dedicated MRN/registration counter (audit only). Summarized in analytics doc §2.
- **What's missing:** Product rule for “intake complete (unpaid)”; dashboards — use BI/SQL per doc §4.1 until §4.2 is built.
- **Notes:** Align event names with privacy/compliance ([COMPLIANCE.md](../../../../Reference/COMPLIANCE.md))

**Scope Guard:**
- No implementation in this task file until product confirms priority
- Do not log PHI in metrics

**Reference Documentation:**
- [15-04-2026 README](./README.md) — open questions §3
- [OBSERVABILITY.md](../../../../Reference/OBSERVABILITY.md)

---

## Task Breakdown

### 1. Discovery
- [x] 1.1 List existing events related to booking, consent, payment, MRN
- [x] 1.2 Decide whether new events or derived queries from DB are sufficient

### 2. Design (if proceeding)
- [x] 2.1 Define **intake_complete** vs **registered** (MRN assigned) for reporting
- [x] 2.2 Document in Reference or runbook

### 3. Implementation (if proceeding)
- [ ] 3.1 Implement minimal incremental tracking — **deferred** (see [ANALYTICS_INTAKE_VS_REGISTERED.md](../../../../Reference/ANALYTICS_INTAKE_VS_REGISTERED.md) §4.2)
- [ ] 3.2 Verify no PHI in payloads — **when 3.1 proceeds**

---

## Global Safety Gate

- [x] **PHI in metrics?** Must be No
- [x] **Consent for analytics?** Follow product/legal policy

---

## Related Tasks

- [Task 01](./task-01-patients-list-mrn-filter.md) — registration definition

---

**Last Updated:** 2026-04-15  
**Reference:** [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md)
