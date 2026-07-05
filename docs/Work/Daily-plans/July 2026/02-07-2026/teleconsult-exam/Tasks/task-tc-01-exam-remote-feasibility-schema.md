# Task tc-01: Exam remote-feasibility schema + teleconsult WNL lines + `consultationType` surfaced as form state

> **Filename:** `task-tc-01-exam-remote-feasibility-schema.md` in `teleconsult-exam/Tasks/`.
> **Links:** batch plan [`../plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-teleconsult-exam.md`](./EXECUTION-ORDER-teleconsult-exam.md). Code paths below are **repo-relative** (avoid fragile `../` link math).

---

## 📋 Task Overview

Lay the **substrate** for teleconsult-aware examination — three pure/near-pure pieces, **no UI and no derivation change yet**:

1. **Per-subsection `remote` feasibility flag.** Add `remote: "assessable" | "in_person_only"` to each *rendered* exam subsection. `assessable` = doable over video (Inspection + observable signs); `in_person_only` = needs a stethoscope/hands (Auscultation, Palpation, Percussion). Flag is **UI/derivation guidance only** — obj-01 Zod is untouched and the chip vocabulary is unchanged.
2. **Teleconsult WNL line per system.** Add a teleconsult-scoped "within normal limits" line (e.g. Respiratory → *"No respiratory distress on inspection"*) alongside the existing in-clinic `normalLine`. Consumed later by tc-03; defined here.
3. **Surface `consultationType` as readable form state.** Today `consultationType` is loaded (`loadConsultationType`) and used **only at seed-time** to pick vitals provenance defaults — it is not readable by components. Expose it on the RX form context (state + selector) so the exam layer (tc-02/tc-03) can branch on `isTeleconsult` **without** inferring modality from the vitals `measurementContext` (which the doctor edits per-vital → wrong signal).

Ship the pure **resolvers** + unit tests so tc-02/tc-03 are thin consumers.

