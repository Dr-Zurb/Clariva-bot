# Task pkd-03: Visit-based New + Revisits (30d)

> **Links:** [`../plan-patients-kpi-doctor-batch.md`](../plan-patients-kpi-doctor-batch.md)

**Status:** ✅ DONE  
**Wave:** 3 · **Size:** M  
**Decisions:** PKD-D3, PKD-D4  
**Depends:** pkd-01

## Definitions
- **New (30d):** ≥1 `completed` appointment in rolling 30d; no `completed` appointment before window.
- **Revisits (30d):** ≥1 `completed` in window + ≥1 `completed` before window.
- Mutually exclusive.

## Checklist
- [ ] Redefine `new-30d` / `new_30d` KPI to visit-based.
- [ ] Add `revisit-30d` segment + `revisits_30d` KPI.
- [ ] Strip tiles; client filter where possible or server fetch.
- [ ] Unit tests for mutual exclusion + boundaries.
