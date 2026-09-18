# Task pkd-02: Incomplete consults segment + KPI

> **Links:** [`../plan-patients-kpi-doctor-batch.md`](../plan-patients-kpi-doctor-batch.md)

**Status:** ✅ DONE  
**Wave:** 2 · **Size:** M  
**Decisions:** PKD-D2, PKD-D6  
**Depends:** pkd-01

## Definition
Session started (`status = live` OR `actual_started_at` OR doctor/patient join timestamps) **and** linked appointment `status` is not `completed`. Exclude never-started. Optional lookback 90d on `scheduled_start_at`.

## Checklist
- [ ] Segment id `incomplete-consult` in backend + frontend types + validation.
- [ ] List filter returns distinct patients.
- [ ] KPI `incomplete_consults` on `/patients/kpis`.
- [ ] Strip tile #1; server-only client filter flag.
- [ ] Unit tests for predicate edge cases.
