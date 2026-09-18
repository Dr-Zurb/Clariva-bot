# Task pkd-01: Strip + toolbar reshape

> **Links:** [`../plan-patients-kpi-doctor-batch.md`](../plan-patients-kpi-doctor-batch.md)

**Status:** ✅ DONE  
**Wave:** 1 · **Size:** S  
**Decisions:** PKD-D1, PKD-D5

## Goal
Remove doctor-misaligned KPI tiles. Interim strip: **Follow-up overdue** · **New this month** (Incomplete + Revisits land in pkd-02/03). Keep duplicates via callout/chip only.

## Checklist
- [ ] `PatientsKpiStrip` drops no-show / open-episodes / duplicates tiles.
- [ ] Toolbar KPI pill set matches strip; secondary chips include no-show / allergies / untagged (optional active-90d).
- [ ] `onDuplicatesOpen` optional on strip (may remove if unused).
- [ ] Manual: strip no longer shows Active/No-show/Open episodes/Duplicates as tiles.
