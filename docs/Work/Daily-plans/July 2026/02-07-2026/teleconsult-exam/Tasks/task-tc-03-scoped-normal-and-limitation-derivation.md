# Task tc-03: Scoped teleconsult "Mark normal" line + auto limitation caveat in `examination_findings`

> **Filename:** `task-tc-03-scoped-normal-and-limitation-derivation.md` in `teleconsult-exam/Tasks/`.
> **Links:** batch plan [`../plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-teleconsult-exam.md`](./EXECUTION-ORDER-teleconsult-exam.md). Code paths **repo-relative**.

---

## 📋 Task Overview

The **text** side of teleconsult — two derivation changes, both gated on `isTeleconsult`, both preserving **in-clinic byte-parity** (`TC-D4`, `TC-D5`):

1. **Scoped "Mark normal" line.** When a system is marked normal on a teleconsult, its derived line uses the **teleconsult WNL line** from tc-01 (e.g. Respiratory → *"No respiratory distress on inspection"*) instead of the in-clinic `normalLine` (*"Bilateral air entry normal, no added sounds"*) — so a normal teleconsult note never claims auscultation/palpation were normal.
2. **Auto limitation caveat.** When teleconsult **and** the derived exam block is non-empty, append a visit-level suffix line: *"Assessment via teleconsultation; physical examination limited to inspection and patient-reported data."* Editable/removable once the doctor manually overrides the derived text (standard OBJ-D2 override behaviour).

**In-clinic derivation is byte-identical to today** — proven by the existing parity suites staying green.

