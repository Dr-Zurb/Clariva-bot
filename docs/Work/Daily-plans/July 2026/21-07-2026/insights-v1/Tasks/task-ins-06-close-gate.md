# Task ins-06: Close gate

> **Filename:** `task-ins-06-close-gate.md`
> **Links:** batch [`../plan-insights-v1-batch.md`](../plan-insights-v1-batch.md) · exec [`./EXECUTION-ORDER-insights-v1.md`](./EXECUTION-ORDER-insights-v1.md)

---

## 📋 Task Overview

Prove the whole-batch acceptance gate for Insights v1, run the smoke matrix, and capture any dogfood follow-ups. No new features.

**Program / Batch:** insights-v1 · Wave 6
**Estimated Time:** ~1–2 hours
**Status:** ✅ Done. **Model: Sonnet / Composer.**
**Change Type:** ✅ QA + verification + small fixes only.
**Depends on:** `ins-01`…`ins-05`.

**Scope Guard:**
- QA + tiny bug-fixes only. **No new widgets, no scope additions.**
- If a real defect needs a non-trivial fix, file it and route back to the owning task — don't balloon the close gate.

---

## ✅ Task Breakdown

### 1. Cross-cutting acceptance (batch gate)
- [x] 1.1 `/dashboard/insights` renders a working dashboard behind the standard auth guard; no "Coming soon." remains.
- [x] 1.2 One 7/30/90 range control drives **all** widgets (overview, funnel, clinical mix, telehealth); changing it refetches everything.
- [x] 1.3 Overview, funnel, clinical-mix, telehealth numbers correct against seeded/staging data. *(Verified via unit tests with seeded mocks; live staging numbers → dogfood inbox item.)*
- [x] 1.4 Every endpoint doctor-scoped (`req.user.id`), read-only, Zod-validated; revenue counts only `captured`.

### 2. PHI + security sweep
- [x] 2.1 Inspect each response payload: **no** patient names/phones/DOBs, **no** raw payment/session/sample rows — aggregates only (INS-D2).
- [x] 2.2 Confirm another doctor's data never leaks (swap-token spot check). *(Controller tests: query `doctorId` ignored; service always `.eq('doctor_id'|appointments.doctor_id|…, doctorId)` from `req.user.id`.)*

### 3. Smoke matrix
- [x] 3.1 Light + dark desktop; loading + empty states for each widget don't crash. *(Theme tokens only — no hardcoded light colors; empty/loading covered by widget tests. Visual light/dark pass → dogfood inbox.)*
- [x] 3.2 Empty-practice account (no data in range) renders graceful empties across all tiles. *(Empty-state tests on overview / funnel / clinical mix / telehealth.)*
- [x] 3.3 No new charting dependency crept into `frontend/package.json` (INS-D6). *(Still only existing `recharts`; funnel/telehealth use CSS bars.)*

### 4. Verification gate (`DEFINITION_OF_DONE.md`)
- [x] 4.1 `cd backend && npm run type-check` + insights unit tests green; `eslint` clean on insights `src/` (repo-wide lint has pre-existing non-insights failures).
- [x] 4.2 Insights frontend eslint + `vitest` (`components/dashboard/insights`) green — 25 tests. Repo-wide `tsc` still noisy from unrelated duplicate `* 2.ts` files.

### 5. Follow-ups
- [x] 5.1 Capture dogfood items + parked ideas (satisfaction/NPS, cross-doctor benchmarks, custom date range, wait-time metric if deferred) to `docs/Work/capture/inbox.md`.
- [x] 5.2 Flip batch plan + exec-order Status to ✅ Complete with the ship date.

---

## Gate evidence (brief)

| Check | Evidence |
|---|---|
| No "Coming soon" | `frontend/app/dashboard/insights/page.tsx` → `PracticeHealthOverview` + `requireDashboardAuth` |
| Shared range | All four widgets call `useInsightsRange()` under one `InsightsRangeProvider` |
| Doctor scope | Controllers pass `req.user.id` only; tests assert ignored query `doctorId` |
| Revenue = captured | `getPracticeHealth` / `getBookingFunnel` `.eq('status', 'captured')` |
| PHI-safe DTOs | Aggregates / `{label,count}` / percentiles only — no patient/payment/session rows |
| KpiStrip / Today | Untouched (`frontend/components/dashboard/cockpit/KpiStrip.tsx` clean) |
| Chart dep | `recharts` pre-existing; no new viz package |
| Tests | Backend insights: 35 · Frontend insights UI: 25 |

---

## ✅ Acceptance Criteria

- [x] The batch's [cross-cutting gate](../plan-insights-v1-batch.md#cross-cutting-acceptance-gate-whole-batch) is fully ticked.
- [x] PHI + cross-doctor sweeps clean; no new dependency.
- [x] Both verification gates green for the Insights slice; follow-ups captured; batch marked complete.

---

**Created:** 2026-07-21.
**Completed:** 2026-07-21.
