# Task 5: Patient Detail & API Connection
## February 3, 2026 – Week 4: Doctor Dashboard Frontend Day 4

---

## 📋 Task Overview

Complete the doctor dashboard frontend: patient detail view (with backend API if missing), filtering and search for appointments (by date/status and optional patient name), and ensure API connection and responsive behavior are production-ready. Backend currently has **no** `GET /api/v1/patients/:id`; this task adds it (auth, RLS-aligned) and the patient detail page. If scope guard forbids backend work, use a placeholder patient detail page and document.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** _2026-02-03_

**Change Type:**
- [x] **New feature** — Add patient detail, filtering, search, polish
- [x] **Update existing** — Extend API client and appointments list page from Task 4

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** Dashboard layout (Task 3); appointments list and detail (Task 4); API client for appointments (`getAppointments`, `getAppointmentById`); backend `GET /api/v1/appointments` and `GET /api/v1/appointments/:id`; backend `patient-service.ts` (`findPatientById`, `findPatientByIdWithAdmin`); RLS on `patients` — doctors can read patients linked via conversations (RLS_POLICIES); appointment detail page links to `/dashboard/patients/[patient_id]` when `patient_id` present (Task 4.3).
- ❌ **What's missing:** Backend `GET /api/v1/patients/:id` (no patient routes in backend); patient detail page `app/dashboard/patients/[id]/page.tsx`; filtering/search on appointments list (date range, status, optional patient name); frontend types and API client for patient.
- ⚠️ **Notes:** COMPLIANCE: no PHI in logs (COMPLIANCE.md). RLS: doctors read patients only if linked via `conversations` (doctor_id + patient_id). Backend must enforce same rule: return patient by ID only when doctor has a conversation (or appointment) linking to that patient — see RLS_POLICIES.md “patients” table.

**Scope Guard:**
- Expected files touched: frontend pages, API client, filters; backend patient endpoint + controller + route + service helper.
- Any expansion requires explicit approval.

**Reference Documentation:**
- [FRONTEND_ARCHITECTURE.md](../../Reference/FRONTEND_ARCHITECTURE.md) - Data fetching; API client; auth
- [FRONTEND_STANDARDS.md](../../Reference/FRONTEND_STANDARDS.md) - API consumption; loading/error; auth; no PII in logs
- [FRONTEND_RECIPES.md](../../Reference/FRONTEND_RECIPES.md) - F1 API client; F4 loading/error; auth header
- [FRONTEND_COMPLIANCE.md](../../Reference/FRONTEND_COMPLIANCE.md) - No PII/PHI in URLs, logs, client storage
- [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/DEFINITION_OF_DONE_FRONTEND.md) - Frontend completion checklist
- [FRONTEND_TESTING.md](../../Reference/FRONTEND_TESTING.md) - Testing filters, patient detail; mocks per CONTRACTS
- [CONTRACTS.md](../../Reference/CONTRACTS.md) - Response format (frontend must consume)
- [API_DESIGN.md](../../Reference/API_DESIGN.md) - Filtering, pagination
- [FILTERING_AND_SORTING.md](../../Reference/FILTERING_AND_SORTING.md) - Query param patterns (status, date range, text search)
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - patients table columns
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md) - Doctors read linked patients via conversations
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - No PHI in logs; doctor-only access; audit logging
- [BUSINESS_PLAN.md](../../Business%20files/BUSINESS_PLAN.md) - Doctor-first; privacy & compliance

---

## ✅ Task Breakdown (Hierarchical)

### 1. Backend: Patient by ID (if not present)
- [x] 1.1 Add `GET /api/v1/patients/:id` requiring auth (`req.user.id`). Implement service helper (e.g. `getPatientForDoctor(patientId, doctorId, correlationId)`): verify doctor has access — either EXISTS conversation where `doctor_id = doctorId` AND `patient_id = patientId`, or EXISTS appointment where `doctor_id = doctorId` AND `patient_id = patientId`; if not, return 403. If allowed, fetch patient by ID (admin client); return `successResponse({ patient }, req)`. Response shape per CONTRACTS: `data: { patient: Patient }`; snake_case from DB; no PHI in logs. Use `logDataAccess(correlationId, userId, 'patient', patientId)` per COMPLIANCE. _(Done: getPatientForDoctor in patient-service.ts.)_
- [x] 1.2 Add patient controller handler (e.g. `getPatientByIdHandler`): validate `:id` (UUID); call service; 404 if patient not found after access check; 403 if access denied. Use asyncHandler, successResponse, validation per STANDARDS. _(Done: patient-controller.ts.)_
- [x] 1.3 Add route `GET /api/v1/patients/:id` in `routes/api/v1/patients.ts` (create file if missing); mount under API v1; apply `authenticateToken` middleware. Register in `routes/api/v1/index.ts`. _(Done: patients.ts; index.ts.)_
- [x] 1.4 **Scope-guard fallback:** If backend patient API is out of scope: add placeholder patient detail page at `app/dashboard/patients/[id]/page.tsx` (e.g. "Patient API coming soon" or "Patient details will be available here"); document in task notes; link from appointment detail already present (Task 4.3). _(N/A: backend API added.)_

