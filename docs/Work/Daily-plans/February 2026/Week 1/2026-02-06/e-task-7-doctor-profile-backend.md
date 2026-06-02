# Task 7: Doctor profile backend
## 2026-02-06 - Must-have 2: Doctor Setup

---

## 📋 Task Overview

Provide backend support for doctor profile: name, practice name, contact (email from auth), optional phone and address for display. If no dedicated table exists, add migration for `doctor_profiles` (or equivalent) keyed by doctor_id; then implement GET and PUT (or PATCH) for current doctor’s profile with Zod validation and RLS so doctor can only read/update their own row.

**Estimated Time:** 2–2.5 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [x] **New feature**
- [ ] **Update existing**

**Current State:**
- ✅ **What exists:** auth.users (doctors); doctor_settings (009); no doctor_profiles table or profile API.
- ❌ **What's missing:** doctor_profiles table (or equivalent) with name, practice_name, phone, address, timezone (optional); GET/PUT API; Zod schemas; RLS; TypeScript types.
- ⚠️ **Notes:** Email comes from auth; profile holds display name, practice name, phone, address. Timezone can live here or in doctor_settings for availability.

**Scope Guard:** Expected files touched: ≤ 6

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) - Read prior migrations first
- [RECIPES.md](../../Reference/engineering/development/RECIPES.md) - Add route, controller, service, validation
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - asyncHandler, Zod, AppError
- [RLS_POLICIES.md](../../Reference/engineering/compliance/RLS_POLICIES.md) - Doctor-only access

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration (if new table)
- [ ] 1.1 Read migrations 001–011 to follow naming and RLS patterns
- [ ] 1.2 Create migration: table doctor_profiles (doctor_id PK FK auth.users, display_name, practice_name, phone, address, timezone; created_at, updated_at); RLS: doctor SELECT/INSERT/UPDATE own row; service_role SELECT for worker if needed
- [ ] 1.3 Index on doctor_id (PK); trigger updated_at

### 2. TypeScript types
- [ ] 2.1 Types: DoctorProfile, InsertDoctorProfile, UpdateDoctorProfile; match schema
- [ ] 2.2 Zod schemas for API: get (no body); update (display_name?, practice_name?, phone?, address?, timezone?) with optional strings and max lengths

### 3. Service layer
- [ ] 3.1 getDoctorProfile(doctorId, correlationId, userId): validate ownership; return row or null
- [ ] 3.2 updateDoctorProfile(doctorId, data, correlationId, userId): validate ownership; upsert row; return updated profile; throw AppError on validation/DB error
- [ ] 3.3 Use user-scoped client for RLS; audit log read/update per COMPLIANCE

### 4. Controller and routes
- [ ] 4.1 GET `/api/v1/profile` or `/api/v1/doctors/me/profile`: auth required; doctorId = req.user.id; return profile or 200 with null/empty
- [ ] 4.2 PUT or PATCH `/api/v1/profile`: auth required; body validated with Zod; update and return profile
- [ ] 4.3 asyncHandler; successResponse; no PII in logs (only doctor_id in metadata if needed)

### 5. Verification
- [ ] 5.1 Unit tests: get/update with ownership; reject other doctor’s update
- [ ] 5.2 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 012_doctor_profiles.sql       (NEW - if new table)
├── src/
│   ├── services/
│   │   └── doctor-profile-service.ts  (NEW)
│   ├── controllers/
│   │   └── doctor-profile-controller.ts (NEW)
│   ├── routes/
│   │   └── api/v1/
│   │       └── profile.ts            (NEW) or doctors.ts
│   ├── types/
│   │   └── doctor-profile.ts         (NEW) or database.ts
│   └── utils/
│       └── validation.ts             (UPDATE - profile schemas)
```

**Existing Code Status:**
- ✅ auth.users - EXISTS (no profile fields)
- ❌ doctor_profiles table - MISSING
- ❌ Profile API - MISSING

**When creating a migration:**
- [ ] Read all previous migrations in order per [MIGRATIONS_AND_CHANGE.md](../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) §4

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- One row per doctor; doctor_id from JWT only; RLS enforces ownership.
- No PHI in logs; audit with correlationId and resource only.
- Controller uses asyncHandler and successResponse; service throws AppError.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y) → [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (MUST be No; profile may contain practice name/phone—treat as administrative, no logging of values)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Doctor can GET and PUT their profile; only own row accessible.
- [ ] Zod rejects invalid fields; response shape per API_DESIGN.
- [ ] Type-check and lint pass.

---

## 🔗 Related Tasks

- [e-task-8: Availability & blocked_times API](./e-task-8-availability-blocked-times-api.md)
- [e-task-11: Frontend Setup/Settings flow](./e-task-11-frontend-setup-settings-flow.md)

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
