# Task RBH-03: Merge upcoming appointments helper (cancel/reschedule)

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

**Deduplicate** the repeated logic in `webhook-worker.ts` that builds the list of related patients’ appointments, merges, sorts, and filters to **upcoming pending/confirmed** for cancel and reschedule flows. Single shared implementation reduces drift and bugs.

**Estimated Time:** 4–6 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — Refactor only; **no user-visible behavior change** — follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `backend/src/services/webhook-appointment-helpers.ts` with `buildRelatedPatientIdsForWebhook` and `getMergedUpcomingAppointmentsForRelatedPatients`; worker + `check_appointment_status` branch call the helper; unit tests in `webhook-appointment-helpers.test.ts`.
- ❌ **What's missing:** —
- ⚠️ **Notes:** Helper lives in service layer; `appointment-service.listAppointmentsForPatient` unchanged (same call pattern).

**Scope Guard:**
- Expected files touched: ≤ 4
- No schema or API changes.

**Reference Documentation:**
- [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit
- [x] 1.1 Locate both duplicate blocks; list inputs (doctorId, conversation patient, state fields) and outputs (`upcoming` list ordering rules).
- [x] 1.2 Confirm identical semantics; document any intentional difference (if none, proceed).

### 2. Extract & wire
- [x] 2.1 Introduce shared module or service function consumed by worker only (or by appointment-service if already appropriate).
- [x] 2.2 Replace both cancel and reschedule paths to call helper; delete duplicated code.

### 3. Verification
- [x] 3.1 Run type-check and existing tests; add or extend unit test for helper if pure enough.
- [x] 3.2 Manual sanity: cancel and reschedule with 0 / 1 / N upcoming appointments.

---

## 📁 Files to Create/Update

```
backend/src/services/webhook-appointment-helpers.ts
backend/src/workers/webhook-worker.ts
backend/tests/unit/services/webhook-appointment-helpers.test.ts
```

**When updating existing code:**
- [x] Remove obsolete duplicate loops entirely.
- [x] Update imports; no dead exports.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Same date ordering and status filter as today.
- No new database queries beyond current pattern (same call count order of magnitude).

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** N (read paths unchanged semantically)
- [x] **RLS verified?** N/A if same code paths
- [x] **Any PHI in logs?** N
- [x] **External API?** N

---

## ✅ Acceptance & Verification Criteria

- [x] Cancel and reschedule behavior unchanged per characterization tests (RBH-02) or manual checklist.
- [x] Duplicate block removed; type-check clean.

---

## 🔗 Related Tasks

- [RBH-02](./e-task-rbh-02-webhook-characterization-tests.md)
- [RBH-05](./e-task-rbh-05-split-webhook-worker-modules.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