### 2. Frontend: Patient Detail
- [x] 2.1 Add frontend types for patient: `frontend/types/patient.ts` — `Patient` interface aligned with API/DB (snake_case, e.g. `name`, `phone`, `date_of_birth`, `gender`, `platform`, `platform_external_id`, `consent_status`, `consent_granted_at`, `consent_revoked_at`, `consent_method`, `created_at`, `updated_at`) per CONTRACTS and DB_SCHEMA. _(Done: types/patient.ts.)_
- [x] 2.2 Add API client method `getPatientById(id: string, token: string)` in `lib/api.ts`; handle non-2xx and parse canonical error format; return `ApiSuccess<{ patient: Patient }>`. _(Done: lib/api.ts.)_
- [x] 2.3 Create patient detail page `app/dashboard/patients/[id]/page.tsx`: Server Component; get session; redirect if unauthenticated; fetch patient via `getPatientById(id, token)`; show loading via `loading.tsx`; on success display patient info (name, phone, platform, consent status, etc.); 404 → "Patient not found"; 403 → "You don't have access to this patient"; 401 → redirect to login. Error message with `role="alert"` and `aria-live="polite"` per DEFINITION_OF_DONE_FRONTEND §3. No PHI in logs. _(Done: patients/[id]/page.tsx.)_
- [x] 2.4 Create `app/dashboard/patients/[id]/loading.tsx` for loading state. Add "Back to patients" (or "Back to dashboard") link with visible focus. _(Done: loading.tsx; Back to patients link in page.)_

### 3. Filtering & Search (Appointments)
- [x] 3.1 Add filters to appointments list page: **date range** (e.g. from/to — `dateFrom`, `dateTo` or `appointmentDate[gte]`/`appointmentDate[lte]` per FILTERING_AND_SORTING) and **status** (pending, confirmed, cancelled, completed). Phase 0: if backend does not yet accept query params, implement **client-side filter** on the loaded list (filter by status and date range in JS). If backend is extended: add optional query params to `GET /api/v1/appointments` per FILTERING_AND_SORTING.md and extend `getAppointments(token, params)`. _(Done: client-side filter in AppointmentsListWithFilters.)_
- [x] 3.2 Optional search: if backend supports `patientName[contains]` (or similar), add to API client and backend; otherwise **client-side filter** on patient name (case-insensitive substring) on the loaded list for Phase 0. _(Done: client-side search by patient name in AppointmentsListWithFilters.)_
- [x] 3.3 UI: filter controls (dropdown or chips for status; date inputs or pickers for range; optional search input for patient name). Preserve accessibility: labels/aria-label; focus order; error messages visible and announced. _(Done: status select, from/to date inputs, patient name search; labels and aria-label.)_

### 4. API Connection & Auth
- [x] 4.1 Ensure all dashboard API calls send auth: Supabase JWT in `Authorization: Bearer <token>`. Appointments already do (Task 4); add same for `getPatientById`. Backend: patient route must use `authenticateToken` (see 1.3). _(Done: getPatientById sends token; patients route uses authenticateToken.)_
- [x] 4.2 Handle errors consistently: 401 → redirect to login or "Session expired"; 403 → "Access denied"; 5xx → generic "Something went wrong" (no PHI in message). Use same pattern as appointments list/detail (role="alert", aria-live). _(Done: patient detail page; appointments already had.)_
- [x] 4.3 Document `NEXT_PUBLIC_API_URL` in `frontend/.env.example` if not already; note any backend CORS/env needed for frontend. _(Already in .env.example.)_

### 5. Responsive & Polish
- [x] 5.1 Appointments list and detail, and patient detail: readable and usable on mobile — stacked layout where appropriate; touch targets sufficient (min ~44px or equivalent per DEFINITION_OF_DONE_FRONTEND); sufficient contrast and visible focus states. _(Done: min-h-[44px] on filter controls and cards; focus:ring-2.)_
- [x] 5.2 Loading: use `loading.tsx` for list and detail routes; consistent error messaging (role="alert", no raw API messages with PHI). _(Done: loading.tsx for patient detail; role="alert" on errors.)_
- [x] 5.3 No `console.log` in production paths; lint and type-check pass. _(Done: no new console.log; build and lint pass.)_

