# Objective tab — Phase 6: trends — execution order

> Sibling of [`plan-p6-objective-tab-trends-batch.md`](../plan-p6-objective-tab-trends-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `obj-25` is the substrate — the read-only **trend-series selector** (project the shipped per-patient prescription history into a typed per-vital `{ value, unit, at }[]` series) + a thin query hook over the **existing** doctor-scoped read. It must land first; everything downstream consumes the frozen series shape. `obj-26` (inline sparklines in `VitalsGrid`) and `obj-27` (expandable weight/BMI chart + reusable chart shell) both consume obj-25 and are mutually independent — they can run in parallel if a second runner exists. `obj-28` (pediatric growth charts + the bundled reference dataset) depends on obj-25 + the obj-27 chart shell, and carries the one open decision (P6-D3). `obj-29` closes the view-only byte-parity / a11y / sparse-data gate. The lightest Objective phase — **no migration, no new server surface** — so the only Opus is the close-gate.

---

## Wave plan (5 waves; obj-26/27 optionally parallel)

```
Wave 1 (substrate — ~2–3h):
  obj-25 (trend-series selector: per-patient prescription history →
          typed per-vital series + query hook over the shipped read;
          NO schema, NO new server surface)
        │
        ├─────────────────────────────┐
        ▼                              ▼  (optional parallel runner)
Wave 2 (~3–4h):                  Wave 3' (~3–4h):
  obj-26 (inline sparklines        obj-27 (expandable weight/BMI chart
          per VitalsGrid field             + reusable recharts chart shell
          + sparse-data states)            for BP/HR/SpO₂/glucose)
        │                              │
        └──────────────┬──────────────┘
                       ▼
Wave 4 (~4–5h):
  obj-28 (pediatric growth charts: wt/ht/HC percentile curves
          vs a bundled static WHO/IAP reference dataset, keyed by DOB + sex;
          hide gracefully when DOB/sex absent)
                       │
                       ▼
Wave 5 (~2–4h):
  obj-29 (trend view-only byte-parity + a11y + sparse/empty states +
          verification gate)
```

> If running single-threaded, the order is **obj-25 → 26 → 27 → 28 → 29** (the batch plan's wave numbering). obj-26/27 are only *optionally* parallel.

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **obj-25** | S–M | Sonnet | `listPrescriptionsByPatient` in [`prescription-service.ts`](../../../../../../../../backend/src/services/prescription-service.ts) (the shipped doctor-scoped per-patient read + the vitals columns it selects); the `prescriptions` vitals fields + `created_at` in `backend/src/types/prescription.ts` / `frontend/types/prescription.ts`; P2's [`vitals-derive.ts`](../../../../../../../../frontend/lib/cockpit/vitals-derive.ts) (BMI/units to reuse for derived series); the frontend query-hook pattern (`lib/query/keys.ts`) | Pure transform: project the per-patient prescription list into a typed `{ metric, unit, points: { value, at }[] }` series per vital, tolerant of nulls/sparse rows + unit normalization; a thin query hook wrapping the **existing** read (no new endpoint, no schema). Read-only — Sonnet. |
| W2.0 *(opt. parallel)* | obj-26 | M | Sonnet | obj-25's series; `VitalsGrid` + the P2 last-visit ghost-value affordance to extend; `recharts` mini-line usage; existing `recharts` chart components for style parity | Inline sparkline per `VitalsGrid` field (last N, default 5), extending the ghost value into a recent-history glance; graceful 0/1-point states. Pure read render. |
| W3.0 *(opt. parallel)* | obj-27 | M | Sonnet | obj-25's series; `recharts` line/area usage; the Objective section host (`ObjectiveSection.tsx`) for the expand affordance; a11y axis/label patterns | Expandable weight/BMI detail chart (adult) built as a **reusable chart shell** so BP/HR/SpO₂/glucose detail trends reuse it; accessible axes + range. Read render. |
| W4.0 | obj-28 | M–L | Sonnet | obj-25's series + the obj-27 chart shell; patient DOB + sex source (how `RxFormContext`/shell reads patient demographics); a small public WHO/IAP LMS percentile table to bundle | Pediatric weight/height/HC percentile curves vs a **bundled static reference dataset** (config, not PHI; versioned in-repo), keyed by DOB + sex; hide the chart gracefully when DOB/sex absent. Content-heavy + carries P6-D3 — confirm the reference source/region at start. |
| W5.0 | obj-29 | M | **Opus** | obj-25..28 surfaces; `buildRxPayload`; the P1/P3/P4/P5 parity-fixture shapes ([`objectiveLayoutParity.test.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/__tests__/objectiveLayoutParity.test.tsx) + `objectiveResultsParity.test.tsx`) | View-only byte-parity (no trend reaches `buildRxPayload`, no row written, no PDF/SMS/snapshot change); a11y sweep (chart text/aria descriptions, keyboard reach, sparse-state announce); empty/single/sparse-data states; `tsc`/lint/test gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| obj-25 | S–M | Sonnet | Pure read-only transform + a hook over the **shipped** doctor-scoped read; no schema, no new server surface, no PHI write. Bounded — Sonnet. |
| obj-26 | M | Sonnet | Inline `recharts` sparkline render over a frozen series; reuses P2's ghost value; no schema risk, no server write. |
| obj-27 | M | Sonnet | Reusable `recharts` chart shell; client render only; low blast radius. |
| obj-28 | M–L | Sonnet | Content-heavy (bundle a static reference dataset) but still read-only client render — *config, not PHI*. The reference-data decision (P6-D3) is a content choice, not a safety surface, so it stays Sonnet; flag P6-D3 before starting. |
| obj-29 | M | **Opus** | View-only byte-parity fixtures + a11y + sparse-data states + verification — the parity-risk slice, like obj-04/obj-15/obj-19/obj-24. |

**Caps check:** ≤1 Opus per wave ✓. **Phase Opus count = 1** (obj-29 close-gate) — the lightest Objective phase: no migration, no storage, no RLS. obj-26/27 are parallelizable branches; obj-28 branches after the obj-27 shell.

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p6-objective-tab-trends-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p6-objective-tab-trends-batch.md`](../plan-p6-objective-tab-trends-batch.md).
- Tasks: [`task-obj-25-…`](./task-obj-25-trend-data-foundation.md) · [`task-obj-26-…`](./task-obj-26-vital-sparklines.md) · [`task-obj-27-…`](./task-obj-27-weight-bmi-trend-chart.md) · [`task-obj-28-…`](./task-obj-28-pediatric-growth-charts.md) · [`task-obj-29-…`](./task-obj-29-trends-close-gate.md).
- Pattern precedents: P5 [`EXECUTION-ORDER-p5-…`](../../p5-poc-results-media/Tasks/EXECUTION-ORDER-p5-objective-tab-poc-results-media.md); P2 vitals [`p2-vitals-2/`](../../p2-vitals-2/).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-20. **Status:** ✅ **Complete** (2026-06-20).
