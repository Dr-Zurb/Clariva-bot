# SOAP data placement — Phase 1: results consolidation — execution order

> Sibling of [`plan-p1-soap-data-placement-results-consolidation-batch.md`](../plan-p1-soap-data-placement-results-consolidation-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** a single, self-contained frontend task. No substrate, no parallel branch.

---

## Wave plan (1 wave)

```
Wave 1 (~30–45m):
  sdp-01 (remove Plan-side TestResultsField + update tests + payload-parity proof)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **sdp-01** | S | Auto/Sonnet | `PlanSection.tsx` (`TestResultsField` component + its render call); `TestResultsList.tsx` (the Objective legacy textarea that stays); `buildRxPayload` in `RxFormContext.tsx` (the derivation that proves no data loss); existing Plan/Objective parity tests | Remove `TestResultsField` from Plan; confirm Objective keeps the escape hatch; update tests asserting the Plan field; assert `buildRxPayload` parity. Frontend-only — no schema/API/migration. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| sdp-01 | S | Auto/Sonnet | UI-only removal of one duplicate field + test updates. No schema, no PHI column, no RLS, no migration → no Opus trigger. |

**Caps check:** 0 Opus tasks ✓.

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p1-soap-data-placement-results-consolidation-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p1-soap-data-placement-results-consolidation-batch.md`](../plan-p1-soap-data-placement-results-consolidation-batch.md).
- Task: [`task-sdp-01-…`](./task-sdp-01-remove-plan-test-results-field.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-25. **Status:** 🚧 `Committed`.
