# Task ins-01: Practice-health aggregation API (backend)

> **Filename:** `task-ins-01-practice-health-api.md`
> **Links:** batch [`../plan-insights-v1-batch.md`](../plan-insights-v1-batch.md) · exec [`./EXECUTION-ORDER-insights-v1.md`](./EXECUTION-ORDER-insights-v1.md)

---

## 📋 Task Overview

Land the **data spine** for Insights: one read-only, doctor-scoped, range-aware endpoint that returns Tier-1 practice-health metrics. No UI in this task.

`GET /api/v1/dashboard/insights/overview?from&to` →
```
{
  range: { from, to },
  volume: { total, byStatus: {...}, byModality: {...} },
  noShowRate,                       // 0..1
  revenueCapturedMinor, currency,   // Σ payments.status='captured'
  consult: { completionRate, medianDurationSeconds }
}
```

**Program / Batch:** insights-v1 · Wave 1
**Estimated Time:** ~3–4 hours
**Status:** ✅ Done (2026-07-21, Opus). **Model: Opus** (reads `payments` — money; agent-contract escalation trigger).
**Change Type:** ✅ Add read-only endpoint + service + tests (follow `STANDARDS.md` / `RECIPES.md`).

**Current State:**
- ✅ Route registration pattern: `backend/src/routes/api/v1/index.ts` (see `/dashboard/events`).
- ✅ Controller pattern to mirror: `backend/src/controllers/dashboard-events-controller.ts` (`asyncHandler`, `req.user.id` only, `successResponse`, Zod, typed errors).
- ✅ Read-service pattern to mirror: `backend/src/services/appointment-service.ts`.
- ✅ Tables present: `appointments` (`status`, `consultation_type`, `appointment_date`), `payments` (`amount_minor`, `status`, `currency`), `consultation_sessions` (`status`, `actual_started_at`, `actual_ended_at`).
- ❌ No `/dashboard/insights` route, controller, or service.

**Scope Guard:**
- Expected: one route file, one controller, one service (+ helpers), one test file; one line added to `index.ts`.
- **DO NOT** build any frontend (that's `ins-02`).
- **DO NOT** add a migration or write to any table — read-only.
- **DO NOT** return raw `payments` / patient rows — aggregates only (INS-D2).
- **DO NOT** touch the Today dashboard or `KpiStrip`.

---

## ✅ Task Breakdown

### 1. Route + controller
- [x] 1.1 New `backend/src/routes/api/v1/dashboard-insights.ts`; register `router.use('/dashboard/insights', …)` in `index.ts` (near `/dashboard/events`).
- [x] 1.2 `getInsightsOverviewHandler` in a new `dashboard-insights-controller.ts` — mirror `dashboard-events-controller.ts`: `asyncHandler`, `authenticateToken`, `req.user.id` as the ONLY doctor id (never trust body/query), `successResponse`, typed `AppError`s.
- [x] 1.3 Zod-validate `from`/`to` (ISO date). Defaults: `to = today`, `from = today − 30d`. Reject `from > to` and spans > 366 days with `ValidationError`.

### 2. Service
- [x] 2.1 New `backend/src/services/dashboard-insights-service.ts`; mirror `appointment-service.ts` structure.
- [x] 2.2 `getPracticeHealth({ doctorId, from, to })` returns the DTO above. All queries filter `doctor_id = doctorId` (RLS enforced), read-only.
- [x] 2.3 `volume`: count appointments in range; group by `status` and by `consultation_type`.
- [x] 2.4 `noShowRate` = `no_show` ÷ (`confirmed` + `completed` + `no_show`); guard divide-by-zero → `0`.
- [x] 2.5 `revenueCapturedMinor` = Σ `payments.amount_minor` where `status='captured'` in range; surface `currency` (assume single-currency per doctor; if mixed, return the dominant + note). **No per-transaction data returned.**
- [x] 2.6 `consult.completionRate` = sessions `ended` ÷ sessions scheduled-in-range; `medianDurationSeconds` from sessions with both `actual_started_at` and `actual_ended_at` (null/0 on empty).

### 3. Tests
- [x] 3.1 Seeded appointments across statuses + modalities → correct `volume` counts + `noShowRate`.
- [x] 3.2 Revenue sums only `captured` (excludes pending/failed/refunded); currency surfaced.
- [x] 3.3 Median duration correct for odd/even counts; empty range → `0`/null, no throw.
- [x] 3.4 Controller: bad `from`/`to` → 422 (Zod); missing auth → 401; another doctor's data never leaks.

### 4. Verification
- [x] 4.1 `cd backend && npm run type-check && npm run lint` — clean for the slice (script is `type-check`; slice lint exit 0).
- [x] 4.2 `cd backend && npm test` — insights service + controller tests green (19 passing).

---

## 📁 Files to Create/Update

```
CREATE: backend/src/routes/api/v1/dashboard-insights.ts
CREATE: backend/src/controllers/dashboard-insights-controller.ts
CREATE: backend/src/services/dashboard-insights-service.ts
CREATE: backend/src/**/__tests__/dashboard-insights-service.test.ts   (mirror existing test location)
UPDATE: backend/src/routes/api/v1/index.ts                            (register route)
READ:   backend/src/controllers/dashboard-events-controller.ts        (controller pattern)
READ:   backend/src/services/appointment-service.ts                   (read-service pattern)
DO NOT TOUCH: any migration; writes to payments/appointments/sessions; frontend
```

---

## 🧠 Design Constraints

- **Read-only + aggregate-only.** Numbers, sums, rates — never raw `payments` or patient rows.
- **Doctor-scoped always.** `req.user.id` is the source of `doctor_id`; RLS enforced.
- **Controllers orchestrate only** (validate → service → respond); business logic in the service.
- **Mirror, don't fork** — controller ← `dashboard-events-controller.ts`; service ← `appointment-service.ts`.

---

## ✅ Acceptance Criteria

- [x] `GET /api/v1/dashboard/insights/overview?from&to` returns the Tier-1 DTO, doctor-scoped, Zod-validated, read-only.
- [x] Revenue counts only `captured`; no per-transaction data leaves the service.
- [x] Median duration + rates handle empty/edge ranges without throwing.
- [x] Backend verification gate green; no frontend touched.

---

**Created:** 2026-07-21.
