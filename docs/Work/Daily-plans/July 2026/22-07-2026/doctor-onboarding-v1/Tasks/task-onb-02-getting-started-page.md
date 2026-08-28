# Task onb-02: Getting-started page (frontend)

> **Filename:** `task-onb-02-getting-started-page.md`
> **Links:** batch [`../plan-doctor-onboarding-v1-batch.md`](../plan-doctor-onboarding-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-onboarding-v1.md`](./EXECUTION-ORDER-doctor-onboarding-v1.md)

---

## 📋 Task Overview

A skippable `/dashboard/getting-started` page: the 4 go-live steps with live done/todo state (from onb-01) and deep links into the existing setup pages.

**Batch:** doctor-onboarding-v1 · Wave 2 (parallel with onb-03)
**Status:** ✅ Complete
**Change Type:** New feature — one page + small step-list component.

**Current State:**
- ✅ Deep-link targets exist: `/dashboard/settings/integrations` (IG), `/dashboard/settings/practice-setup/practice-info`, `.../services-catalog`, `.../availability`.
- ✅ onb-01 provides the status booleans.
- ❌ No getting-started route.

**Scope Guard:**
- One route + one presentational component; consume onb-01.
- **DO NOT** rebuild setup forms — link out.
- **DO NOT** force-redirect signup here (offer it, don't wall it).

---

## ✅ Task Breakdown

### 1. Page
- [x] 1.1 New `frontend/app/dashboard/getting-started/page.tsx` with metadata + dashboard chrome.
- [x] 1.2 Fetch onb-01 status (server prefetch or client query, matching dashboard patterns).
- [x] 1.3 Render 4 ordered steps; each shows done ✓ / todo, a one-line why, and a deep link ("Connect", "Add practice info", "Set pricing", "Set availability").
- [x] 1.4 When `complete`, show a success state ("You're live — patients can now book").

### 2. Entry point
- [x] 2.1 Add a subtle sidebar/nav entry or a post-signup redirect to this page (decide + document; default: sidebar link + first-visit redirect only when not `complete`).

### 3. Verification
- [x] 3.1 `npm run lint` (slice) + `npx tsc --noEmit` clean.
- [x] 3.2 Manual: fresh doctor sees 4 todos; completing a step flips it on refetch; complete → success state.

---

## 📁 Files to Create/Update

```
CREATE: frontend/app/dashboard/getting-started/page.tsx
CREATE: frontend/components/dashboard/onboarding/OnboardingSteps.tsx
UPDATE: frontend/lib/api (onboarding status fetch helper)
READ:   frontend/components/settings/InstagramConnect.tsx (status shape)
DO NOT TOUCH: setup form pages; migration
```

## 🧠 Design Constraints

- Guidance, not a gate — always skippable to `/dashboard`.
- No PII in logs; reuse existing UI kit + semantic tokens.

## ✅ Acceptance Criteria

- [x] Page lists 4 steps with live state + working deep links.
- [x] Complete state renders; page is skippable.
- [x] Slice gate green; no migration.

**Created:** 2026-07-22.
