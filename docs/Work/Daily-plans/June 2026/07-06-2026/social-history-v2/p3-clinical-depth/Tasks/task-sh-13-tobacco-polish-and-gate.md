# Task sh-13: tobacco pack-year equivalents (hookah/cigar/vape) + Phase 3 integration · a11y · gate

> **Filename:** `task-sh-13-tobacco-polish-and-gate.md` in `social-history-v2/p3-clinical-depth/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Two parts. (1) **Tobacco polish:** extend pack-years so non-cigarette tobacco — hookah, cigar, and
vape — contributes documented cigarette-equivalent multipliers to the existing pack-years sum,
clearly labelled "approximate" (SHv3-D6). No new index type; cigarette/beedi numbers stay unchanged.
(2) **Phase 3 gate:** verify carry-forward + presets copy all Phase-3 fields (`auditC`,
`maxPerSession`, new frequency, `abv`), run the a11y pass across the new controls (AUDIT-C block,
max-in-one-sitting, frequency, ABV input), and execute the whole-phase acceptance gate.

**Program / Phase:** social-history-v2 · Phase 3 (clinical depth + surfacing)  
**Batch:** [`plan-p3-social-history-v2-clinical-depth-batch.md`](../plan-p3-social-history-v2-clinical-depth-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md`](./EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md)  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature + verification** — additive multipliers + phase gate (no schema migration).

**Current State:**
- ✅ **What exists:** pack-years math + `SMOKING_PACK_YEARS_TOOLTIP` + product rows in [`social-history-tobacco-products.ts`](../../../../../../../frontend/lib/cockpit/social-history-tobacco-products.ts); `packYearsClinicalHint` + thresholds in [`social-history-indices.ts`](../../../../../../../frontend/lib/cockpit/social-history-indices.ts); carry-forward + presets passthrough (serialize whole object); a11y conventions from Phases 1–2.
- ✅ **What's missing (was):** hookah/cigar/vape cigarette-equivalent multipliers; Phase-3 carry-forward/a11y/gate verification — all shipped.

**Scope Guard:**
- Expected files touched: ≤ 5 (`social-history-tobacco-products.ts`; `social-history-indices.ts`; `SocialHistoryField.tsx` for the label; carry-forward/presets verification; + tests). No new index type; no migration.

**Reference Documentation:**
- Batch plan **SHv3-D6** (tobacco polish stays an approximation) + cross-cutting gate · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Tobacco equivalents
- [x] ✅ 1.1 Add documented cigarette-equivalent multipliers for hookah / cigar / vape to the tobacco product model; feed them into the existing pack-years sum. - **Completed: 2026-06-08** (`HOOKAH_SESSION_CIGARETTE_EQUIVALENT=10`, `CIGAR_CIGARETTE_EQUIVALENT=1`, `VAPE_POD_CIGARETTE_EQUIVALENT=20`)
- [x] ✅ 1.2 Update the tooltip/label to state the equivalents are approximate; cigarette/beedi pack-years stay byte-identical. - **Completed: 2026-06-08**

### 2. Integration verify (Phase 3 fields)
- [x] ✅ 2.1 Confirm carry-forward copies `alcohol.auditC`, `alcohol.maxPerSession`, new frequency, and drink `abv` (should be automatic — whole-object serialize; verify + add a test if gapped). - **Completed: 2026-06-08** (`carry-forward-subjective.test.ts`)
- [x] ✅ 2.2 Confirm subjective presets / templates round-trip the new fields. - **Completed: 2026-06-08** (`apply-subjective-template.test.ts`)

### 3. a11y
- [x] ✅ 3.1 Keyboard + screen-reader pass over the AUDIT-C block, max-in-one-sitting control, new frequency options, and the ABV input (labels, roles, focus order, live-badge announcements). - **Completed: 2026-06-08** (binge hint `role="status"` + `aria-live`; assertions in `SocialHistoryField.test.tsx`)

