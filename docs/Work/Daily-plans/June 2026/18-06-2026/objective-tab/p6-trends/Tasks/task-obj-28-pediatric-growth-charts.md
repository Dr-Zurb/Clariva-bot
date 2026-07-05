# Task obj-28: Pediatric growth charts (weight/height/HC percentile curves vs a bundled reference dataset)

> **Filename:** `task-obj-28-pediatric-growth-charts.md` in `objective-tab/p6-trends/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Plot a child's **weight / height / head-circumference** measurements (from the obj-25 series, by age at each
visit) against **percentile curves** drawn from a **bundled static reference dataset** (WHO 0–5y + IAP/CDC for
older children; region default India — P6-D3), keyed by **DOB + sex**. The reference dataset is *config, not
PHI* — public LMS percentile parameters versioned in-repo, carrying no patient data. When the patient has no
DOB or no recorded sex, the growth chart is **hidden gracefully** (never errors, never guesses). Reuses the
obj-27 chart shell.

**Program / Phase:** objective-tab · Phase 6 (trends)  
**Batch:** [`plan-p6-objective-tab-trends-batch.md`](../plan-p6-objective-tab-trends-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-objective-tab-trends.md`](./EXECUTION-ORDER-p6-objective-tab-trends.md)  
**Estimated Time:** ~4–5 hours  
**Status:** ✅ **Complete** (2026-06-20)

> **P6-D3 locked for implementation:** WHO 0–5y percentile checkpoints + IAP/India clinical practice; bundled in-repo as `who-iap-v1`; region default India.

**Change Type:**
- [x] **Add component + bundled data** — growth-chart instance + a versioned reference dataset. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-25's series + hook; obj-27's reusable chart shell; `recharts`; patient DOB + sex via `getPatientById`.
- ✅ **What's shipped (obj-28):** `growth-reference/who-iap-v1.ts`; `growth-percentiles.ts`; `GrowthChart.tsx` + `PediatricGrowthChartsSection`; wired in `VitalsGrid`.

**Scope Guard:**
- Expected files touched: ≤ 5 (a versioned reference-data module + its provenance note; an age/percentile helper + test; the `GrowthChart` instance reusing obj-27's shell + test). **No** new dependency, **no** write path, **no** schema, **no** server fetch of reference data unless P6-D3 says so.
- The reference dataset must be **small, public, attributed, and versioned** — do not inline an unsourced table.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · catalog [`exam-catalog.md`](../../../../../../capture/features/objective-tab/exam-catalog.md) §I.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Reference dataset (config, not PHI)
- [x] ✅ 1.1 Bundle a small versioned LMS percentile dataset per P6-D3 (weight/height/HC by age + sex), with a provenance/attribution + version note; carries **no** patient data. - **Completed: 2026-06-20**
- [x] ✅ 1.2 A typed accessor for percentile bands at a given age + sex. - **Completed: 2026-06-20**

### 2. Growth-chart instance
- [x] ✅ 2.1 Derive age-at-visit from DOB + each point's timestamp; plot the child's wt/ht/HC points over the percentile-curve bands using the obj-27 chart shell. - **Completed: 2026-06-20**
- [x] ✅ 2.2 Hide the chart gracefully when DOB or sex is absent (P6-D3); read-only. - **Completed: 2026-06-20**

### 3. Verification & Testing
- [x] ✅ 3.1 Unit test: percentile accessor returns correct bands for sample age/sex; age-at-visit derivation; DOB/sex-absent → hidden (no throw); points plot on the right band. - **Completed: 2026-06-20**
- [x] ✅ 3.2 `frontend tsc` + lint clean; targeted vitest green. - **Completed: 2026-06-20**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/growth-reference/<dataset>.ts (versioned LMS data + provenance) + percentile helper + test
CREATE: frontend/components/cockpit/rx/objective/GrowthChart.tsx (reuses obj-27 TrendChart shell) + test
DO NOT TOUCH: buildRxPayload / write paths; package.json; any schema/migration
```

**When updating existing code:**
- [x] Reference data is **config, not PHI** — versioned, attributed, no patient values (P6-D3).
- [x] Reuse obj-27's chart shell + `recharts` (P6-D2); read-only (P6-D1); hide gracefully on missing DOB/sex.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Percentiles from a bundled static reference dataset, keyed by DOB + sex; absent → hide (P6-D3).**
- **Reference data = config, not PHI; versioned + attributed.**
- **Read-only; reuse the obj-27 shell + recharts (P6-D1/P6-D2).**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No write** — renders obj-25's series + bundled reference config.
  - [x] **RLS verified?** **Yes** — patient data inherits obj-25's doctor-scoped read; reference data is non-PHI config.
- [x] **Any PHI in logs?** **No** — never log measurements or DOB.
- [x] **External API or AI call?** **No** (reference data bundled per P6-D3; if fetched, that is a separate decision).
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate by default** — read-only client render + bundled non-PHI config. **But** confirm P6-D3 first; if the dataset is fetched from an external source instead of bundled, re-evaluate (external call → revisit the gate).

---

## ✅ Acceptance & Verification Criteria

- [x] Growth chart plots wt/ht/HC vs percentile bands from a bundled, versioned, attributed reference dataset, keyed by DOB + sex.
- [x] Absent DOB/sex hides the chart gracefully (no error); reference data carries no PHI.
- [x] No new dependency; no write; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The one content-heavy task of the phase. The genuinely new artifact is the **reference dataset** (public WHO/IAP percentile parameters) — everything else reuses obj-25's series + obj-27's chart shell. Keep the dataset small, sourced, and versioned.

---

## 🔗 Related Tasks

- [`task-obj-27-weight-bmi-trend-chart.md`](./task-obj-27-weight-bmi-trend-chart.md) — provides the reusable chart shell.
- [`task-obj-25-trend-data-foundation.md`](./task-obj-25-trend-data-foundation.md) — the measurement series.

---

**Last Updated:** 2026-06-20  
**Pattern:** read-only percentile-curve overlay over the per-vital series, using a bundled versioned reference dataset (config, not PHI).  
**Reference:** `process/CODE_CHANGE_RULES.md`
