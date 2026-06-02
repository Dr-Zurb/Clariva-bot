# Task 2: Env MIN_VERIFIED Default 60
## 2026-03-23 — Consultation Verification v2

---

## 📋 Task Overview

Change default for `MIN_VERIFIED_CONSULTATION_SECONDS` from 120 to 60. Some consultations are legitimately short (instant diagnosis); 60 seconds is enough to prevent doctor exploit (leave immediately after patient joins).

**Estimated Time:** 0.25 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-23

**Change Type:**
- [x] **Update existing** — Change env default

**Current State:**
- ✅ **What exists:** MIN_VERIFIED_CONSULTATION_SECONDS in env.ts, default '120', transform to number with min 60
- ❌ **What's missing:** Default should be 60

**Scope Guard:**
- Expected files touched: 2 (env.ts, .env.example)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Env
- [x] 1.1 In `backend/src/config/env.ts`, change default from '120' to '60' — **Completed: 2026-03-23**
  - [x] 1.1.1 Keep transform: Math.max(60, parseInt(v, 10) || 60) so minimum stays 60
- [x] 1.2 Update `backend/.env.example` comment if present

### 2. Verification
- [x] 2.1 Run type-check

---

## 📁 Files to Create/Update

```
backend/
├── src/config/
│   └── env.ts        (UPDATE)
└── .env.example      (UPDATE - optional)
```

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Default is 60; minimum remains 60
- [x] Existing env override (e.g. 120) still works

---

**Last Updated:** 2026-03-23  
**Completed:** 2026-03-23