### 4. Phase gate
- [x] ✅ 4.1 Run the [batch plan's cross-cutting gate](../plan-p3-social-history-v2-clinical-depth-batch.md#cross-cutting-acceptance-gate-whole-phase): all sh-09..13 acceptance items, `cd frontend; npx tsc --noEmit` + `npm run lint`, backend + frontend suites, PDF render check. - **Completed: 2026-06-08** (157 frontend + 4 backend PDF tests green)

### 5. Verification & Testing
- [x] ✅ 5.1 Pack-years tests with hookah/cigar/vape equivalents; cigarette-only unchanged. - **Completed: 2026-06-08** (`social-history-tobacco-products.test.ts`)
- [x] ✅ 5.2 Carry-forward/preset round-trip tests for the new fields; a11y assertions; full-suite green. - **Completed: 2026-06-08**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/social-history-tobacco-products.ts (hookah/cigar/vape multipliers)
UPDATE: frontend/lib/cockpit/social-history-indices.ts (pack-years sum picks up equivalents; label)
UPDATE: frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx (approximate label)
UPDATE: relevant *.test.ts(x) (pack-years, carry-forward/preset, a11y)
VERIFY (no expected change): carry-forward + presets paths (whole-object serialize)
DO NOT TOUCH: migrations (none); new index types
```

**Shipped files:**
- `frontend/lib/cockpit/social-history-tobacco-products.ts`
- `frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx`
- `frontend/components/cockpit/rx/subjective/TobaccoProductRows.tsx`
- `frontend/lib/cockpit/__tests__/social-history-tobacco-products.test.ts`
- `frontend/lib/cockpit/__tests__/carry-forward-subjective.test.ts`
- `frontend/lib/cockpit/__tests__/apply-subjective-template.test.ts`
- `frontend/lib/cockpit/__tests__/social-history.test.ts`
- `frontend/components/cockpit/rx/subjective/__tests__/SocialHistoryField.test.tsx`
- `frontend/components/cockpit/rx/subjective/__tests__/TobaccoProductRows.test.tsx`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Approximation, labelled** (SHv3-D6) — hookah/cigar/vape are documented equivalents, not a separate index.
- **Cigarette/beedi unchanged** — existing pack-years output stays byte-identical.
- **Carry-forward is automatic** — new fields ride the whole-object serialize; this task verifies, not re-wires.
- **No migration.**

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (shape only)** — tobacco equivalents in `social_history_structured` JSONB (PHI); no new column.
  - [x] **RLS verified?** **Yes** — covered by 026; unchanged.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Hookah/cigar/vape contribute approximate cigarette-equivalents to pack-years (labelled; cigarette/beedi unchanged); carry-forward + presets copy all Phase-3 fields; a11y clean across new controls; whole-phase gate passes; suites + `tsc`/lint green; no migration.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Last task in Phase 3 — closes the program's clinical-depth + surfacing backlog. Any remaining items (full AUDIT-10, IPAQ, active CDS, threshold admin UI) stay deferred per the batch plan's "does NOT do" table.

Approximate multipliers (documented constants, overridable later):
- Hookah session → 10 cigarettes
- Cigar → 1 cigarette each
- Vape pod → 20 cigarettes (≈1 pack)

---

## 🔗 Related Tasks

- [`task-sh-09-alcohol-audit-c.md`](./task-sh-09-alcohol-audit-c.md) · [`task-sh-10-binge-and-frequency.md`](./task-sh-10-binge-and-frequency.md) · [`task-sh-11-abv-and-thresholds.md`](./task-sh-11-abv-and-thresholds.md) · [`task-sh-12-pdf-surfacing.md`](./task-sh-12-pdf-surfacing.md) — all verified by this gate.

---

**Last Updated:** 2026-06-08  
**Pattern:** additive approximation multipliers + whole-phase integration/a11y/gate.  
**Reference:** `process/CODE_CHANGE_RULES.md` · batch plan SHv3-D6 + cross-cutting gate.
