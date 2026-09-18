# Task su2-02: Copy, demo cross-link + close gate

> **Filename:** `task-su2-02-copy-demo-crosslink-and-close-gate.md`
> **Links:** batch [`../plan-signup-v2-batch.md`](../plan-signup-v2-batch.md) · exec [`./EXECUTION-ORDER-signup-v2.md`](./EXECUTION-ORDER-signup-v2.md)

---

## 📋 Task Overview

Doctor-facing copy pass on `/signup` + a "Prefer a guided walkthrough? **Book a demo**" cross-link to `/demo`, then the batch close gate.

**Batch:** signup-v2 · Wave 2
**Status:** ✅ Complete
**Change Type:** Update existing.

**Scope Guard:** copy + one link in `signup/page.tsx`; no logic changes.

---

## ✅ Task Breakdown

### 1. Copy + cross-link
- [x] 1.1 Reframe heading/sub to doctor context (e.g. "Create your Halo Aid account").
- [x] 1.2 Add a `/demo` cross-link near the footer/CTA using the marketing `DEMO_HREF`/`Link` pattern.
- [x] 1.3 Confirm error copy stays friendly + no email echo.

### 2. Close gate
- [x] 2.1 `npm run lint` (slice) + `npx tsc --noEmit` clean.
- [x] 2.2 Manual smoke: `/signup` renders, link → `/demo`, mobile layout OK.
- [x] 2.3 Mark batch + tasks ✅; add a dogfood line to `capture/inbox.md`.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/app/(auth)/signup/page.tsx
UPDATE: docs/Work/capture/inbox.md (dogfood note)
```

## ✅ Acceptance Criteria

- [x] Copy reads doctor-facing; `/demo` cross-link works.
- [x] Slice gate green; docs marked complete.

**Created:** 2026-07-22.
