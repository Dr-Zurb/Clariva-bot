# Social history v2 — Phase 1: core + indices — execution order

> Sibling of [`plan-p1-social-history-v2-core-indices-batch.md`](../plan-p1-social-history-v2-core-indices-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** four sequential tasks. `sh-01` lands the pure model/indices/serializer (foundation), `sh-02` the migration + backend, `sh-03` the form plumbing + UI, `sh-04` the integration + a11y + phase gate. Largely linear (each builds on the prior); sh-02 backend and sh-03 UI share the frozen JSONB shape from sh-01.

---

## Wave plan (4 waves)

```
Wave 1 (foundation — ~2–3h, **Model: Auto**):
  sh-01 (structured model + pack-years/CAGE indices + serializer; unit-tested)

        │
        ▼
Wave 2 (~2–3h, **Model: Auto**):
  sh-02 (migration 125 + backend types/validation/service passthrough)

        │
        ▼
Wave 3 (~3–4h, **Model: Auto**):
  sh-03 (RxFormContext plumbing + buildRxPayload + SocialHistoryField rewrite)

        │
        ▼
Wave 4 (~1–2h, **Model: Auto**):
  sh-04 (carry-forward/presets + a11y + phase acceptance gate)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **sh-01** | M | Auto | v1 [`social-history.ts`](../../../../../../../frontend/lib/cockpit/social-history.ts); v2 plan §P1-02..P1-04 | `SocialHistoryStructured` type; `social-history.ts` rewrite (parse/serialize/updaters + legacy fallback); new `social-history-indices.ts` (pack-years, CAGE). Unit tests. |
| W2.0 | **sh-02** | M | Auto | [`116_*.sql`](../../../../../../../backend/migrations/116_prescriptions_subjective_expansion.sql); [`prescription-service.ts`](../../../../../../../backend/src/services/prescription-service.ts); [`validation.ts`](../../../../../../../backend/src/utils/validation.ts) | Migration `125`; backend types; zod schema (create + update); insert/update/last-subjective passthrough. |
| W3.0 | **sh-03** | M/L | Auto | [`RxFormContext.tsx`](../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx); v1 [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx) | `socialHistoryStructured` on `RxFormFields` + reducer + hydrate (prefer JSONB, fallback TEXT); `buildRxPayload` sends JSONB + derived TEXT; UI rewrite (conditional reveal, CAGE toggles, live index badges). |
| W4.0 | **sh-04** | S | Auto | carry-forward + presets paths; a11y checklist | Carry-forward/presets copy the structured object; keyboard/SR a11y on the new controls; run the phase gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| sh-01 | M | Auto | Pure, bounded TS + math; fully unit-testable. |
| sh-02 | M | Auto | Additive migration + passthrough mirroring the shipped derived-field pattern. |
| sh-03 | M/L | Auto | Form plumbing + a focused component rewrite; no new architecture. |
| sh-04 | S | Auto | Wiring + a11y + verification on top of shipped surfaces. |

**Caps check:** 0 Opus in Phase 1. ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p1-social-history-v2-core-indices-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p1-social-history-v2-core-indices-batch.md`](../plan-p1-social-history-v2-core-indices-batch.md).
- Source plan: [`Product plans/ehr/subjective-tab/plan-social-history-v2.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md).
- Tasks: [`task-sh-01-…`](./task-sh-01-data-model-and-indices.md) · [`task-sh-02-…`](./task-sh-02-migration-and-backend.md) · [`task-sh-03-…`](./task-sh-03-form-plumbing-and-ui.md) · [`task-sh-04-…`](./task-sh-04-integration-a11y-and-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-07. **Status:** ⏳ `Planned`.
