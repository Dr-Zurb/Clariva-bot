# Social history v2 — Phase 3: clinical depth + surfacing — execution order

> Sibling of [`plan-p3-social-history-v2-clinical-depth-batch.md`](../plan-p3-social-history-v2-clinical-depth-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** five tasks. `sh-09` lands the AUDIT-C screen end-to-end (model + indices + UI + backend), freezing the extended alcohol shape. `sh-10` (binge + finer frequency) and `sh-11` (ABV + configurable thresholds) run in parallel over disjoint surfaces, coordinating only on the `standardUnitsForDrink` signature. `sh-12` surfaces the derived TEXT on the prescription PDF (independent — reads derived TEXT). `sh-13` adds tobacco pack-year equivalents and runs the integration + a11y + phase gate.

---

## Wave plan (4 waves)

```
Wave 1 (foundation — ~2–3h):
  **Model: Auto** sh-09 (AUDIT-C: alcohol.auditC model + indices score + UI block + backend zod)

        │
        ▼
Wave 2 (~3–4h parallel):
  **Model: Auto** sh-10 (binge / max-in-one-sitting + finer episodic frequency)
  **Model: Auto** sh-11 (ABV per-drink override + configurable India-aware thresholds)

        │
        ▼
Wave 3 (~1–2h):
  **Model: Auto** sh-12 (surface derived social-history TEXT on the prescription PDF)

        │
        ▼
Wave 4 (~1–2h):
  **Model: Auto** sh-13 (tobacco hookah/cigar/vape pack-year equivalents + integration/a11y/phase gate)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **sh-09** | M | Auto | [`social-history-indices.ts`](../../../../../../../frontend/lib/cockpit/social-history-indices.ts) (CAGE pattern); [`social-history-alcohol-drinks.ts`](../../../../../../../frontend/lib/cockpit/social-history-alcohol-drinks.ts); [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx); [`validation.ts`](../../../../../../../backend/src/utils/validation.ts) | `alcohol.auditC` shape (3 Qs + total + positive); `auditCScore` index; CAGE-style UI block; serialize into derived TEXT; zod + types. |
| W2.0 | **sh-10** | M | Auto | [`social-history-alcohol-drinks.ts`](../../../../../../../frontend/lib/cockpit/social-history-alcohol-drinks.ts); [`AlcoholDrinkRows.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/AlcoholDrinkRows.tsx) | `alcohol.maxPerSession` field + binge hint; finer frequency (month + sub-weekly cadence) feeding `occasionsPerWeekFromDrink`; serialize/parse + zod. |
| W2.1 | **sh-11** | M | Auto | [`social-history-alcohol-drinks.ts`](../../../../../../../frontend/lib/cockpit/social-history-alcohol-drinks.ts); [`social-history-indices.ts`](../../../../../../../frontend/lib/cockpit/social-history-indices.ts) | optional `abv` on `AlcoholDrinkRow` overriding assumed ABV in `standardUnitsForDrink`; named overridable threshold constants (hazardous units/wk, pack-years) with defaults unchanged + India-config seam. |
| W3.0 | **sh-12** | S/M | Auto | prescription PDF template/service (locate); [`prescription-service.ts`](../../../../../../../backend/src/services/prescription-service.ts) | place derived `social_history` TEXT in the Rx PDF; omit when empty; no PHI in logs. |
| W4.0 | **sh-13** | S/M | Auto | [`social-history-tobacco-products.ts`](../../../../../../../frontend/lib/cockpit/social-history-tobacco-products.ts); [`social-history-indices.ts`](../../../../../../../frontend/lib/cockpit/social-history-indices.ts); carry-forward + presets paths; a11y checklist | hookah/cigar/vape cigarette-equivalent multipliers into pack-years (labelled approximate); carry-forward/presets copy new fields; a11y; phase gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| sh-09 | M | Auto | Bounded scored questionnaire mirroring the shipped CAGE pattern; fully unit-testable. |
| sh-10 | M | Auto | Additive field + frequency math over the shipped drink-row module. |
| sh-11 | M | Auto | Pure units-math override + constant extraction; no new architecture. |
| sh-12 | S/M | Auto | Read-only placement of already-derived plain text into the PDF template. |
| sh-13 | S/M | Auto | Approximation multipliers + wiring/a11y/verification on shipped surfaces. |

**Caps check:** 0 Opus in Phase 3. ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p3-social-history-v2-clinical-depth-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p3-social-history-v2-clinical-depth-batch.md`](../plan-p3-social-history-v2-clinical-depth-batch.md).
- Source plan: [`Product plans/ehr/subjective-tab/plan-social-history-v2.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md).
- Tasks: [`task-sh-09-…`](./task-sh-09-alcohol-audit-c.md) · [`task-sh-10-…`](./task-sh-10-binge-and-frequency.md) · [`task-sh-11-…`](./task-sh-11-abv-and-thresholds.md) · [`task-sh-12-…`](./task-sh-12-pdf-surfacing.md) · [`task-sh-13-…`](./task-sh-13-tobacco-polish-and-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-07. **Status:** ✅ `Done` (2026-06-08) — Phase 3 complete (sh-09..13).
