# Task 4: Appointments List & Detail
## February 3, 2026 – Week 4: Doctor Dashboard Frontend Day 3–4

---

## 📋 Task Overview

Build the appointments list page and appointment detail view for the doctor dashboard (**doctor view appointments** per BUSINESS_PLAN). List shows the doctor’s appointments (from backend API); detail view shows one appointment by ID. Include loading and error states; use canonical API response format per CONTRACTS. Filtering by date/status can be deferred; this task focuses on list + detail and API connection for appointments.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-02-03

**Change Type:**
- [x] **New feature** — Add appointments list and detail UI and API client usage
- [ ] **Update existing** — N/A

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** Backend **GET /api/v1/appointments** (list; doctor auth), **GET /api/v1/appointments/:id** (detail; doctor auth), **POST /api/v1/appointments/book**, **GET /api/v1/appointments/available-slots**. Backend returns canonical `{ success, data, meta }` per CONTRACTS. Frontend **`lib/api.ts`** (getAppointments, getAppointmentById; Bearer token); **`types/appointment.ts`**; **`app/dashboard/appointments/page.tsx`** (list with loading/error); **`app/dashboard/appointments/[id]/page.tsx`** (detail; 404/403 handling); loading.tsx for list and detail.
- ❌ **What's missing:** Nothing for this task.
- ⚠️ **Notes:** List response is `data: { appointments: Appointment[] }`. No PHI in logs.

**Scope Guard:**
- Expected files touched: frontend pages, API client, types; backend only if list endpoint is added
- Any expansion requires explicit approval

**Reference Documentation:**
- [FRONTEND_ARCHITECTURE.md](../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) - Data fetching; API client (`lib/api.ts`); types in `types/` or lib
- [FRONTEND_STANDARDS.md](../../Reference/engineering/development/FRONTEND_STANDARDS.md) - API consumption; loading/error states; no PII in logs; auth for protected endpoints
- [FRONTEND_RECIPES.md](../../Reference/engineering/development/FRONTEND_RECIPES.md) - **F1** typed API client; **F4** loading/error states (Suspense, role="alert")
- [FRONTEND_COMPLIANCE.md](../../Reference/engineering/compliance/FRONTEND_COMPLIANCE.md) - No PII/PHI in URLs or logs; auth; data minimization
- [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/engineering/development/DEFINITION_OF_DONE_FRONTEND.md) - §1 Code/Structure, §2 Data and API, §3 Accessibility (errors visible/announced), §5 Security/Privacy
- [FRONTEND_TESTING.md](../../Reference/engineering/development/FRONTEND_TESTING.md) - Testing list/detail flows; mocks per CONTRACTS
- [CONTRACTS.md](../../Reference/engineering/architecture/CONTRACTS.md) - Success/error response format; PaginatedResponse if list is paginated
- [PAGINATION.md](../../Reference/engineering/development/PAGINATION.md) - List endpoint pagination (data.items + data.pagination) if used
- [API_DESIGN.md](../../Reference/engineering/architecture/API_DESIGN.md) - REST, versioning
- [DB_SCHEMA.md](../../Reference/engineering/architecture/DB_SCHEMA.md) - appointments table (id, doctor_id, patient_name, patient_phone, appointment_date, status, notes)
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - No PHI in logs; doctor-only access

---

## ✅ Task Breakdown (Hierarchical)

### 1. Backend: List Appointments (if not present)
- [x] 1.1 If backend has no list endpoint: add `GET /api/v1/appointments` (or `GET /api/v1/doctors/me/appointments`) requiring auth, returning doctor’s appointments (filter by `req.user.id` or JWT doctor_id). Use existing appointment service; return array in `data`; pagination optional for Phase 0. _(Done: GET /api/v1/appointments with authenticateToken; listAppointmentsForDoctor(userId).)_
- [x] 1.2 If list endpoint exists: document it and use it from frontend. _(Done: documented in controller and routes; frontend uses getAppointments() in lib/api.ts.)_
- [x] 1.3 Response: canonical per CONTRACTS — either `data: { appointments: Appointment[] }` (non-paginated) or PaginatedResponse with `data.items` and `data.pagination` per CONTRACTS.md and PAGINATION.md; no PHI in logs. _(Done: successResponse({ appointments }, req) → data.appointments; logDataAccess without resource id — no PHI.)_

### 2. Frontend API Client
- [x] 2.1 Create API client (e.g. `lib/api.ts`) per FRONTEND_RECIPES F1: base URL from `NEXT_PUBLIC_API_URL`; helper to send auth (e.g. Supabase session JWT in `Authorization: Bearer <token>` if backend accepts it). _(Done: lib/api.ts with Bearer token.)_
- [x] 2.2 Types for appointment list and appointment detail matching CONTRACTS (success `data`, `meta`; error shape). _(Done: types/appointment.ts; ApiSuccess, ApiError in lib/api.ts.)_
- [x] 2.3 Client methods: `getAppointments()` (list), `getAppointmentById(id)` (detail); handle non-2xx and parse canonical error format per CONTRACTS. _(Done.)_

