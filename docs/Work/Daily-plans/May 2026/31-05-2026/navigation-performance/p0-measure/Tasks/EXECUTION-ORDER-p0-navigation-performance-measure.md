# Navigation performance — Phase 0 (measure) — execution order

> Sibling document of [`plan-p0-navigation-performance-measure-batch.md`](../plan-p0-navigation-performance-measure-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (1 wave)

```
Wave 1 (Baseline + budget — ~0.5–1d, single lane sequential):
  Lane α  ──── np-01 (S, Sonnet 4.6)
```

**Total wall-clock:** ~0.5–1d.
**Total agent-time (sequential equivalent):** ~0.5–1d.

The bottleneck is Wave 1 — it is the only wave; the "work" is mostly disciplined measurement (dev **and** prod build) plus writing the numbers down, not code.

---

## Lane-by-lane details

### Wave 1 — Baseline + budget (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | np-01 | S | Sonnet 4.6 | `backend/src/middleware/request-logger.ts`, `request-timing.ts`; `frontend/app/dashboard/*` routes | Measurement-only. Capture dev + prod-build numbers for the 4 daily-driver surfaces; commit the table + agreed budget. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| np-01 | S | Sonnet 4.6 (Composer 2 Fast acceptable) | Thin client nav-timing util + a markdown baseline table. No security/PHI surface. No structural change. |

No Opus task in this phase.

---

## Acceptance gates per wave

### Wave 1 gate
- [x] Baseline table committed with p50/p95 request `durationMs`, requests-per-navigation, and click→FCP for **Today, OPD, Patients list, Patient detail**.
- [x] Each metric captured in **both** `next dev` and `next build && next start` (NP-DL-6), with the two columns side by side.
- [x] Perf budget (North-star targets from the product plan) written down and agreed.
- [x] No change to request/response semantics — instrumentation is measurement-only (`git diff` shows no behavioural backend/route changes).
- [x] `npx tsc --noEmit` clean (frontend + backend).

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|
| 1 — baseline | np-01 | 1 | 0 | ~0.5–1d |

---

## References

- Plan: [`plan-p0-navigation-performance-measure-batch.md`](../plan-p0-navigation-performance-measure-batch.md)
- Product plan: [`../../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../../Product%20plans/plan-navigation-performance.md)
- Model strategy: [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- Next phase exec-order: [`../../p1-backend-tax/Tasks/EXECUTION-ORDER-p1-navigation-performance-backend-tax.md`](../../p1-backend-tax/Tasks/EXECUTION-ORDER-p1-navigation-performance-backend-tax.md)
