# Task sh-10: binge / max-in-one-sitting + finer episodic frequency

> **Filename:** `task-sh-10-binge-and-frequency.md` in `social-history-v2/p3-clinical-depth/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close the two gaps the user flagged for episodic drinkers: (1) weekly averages hide **binge**
sessions — add a single `alcohol.maxPerSession` field (max drinks/units in one typical sitting) with
a non-average binge hint; and (2) the current `day / week / fortnight` frequency can't express
**monthly / every-other-day / "once in 10 days"** cadences cleanly — extend the drink-row frequency
so units/week stays correct for sub-weekly drinkers. Additive over the shipped drink-row module;
**no migration** (SHv3-D1/D3).

**Program / Phase:** social-history-v2 · Phase 3 (clinical depth + surfacing)  
**Batch:** [`plan-p3-social-history-v2-clinical-depth-batch.md`](../plan-p3-social-history-v2-clinical-depth-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md`](./EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md)  
**Estimated Time:** ~2 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature** — additive field + frequency option (no schema migration).

**Current State:**
- ✅ **What exists:** `AlcoholDrinkRow` with `frequency` + `frequencyUnit` (`day`/`week`/`fortnight`/`month`/`interval`), `occasionsPerWeekFromDrink`, `standardUnitsPerWeekFromDrinks`, `maxPerSession`, binge hint, and `HAZARDOUS_UNITS_PER_WEEK` in [`social-history-alcohol-drinks.ts`](../../../../../../../frontend/lib/cockpit/social-history-alcohol-drinks.ts); UI in [`AlcoholDrinkRows.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/AlcoholDrinkRows.tsx) + [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx).
- ✅ **What's missing (was):** a standalone `maxPerSession` capture + binge hint; a `month` frequency unit and sub-weekly `interval` cadence — **now shipped in sh-10**.

**Scope Guard:**
- Expected files touched: ≤ 5 (`social-history-alcohol-drinks.ts`; `AlcoholDrinkRows.tsx` + `SocialHistoryField.tsx`; `prescription.ts`; `validation.ts`; + tests). Does **not** own AUDIT-C (sh-09) or ABV (sh-11).

**Reference Documentation:**
- Batch plan **SHv3-D3** (binge on the alcohol section, not a Pattern chip) · the prior fortnightly-frequency work · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Binge / max-in-one-sitting
- [x] ✅ 1.1 Add `alcohol.maxPerSession` (count + unit consistent with drink rows) to the model; extend `normalize`/`EMPTY_*`/`has…Content`. - **Completed: 2026-06-08**
- [x] ✅ 1.2 Add a binge hint (≥6 UK units in one sitting) that is independent of units/week — surfaces even when weekly average is low. - **Completed: 2026-06-08**

### 2. Finer frequency
- [x] ✅ 2.1 Add `month` to `AlcoholFrequencyUnit` and `interval` for every-N-days cadence; update `occasionsPerWeekFromDrink` (month: `freq×12/52`; interval: `7/N`). - **Completed: 2026-06-08**
- [x] ✅ 2.2 Update `formatAlcoholDrinkClause` / `parseAlcoholDrinkClause` for the new cadence; round-trips lossless (`× 1/mo`, `× 1/10d`). - **Completed: 2026-06-08**

### 3. UI
- [x] ✅ 3.1 Add the max-in-one-sitting control to the alcohol section + `×/mo` and `/Nd` frequency options to the drink-row selector. - **Completed: 2026-06-08**

### 4. Backend validation
- [x] ✅ 4.1 Add `maxPerSession` to `socialHistoryAlcoholSectionSchema` and `month`/`interval` to `ALCOHOL_FREQUENCY_UNIT_VALUES` / drink-row schema; mirror types on `prescription.ts`. - **Completed: 2026-06-08**

### 5. Verification & Testing
- [x] ✅ 5.1 Units-per-week math tests for month + interval cadence; binge hint fires on max-per-session regardless of weekly total. - **Completed: 2026-06-08**
- [x] ✅ 5.2 Serialize/parse round-trip for new frequency + max-per-session; backend accept/reject; suites green. - **Completed: 2026-06-08**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/social-history-alcohol-drinks.ts (maxPerSession + month/cadence + units math + serialize/parse)
UPDATE: frontend/components/cockpit/rx/subjective/AlcoholDrinkRows.tsx (frequency options)
UPDATE: frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx (max-in-one-sitting + binge hint)
UPDATE: backend/src/types/prescription.ts (AlcoholUseSection.maxPerSession + frequencyUnit month/interval)
UPDATE: backend/src/utils/validation.ts (schema + ALCOHOL_FREQUENCY_UNIT_VALUES)
UPDATE: relevant *.test.ts(x)
DO NOT TOUCH: migrations (none); AUDIT-C (sh-09); ABV/thresholds (sh-11)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Binge ≠ weekly average** (SHv3-D3) — the hint must trigger off `maxPerSession`, not units/week.
- **Pattern chips stay removed** — do not reintroduce binge/weekend chips; this is structured capture.
- **Lossless round-trip** — new cadence must serialize/parse without loss.
- **No migration** — alcohol JSONB only.
- Keep existing `day`/`week`/`fortnight` behaviour byte-identical.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (shape only)** — extends `social_history_structured` JSONB (PHI); no new column.
  - [x] **RLS verified?** **Yes** — covered by 026; unchanged.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] `maxPerSession` captured + binge hint independent of weekly total; `month` + sub-weekly cadence feed units/week correctly and round-trip; backend validates; suites green; no migration.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Cross-reference AUDIT-C Q3 (sh-09): Q3 is a frequency band for ≥6-drink sessions; `maxPerSession` is a raw count — kept distinct with UI copy linking them.

Serialized formats: drink rows `× 1/mo` and `× 1/10d`; section `max 8 pegs/session`.

---

## 🔗 Related Tasks

- [`task-sh-09-alcohol-audit-c.md`](./task-sh-09-alcohol-audit-c.md) — AUDIT-C Q3 overlaps conceptually.
- [`task-sh-11-abv-and-thresholds.md`](./task-sh-11-abv-and-thresholds.md) — shares `standardUnitsForDrink`; coordinate the signature.

---

**Last Updated:** 2026-06-08  
**Pattern:** additive field + frequency extension over the shipped drink-row module.  
**Reference:** `process/CODE_CHANGE_RULES.md` · batch plan SHv3-D3.
