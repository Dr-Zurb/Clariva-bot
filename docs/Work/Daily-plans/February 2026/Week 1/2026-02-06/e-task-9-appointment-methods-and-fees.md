# Task 9: Appointment methods & fees
## 2026-02-06 - Must-have 2: Doctor Setup

---

## 📋 Task Overview

Extend doctor_settings (or add related structure) to support appointment methods (e.g. “Text/chat”, “Voice call”, “Video call”) and fee per method, plus currency. Expose GET and PUT via API so the doctor can set methods and fee per method (and currency). Booking and payment (e-task-12) will consume these settings. Reuse existing doctor_settings where possible; add columns or a related table per schema design (e.g. fee_per_method JSONB or separate rows).

**Estimated Time:** 2.5–3 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Extend doctor_settings table and/or service; follow [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** doctor_settings (009): doctor_id, appointment_fee_minor, appointment_fee_currency, country; getDoctorSettings(doctorId); no UI or API for doctor to set; worker uses getDoctorSettings for payment link.
- ❌ **What's missing:** Schema for “methods” and fee per method (e.g. text/voice/video and amount per method); GET/PUT API for appointment settings; Zod validation; RLS already exists on doctor_settings.
- ⚠️ **Notes:** MVP can use single fee for all methods or fee_per_method (e.g. JSONB { text: 1000, voice: 2000 } in minor units). Currency already in doctor_settings.

**Scope Guard:** Expected files touched: ≤ 6

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) - Migration for new columns
- [RECIPES.md](../../Reference/engineering/development/RECIPES.md) - Add route, controller, service
- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) - When changing existing code
- [DB_SCHEMA.md](../../Reference/engineering/architecture/DB_SCHEMA.md) - doctor_settings

---

## ✅ Task Breakdown (Hierarchical)

### 1. Schema extension
- [ ] 1.1 Read migrations 001–012; decide: add columns to doctor_settings (e.g. appointment_methods TEXT[] or JSONB, fee_per_method JSONB) or new table. Prefer backward compatible: nullable new columns; existing appointment_fee_minor remains as default/single fee.
- [ ] 1.2 Migration: add columns (e.g. fee_per_method JSONB { method: minor_amount }) and/or appointment_methods (array or JSONB); document in migration header
- [ ] 1.3 RLS: no change (doctor_settings already RLS); service_role can read for worker

### 2. TypeScript types and Zod
- [ ] 2.1 Update DoctorSettingsRow and types: fee_per_method optional; appointment_methods optional; Zod schema for PUT: { appointment_fee_minor?, appointment_fee_currency?, country?, appointment_methods?, fee_per_method? } with allowed method keys (e.g. text, voice, video) and number (minor units)
- [ ] 2.2 Validate method names and non-negative fees

### 3. Service layer
- [ ] 3.1 getDoctorSettings already exists; ensure it returns new fields
- [ ] 3.2 Add or extend: updateDoctorSettings(doctorId, data, correlationId, userId): validate ownership; update doctor_settings row; return updated row; throw AppError on validation/DB error
- [ ] 3.3 Audit log update per COMPLIANCE

### 4. Controller and routes
- [ ] 4.1 GET `/api/v1/settings/appointment` or `/api/v1/doctor-settings`: auth required; return current doctor’s settings (fee, currency, country, methods, fee_per_method)
- [ ] 4.2 PUT `/api/v1/settings/appointment`: auth required; body Zod; update and return settings
- [ ] 4.3 asyncHandler; successResponse; no PII in logs

### 5. Verification
- [ ] 5.1 Unit tests: get/update with ownership; worker still gets settings for payment (e-task-12 will use)
- [ ] 5.2 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 013_doctor_settings_methods_fees.sql  (NEW - add columns)
├── src/
│   ├── services/
│   │   └── doctor-settings-service.ts       (UPDATE - updateDoctorSettings, return new fields)
│   ├── controllers/
│   │   └── doctor-settings-controller.ts      (NEW)
│   ├── routes/
│   │   └── api/v1/
│   │       └── settings.ts                   (NEW) or doctor-settings.ts
│   └── types/
│       └── doctor-settings.ts                 (UPDATE - new fields)
```

**Existing Code Status:**
- ✅ doctor_settings table - EXISTS (009); doctor-settings-service getDoctorSettings
- ⚠️ doctor_settings - UPDATE (add columns); service - UPDATE (update + new fields)
- ❌ GET/PUT API - MISSING

**When updating existing code:**
- [ ] Audit: doctor-settings-service, worker (getDoctorSettings), payment-service
- [ ] Map: new columns; worker continues to use getDoctorSettings (return fee per method or single fee for backward compat)
- [ ] Update tests and types per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Backward compatibility: existing appointment_fee_minor/currency still used if fee_per_method absent.
- Controller uses asyncHandler; service throws AppError; no PHI in logs.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – doctor_settings) → [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Doctor can GET and PUT appointment settings including methods and fee per method (and currency).
- [ ] Worker and payment flow can still read settings (e-task-12 will use for fee/currency).
- [ ] Type-check and lint pass.

---

## 🔗 Related Tasks

- [e-task-10: Services table & CRUD API](./e-task-10-services-table-and-crud-api.md)
- [e-task-12: Booking & payment use doctor settings](./e-task-12-booking-payment-use-doctor-settings.md)

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
