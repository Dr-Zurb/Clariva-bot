# Task onb-01: Onboarding readiness-status API (backend)

> **Filename:** `task-onb-01-readiness-status-api.md`
> **Links:** batch [`../plan-doctor-onboarding-v1-batch.md`](../plan-doctor-onboarding-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-onboarding-v1.md`](./EXECUTION-ORDER-doctor-onboarding-v1.md)

---

## 📋 Task Overview

One read-only, doctor-scoped endpoint that returns the go-live checklist state, **derived** from existing data (no new table).

`GET /api/v1/dashboard/onboarding/status` →
```
{
  instagramConnected: boolean,
  practiceInfoSet: boolean,     // doctor_settings.practice_name present
  pricingSet: boolean,          // catalog_mode != null AND (fee OR ≥1 catalog offering)
  availabilitySet: boolean,     // ≥1 availability row
  complete: boolean             // all four true
}
```

**Batch:** doctor-onboarding-v1 · Wave 1
**Status:** ✅ Complete
**Change Type:** New feature — read-only endpoint + service (+ tests).

**Current State:**
- ✅ IG status source: existing Instagram status service/endpoint (mirror what `getInstagramStatus` reads).
- ✅ `doctor_settings` read via `doctor-settings-service` (`practice_name`, `catalog_mode`, fee, `service_offerings_json`).
- ✅ `availability` table exists (001 schema), doctor-scoped.
- ✅ Pattern to mirror: `dashboard-insights-controller.ts` / `dashboard-insights-service.ts` (read-only, `req.user.id` only).
- ❌ No onboarding route/controller/service.

**Scope Guard:**
- One route + one controller + one service (+ helpers) + one test file; one line in `index.ts`.
- **DO NOT** add a migration or write to any table — read-only.
- **DO NOT** return raw settings/availability rows — booleans only.

---

## ✅ Task Breakdown

### 1. Route + controller
- [x] 1.1 New route file; register under `/dashboard/onboarding` in `routes/api/v1/index.ts`.
- [x] 1.2 `getOnboardingStatusHandler` — `asyncHandler`, `authenticateToken`, `req.user.id` as the only doctor id; `successResponse`.

### 2. Service
- [x] 2.1 `getOnboardingStatus({ doctorId })` composing the four signals from existing services/tables.
- [x] 2.2 `pricingSet` truth table: `catalog_mode === 'single_fee'` with a fee, OR `catalog_mode === 'multi_service'` with ≥1 offering.
- [x] 2.3 `complete` = AND of the four.

### 3. Tests
- [x] 3.1 Each signal independently true/false; `complete` only when all true.
- [x] 3.2 Fresh doctor (no settings row) → all false, no throw.
- [x] 3.3 Auth: missing token → 401; never reads another doctor's data.

### 4. Verification
- [x] 4.1 `cd backend && npm run type-check && npm run lint` (slice) clean.
- [x] 4.2 `npm test` — onboarding service + controller green.

---

## 📁 Files to Create/Update

```
CREATE: backend/src/routes/api/v1/dashboard-onboarding.ts
CREATE: backend/src/controllers/dashboard-onboarding-controller.ts
CREATE: backend/src/services/dashboard-onboarding-service.ts
CREATE: backend/src/**/__tests__/dashboard-onboarding-service.test.ts
UPDATE: backend/src/routes/api/v1/index.ts
READ:   backend/src/controllers/dashboard-insights-controller.ts (pattern)
DO NOT TOUCH: any migration; any write path
```

## 🧠 Design Constraints

- Read-only + booleans only (no raw rows, no PII).
- Doctor-scoped via `req.user.id`; RLS enforced.
- Controller orchestrates; logic in service; mirror insights, don't fork.

## 🌍 Global Safety Gate

- **Data touched?** Y (reads only) — doctor-scoped, RLS. No writes, no new table.
- **PHI in logs?** No.
- **External API / AI?** Reads IG connection status only (no message content).
- **Retention/deletion impact?** No.

## ✅ Acceptance Criteria

- [x] Endpoint returns the 4 booleans + `complete`, doctor-scoped, read-only, Zod-safe.
- [x] Fresh doctor → all false without error.
- [x] Backend gate green; no frontend; no migration.

**Created:** 2026-07-22.