**Program / Batch:** teleconsult-exam · single batch (Wave 3)
**Plan:** [`../plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md)
**Estimated Time:** ~3–4 hours
**Status:** Committed — not yet implemented. **Model: Opus** — modifies the **locked** `examination_findings` derived-text contract (OBJ-D2) and must prove parity; same posture as `obj-30`.

**Change Type:**
- [ ] **Update existing** — thread modality into the exam derivation; scoped normal line + caveat suffix. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **What exists:** `deriveExaminationFindingsFromExam(examFindings)` in `frontend/components/cockpit/rx/RxFormContext.tsx` (~L768) — **pure, findings-only**, sorts by `compareExamSystems`, maps each via `renderExamSystemLine` (normal → `normalLine`, abnormal → joined findings), joins `\n`, empty → `""` (legacy free-text fallback, P1-D2). Called on save (mirrors `examination_findings`, OBJ-D2) and directly by the parity tests with exact-string assertions (`examDerivationParity`, `objectiveLayoutParity`, `rxFormContext.exam`, `objectiveTemplateParity`). tc-01 provides `teleconsultNormalLine(systemId)` + `isTeleconsult` + readable `consultationType`.
- ❌ **What's missing:** any modality awareness in the derivation; a scoped-normal branch; the caveat suffix.

**Scope Guard:**
- Expected files touched: `RxFormContext.tsx` (the derivation + its call site) and/or `exam-finding-utils.ts` (if the line renderer moves there); the `ExamSystemStatusToolbar` / body normal-line display; the parity/derivation tests (+ new teleconsult cases).
- **DO NOT** change the in-clinic output, the stored shape, or `examination_json`. **DO NOT** persist the caveat as data (it is derived). **DO NOT** change chip vocabulary or ordering.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `STANDARDS.md` · `RECIPES.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Thread modality into derivation (additive, parity-safe)
- [x] ✅ 1.1 Give `deriveExaminationFindingsFromExam` an **optional** options arg (`{ consultationType }`) that **defaults to today's behaviour** (absent/`undefined` → in-clinic) — so every existing findings-only call (incl. the parity tests) is byte-identical. - **Completed: 2026-07-03**
- [x] ✅ 1.2 Update the on-save call site in `RxFormContext.tsx` (added a `consultationTypeRef`; `buildRxPayload` now takes an optional `{ consultationType }` threaded into the derivation) to pass the readable `consultationType` (tc-01). - **Completed: 2026-07-03**

### 2. Scoped normal line
- [x] ✅ 2.1 In the normal-system branch of the line renderer, when teleconsult, emit `teleconsultNormalLine(systemId)` instead of the bare `"Normal"`; when in-clinic, unchanged. - **Completed: 2026-07-03**
- [x] ✅ 2.2 Reflect the scoped line in the in-card "Mark normal" preview (the `normalLine` fed to `ExamSystemStatusToolbar` in the 5 bodies) so what the doctor sees matches what derives. - **Completed: 2026-07-03**

### 3. Limitation caveat suffix
- [x] ✅ 3.1 When teleconsult **and** the derived block is non-empty, append `TELECONSULT_EXAM_CAVEAT` as a final line (visit-level, once — not per system). Empty exam → still `""` (legacy fallback unchanged). - **Completed: 2026-07-03**
- [x] ✅ 3.2 Caveat rides through the OBJ-D2 passthrough into `examination_findings` on save (derived-only, nothing new persisted — `examinationJson` is modality-independent); overridable/removable via the existing manual-override path. - **Completed: 2026-07-03**

### 4. Verification & Testing
- [x] ✅ 4.1 **In-clinic parity:** `examDerivationParity`, `rxFormContext.exam`, `objectiveTemplateParity` green **unchanged**; `objectiveLayoutParity` exam payload is byte-identical (its 7 failures are the pre-existing obj-15 ObjectiveSection layout/a11y WIP, not exam derivation). - **Completed: 2026-07-03**
- [x] ✅ 4.2 New teleconsult cases added: a normal system derives the scoped line; a non-empty teleconsult exam ends with the caveat; an empty exam returns `""`; mixed normal+abnormal sorts/joins then appends the caveat once; toolbar preview matches. - **Completed: 2026-07-03**
- [x] ✅ 4.3 `tsc --noEmit`, `eslint`, and the exam/parity suites clean for the slice (102 + 59 targeted tests green). - **Completed: 2026-07-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (optional modality arg on deriveExaminationFindingsFromExam; scoped normal branch; caveat suffix; pass consultationType at call site)
UPDATE (if line renderer lives there): frontend/lib/cockpit/exam-finding-utils.ts
UPDATE: frontend/components/cockpit/rx/inputs/ExamSystemStatusToolbar.tsx (scoped normal preview under teleconsult)
UPDATE: frontend/components/cockpit/rx/__tests__/examDerivationParity.test.tsx (+ teleconsult cases; keep in-clinic assertions unchanged)
UPDATE (verify green, no assertion change): objectiveLayoutParity / rxFormContext.exam / objectiveTemplateParity
DO NOT TOUCH: in-clinic output; examination_json; stored shape; chip vocabulary/order
```

**When updating existing code:** (MANDATORY)
- [ ] Keep the derivation **pure + stable** (registry order, no `Date.now`) — the caveat text is a constant, not timestamped.
- [ ] Make the modality arg **optional with an in-clinic default** so no existing caller changes behaviour.
- [ ] Run the parity suites *before* touching anything to capture the baseline strings.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **In-clinic is sacred (`TC-D5`).** For in-clinic / findings-only calls the output must be **byte-identical** to today — the parity suites are the gate.
- **Caveat is derived, never stored (`TC-D1`).** It lives only in the derived text; absence of a finding still means absence.
- **Scoped normal must not over-claim (`TC-D4`).** A teleconsult "normal" asserts only the inspection/observable scope.
- **Additive signature.** Optional modality arg defaulting to in-clinic; no breaking change to callers/tests.
- No PHI in logs; caveat text is generic (no patient identifiers).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** — derivation only; writes via existing OBJ-D2 passthrough; no schema/migration.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] In-clinic derived `examination_findings` is byte-identical to pre-change (parity suites green, no assertion edits).
- [ ] Teleconsult normal system derives the scoped WNL line; the in-card preview matches.
- [ ] Non-empty teleconsult exam appends the caveat exactly once; empty exam → `""`.
- [ ] Caveat is overridable/removable via the existing manual-override path; nothing new persisted.
- [ ] lint + `tsc` + slice tests green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- [`task-tc-01-exam-remote-feasibility-schema.md`](./task-tc-01-exam-remote-feasibility-schema.md) — provides `teleconsultNormalLine` + `isTeleconsult`.
- [`task-tc-02-teleconsult-exam-ui-preset.md`](./task-tc-02-teleconsult-exam-ui-preset.md) — the UI counterpart.
- [`task-tc-04-teleconsult-exam-close-gate.md`](./task-tc-04-teleconsult-exam-close-gate.md) — the parity + verification gate.

---

**Last Updated:** 2026-07-02
**Pattern:** additive optional modality arg on a pure derivation; in-clinic byte-parity guarded by the existing suites (mirrors `obj-30`).
