# Task 10: Services table & CRUD API
## 2026-02-06 - Must-have 2: Doctor Setup

---

## 📋 Task Overview

Introduce a “services” concept so doctors can maintain a list of offered services (e.g. “General consultation”, “Follow-up”, “Procedure X”). Add migration for `services` table (or equivalent) linked to doctor_id; optional “allowed_methods” per service for MVP. Implement CRUD API (list, create, update, delete) for the current doctor’s services. All endpoints require auth and RLS so doctor only manages their own services.

**Estimated Time:** 2.5–3 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [x] **New feature**
- [ ] **Update existing**

**Current State:**
- ✅ **What exists:** No services table in 001–009; appointments reference doctor and patient but not a “service” type.
- ❌ **What's missing:** services table (id, doctor_id, name, optional allowed_methods, sort_order?); RLS; TypeScript types; service layer; CRUD API with Zod.
- ⚠️ **Notes:** MVP can keep allowed_methods optional (one set of methods for all services); add per-service methods later if needed.

**Scope Guard:** Expected files touched: ≤ 6

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../Reference/MIGRATIONS_AND_CHANGE.md) - Read prior migrations first
- [RECIPES.md](../../Reference/RECIPES.md) - Add route, controller, service
- [STANDARDS.md](../../Reference/STANDARDS.md) - asyncHandler, Zod, AppError
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md) - Doctor-only access

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [ ] 1.1 Read migrations 001–013; follow naming and RLS patterns
- [ ] 1.2 Create table services: id UUID PK, doctor_id UUID NOT NULL FK auth.users ON DELETE CASCADE, name TEXT NOT NULL, allowed_methods TEXT[] or JSONB NULL (optional), sort_order INT default 0; created_at, updated_at; index on doctor_id
- [ ] 1.3 RLS: doctor SELECT/INSERT/UPDATE/DELETE own rows (WHERE doctor_id = auth.uid()); service_role SELECT for worker/booking if needed
- [ ] 1.4 Trigger updated_at

### 2. TypeScript types and Zod
- [ ] 2.1 Types: Service, InsertService, UpdateService; match schema
- [ ] 2.2 Zod: create { name, allowed_methods?, sort_order? }; update { name?, allowed_methods?, sort_order? }; validate name non-empty, allowed_methods array of allowed enum if present

### 3. Service layer
- [ ] 3.1 listServices(doctorId, correlationId, userId): validate ownership; return array
- [ ] 3.2 createService(doctorId, data, correlationId, userId): validate ownership; insert; return created row
- [ ] 3.3 updateService(serviceId, doctorId, data, correlationId, userId): validate ownership (service.doctor_id = doctorId); update; return row
- [ ] 3.4 deleteService(serviceId, doctorId, correlationId, userId): validate ownership; delete; 404 if not found
- [ ] 3.5 Audit log per COMPLIANCE; no PHI in logs

### 4. Controller and routes
- [ ] 4.1 GET `/api/v1/services`: auth; return list for req.user.id
- [ ] 4.2 POST `/api/v1/services`: auth; body Zod; create; return 201 and body
- [ ] 4.3 PATCH `/api/v1/services/:id`: auth; body Zod; update; return updated
- [ ] 4.4 DELETE `/api/v1/services/:id`: auth; delete; return 204 or 200
- [ ] 4.5 All asyncHandler; 404 when resource not found or not owned

### 5. Verification
- [ ] 5.1 Unit tests: CRUD with ownership; reject other doctor’s service id
- [ ] 5.2 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 014_services.sql              (NEW)
├── src/
│   ├── services/
│   │   └── services-service.ts       (NEW - name conflict with "services" folder possible; use doctor-services-service or service-catalog-service)
│   ├── controllers/
│   │   └── services-controller.ts     (NEW)
│   ├── routes/
│   │   └── api/v1/
│   │       └── services.ts            (NEW)
│   └── types/
│       └── service.ts                 (NEW) or database.ts
```

**Existing Code Status:**
- ❌ services table - MISSING
- ❌ Services API - MISSING

**When creating a migration:**
- [ ] Read all previous migrations in order per [MIGRATIONS_AND_CHANGE.md](../../Reference/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) §4

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- One service row per id; doctor_id on every row; RLS enforces ownership.
- Naming: avoid reserved “services” for route path if it conflicts with Express (e.g. /api/v1/doctor-services).
- Controller uses asyncHandler; service throws AppError.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y) → [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Doctor can list, create, update, delete their services via API.
- [ ] Only own services are accessible; 404 for wrong doctor or missing id.
- [ ] Type-check and lint pass.

---

## 🔗 Related Tasks

- [e-task-11: Frontend Setup/Settings flow](./e-task-11-frontend-setup-settings-flow.md)
- [e-task-12: Booking & payment use doctor settings](./e-task-12-booking-payment-use-doctor-settings.md) (optional: booking shows service list)

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