### 6. Verification
- [x] 6.1 Type-check and lint (frontend and backend). _(Done: backend and frontend build; frontend lint clean; backend lint warnings pre-existing.)_
- [x] 6.2 Manual test: appointments list with filters; appointment detail; patient detail (or placeholder if backend not added); responsive; auth and error handling (401, 403, 404). _(Manual verification.)_
- [x] 6.3 **Accessibility:** Focus states, labels, error messages visible and announced per DEFINITION_OF_DONE_FRONTEND §3. **Compliance:** No PHI in console or server logs. _(Done: focus:ring-2; labels/aria-label; role="alert" aria-live; logDataAccess only IDs.)_

---

## 📁 Files to Create/Update

```
backend/src/
├── controllers/
│   └── patient-controller.ts   (NEW - getPatientByIdHandler; validate :id; call getPatientForDoctor)
├── services/
│   └── patient-service.ts     (UPDATE - add getPatientForDoctor(patientId, doctorId, correlationId))
├── routes/
│   └── api/v1/
│       ├── patients.ts         (NEW - GET /:id, authenticateToken)
│       └── index.ts            (UPDATE - mount patients router)
├── utils/
│   └── validation.ts          (UPDATE - add validateGetPatientParams if needed)
frontend/
├── types/
│   └── patient.ts             (NEW - Patient interface per DB_SCHEMA/CONTRACTS)
├── lib/
│   └── api.ts                 (UPDATE - getPatientById(id, token); optional getAppointments(params))
├── app/dashboard/
│   ├── appointments/
│   │   └── page.tsx          (UPDATE - filter UI; client-side or query params)
│   └── patients/
│       └── [id]/
│           ├── page.tsx       (NEW - patient detail Server Component)
│           └── loading.tsx    (NEW - loading state)
└── .env.example              (UPDATE if needed - NEXT_PUBLIC_API_URL documented)
```

**Existing Code Status:**
- ✅ Appointments list and detail (Task 4); API client (`getAppointments`, `getAppointmentById`); appointment detail links to `/dashboard/patients/[id]` when `patient_id` present.
- ✅ Backend `patient-service.ts`: getPatientForDoctor, patient-controller, GET /api/v1/patients/:id, validateGetPatientParams.
- ✅ Frontend: types/patient.ts, getPatientById, patients/[id]/page.tsx, patients/[id]/loading.tsx, AppointmentsListWithFilters (status, date range, patient name).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **CONTRACTS:** All API responses follow canonical format (`successResponse`; `data: { patient: Patient }` or `data: { appointments: Appointment[] }`); frontend types and parsing must match.
- **COMPLIANCE:** No PHI in logs; doctor-only access enforced by backend (auth + RLS-aligned check); audit `logDataAccess` for patient read.
- **RLS_POLICIES:** Doctors can read patients only when linked via conversations (or appointments); backend GET patient must enforce same rule (conversation or appointment link exists for doctor + patient).
- **FRONTEND_STANDARDS:** TypeScript; loading and error states for every data fetch; responsive design; DEFINITION_OF_DONE_FRONTEND §3 (focus, labels, error announced).
- **FILTERING_AND_SORTING:** Query param format for filters (e.g. `status=confirmed`, `appointmentDate[gte]=...`, `appointmentDate[lte]=...`); if backend does not support yet, client-side filter for Phase 0.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – patients, appointments)
  - If Yes → [ ] **RLS verified?** (Y – doctor sees only own appointments; patients only when linked via conversations/appointments)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (Y – backend API) → [ ] **Auth and error handling confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Doctor can view patient detail at `/dashboard/patients/[id]` (backend returns patient when doctor has access; 403/404 when not).
- [x] Appointments list supports filtering by date range and status (and optional patient name search — client-side or backend).
- [x] All dashboard API calls send auth; 401/403/5xx handled consistently; no PHI in logs.
- [x] Responsive and polished; loading and error states; accessibility (focus, labels, error announced) per DEFINITION_OF_DONE_FRONTEND.

**See also:** [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/DEFINITION_OF_DONE_FRONTEND.md).

---

## 🔗 Related Tasks

- [Task 4: Appointments List & Detail](./e-task-4-appointments-list-and-detail.md) – Prerequisite (appointment detail links to patient; API client pattern)
- Week 4 Day 5–7: Testing & bug fixes (E2E, performance, security)

---

**Last Updated:** 2026-02-03  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
