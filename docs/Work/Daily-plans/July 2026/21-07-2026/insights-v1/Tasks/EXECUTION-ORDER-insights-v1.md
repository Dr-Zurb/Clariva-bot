# Insights v1 — execution order

> Sibling of [`../plan-insights-v1-batch.md`](../plan-insights-v1-batch.md). Plan = what + why; this = who-runs-what-when + model.
>
> **Decision lock:** see batch plan (`INS-D1`…`D10`).
>
> **Cost-aware model strategy:** `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`

> **Shape.** Six-wave batch. `ins-01` lands the overview aggregation API (data spine). `ins-02` builds the page shell + range control every later widget plugs into. `ins-03`…`05` are independent per-tier vertical slices (endpoint + widget). `ins-06` closes the gate. Tiers 3–5 can parallelize after `ins-02`, but default to serial to avoid shell merge churn.

---

## Wave plan (6 waves)

```
Wave 1 (~3–4h):
  ins-01  overview aggregation API (route + controller + service + tests)   [Opus — payments]
        │
        ▼
Wave 2 (~2–3h):
  ins-02  Insights page shell + 7/30/90 range control + Tier-1 tiles + volume trend
        │
        ├────────────┬───────────────┐   (independent after shell; serial by default)
        ▼            ▼               ▼
Wave 3 (~3–4h)  Wave 4 (~3–4h)   Wave 5 (~2–3h):
  ins-03         ins-04           ins-05
  booking funnel clinical mix     telehealth quality
  [Opus—payments](de-identified)  (call quality + modality)
        └────────────┴───────────────┘
                     │
                     ▼
Wave 6 (~1–2h):
  ins-06  cross-cutting gate + smoke matrix + verification + capture follow-ups
```

---

## Wave-by-wave

| Step | Task | Tier | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|---|
| W1.0 | **ins-01** | 1 | M | **Opus** | `dashboard-events-controller.ts`; `appointment-service.ts`; `routes/api/v1/index.ts`; schema for `appointments`/`payments`/`consultation_sessions` | Read-only, aggregate-only, doctor-scoped. Revenue = Σ `captured`. Zod on `from`/`to`. |
| W2.0 | **ins-02** | 1 | M | Sonnet | ins-01 DTO; `KpiStrip.tsx`; `lib/query/options.ts` + `keys.ts`; `insights/page.tsx` | Range control + tiles + volume trend. Resolve chart-lib open question here (INS-D6). |
| W3.0 | **ins-03** | 2 | M | **Opus** | ins-01/02 patterns; `slot_selections`, `payments`, `service_staff_review_requests` | Funnel stages + SLA. Payments read → Opus. |
| W4.0 | **ins-04** | 3 | M | Sonnet | ins-01/02 patterns; `prescriptions.diagnoses_json`, `prescription_medicines`, `investigations_orders_json` | De-identified counts only. Pick Dx source (INS-D open Q3). |
| W5.0 | **ins-05** | 4 | S–M | Sonnet | ins-01/02 patterns; `consultation_sessions`, `video_call_quality`, `voice_call_quality` | Percentiles + modality mix + join success. |
| W6.0 | **ins-06** | — | S | Sonnet / Composer | ins-01…05 output; batch acceptance gate | Manual light/dark + PHI check + verification commands. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| ins-01 | M | **Opus** | Reads `payments` (money) + doctor-scoped RLS reads; agent-contract escalation trigger. |
| ins-02 | M | Sonnet | Thin UI over the endpoint; mirrors existing KPI/query patterns. |
| ins-03 | M | **Opus** | Reads `payments` in the funnel; money-sensitive aggregation. |
| ins-04 | M | Sonnet | Aggregation + widgets over clinical text/JSON; de-identification care but no money. |
| ins-05 | S–M | Sonnet | Quality-metric aggregation + widget; no money, no PHI. |
| ins-06 | S | Sonnet / Composer | QA + gate. |

**Caps check:** ≤1 Opus per wave ✓ (ins-01 wave 1, ins-03 wave 3 — never concurrent). **No migration / PHI-in-UI / RLS change.**

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-insights-v1-batch.md#cross-cutting-acceptance-gate-whole-batch).

---

## Task files

- [`task-ins-01-practice-health-api.md`](./task-ins-01-practice-health-api.md)
- [`task-ins-02-overview-ui.md`](./task-ins-02-overview-ui.md)
- [`task-ins-03-booking-funnel.md`](./task-ins-03-booking-funnel.md)
- [`task-ins-04-clinical-mix.md`](./task-ins-04-clinical-mix.md)
- [`task-ins-05-telehealth-quality.md`](./task-ins-05-telehealth-quality.md)
- [`task-ins-06-close-gate.md`](./task-ins-06-close-gate.md)

---

**Created:** 2026-07-21. **Status:** ✅ Complete — shipped 2026-07-21 (W1…W6 / `ins-01`…`ins-06`).
