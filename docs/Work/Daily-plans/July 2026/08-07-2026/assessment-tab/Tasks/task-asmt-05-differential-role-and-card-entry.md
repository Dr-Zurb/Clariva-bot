# Task asmt-05: Fold DDx into the diagnosis cards — `differential` role + `excluded` state + type-to-card entry

> **Filename:** `task-asmt-05-differential-role-and-card-entry.md` in `assessment-tab/Tasks/`.
> **Links:** batch plan [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-assessment-tab.md`](./EXECUTION-ORDER-assessment-tab.md). Code paths **repo-relative**.

---

## 🛑 ESCALATION (agent contract)

This task **changes how a patient-facing field (`differential_diagnosis`) is derived** and is a **5+ file cross-stack refactor** (types + Zod + helpers + reducer + editor). Per `.cursor/rules/00-agent-contract.mdc` both are explicit STOPs: do **not** start implementation on Auto/Sonnet. **Flag for Opus and surface the derivation-parity plan for approval before writing code.**

It **reverses decision lock ASMT-D4** ("`differential_diagnosis` is NOT folded into `diagnoses_json` in v1"). That reversal is deliberate and must be recorded in [`../README.md`](../README.md) + [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md) (done alongside this file). **No new migration is required** — migration 161's SQL only checks `jsonb_typeof(diagnoses_json) = 'array'`; there is no SQL CHECK on `kind`/`certainty`, so both enum additions are app-layer (TS + Zod). Confirm this before any code.

---

## 📋 Task Overview

Today the Assessment tab has **two** diagnosis entry surfaces: the structured `diagnoses_json` cards (primary/secondary, from asmt-03) **and** a separate free-text `differential_diagnosis` chip list (`DdxChipList`). This task unifies them into **one card stream** and upgrades entry to a single type-and-Enter field.

1. **`differential` becomes a card role.** Add `'differential'` to `DiagnosisKind` (`primary | secondary | differential`). The `DdxChipList` chip editor is retired from the tab; differentials become cards like any other diagnosis.
2. **`excluded` becomes a distinct certainty state.** Add `'excluded'` to `DiagnosisCertainty` (`provisional | rule_out | confirmed | excluded`). `excluded` = "considered and dismissed" — **distinct from `rule_out`** (r/o = *actively excluding*). Used for differentials the doctor considered and ruled out.
3. **Type-to-card entry.** One text input at the top of the Diagnoses block; **Enter/comma drops a card** (label pre-filled, input cleared, focus retained for rapid entry). Mirrors the `DdxChipList` keyboard pattern (Enter/comma commit, Backspace-on-empty removes last) and dedupes on a normalized label.
4. **DDx becomes a derived projection (the invariant).** On save, `differential_diagnosis[]` is **derived** from cards where `kind === 'differential' && certainty !== 'excluded'` — byte-identical to today for equal content (ASMT-D4′ / OBJ-D2 analog). Excluded differentials are **retained in `diagnoses_json`** (the record of what was dismissed) but **omitted from patient-facing output**. A legacy stored `differential_diagnosis[]` hydrates into differential cards on load (no data migration).
5. **Reduced differential card.** A differential card shows **label + Considering/Excluded toggle + note only** (toggle maps to `certainty` = `provisional`/`excluded`). Status, severity, and the problem-list link/promote block are **hidden** for differentials (a differential is not a committed Dx and never goes on the chronic problem list).

**Program / Batch:** assessment-tab · Wave 5
**Plan:** [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md)
**Estimated Time:** ~5–7 hours
**Status:** ✅ **Done — 2026-07-09** (user override: implement with Grok 4.5 high). Migration 161 confirmed array-only CHECK (no `kind`/`certainty` SQL enum). ASMT-D4′ already recorded in README + plan.

**Change Type:**
- [x] ✅ **Update existing** (enums + Zod + helpers + reducer + editor; retire `DdxChipList` from the tab). **No new migration** (confirm SQL has no `kind`/`certainty` CHECK). Follow `docs/Work/process/CODE_CHANGE_RULES.md`. — **Completed: 2026-07-09**

**Current State:** (check existing code first!)
- ✅ **Exists:** `DiagnosisKind`/`DiagnosisCertainty` + `DiagnosisRow` (`frontend/types/prescription.ts` L22-52, mirrored BE); tolerant `diagnosisRowSchema` + `diagnosesJsonSchema` (`backend/src/utils/validation.ts` L1716-1779; `DIAGNOSIS_KIND_VALUES` L1716, `DIAGNOSIS_CERTAINTY_VALUES` L1717); helpers `normalizeDiagnoses` / `derivePrimaryDiagnosis` / `enforceSinglePrimary` / `sortDiagnosesPrimaryFirst` / `seedPrimaryDiagnosisFromLegacy` / `normalizeConditionKey` (`frontend/lib/cockpit/diagnoses.ts`); reducer `SET/ADD/UPDATE/REMOVE_DIAGNOSIS` + `ADD/REMOVE_DDX` (`RxFormContext.tsx` L449-455, L1917-1980), hydrate L1029-1040, `buildRxPayload` derive L1246-1253; the card editor `DiagnosisRowsList.tsx`; the chip editor `DdxChipList.tsx`; the tab editor `AssessmentSection.tsx` (renders `<DiagnosisRowsList/>` + `<DdxChipList/>`).
- ⚠️ **Invariant:** RLS on `prescriptions` covers all columns via `auth.uid() = doctor_id` (migration 026). Do **not** add/modify RLS. Output readers (`prescription-pdf-composer.ts`, `PrescriptionDocument.tsx`, `notification-service.ts`, `VisitDetailSideSheet.tsx`) read `provisional_diagnosis` / `differential_diagnosis` — their **output shape stays untouched**; only how `differential_diagnosis` is *derived* changes.
- ⚠️ **Watch (strip glance):** `AssessmentStrip.tsx` shows the DDx glance. After the fold, the strip's DDx must read the **derived** differentials (read-only glance); confirm the strip has no editor dispatching `ADD_DDX`.

**Scope Guard:**
- Expected files touched: the two `prescription.ts` type files, `validation.ts` (two enum arrays), `diagnoses.ts` (helpers), `RxFormContext.tsx` (hydrate + derive + reducer), `DiagnosisRowsList.tsx` (entry input + role selector + role-conditional fields), `AssessmentSection.tsx` (drop `<DdxChipList/>`), `DdxChipList.tsx` (retire), plus the affected tests.
- **DO NOT** add a migration unless the escalation review proves the JSONB column needs a SQL CHECK change (it should not). **DO NOT** change the `provisional_diagnosis` / `differential_diagnosis` **output shape** — only DDx *derivation*. **DO NOT** surface excluded differentials on patient output. **DO NOT** add ICD/SNOMED coding (ASMT-D7). **DO NOT** edit RLS (ASMT-D8). **DO NOT** auto-write chronic conditions on save (ASMT-D6).

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md` · derivation/parity precedent from asmt-03 (`frontend/lib/cockpit/diagnoses.ts`, the `provisional_diagnosis` parity test) and `frontend/lib/cockpit/test-results.ts`.

---

## ✅ Task Breakdown (Hierarchical)

### 0. Escalation gate
- [x] ✅ 0.1 STOP: confirm no migration is required (SQL has no `kind`/`certainty` CHECK — migration 161 L44-45); surface the DDx derivation-parity plan + the ASMT-D4 reversal; **user override to implement with Grok 4.5 high**. — **Completed: 2026-07-09**

### 1. Enums + types
- [x] ✅ 1.1 Added `'differential'` to `DiagnosisKind` and `'excluded'` to `DiagnosisCertainty` FE+BE. — **Completed: 2026-07-09**
- [x] ✅ 1.2 Added both values to `DIAGNOSIS_KIND_VALUES` / `DIAGNOSIS_CERTAINTY_VALUES` in `validation.ts`. — **Completed: 2026-07-09**
- [x] ✅ 1.3 Mirrored value lists in `diagnoses.ts`. — **Completed: 2026-07-09**

### 2. No migration (confirm + document)
- [x] ✅ 2.1 Confirmed migration 161 only constrains `jsonb_typeof = 'array'`; no new migration. — **Completed: 2026-07-09**

### 3. Helper semantics (correctness-critical)
- [x] ✅ 3.1 `enforceSinglePrimary` — only non-differential rows may hold primary; differentials never demoted. — **Completed: 2026-07-09**
- [x] ✅ 3.2 `sortDiagnosesPrimaryFirst` — primary → secondary → differential. — **Completed: 2026-07-09**
- [x] ✅ 3.3 `derivePrimaryDiagnosis` — skips differentials. — **Completed: 2026-07-09**
- [x] ✅ 3.4 Added `deriveDifferentialDiagnosis` + `seedDifferentialsFromLegacy`. — **Completed: 2026-07-09**
- [x] ✅ 3.5 `normalizeDiagnoses` accepts `'differential'`/`'excluded'`; clears `conditionId` on differentials. — **Completed: 2026-07-09**

### 4. Hydrate + derivation parity (the invariant)
- [x] ✅ 4.1 Hydrate seeds differential cards from legacy `differential_diagnosis[]`. — **Completed: 2026-07-09**
- [x] ✅ 4.2 `buildRxPayload` derives `differentialDiagnosis` from non-excluded differential cards. — **Completed: 2026-07-09**
- [x] ✅ 4.3 Parity tests for DDx derivation + excluded omission. — **Completed: 2026-07-09**

### 5. Reducer + strip
- [x] ✅ 5.1 Reducer keeps derived DDx mirror in sync; strip glance is read-only. — **Completed: 2026-07-09**
- [x] ✅ 5.2 Removed `ADD_DDX` / `REMOVE_DDX` actions; deleted `DdxChipList.tsx`. — **Completed: 2026-07-09**

### 6. Entry input + role-conditional card editor (`DiagnosisRowsList.tsx`)
- [x] ✅ 6.1 Type-to-card capture input (Enter/comma; Backspace-on-empty; dedupe). Replaced "Add diagnosis" button. — **Completed: 2026-07-09**
- [x] ✅ 6.2 Per-card role control (Primary · Secondary · Differential). — **Completed: 2026-07-09**
- [x] ✅ 6.3 Role-conditional fields; differential = Considering/Excluded + note only. — **Completed: 2026-07-09**
- [x] ✅ 6.4 Primary highlighted; differentials dashed/lighter. — **Completed: 2026-07-09**

### 7. Fold in the tab + output privacy
- [x] ✅ 7.1 Removed `<DdxChipList/>` from `AssessmentSection.tsx`. — **Completed: 2026-07-09**
- [x] ✅ 7.2 Excluded differentials omitted from derived output (proven by test). — **Completed: 2026-07-09**

### 8. Verification gate
- [x] ✅ 8.1 Backend type-check PASS; diagnoses validation + asmt-05 cases PASS. — **Completed: 2026-07-09**
- [x] ✅ 8.2 Frontend assessment slice vitest 55/55 PASS; eslint clean on touched files; no new tsc errors in touched symbols (pre-existing WIP errors elsewhere). — **Completed: 2026-07-09**
- [ ] 8.3 Manual/integration: type-Enter / role switch / Excluded / legacy hydrate — flag for QA.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/types/prescription.ts        (DiagnosisKind +differential; DiagnosisCertainty +excluded)
UPDATE: backend/src/types/prescription.ts     (mirror)
UPDATE: backend/src/utils/validation.ts       (DIAGNOSIS_KIND_VALUES +differential; DIAGNOSIS_CERTAINTY_VALUES +excluded; tolerant .catch stays)
UPDATE: frontend/lib/cockpit/diagnoses.ts     (value lists; enforceSinglePrimary/sort/derivePrimary skip differentials; +deriveDifferentialDiagnosis; +seedDifferentialsFromLegacy)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (hydrate seeds differentials; buildRxPayload derives differentialDiagnosis from cards; keep derived mirror; retire ADD/REMOVE_DDX usage)
UPDATE: frontend/components/cockpit/rx/inputs/DiagnosisRowsList.tsx (type-to-card input; role selector; role-conditional fields)
UPDATE: frontend/components/cockpit/rx/sections/AssessmentSection.tsx (remove <DdxChipList/>)
RETIRE: frontend/components/cockpit/rx/inputs/DdxChipList.tsx (no longer used in the tab; delete if no other consumer)
UPDATE: tests — rxFormContext.diagnoses.test.ts, DiagnosisRowsList test, AssessmentSection.test.tsx (drop DdxChipList), validation diagnoses test; ADD a differential_diagnosis derivation-parity test
DO NOT TOUCH: RLS; provisional_diagnosis / differential_diagnosis OUTPUT shape; output readers; migrations (unless a SQL CHECK is found)
```

**When updating existing code:** (MANDATORY)
- [ ] Both enum additions optional/tolerant; old rows/prescriptions validate + hydrate unchanged.
- [ ] `differential_diagnosis` byte-identical for equal content; excluded differentials omitted from output but kept in `diagnoses_json`.
- [ ] `provisional_diagnosis` byte-identical; a differential never derives into it.
- [ ] No RLS edits; no new migration; prescription save never auto-writes a chronic condition.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **DDx is a derived projection (ASMT-D4′).** `differential_diagnosis` output stays canonical; it is derived from non-excluded differential cards, byte-identical for equal content. This **reverses** the original ASMT-D4 ("not folded in v1") — recorded in README + plan.
- **`excluded` ≠ `rule_out`.** `rule_out` = actively excluding (a working Dx to disprove); `excluded` = considered and dismissed (omitted from patient output).
- **Reduced differentials.** A differential carries only label + considering/excluded + note; no status/severity/problem-link.
- **Legacy hydrate, no data migration.** Stored `differential_diagnosis[]` seeds differential cards on load.
- **No coding (ASMT-D7); no RLS edits (ASMT-D8); no auto-write (ASMT-D6).**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] 🛑 **Data touched?** **YES (derivation only)** — changes how patient-facing `differential_diagnosis` is derived; adds `differential`/`excluded` enum values inside `diagnoses_json`. **No new column, no new migration** (confirm no SQL CHECK). Flag → approve on Opus before code.
- [ ] ✅ **Any PHI in logs?** **No** — never log diagnosis/differential labels or notes.
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **No new store**; `diagnoses_json` retention/cascade unchanged. RLS unchanged.

---

## ✅ Acceptance & Verification Criteria

- [x] A diagnosis card can be set to `differential`; a differential can be marked `Considering`/`Excluded`; the reduced card hides status/severity/problem-link.
- [x] Typing a diagnosis + Enter drops a card (first = primary, else secondary); dedupe + Backspace-on-empty work; the standalone `DdxChipList` is gone from the tab.
- [x] `differential_diagnosis` output is byte-identical for equal content; excluded differentials are omitted from output but retained in `diagnoses_json` (proven by test).
- [x] `provisional_diagnosis` stays byte-identical; a differential never derives into it.
- [x] Legacy `differential_diagnosis[]` hydrates into differential cards on load; no data migration; no RLS edits; BE + FE slice gates green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Requires [`task-asmt-03-structured-diagnoses.md`](./task-asmt-03-structured-diagnoses.md) (the card model + `diagnoses_json` this task extends) and builds beside [`task-asmt-04-problem-list-linkage.md`](./task-asmt-04-problem-list-linkage.md) (problem-link block stays on primary/secondary cards only).
- **Reverses ASMT-D4** — record the reversal in [`../README.md`](../README.md) + [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md).

---

**Last Updated:** 2026-07-09
**Pattern:** fold the free-text DDx chip list into the structured diagnosis cards (`differential` role + `excluded` state), derive patient-facing `differential_diagnosis` from non-excluded differential cards byte-identically, and upgrade entry to a single type-and-Enter-drops-a-card field — no migration.
**Completed:** 2026-07-09 (user override — Grok 4.5 high)
