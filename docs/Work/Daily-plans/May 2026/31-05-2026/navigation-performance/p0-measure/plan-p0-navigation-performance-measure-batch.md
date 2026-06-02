# Navigation performance — Phase 0: baseline + perf budget — batch plan

> **Product plan (what + why + decision locks):** [`../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../Product%20plans/plan-navigation-performance.md) — R-MEASURE.
>
> **First phase of the program.** Encodes **NP-DL-1** (measure first) and **NP-DL-6** (validate in a production build, not just `next dev`). Nothing else in the program is allowed to start until this phase's baseline is captured — every later phase proves its win against these numbers.
>
> **Cost-aware model strategy:** [`../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p0-navigation-performance-measure.md`](./Tasks/EXECUTION-ORDER-p0-navigation-performance-measure.md).

---

## Scope (this phase)

| Task | Title | Status |
|---|---|---|
| [np-01](./Tasks/task-np-01-baseline-instrumentation.md) | Baseline instrumentation + perf budget (dev + prod build) | ✅ done |

**Baseline:** [`baseline.md`](./baseline.md) · raw captures: [`capture-dev.json`](./capture-dev.json), [`capture-prod.json`](./capture-prod.json)

**Deliverable:** a committed baseline table for the four daily-driver surfaces (Today, OPD, Patients list, Patient detail) — captured in **both** `next dev` and a `next build && next start` production build — covering:
- authenticated-request floor (p50/p95 `durationMs`, already emitted by the backend request logger),
- requests-per-navigation (browser Network count), and
- click → first-contentful-paint of the route.

Plus the agreed **perf budget** (the product plan's North-star targets) that Phases 1–3 are held to.

**Why it gates the program:** without a before snapshot we cannot prove a win or catch a regression, and dev-only noise (Strict-Mode double-effects, on-demand compile, no `<Link>` prefetch) would mislead us into "fixing" non-problems (product-plan finding F8 / risk NP-R6).

**Acceptance gate:** baseline numbers committed for dev **and** prod build; budget agreed; no app behaviour changed by this phase (instrumentation is measurement-only and must not alter request semantics).

**Prior phase:** _(none — first phase)_
**Next phase:** [`../p1-backend-tax/`](../p1-backend-tax/) — the backend auth/audit tax removal, measured against this baseline.
