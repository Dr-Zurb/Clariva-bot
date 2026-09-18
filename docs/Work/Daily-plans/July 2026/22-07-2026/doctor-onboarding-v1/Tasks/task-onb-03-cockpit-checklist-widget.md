# Task onb-03: Cockpit checklist widget (frontend)

> **Filename:** `task-onb-03-cockpit-checklist-widget.md`
> **Links:** batch [`../plan-doctor-onboarding-v1-batch.md`](../plan-doctor-onboarding-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-onboarding-v1.md`](./EXECUTION-ORDER-doctor-onboarding-v1.md)

---

## 📋 Task Overview

A compact "Finish setup" widget on the Today cockpit showing remaining go-live steps; **auto-hides** once `complete` (ONB-D5 — no dismiss flag in v1).

**Batch:** doctor-onboarding-v1 · Wave 2 (parallel with onb-02)
**Status:** ✅ Complete
**Change Type:** New feature — one widget mounted on the dashboard.

**Current State:**
- ✅ `frontend/app/dashboard/page.tsx` cockpit with Suspense sections.
- ✅ onb-01 status booleans; onb-02 getting-started page as the "See all" target.
- ❌ No onboarding widget.

**Scope Guard:**
- One widget + its mount in the cockpit; reuse onb-01 fetch.
- **DO NOT** disrupt existing KPI/Now-Next/Queue sections.
- **DO NOT** add persistence/dismiss (auto-hide on complete only).

---

## ✅ Task Breakdown

### 1. Widget
- [x] 1.1 New `OnboardingChecklistCard` — shows count remaining + the next 1–2 undone steps with deep links; "See all" → `/dashboard/getting-started`.
- [x] 1.2 Render nothing when status `complete` (or while loading, to avoid flof).

### 2. Mount
- [x] 2.1 Mount near the top of the cockpit (above KPI strip or in the inbox column — decide + document), behind Suspense/skeleton consistent with siblings.

### 3. Verification
- [x] 3.1 `npm run lint` (slice) + `npx tsc --noEmit` clean.
- [x] 3.2 Manual: fresh doctor sees widget; completing all steps hides it; no layout shift for complete doctors.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/dashboard/onboarding/OnboardingChecklistCard.tsx
UPDATE: frontend/app/dashboard/page.tsx (mount)
DO NOT TOUCH: existing cockpit sections' logic; migration
```

## 🧠 Design Constraints

- Non-intrusive; disappears cleanly when complete.
- Reuse UI kit + semantic tokens; no PII in logs.

## ✅ Acceptance Criteria

- [x] Widget shows remaining steps + deep links; auto-hides on complete.
- [x] No regression to existing cockpit sections.
- [x] Slice gate green; no migration.

**Created:** 2026-07-22.
