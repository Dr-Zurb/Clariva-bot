# SOAP data placement — Phase 3: investigations & results timeline — execution order

> Sibling of [`plan-p3-soap-data-placement-results-timeline-batch.md`](../plan-p3-soap-data-placement-results-timeline-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `sdp-05` is the substrate — the read-only `GET /chart/results` endpoint (route + controller + service aggregation over a direct `prescriptions` query). It must land first; the section needs the timeline shape + endpoint. `sdp-06` mounts the `ResultsTimelineSection` in `PatientChartPanel`. `sdp-07` closes the projection-correctness / read-only / a11y / verification gate. Linear chain.

---

## Wave plan (3 waves)

```
Wave 1 (substrate — ~3–4h):
  sdp-05 (GET /chart/results: route + controller + service aggregation
          ordered + resulted + media; doctor-scoped; PHI-safe; no new schema)
        │
        ▼
Wave 2 (~3–4h):
  sdp-06 (ResultsTimelineSection in PatientChartPanel after Vitals
          + getPatientResultsTimeline wrapper; read-only; layout-aware)
        │
        ▼
Wave 3 (~2–3h):
  sdp-07 (projection correctness + empty/edge states + read-only
          + a11y + verification gate)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **sdp-05** | M | **Opus** | `patient-chart-routes.ts` (`/problems` read-only route to mirror); `patient-chart-controller.ts` (`listProblemsHandler` shape); `patient-chart-service.ts` (doctor-scoped read + `logDataAccess`); how prescriptions are queried by patient (previous-Rx path); `prescriptions.investigations` + `test_results_json` shapes; `prescription_attachments` `objective/` segment (media count) | New `GET /chart/results`; service aggregates the patient's prescriptions into `{ visitDate, ordered, resulted[], mediaCount }` date-desc (direct query + TS assembly, **no view/migration**); doctor-scoped; PHI-safe logs. Opus per new-endpoint/PHI. |
| W2.0 | sdp-06 | M | Sonnet | sdp-05's timeline shape; `PatientChartPanel.tsx` (`SectionWrapper` + count-callback mount); `PreviousRxSection.tsx` / `ProblemListSection.tsx` (read-only section pattern to clone); `lib/api.ts` chart wrappers (e.g. `getChartVitals`) | `getPatientResultsTimeline` wrapper; `ResultsTimelineSection` mounted after Vitals (count badge); read-only across desktop / in-call / mobile + `readonly`. Thin consumer. |
| W3.0 | sdp-07 | S–M | Sonnet | sdp-05/06 output; existing chart-section tests to mirror | Projection correctness (visit/date attribution + media count); empty + order-only + result-only edge states; read-only in all layouts; a11y; `tsc`/lint/test gate (FE + BE). |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| sdp-05 | M | **Opus** | New cross-layer endpoint reading PHI across prescriptions. No migration (P3-D1) keeps it bounded, but the new endpoint + doctor-scoping/PHI safety is Opus-grade — same posture as the chart read endpoints. |
| sdp-06 | M | Sonnet | Clones a shipped read-only chart section + `SectionWrapper`; no schema/safety risk. |
| sdp-07 | S–M | Sonnet | Projection-correctness + a11y + tests; low blast radius. Doctor-scoping/PHI proof lives in sdp-05. |

**Caps check:** ≤1 Opus per wave ✓. **Phase Opus count = 1** (sdp-05).

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p3-soap-data-placement-results-timeline-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p3-soap-data-placement-results-timeline-batch.md`](../plan-p3-soap-data-placement-results-timeline-batch.md).
- Tasks: [`task-sdp-05-…`](./task-sdp-05-results-timeline-endpoint.md) · [`task-sdp-06-…`](./task-sdp-06-results-timeline-section.md) · [`task-sdp-07-…`](./task-sdp-07-results-timeline-close-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-25. **Status:** 🚧 `Committed` — **not yet implemented**.
