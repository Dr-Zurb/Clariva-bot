# Task ins-03: Booking funnel + review SLA (Tier 2)

> **Filename:** `task-ins-03-booking-funnel.md`
> **Links:** batch [`../plan-insights-v1-batch.md`](../plan-insights-v1-batch.md) · exec [`./EXECUTION-ORDER-insights-v1.md`](./EXECUTION-ORDER-insights-v1.md)

---

## 📋 Task Overview

Ship the **booking-bot funnel** — Clariva's differentiator — as a vertical slice: a range-scoped funnel endpoint + a funnel widget on the Insights tab, plus booking-review SLA/backlog.

`GET /api/v1/dashboard/insights/funnel?from&to` →
```
{
  range,
  funnel: {
    slotsSelected,        // slot_selections created in range
    slotsConsumed,        // consumed_at set
    paymentsCaptured,     // payments.status='captured'
    appointmentsConfirmed // appointments confirmed/completed
  },
  review: { pending, medianResolutionSeconds, breachedSla }
}
```

**Program / Batch:** insights-v1 · Wave 3
**Estimated Time:** ~3–4 hours
**Status:** ✅ Done (2026-07-21, Opus). **Model: Opus** (reads `payments`).
**Change Type:** ✅ Add read-only endpoint + service helpers + funnel widget + tests.
**Depends on:** `ins-01` (route/service pattern), `ins-02` (page shell + range control).

**Current State:**
- ✅ Endpoint/service/route patterns from `ins-01`; page shell + reusable range control from `ins-02`.
- ✅ Tables: `slot_selections` (`slot_start`, `consumed_at`), `payments` (`status`), `appointments` (`status`), `service_staff_review_requests` (`status`, `sla_deadline_at`, resolution fields).
- ❌ No funnel aggregation or widget.

**Scope Guard:**
- **DO NOT** add a migration or write to any table.
- **DO NOT** return raw payment/patient/conversation rows — aggregate counts only (INS-D2).
- **DO NOT** re-implement the range control — reuse `InsightsRangeControl` from `ins-02`.
- **DO NOT** touch the booking-review inbox page itself.

---

## ✅ Task Breakdown

### 1. Backend
- [x] 1.1 Add `getBookingFunnel({ doctorId, from, to })` to `dashboard-insights-service.ts`; extend `dashboard-insights-controller.ts` + route with `GET .../funnel`.
- [x] 1.2 Funnel stages counted in range, doctor-scoped: `slotsSelected` (`slot_selections`), `slotsConsumed` (`consumed_at` not null), `paymentsCaptured` (`payments.status='captured'`), `appointmentsConfirmed` (`appointments.status IN ('confirmed','completed')`).
- [x] 1.3 Review SLA from `service_staff_review_requests`: `pending` count, `medianResolutionSeconds` (resolved rows), `breachedSla` (resolved after / still past `sla_deadline_at`).
- [x] 1.4 Zod on `from`/`to` (reuse the ins-01 schema); read-only; no raw rows returned.

### 2. Frontend
- [x] 2.1 `useBookingFunnelQuery` (mirror `usePracticeHealthQuery`) + `bookingFunnelQueryOptions`.
- [x] 2.2 `BookingFunnel.tsx` widget on the Insights tab under the overview: funnel bars/steps with stage counts + step-to-step conversion %; a small "review backlog / SLA" stat.
- [x] 2.3 Consume the shared range control; empty state graceful.

### 3. Tests
- [x] 3.1 Backend: seeded slots/payments/appointments → correct stage counts + conversion; captured-only for payments.
- [x] 3.2 Backend: review SLA — pending count, median resolution, breach detection; empty range no throw.
- [x] 3.3 Frontend: mocked funnel data → correct bars + conversion %; loading/empty states.

### 4. Verification
- [x] 4.1 `cd backend && npm run type-check && npm run lint && npm test` — slice green (25 insights tests).
- [x] 4.2 `cd frontend && npx tsc --noEmit && npm run lint && npm test` — slice green (15 insights UI tests).

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/dashboard-insights-service.ts        (getBookingFunnel)
UPDATE: backend/src/controllers/dashboard-insights-controller.ts  (funnel handler)
UPDATE: backend/src/routes/api/v1/dashboard-insights.ts           (GET /funnel)
UPDATE: backend/src/**/__tests__/dashboard-insights-service.test.ts
CREATE: frontend/hooks/queries/useBookingFunnelQuery.ts
CREATE: frontend/components/dashboard/insights/BookingFunnel.tsx (+ __tests__)
UPDATE: frontend/lib/query/options.ts + keys.ts
UPDATE: frontend/components/dashboard/insights/PracticeHealthOverview.tsx (mount funnel)
DO NOT TOUCH: booking-review inbox page; any migration; payment/appointment writes
```

---

## 🧠 Design Constraints

- **Aggregate-only, doctor-scoped, read-only** (INS-D2/D3). Payments read → Opus (INS-D8).
- **Reuse** the shared range control + query patterns; no new chart dep (INS-D6).

---

## ✅ Acceptance Criteria

- [x] `GET .../funnel` returns the funnel + review-SLA DTO, doctor-scoped, Zod-validated, read-only.
- [x] Funnel widget shows stage counts + conversion %; review backlog/SLA visible.
- [x] No PHI / raw rows; captured-only revenue stage; verification gate green both sides.

---

**Created:** 2026-07-21.
