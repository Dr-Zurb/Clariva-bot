# Task 2: Patient Matching Service
## 2026-03-27

---

## 📋 Task Overview

Implement fuzzy patient matching: given phone, name, age, gender, return possible matches with confidence scores. Used before creating a new patient for "booking for someone else" to suggest "Same person?" and avoid duplicates.

**Estimated Time:** 4–5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-27

**Change Type:**
- [ ] **New feature** — Add patient-matching-service; no change to existing createPatient flows until e-task-5

**Current State:**
- ✅ **What exists:** findPatientByPhone, findPatientByPlatformExternalId; patients table
- ❌ **What's missing:** Fuzzy matching by phone + name + age; confidence scoring; findPossiblePatientMatches
- ⚠️ **Notes:** Matching is scoped per doctor (patients linked via appointments or conversations). Need doctorId to scope.

**Scope Guard:**
- Expected files touched: ≤ 4 (new service, patient-service, types)

**Reference Documentation:**
- [PATIENT_IDENTITY_AND_MATCHING.md](../../../Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md) — No PHI in logs

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define Matching Contract

- [x] 1.1 Define interface: PossiblePatientMatch { patientId, name, phone, age?, gender?, confidence }
- [x] 1.2 Define findPossiblePatientMatches(doctorId, phone, name, age?, gender?, correlationId)
  - [x] 1.2.1 Scope: only patients who have appointment or conversation with this doctor
  - [x] 1.2.2 Return top 5 matches ordered by confidence descending

### 2. Phone Matching

- [x] 2.1 Normalize phone: last 10 digits (strip country code, spaces)
- [x] 2.2 Query patients linked to doctor via appointments OR conversations
- [x] 2.3 Filter by phone last-10 match (exact)

### 3. Name Fuzzy Matching

- [x] 3.1 Add Levenshtein distance for string similarity
- [x] 3.2 Normalize: trim, lowercase for comparison
- [x] 3.3 Score: 1.0 if exact; 0.8+ if high similarity; 0.5+ if partial match
- [x] 3.4 Handle: "Ramesh Masih" vs "Ramesh Masai" (typo), substring matches

### 4. Age and Gender

- [x] 4.1 Age: ±2 years tolerance (optional; +0.1 confidence if match)
- [x] 4.2 Gender: exact match (optional; +0.05 confidence if match)

### 5. Confidence Scoring

- [x] 5.1 Combine: phone match (required) + name score + age/gender bonus
- [x] 5.2 Threshold: only return matches with confidence >= 0.5
- [x] 5.3 Sort by confidence desc, limit 5

### 6. Verification & Testing

- [x] 6.1 Run type-check
- [x] 6.2 Unit tests: empty phone/name, match found, no patients linked
- [x] 6.3 No PHI in logs (service has no logging of PHI)

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── patient-matching-service.ts   (NEW)
│   └── patient-service.ts            (UPDATED - export or use for patient lookup)
└── types/
    └── (add PossiblePatientMatch interface)
```

**Existing Code Status:**
- ✅ `patient-service.ts` — findPatientByPhone, findPatientByIdWithAdmin
- ✅ `appointment-service.ts` — listAppointmentsForDoctor (has patient_id)
- ✅ `conversations` table — links patient_id to doctor_id

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Service layer only; no Express
- Matching scoped to doctor (RLS-aligned: doctor sees only their patients)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – read patients, appointments, conversations)
  - [ ] **RLS verified?** (N/A – service role for webhook; API will use doctor-scoped query)
- [ ] **Any PHI in logs?** (N – only match count, confidence)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] findPossiblePatientMatches returns matches with confidence
- [x] Phone last-10 exact match required
- [x] Name fuzzy matching handles typos (Levenshtein)
- [x] Age ±2, gender exact as optional boost
- [x] Type-check and tests pass

---

## 🔗 Related Tasks

- [e-task-5: Booking flow — match confirmation](./e-task-5-booking-match-confirmation.md)
- [e-task-6: Merge patients](./e-task-6-merge-patients.md)

---

**Last Updated:** 2026-03-27  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
