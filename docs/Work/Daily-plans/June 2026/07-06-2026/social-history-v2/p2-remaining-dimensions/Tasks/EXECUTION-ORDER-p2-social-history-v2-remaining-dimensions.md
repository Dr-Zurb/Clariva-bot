# Social history v2 — Phase 2: remaining dimensions — execution order

> Sibling of [`plan-p2-social-history-v2-remaining-dimensions-batch.md`](../plan-p2-social-history-v2-remaining-dimensions-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `sh-05` lands the data layer (extended model + serializer/parser + backend zod + legacy-notes promotion) and runs first. `sh-06` (lifestyle + context UI) and `sh-07` (wellbeing + gated sexual UI) are two disjoint UI lanes that run in parallel after it. `sh-08` closes with integration + a11y + the phase gate.

---

## Wave plan (3 waves)

```
Wave 1 (data layer — ~2–3h):
  sh-05 (extend SocialHistoryStructured + serializer/parser + backend zod; promote legacy notes)   [Model: Auto]

        │
        ▼
Wave 2 (~3–4h, parallel):
  sh-06 (UI: Substances · Diet · Activity · Occupation+exposures · Living · Travel)   [Lane α]   [Model: Auto]
  sh-07 (UI: Sleep · Stress + gated Sexual history)                                   [Lane β]   [Model: Auto]

        │
        ▼
Wave 3 (~1–2h):
  sh-08 (carry-forward/presets verify + a11y + phase gate)   [Model: Auto]
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **sh-05** | M | Auto | Phase-1 [`social-history.ts`](../../../../../../../frontend/lib/cockpit/social-history.ts) (serializer/parser + `V1_PHASE2_DIMENSIONS`); [`validation.ts`](../../../../../../../backend/src/utils/validation.ts) `socialHistoryStructuredSchema`; [`prescription.ts`](../../../../../../../backend/src/types/prescription.ts) types; source plan Phase-2 § | Add 9 dimension keys to the type; extend serialize/parse/normalize/`hasSocialHistoryStructuredContent`; **promote** diet/activity/occupation out of `notes`; extend backend types + zod sections. Unit tests. |
| W2.α | **sh-06** | M | Auto | sh-05 shape; [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx) helpers (`StatusChipRow` / `MultiTypeChipRow` / `NumberField`) | Lifestyle (substances/diet/activity) + context (occupation+exposures/living/travel) sections + component tests. |
| W2.β | **sh-07** | M | Auto | sh-05 shape; same helpers | Wellbeing (sleep/stress) + **gated Sexual history** ("Add if relevant" toggle, discreet) + component tests. |
| W3.0 | **sh-08** | S | Auto | carry-forward + preset paths; a11y checklist | Verify carry-forward/presets carry the new dims; a11y pass; run the phase gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| sh-05 | M | Auto | Bounded model + serializer/parser extension + zod; fully unit-testable. |
| sh-06 | M | Auto | Six UI sections cloned from shipped helpers. |
| sh-07 | M | Auto | Two UI sections + a gated toggle; small surface, sensitivity care. |
| sh-08 | S | Auto | Verification + a11y on top of shipped surfaces. |

**Caps check:** 0 Opus in Phase 2. ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p2-social-history-v2-remaining-dimensions-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p2-social-history-v2-remaining-dimensions-batch.md`](../plan-p2-social-history-v2-remaining-dimensions-batch.md).
- Source plan: [`Product plans/ehr/subjective-tab/plan-social-history-v2.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md).
- Tasks: [`task-sh-05-…`](./task-sh-05-data-model-and-backend.md) · [`task-sh-06-…`](./task-sh-06-ui-lifestyle-and-context.md) · [`task-sh-07-…`](./task-sh-07-ui-wellbeing-and-sexual-history.md) · [`task-sh-08-…`](./task-sh-08-integration-a11y-and-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-07. **Status:** ✅ `Done` (sh-05..08 completed 2026-06-07).
