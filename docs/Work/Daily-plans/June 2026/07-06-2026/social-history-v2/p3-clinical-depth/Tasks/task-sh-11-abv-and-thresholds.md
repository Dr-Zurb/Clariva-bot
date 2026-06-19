# Task sh-11: ABV per-drink override + configurable (India-aware) thresholds

> **Filename:** `task-sh-11-abv-and-thresholds.md` in `social-history-v2/p3-clinical-depth/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Two related accuracy/config items. (1) **ABV override:** add an optional `abv` to `AlcoholDrinkRow`
so users can specify the actual alcohol-by-volume for ml/can/glass entries — when set, it overrides
the assumed ABV (beer 5%, wine 12%) inside `standardUnitsForDrink`; when absent, current behaviour is
byte-identical. (2) **Configurable thresholds:** extract the hard-coded clinical thresholds
(`HAZARDOUS_UNITS_PER_WEEK`, `PACK_YEARS_ELEVATED_THRESHOLD`, `PACK_YEARS_LDCT_THRESHOLD`, AUDIT-C
positivity) into a single named, overridable config seam — defaults unchanged (UK-style) — so
India-specific values can be set later without editing every call site (SHv3-D4). **No migration.**

**Program / Phase:** social-history-v2 · Phase 3 (clinical depth + surfacing)  
**Batch:** [`plan-p3-social-history-v2-clinical-depth-batch.md`](../plan-p3-social-history-v2-clinical-depth-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md`](./EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md)  
**Estimated Time:** ~2 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature / refactor** — additive field + constant extraction (no schema migration).

**Current State:**
- ✅ **What exists:** ABV-aware unit math with assumed constants + optional `abv` on drink rows; `SOCIAL_HISTORY_THRESHOLDS` config seam in [`social-history-thresholds.ts`](../../../../../../../frontend/lib/cockpit/social-history-thresholds.ts); hints route through it at call time.
- ✅ **What's missing (was):** per-drink `abv` override + single threshold config — **now shipped in sh-11**.

**Scope Guard:**
- Expected files touched: ≤ 5 (`social-history-alcohol-drinks.ts`; `social-history-indices.ts`; `AlcoholDrinkRows.tsx`; `prescription.ts`; `validation.ts`; + tests). No **in-app admin UI** for thresholds (deferred — see batch plan "does NOT do").

**Reference Documentation:**
- Batch plan **SHv3-D4** (thresholds configurable + documented, defaults preserved; ABV optional override) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. ABV override
- [x] ✅ 1.1 Add optional `abv` (bounded %, 0–100) to `AlcoholDrinkRow`; extend `createAlcoholDrink`/normalize. - **Completed: 2026-06-08**
- [x] ✅ 1.2 Make `standardUnitsForDrink` prefer `row.abv` over assumed ABV when present (ml/can/glass/bottle paths); when absent, output is unchanged. - **Completed: 2026-06-08**
- [x] ✅ 1.3 Serialize/parse `abv` in the drink clause when set (`@8%` suffix); round-trip lossless. - **Completed: 2026-06-08**

### 2. Configurable thresholds
- [x] ✅ 2.1 Introduce `SOCIAL_HISTORY_THRESHOLDS` config (hazardous units/wk, pack-years elevated + LDCT, AUDIT-C positive, CAGE positive, binge) with UK defaults; route hints through it at call time. - **Completed: 2026-06-08**
- [x] ✅ 2.2 Document the India-config seam in the module comment; leave defaults UK-style. No clinic admin UI this phase. - **Completed: 2026-06-08**

### 3. UI
- [x] ✅ 3.1 Add an optional ABV input to the drink row (compact, for ml/can/glass/bottle); blank = assumed strength. - **Completed: 2026-06-08**

### 4. Backend validation
- [x] ✅ 4.1 Add `abv` to `alcoholDrinkRowSchema` (bounded 0–100, optional); mirror on `prescription.ts`. - **Completed: 2026-06-08**

### 5. Verification & Testing
- [x] ✅ 5.1 Units math: `abv` override changes units as expected; absent `abv` byte-identical to prior; threshold config overrides read at call time. - **Completed: 2026-06-08**
- [x] ✅ 5.2 Serialize/parse round-trip with `abv`; backend accept/reject; suites green. - **Completed: 2026-06-08**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/social-history-thresholds.ts (SOCIAL_HISTORY_THRESHOLDS config seam)
UPDATE: frontend/lib/cockpit/social-history-alcohol-drinks.ts (abv field + standardUnitsForDrink override + serialize/parse)
UPDATE: frontend/lib/cockpit/social-history-indices.ts (route pack-years/AUDIT-C/CAGE through config)
UPDATE: frontend/components/cockpit/rx/subjective/AlcoholDrinkRows.tsx (optional ABV input)
UPDATE: backend/src/types/prescription.ts (AlcoholDrinkRow.abv)
UPDATE: backend/src/utils/validation.ts (alcoholDrinkRowSchema.abv)
UPDATE: relevant *.test.ts(x)
DO NOT TOUCH: migrations (none); in-app threshold admin UI (deferred)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Defaults preserved** (SHv3-D4) — absent `abv` and unchanged config must produce byte-identical output to today.
- **Single source of truth** — thresholds read from one config object, not duplicated literals.
- **Optional ABV** — blank means "use assumed strength"; never force entry.
- **No migration; no admin UI** — config is code-level constants this phase.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (shape only)** — extends the alcohol drink row in `social_history_structured` JSONB (PHI); no new column.
  - [x] **RLS verified?** **Yes** — covered by 026; unchanged.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Optional `abv` overrides assumed ABV when set (else identical); all clinical thresholds read from one overridable config with UK-style defaults intact; round-trips; backend validates; suites green; no migration.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Override example (app bootstrap):

```ts
import { SOCIAL_HISTORY_THRESHOLDS } from "@/lib/cockpit/social-history-thresholds";
SOCIAL_HISTORY_THRESHOLDS.hazardousUnitsPerWeek = 21;
```

Serialized ABV format: `beer 330 ml @8% × 3/wk`.

---

## 🔗 Related Tasks

- [`task-sh-09-alcohol-audit-c.md`](./task-sh-09-alcohol-audit-c.md) — AUDIT-C threshold now in shared config.
- [`task-sh-10-binge-and-frequency.md`](./task-sh-10-binge-and-frequency.md) — binge threshold in shared config.

---

**Last Updated:** 2026-06-08  
**Pattern:** additive optional field + constant extraction into a config seam.  
**Reference:** `process/CODE_CHANGE_RULES.md` · batch plan SHv3-D4.
