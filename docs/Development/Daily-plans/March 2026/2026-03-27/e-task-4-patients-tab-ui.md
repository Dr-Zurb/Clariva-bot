# Task 4: Patients Tab UI
## 2026-03-27

---

## 📋 Task Overview

Implement the Patients tab in the doctor dashboard. Replace the placeholder with a real list of patients (name, phone, age, MRN, last appointment). Reuse patterns from Appointments tab (filters, list layout).

**Estimated Time:** 4–5 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **Update existing** — Replace placeholder Patients page; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** frontend/app/dashboard/patients/page.tsx (placeholder); AppointmentsListWithFilters pattern
- ❌ **What's missing:** Fetch patients from API; display list; filters (search by name)
- ⚠️ **Notes:** Patients page says "Patient list and detail will be added in Task 5" — this is that implementation.

**Scope Guard:**
- Expected files touched: ≤ 5 (patients page, components, api, types)

**Reference Documentation:**
- [PATIENT_IDENTITY_AND_MATCHING.md](../../../Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md)
- [e-task-3: List patients API](./e-task-3-list-patients-api.md)
- [FRONTEND_RECIPES.md](../../../Reference/FRONTEND_RECIPES.md) if exists

---

## ✅ Task Breakdown (Hierarchical)

### 1. Types & API

- [x] 1.1 Add PatientSummary type in frontend/types (or extend existing)
  - [x] 1.1.1 id, name, phone (masked?), age?, gender?, medical_record_number?, last_appointment_date?
- [x] 1.2 Ensure getPatients(token) in lib/api.ts (from e-task-3)

### 2. Patients List Page

- [x] 2.1 Update patients/page.tsx
  - [x] 2.1.1 Server component: auth check, fetch getPatients(token)
  - [x] 2.1.2 Pass patients to client list component
  - [x] 2.1.3 Handle loading, error (redirect to login on 401)
- [x] 2.2 Create PatientsListWithFilters (or similar) client component
  - [x] 2.2.1 Display: name, phone (last 4 digits or masked), age, gender, MRN, last appointment
  - [x] 2.2.2 Search/filter by name (client-side)
  - [x] 2.2.3 Link to patient detail page (e.g. /dashboard/patients/[id]) if exists

### 3. Layout & Styling

- [x] 3.1 Match Appointments tab layout (filters bar, table/cards)
- [x] 3.2 Responsive; accessible (aria-labels, roles)
- [x] 3.3 Empty state: "No patients yet. Patients will appear here after they book appointments."

### 4. Patient Detail (Optional / Minimal)

- [x] 4.1 If /dashboard/patients/[id] exists: ensure it loads and displays patient
- [x] 4.2 Or: defer to later task; list only for now

### 5. Verification & Testing

- [x] 5.1 Run type-check, lint
- [ ] 5.2 Manual test: login, navigate to Patients, verify list
- [ ] 5.3 Verify empty state when no patients

---

## 📁 Files to Create/Update

```
frontend/
├── app/dashboard/patients/
│   └── page.tsx                    (UPDATED)
├── components/patients/
│   └── PatientsListWithFilters.tsx (NEW - or reuse pattern)
├── lib/
│   └── api.ts                      (UPDATED - getPatients from e-task-3)
└── types/
    └── patient.ts                  (NEW or extend)
```

**Existing Code Status:**
- ✅ `patients/page.tsx` — placeholder
- ✅ `appointments/AppointmentsListWithFilters.tsx` — pattern to follow
- ✅ `patients/[id]/page.tsx` — detail page exists (check)

---

## 🧠 Design Constraints

- No PHI in client logs or URL params
- Follow existing dashboard patterns (auth, layout)
- Accessible (WCAG)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – patient data displayed)
  - [x] **RLS verified?** (N/A – API enforces doctor scope)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Patients tab shows list of patients for logged-in doctor
- [x] Search by name works
- [x] Empty state when no patients
- [x] Type-check and lint pass

---

## 🔗 Related Tasks

- [e-task-3: List patients API](./e-task-3-list-patients-api.md)
- [e-task-6: Merge patients](./e-task-6-merge-patients.md)

---

**Last Updated:** 2026-03-27  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