### 3. Appointments List Page
- [x] 3.1 Appointments list page: fetch list on load (Server Component with Suspense or Client with loading state per F4); show loading state; on success render table or cards (date, time, patient name, status, link to detail). _(Done: Server Component; loading.tsx; cards with Link.)_
- [x] 3.2 On error: show **user-friendly message**; display in a way that is **visible and preferably announced** (e.g. `role="alert"` or `aria-live` per DEFINITION_OF_DONE_FRONTEND §3); do not log PHI. _(Done: role="alert", aria-live="polite".)_
- [x] 3.3 Link each row/card to appointment detail route (`/dashboard/appointments/[id]`); use `next/link`; sufficient focus visibility for keyboard nav. _(Done: next/link; focus:ring-2.)_

### 4. Appointment Detail Page
- [x] 4.1 Detail page: fetch appointment by ID (from route param `[id]`); show loading state; on success show fields (date, time, patient name, phone, status, notes, etc.) per DB_SCHEMA and API response shape. _(Done: [id]/page.tsx; loading.tsx; dl/dt/dd.)_
- [x] 4.2 On error (e.g. 404): show **"Appointment not found"** or similar; handle **403 Unauthorized** (redirect to login or user-friendly message). Error message visible and preferably announced (role="alert"); do not log PHI in error handler. _(Done: 404 "Appointment not found"; 403 message; role="alert".)_
- [x] 4.3 Optional: link to patient detail if Task 5 provides it (e.g. by patient_id). _(Done: patient name links to `/dashboard/patients/[patient_id]` when `patient_id` present; destination page added in Task 5.)_

### 5. Verification
- [x] 5.1 Type-check and lint; no `any` for API data or appointment types. _(Done: build and lint pass.)_
- [x] 5.2 Manual test: list loads; detail loads; error states display correctly; no PHI in console/logs. _(Manual verification.)_
- [x] 5.3 **Accessibility:** List and detail have visible focus for links/buttons; error messages visible and announced per DEFINITION_OF_DONE_FRONTEND §3. _(Done: focus:ring-2; role="alert"; aria-live.)_

---

## 📁 Files to Create/Update

```
backend/src/                    (only if list endpoint added)
├── controllers/
│   └── appointment-controller.ts  (UPDATE - add list handler if missing)
├── routes/
│   └── api/v1/appointments.ts    (UPDATE - GET list if missing)
frontend/
├── lib/
│   └── api.ts                 (NEW - API client per F1; auth header; getAppointments, getAppointmentById)
├── types/                     (optional - per FRONTEND_ARCHITECTURE; or types in lib/api.ts)
│   └── appointment.ts         (optional - Appointment, list/detail types aligned with CONTRACTS)
├── app/
│   └── dashboard/
│       └── appointments/
│           ├── page.tsx       (UPDATE - list page; replace placeholder; loading/error per F4)
│           └── [id]/
│               └── page.tsx   (NEW - detail page; loading/error; 404/403 handling)
└── components/
    └── domain/                (optional - per FRONTEND_ARCHITECTURE)
        └── AppointmentCard.tsx (optional - list item)
```

**Existing Code Status:**
- ✅ Backend: GET /api/v1/appointments (list), GET /api/v1/appointments/:id (detail); POST book; available-slots; list and :id require auth
- ✅ Frontend: lib/api.ts, types/appointment.ts, list page, [id] detail page, loading states

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **API:** Responses must follow CONTRACTS (success/error format); frontend must not assume different shape (FRONTEND_STANDARDS, CONTRACTS). List response: either `data.appointments` or PaginatedResponse (`data.items` + `data.pagination`) per CONTRACTS and PAGINATION.md.
- **Loading and error states:** Every data fetch must have loading and error UI; no silent failures (FRONTEND_STANDARDS, FRONTEND_RECIPES F4). Error messages user-facing; visible and preferably announced (role="alert" or aria-live) per DEFINITION_OF_DONE_FRONTEND §3.
- **Privacy:** No PHI in logs — do not log patient name, phone, or notes (COMPLIANCE, FRONTEND_COMPLIANCE).
- **Auth:** Doctor-only: list and detail scoped to current user (backend RLS); frontend sends auth (e.g. Bearer token from Supabase session) for protected endpoints.
- **Accessibility:** Sufficient contrast and focus states for list/detail links and buttons (FRONTEND_STANDARDS).

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – appointments, list endpoint added)
  - If Yes → [x] **RLS verified?** (Y – list scoped by doctor_id; backend uses admin client with .eq('doctor_id', userId))
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (Y – backend API) → [x] **Consent + redaction confirmed?** (Y – no PHI in logs)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Doctor can view list of their appointments and open detail by ID
- [x] Loading and error states work; API client uses canonical format (CONTRACTS)
- [x] No PHI in frontend or backend logs
- [x] If list endpoint was added, it is documented and RLS enforces doctor scope
- [x] Error messages visible and preferably announced (accessibility); focus states for list/detail

**See also:** [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/engineering/development/DEFINITION_OF_DONE_FRONTEND.md) (full checklist).

---

## 🔗 Related Tasks

- [Task 3: Dashboard Layout & Navigation](./e-task-3-dashboard-layout-and-navigation.md) – Prerequisite
- [Task 5: Patient Detail & API Connection](./e-task-5-patient-detail-and-api-connection.md) – Filtering, search, patient detail

---

**Last Updated:** 2026-02-03  
**Related Learning:** `docs/Archive/learning/2026-02-03/l-task-4-appointments-list-and-detail.md` (create when implementing)  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
