# Task 4: Update tryMarkVerified — Who Left First Logic
## 2026-03-23 — Consultation Verification v2

---

## 📋 Task Overview

Replace current tryMarkVerified logic (both joined + duration >= threshold) with new "who left first" rules. Doctor gets verified if: patient no-show, or patient left first, or doctor left first but overlap >= 60 sec.

**Estimated Time:** 2 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-23

**Change Type:**
- [x] **Update existing** — Rewrite tryMarkVerified in consultation-verification-service

**Current State:**
- ✅ **What exists:** tryMarkVerified with who-left-first logic; patient no-show; fallback when left_at missing
- ✅ **Done:** Patient no-show handling; who-left-first logic; fallback when left_at missing
- ✅ **Notes:** Uses e-task-1 (columns), e-task-3 (participant-disconnected to populate)

**Scope Guard:**
- Expected files touched: 2 (consultation-verification-service, tests)

**Reference Documentation:**
- [CONSULTATION_VERIFICATION_STRATEGY.md](../../../task-management/CONSULTATION_VERIFICATION_STRATEGY.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. tryMarkVerified Logic
- [x] 1.1 Update select to include doctor_left_at, patient_left_at
- [x] 1.2 Replace eligibility check:
  - [x] 1.2.1 If !doctor_joined_at OR !consultation_ended_at → return (no change)
  - [x] 1.2.2 **Patient no-show:** If !patient_joined_at → verify (set verified_at, status=completed)
  - [x] 1.2.3 **Both joined:** overlap_start = max(doctor_joined_at, patient_joined_at)
  - [x] 1.2.4 **Patient left first:** If patient_left_at exists AND ( !doctor_left_at OR patient_left_at < doctor_left_at ) → verify
  - [x] 1.2.5 **Doctor left first:** If doctor_left_at exists AND doctor_left_at <= patient_left_at (or patient_left_at null): overlap_sec = (doctor_left_at - overlap_start); if overlap_sec >= MIN_VERIFIED_SEC → verify; else return
  - [x] 1.2.6 **Fallback:** If doctor_left_at/patient_left_at missing but consultation_duration_seconds >= MIN_VERIFIED_SEC and both joined → verify (conservative for existing/edge cases)
  - [x] 1.2.7 Otherwise → return (do not verify)

### 2. Date Parsing
- [x] 2.1 Parse doctor_joined_at, patient_joined_at, doctor_left_at, patient_left_at as Date for comparison
  - [x] 2.1.1 Handle ISO strings; use getTime() for numeric diff

### 3. Verification & Testing
- [x] 3.1 Unit tests for each scenario (no-show, patient left first, doctor left first >= 60s, doctor left first < 60s, fallback)
- [x] 3.2 Run type-check

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── consultation-verification-service.ts  (UPDATE)
└── tests/unit/services/
    └── consultation-verification-service.test.ts  (UPDATE)
```

---

## 🧠 Design Constraints

- Reuse MIN_VERIFIED_CONSULTATION_SECONDS from env (now 60)
- Existing verified/completed appointments: skip (early return)
- No PHI in logs

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — appointments)
  - [x] **RLS verified?** (N/A — service role)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Patient no-show → verified
- [x] Patient left first → verified
- [x] Doctor left first, overlap >= 60s → verified
- [x] Doctor left first, overlap < 60s → NOT verified
- [x] Fallback (no left_at): duration >= 60 and both joined → verified

---

## 🔗 Related Tasks

- [e-task-1: Migration](./e-task-1-consultation-left-at-migration.md)
- [e-task-3: participant-disconnected](./e-task-3-participant-disconnected.md)

---

**Last Updated:** 2026-03-23