**Program / Batch:** teleconsult-exam · single batch (Wave 1 substrate)
**Plan:** [`../plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md)
**Estimated Time:** ~2–3 hours
**Status:** Committed — not yet implemented. **Model: Sonnet** (pure data + a small context selector; no schema/DB, no derived-text).

**Change Type:**
- [ ] **Update existing** — enrich subsection schemas + `exam-schema.ts`; add resolvers; surface `consultationType`. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **What exists:** the 5 per-system subsection defs `CVS/RESP/ABD/CNS/GENERAL_EXAM_SUBSECTIONS` in `frontend/lib/cockpit/{cvs,resp,abd,cns,general}-exam-finding-schema.ts` (each subsection `{ id, label, chips, chipGroups?, structuredFindingIds }`) — these are what the bodies actually render; `frontend/lib/cockpit/exam-schema.ts` (`ExamSubsection { id, label, chips }`, per-system `normalLine`, generic fallback); `frontend/lib/cockpit/measurement-context.ts` (`resolveDefaultMeasurementContext(consultationType)` — the teleconsult-defaults precedent); `RxFormContext.tsx` `RxFormSeedOptions.consultationType` consumed by `createEmptyRxFormFields` / `rxFormFieldsFromPrescription`; `useRxFormProviderSetup.ts` `loadConsultationType(token, appointmentId)`.
- ❌ **What's missing:** any `remote` feasibility notion; a teleconsult WNL line; a **readable** `consultationType` (it is seed-only today) / an `isTeleconsult` selector.

**Scope Guard:**
- Expected files touched: the 5 `*-exam-finding-schema.ts` + `exam-schema.ts` + `RxFormContext.tsx` (surface `consultationType`) + a new resolver test (and, if needed, `useRxFormProviderSetup.ts` to store the loaded value).
- **DO NOT** change any chip string, `ExamFindingEntry`/`ExamSystemFinding` shape, or obj-01 Zod. **DO NOT** add a migration/column. **DO NOT** touch the UI bodies or derivation (that's tc-02/tc-03). **DO NOT** infer modality from `measurementContext`.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/STANDARDS.md` · `RECIPES.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Remote-feasibility flag on rendered subsections
- [ ] 1.1 Add a shared `ExamRemoteFeasibility = "assessable" | "in_person_only"` type (one home, e.g. `exam-schema.ts`) and add an **optional** `remote?: ExamRemoteFeasibility` field to the subsection defs used by the bodies (the `*-exam-finding-schema.ts` subsection interfaces).
- [ ] 1.2 Tag each system's subsections: Inspection + observable = `assessable`; Auscultation / Palpation / Percussion (and CVS Precordium/JVP palpation-only groups) = `in_person_only`. Default when omitted = `assessable` (so General/observable stays untouched).
- [ ] 1.3 Mirror the flag onto `exam-schema.ts` subsections for the generic fallback path (keep the two representations consistent — assert in a test).

### 2. Teleconsult WNL line
- [ ] 2.1 Add a `teleconsultNormalLine` per core system (in `exam-schema.ts` next to `normalLine`), e.g. Resp → "No respiratory distress on inspection", CVS → "No raised JVP or peripheral edema on inspection", General unchanged (already inspection-based).
- [ ] 2.2 Resolver `teleconsultNormalLine(systemId): string` falling back to the in-clinic `normalLine` when no teleconsult-specific line is defined.

### 3. Surface `consultationType` + resolvers
- [ ] 3.1 Store the loaded `consultationType` as readable RX-form state (not just a seed input) and expose it via `useRxForm()` (e.g. `state.consultationType` or a `useConsultationType()` selector). Keep it optional/nullable.
- [ ] 3.2 `isTeleconsult(consultationType): boolean` — **true unless** `consultation_type === "in_clinic"` (mirror `resolveDefaultMeasurementContext`'s branch so teleconsult is the default posture). Confirm the exact in-clinic sentinel used by `loadConsultationType`.
- [ ] 3.3 `resolveSubsectionRemoteFeasibility(subsection): ExamRemoteFeasibility` + `listSubsectionsByFeasibility(...)` helpers for tc-02.

### 4. Verification & Testing
- [ ] 4.1 Unit tests: every rendered subsection resolves a feasibility; the IPPA contact subsections are `in_person_only`; `teleconsultNormalLine` falls back correctly; `isTeleconsult` treats absent/unknown as teleconsult and only `in_clinic` as false.
- [ ] 4.2 A guard test that the `exam-schema.ts` fallback flags match the per-system schema flags (no drift).
- [ ] 4.3 `cd frontend && npx tsc --noEmit && npm run lint` clean for touched files; existing exam/objective suites still green (no behaviour change expected).

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/cvs-exam-finding-schema.ts   (remote flag on subsection defs)
UPDATE: frontend/lib/cockpit/resp-exam-finding-schema.ts  (remote flag)
UPDATE: frontend/lib/cockpit/abd-exam-finding-schema.ts   (remote flag)
UPDATE: frontend/lib/cockpit/cns-exam-finding-schema.ts   (remote flag)
UPDATE: frontend/lib/cockpit/general-exam-finding-schema.ts (remote flag; mostly assessable)
UPDATE: frontend/lib/cockpit/exam-schema.ts               (ExamRemoteFeasibility type; teleconsultNormalLine; fallback flags; resolvers)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx   (surface consultationType as readable state + isTeleconsult selector)
UPDATE (if needed): frontend/components/cockpit/rx/useRxFormProviderSetup.ts (persist loaded consultationType into state)
CREATE: frontend/lib/cockpit/__tests__/exam-remote-feasibility.test.ts
DO NOT TOUCH: chip strings; ExamFindingEntry/ExamSystemFinding shapes; obj-01 Zod; migrations; the exam bodies; derivation
```

**When updating existing code:** (MANDATORY)
- [ ] Grep every consumer of the subsection defs before adding a field (the bodies destructure them).
- [ ] Confirm the exact `in_clinic` sentinel string emitted by `loadConsultationType` before writing `isTeleconsult`.
- [ ] Keep the flag optional with an `assessable` default so untagged subsections are inert.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Pure substrate.** No UI, no derivation, no "Mark normal" change in this task — only schema + resolvers + a readable modality value.
- **No data-contract change.** `remote` and `teleconsultNormalLine` are static schema metadata; nothing new is persisted. `TC-D1` holds.
- **Modality from `consultationType` only (`TC-D6`)** — never from `measurementContext`.
- **Teleconsult is the default posture** — only `in_clinic` is "not teleconsult", matching the vitals-provenance branch.
- No PHI in logs/labels.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** — static schema + a context value; no schema/migration.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Every rendered subsection resolves a `remote` feasibility; IPPA contact subsections are `in_person_only`, Inspection/observable are `assessable`.
- [ ] `teleconsultNormalLine(systemId)` returns a scoped line where defined and falls back to `normalLine` otherwise.
- [ ] `consultationType` is readable via `useRxForm()`; `isTeleconsult` returns false only for `in_clinic`.
- [ ] Fallback (`exam-schema.ts`) and per-system flags agree (guard test).
- [ ] lint + `tsc` clean for touched files; existing suites green (no behaviour change).

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- [`task-tc-02-teleconsult-exam-ui-preset.md`](./task-tc-02-teleconsult-exam-ui-preset.md) — consumes the flag + `isTeleconsult`.
- [`task-tc-03-scoped-normal-and-limitation-derivation.md`](./task-tc-03-scoped-normal-and-limitation-derivation.md) — consumes `teleconsultNormalLine`.

---

**Last Updated:** 2026-07-02
**Pattern:** static schema metadata + resolver + modality selector; mirrors `measurement-context.ts` teleconsult-default branch.
