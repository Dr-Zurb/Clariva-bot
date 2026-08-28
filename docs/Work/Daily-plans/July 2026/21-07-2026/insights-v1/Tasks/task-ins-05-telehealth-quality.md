# Task ins-05: Telehealth quality (Tier 4)

> **Filename:** `task-ins-05-telehealth-quality.md`
> **Links:** batch [`../plan-insights-v1-batch.md`](../plan-insights-v1-batch.md) · exec [`./EXECUTION-ORDER-insights-v1.md`](./EXECUTION-ORDER-insights-v1.md)

---

## 📋 Task Overview

Surface the telehealth data Clariva already samples but never shows: call-quality summary, modality mix (incl. mid-call switches), and join success.

`GET /api/v1/dashboard/insights/telehealth?from&to` →
```
{
  range,
  modalityMix: { text, voice, video },          // sessions by modality
  switches: { upgrades, downgrades },            // Σ upgrade_count / downgrade_count
  joinSuccessRate,                               // started sessions with patient_joined_at / started
  quality: {
    video: { p50Rtt, p95Rtt, avgPacketLoss },
    voice: { p50Rtt, p95Rtt, avgPacketLoss }
  }
}
```

**Program / Batch:** insights-v1 · Wave 5
**Estimated Time:** ~2–3 hours
**Status:** ✅ Done. **Model: Sonnet / Opus (service already in place).**
**Change Type:** ✅ Add read-only endpoint + service helpers + widget + tests.
**Depends on:** `ins-01`/`ins-02` patterns.

**Current State:**
- ✅ Sources: `consultation_sessions` (`modality`, `status`, `actual_started_at`, `patient_joined_at`, `upgrade_count`, `downgrade_count`); `video_call_quality` / `voice_call_quality` (RTT, jitter, packet loss, fps, bitrate samples).
- ✅ Telehealth aggregation + widget shipped.

**Scope Guard:**
- **DO NOT** add a migration or write to any table.
- **DO NOT** return per-session or per-sample rows — aggregates/percentiles only (INS-D2).
- **DO NOT** re-implement the range control — reuse `ins-02`'s.

---

## ✅ Task Breakdown

### 1. Backend
- [x] 1.1 Add `getTelehealthQuality({ doctorId, from, to })` to `dashboard-insights-service.ts`; extend controller + route with `GET .../telehealth`.
- [x] 1.2 `modalityMix`: count `consultation_sessions` by `modality` in range (doctor-scoped).
- [x] 1.3 `switches`: Σ `upgrade_count` / `downgrade_count`.
- [x] 1.4 `joinSuccessRate`: sessions with `actual_started_at` set AND `patient_joined_at` set ÷ started sessions; guard div-by-zero.
- [x] 1.5 `quality`: p50/p95 RTT + avg packet loss from `video_call_quality` / `voice_call_quality` over the range. Percentile in SQL (`percentile_cont`) or in-service; document choice.
- [x] 1.6 Zod on `from`/`to`; read-only; no raw sample rows returned.

### 2. Frontend
- [x] 2.1 `useTelehealthQualityQuery` + query options.
- [x] 2.2 `TelehealthQuality.tsx` — modality mix (small bars), join-success stat, upgrades/downgrades, quality summary (p50/p95 RTT, loss). Reuse shared range control; empty state graceful ("no telehealth sessions in range").

### 3. Tests
- [x] 3.1 Backend: seeded sessions/quality samples → correct mix, join rate, switch sums, percentiles; empty range no throw.
- [x] 3.2 Frontend: mocked data → widget renders; empty/loading states.

### 4. Verification
- [x] 4.1 `cd backend && npm run type-check && npm run lint && npm test` — slice green.
- [x] 4.2 `cd frontend && npx tsc --noEmit && npm run lint && npm test` — slice green (repo-wide tsc still has pre-existing duplicate `* 2.ts` noise).

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/dashboard-insights-service.ts        (getTelehealthQuality)
UPDATE: backend/src/controllers/dashboard-insights-controller.ts  (telehealth handler)
UPDATE: backend/src/routes/api/v1/dashboard-insights.ts           (GET /telehealth)
UPDATE: backend/src/**/__tests__/dashboard-insights-service.test.ts
CREATE: frontend/hooks/queries/useTelehealthQualityQuery.ts
CREATE: frontend/components/dashboard/insights/TelehealthQuality.tsx (+ __tests__)
UPDATE: frontend/lib/query/options.ts + keys.ts
UPDATE: frontend/components/dashboard/insights/PracticeHealthOverview.tsx (mount telehealth)
DO NOT TOUCH: any migration; session/quality writes
```

---

## 🧠 Design Constraints

- **Aggregate / percentile only**, doctor-scoped, read-only. No per-session or per-sample rows.
- **Reuse** range control + query patterns; no new chart dep (INS-D6).
- **Percentiles:** nearest-rank in-service (`percentileNearestRank`) — migration-free; documented on the helper.

---

## ✅ Acceptance Criteria

- [x] `GET .../telehealth` returns modality mix + switches + join-success + quality percentiles, doctor-scoped, Zod-validated, read-only.
- [x] Widget renders the summary; empty (no telehealth) state is graceful.
- [x] No raw session/sample rows leave the service; verification gate green both sides.

---

**Created:** 2026-07-21.
**Completed:** 2026-07-21.
