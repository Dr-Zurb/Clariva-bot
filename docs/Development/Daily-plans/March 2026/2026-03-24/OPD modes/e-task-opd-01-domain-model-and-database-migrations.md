# Task OPD-01: Domain model & database migrations (OPD modes)

## 2026-03-24 — OPD initiative

---

## 📋 Task Overview

Define and migrate **database support** for doctor-selectable **`slot` | `queue`** OPD modes: minimal new tables/columns, RLS, indexes, and sync **[DB_SCHEMA.md](../../../../../Reference/DB_SCHEMA.md)**. This task is the **foundation** for all follow-on API and UI work per [opd-systems-plan.md](./opd-systems-plan.md).

**Estimated Time:** 8–16 hours (depends on schema breadth chosen in 1.1)  
**Status:** ✅ **IMPLEMENTED** (schema + types + docs; apply migration to target DB before deploy)  
**Completed:** 2026-03-24

**Change Type:**
- [x] **New feature** — additive schema + types (preserve existing slot behavior as default)

**Current State:** (audit before coding)
- ✅ **`doctor_settings`** — exists (`backend/migrations/009`, `012`, `025`…); no `opd_mode` (`backend/src/types/doctor-settings.ts` — verify path in repo root).
- ✅ **`appointments`** — `appointment_date`, `status` CHECK, Twilio/consultation fields (`021`, `023`…); no queue token columns.
- ✅ **Availability** — slot grid via `availability` + `availability-service.ts`; public booking `bookings.ts` / `booking-controller.ts`.
- ❌ **OPD queue** — no `opd_session` / token table; repo **`queue.ts`** = BullMQ jobs — do **not** reuse that name for patient queue.
- ⚠️ **Migrations** live in **`backend/migrations/`** (not `supabase/migrations`) — see [MIGRATIONS_AND_CHANGE.md](../../../../../Reference/MIGRATIONS_AND_CHANGE.md).

**Scope Guard:**
- One new migration file (or split only if reviewed); expected **≤ 8** application files touched for types + migration apply notes.
- Any **wide** status enum change on `appointments` requires explicit product sign-off (prefer additive columns first).

**Reference Documentation:**
- [TASK_TEMPLATE.md](../../../../../task-management/TASK_TEMPLATE.md) · [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)
- [DB_SCHEMA.md](../../../../../Reference/DB_SCHEMA.md) · [RLS_POLICIES.md](../../../../../Reference/RLS_POLICIES.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../Reference/MIGRATIONS_AND_CHANGE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Design decisions (document before DDL)

- [x] 1.1 **Choose schema strategy** — **Option A:** `doctor_settings.opd_mode` + `opd_policies` JSONB; **`opd_queue_entries`** for queue rows (no separate `doctor_opd_settings` table for MVP).
- [x] 1.1.3 **Queue storage:** `opd_queue_entries` (doctor_id, appointment_id, session_date, token_number, position, status). **Deferred:** `opd_daily_sessions` (add in later task if needed).
- [x] 1.1.4 **Consult duration telemetry:** deferred — use existing `appointments.consultation_duration_seconds` for rolling ETA (opd-03).
- [x] 1.2 **RLS model:** doctor-only JWT policies on `opd_queue_entries`; patient access via service role APIs.

### 2. Migration authoring

- [x] 2.1 Latest migration before this work: **027**; added **`028_opd_modes.sql`**.
- [x] 2.2 `doctor_settings`: `opd_mode`, `opd_policies`; table `opd_queue_entries` with FKs and indexes.
- [x] 2.3 **Default** `opd_mode = 'slot'` (NOT NULL DEFAULT).
- [x] 2.4 **RLS** on `opd_queue_entries` + DROP IF EXISTS for idempotent re-run.

### 3. Types & documentation

- [x] 3.1 `doctor-settings.ts` (`OpdMode`, `opd_mode`, `opd_policies`); `database.ts` (`OpdQueueEntry`, `OpdQueueEntryStatus`, insert/update types).
- [x] 3.2 `frontend/types/doctor-settings.ts` updated.
- [x] 3.3 **DB_SCHEMA.md** — `doctor_settings` expanded; **`opd_queue_entries`** section added.
- [x] 3.4 **RLS_POLICIES.md** — `opd_queue_entries` policies documented.

### 4. Verification

- [ ] 4.1 **Apply `028_opd_modes.sql`** to Supabase / dev DB (operator step).
- [x] 4.2 Backend `npm run build` (tsc) passes.
- [x] 4.3 Migration comments contain no PHI.

---

## 📁 Files to Create/Update

```
backend/migrations/NNN_opd_modes_....sql
backend/src/types/doctor-settings.ts
backend/src/types/database.ts (if needed)
docs/Reference/DB_SCHEMA.md
```

**Existing Code Status:**
- ✅ `backend/migrations/*` — EXISTS; follow numbering.
- ✅ `doctor_settings` — EXISTS.
- ❌ OPD queue tables — MISSING (this task).

---

## 🧠 Design Constraints (constraints only)

- **Default `opd_mode`:** `slot` for all existing rows (no behavior break).
- **Naming:** avoid `queue` as table name alone — prefer `opd_queue_entries` or `patient_queue_entries`.
- **COMPLIANCE:** No sensitive free-text in policy JSON that isn’t needed.

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** Y → **RLS verified** for new tables
- [ ] **PHI in logs?** N
- [ ] **External API?** N (migration only)
- [ ] **Retention impact?** Document if new samples table has TTL policy later

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration applies cleanly; backfill correct.
- [ ] DB_SCHEMA.md matches reality.
- [ ] RLS enabled + policies documented/updated in RLS_POLICIES if required by repo standards.

---

## 🔗 Related Tasks

- [e-task-opd-02-doctor-settings-api-and-practice-ui.md](./e-task-opd-02-doctor-settings-api-and-practice-ui.md)
- [e-task-opd-03-backend-opd-services-and-routing.md](./e-task-opd-03-backend-opd-services-and-routing.md)

---

**Last Updated:** 2026-03-24  
**Reference:** [README.md](./README.md)
