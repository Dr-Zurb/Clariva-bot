# Task tc-02: Teleconsult exam UI preset across the 5 system bodies

> **Filename:** `task-tc-02-teleconsult-exam-ui-preset.md` in `teleconsult-exam/Tasks/`.
> **Links:** batch plan [`../plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-teleconsult-exam.md`](./EXECUTION-ORDER-teleconsult-exam.md). Code paths below are **repo-relative**.

---

## 📋 Task Overview

The visible change. When `isTeleconsult` (from tc-01), the examination bodies render a **teleconsult preset** implementing decision `TC-D3` ("display, de-emphasised, opt-in — not hidden"):

1. **Assessable-first ordering.** Within each system, `assessable` subsections (Inspection + observable) render first; `in_person_only` subsections (Auscultation / Palpation / Percussion) sink below them.
2. **In-person-only = greyed + collapsed + tagged.** Each `in_person_only` subsection renders **de-emphasised** (muted), **collapsed by default**, with an **"In-person only"** tag in its header (where the abnormal-dot / preview sit today). It is **opt-in**: the doctor taps to expand.
3. **Patient-assisted flip.** If the doctor expands an `in_person_only` subsection and records a finding (e.g. digital stethoscope, guided self-palpation), its tag flips to **"Patient-assisted"** and the finding stores exactly as today.
4. **No auto-open, no auto-normal for in-person-only.** The auto-expand-on-data / fallback-open logic (`useExamSubsectionOpenState`) must **not** auto-open an `in_person_only` subsection in teleconsult, and "Mark normal" must not assert them (the scoped-normal derivation is tc-03; here just ensure the UI doesn't force-fill them).

**In-clinic layout is unchanged** — the preset is gated entirely on `isTeleconsult`.

**Program / Batch:** teleconsult-exam · single batch (Wave 2)
**Plan:** [`../plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md)
**Estimated Time:** ~4–6 hours
**Status:** Committed — not yet implemented. **Model: Opus** — touches all 5 exam bodies + the shared collapsible wrapper with new UX semantics (the "5+ file refactor" escalation in `.cursor/rules/00-agent-contract.mdc`).

**Change Type:**
- [ ] **Update existing** — extend `ExamSubsectionCollapsible`; branch the 5 bodies on `isTeleconsult`. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **What exists:** `frontend/components/cockpit/rx/inputs/ExamSubsectionCollapsible.tsx` — shared header (abnormal dot + one-line preview + chevron) over a height-animating `Collapse`; `examSubsectionSummary(...)`; `useExamSubsectionOpenState(...)` (multi-open Set, auto-expands data-bearing subsections, else `fallbackOpenIds`, `initialExtraOpenIds`). The 5 bodies `frontend/components/cockpit/rx/inputs/Exam{Cvs,Resp,Abd,Cns,General}SystemBody.tsx` already render subsections through it. `useRxForm()` gives form state.
- ❌ **What's missing:** any modality branch; a de-emphasis / tag affordance on the wrapper; feasibility-aware ordering + open-state.

**Scope Guard:**
- Expected files touched: `ExamSubsectionCollapsible.tsx` + the 5 `Exam*SystemBody.tsx` (+ their tests). (Visit-level caveat **text** is tc-03, not here.)
- **DO NOT** change the stored finding shape, chip toggling, scroll behaviour, or in-clinic rendering. **DO NOT** add the derived caveat or scoped-normal text (tc-03). **DO NOT** hide `in_person_only` subsections (TC-D3 = display de-emphasised).

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `STANDARDS.md` · `RECIPES.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Extend the shared wrapper
- [x] ✅ 1.1 Add optional props to `ExamSubsectionCollapsible` — e.g. `deemphasised?: boolean` and `tag?: { label: string; tone: "muted" | "info" }` — rendering a small pill in the header and a muted container when `deemphasised`. No behaviour change when unset (in-clinic path). - **Completed: 2026-07-03**
- [x] ✅ 1.2 Ensure the tag is **text**, not colour-only (a11y — announced by screen readers). - **Completed: 2026-07-03**

### 2. Feasibility-aware ordering + open-state (teleconsult only)
- [x] ✅ 2.1 In each body, when `isTeleconsult`, sort subsections `assessable` first, preserving intra-group order (stable). — `orderSubsectionsForModality`. - **Completed: 2026-07-03**
- [x] ✅ 2.2 Extend / parameterise `useExamSubsectionOpenState` so `in_person_only` subsections are **excluded from auto-open** (data-bearing auto-expand + `fallbackOpenIds`) under teleconsult — they start collapsed even if they somehow carry data, and only open on explicit user toggle. — additive `excludeFromAutoOpen` option. - **Completed: 2026-07-03**
- [x] ✅ 2.3 Compute each subsection's tag: `in_person_only` with no recorded data → **"In-person only"** (muted); `in_person_only` with recorded data → **"Patient-assisted"** (info). `assessable` → no tag (normal path). — `resolveTeleconsultSubsectionTag`. - **Completed: 2026-07-03**

### 3. Wire the 5 bodies
- [x] ✅ 3.1 `ExamRespSystemBody` — Auscultation / Palpation / Percussion de-emphasised + tagged; Inspection + Rate&oxygenation (vitals) foregrounded. - **Completed: 2026-07-03**
- [x] ✅ 3.2 `ExamCvsSystemBody` — Auscultation + palpation-only groups (Precordium/JVP) in-person-only; Inspection + Pulse (vitals) foregrounded. (Corrected tc-01: `pulse` was mistagged `in_person_only`; now `assessable`.) - **Completed: 2026-07-03**
- [x] ✅ 3.3 `ExamAbdSystemBody` — Auscultation / Palpation / Percussion in-person-only; Inspection foregrounded. - **Completed: 2026-07-03**
- [x] ✅ 3.4 `ExamCnsSystemBody` — mostly assessable over video (mental status, speech, facial symmetry, gross motor, gait); tag only the genuinely contact-dependent subsections (`reflexes`, `sensory`, `meningeal`) `in_person_only`. (Corrected tc-01: `motor`+`coordination` flipped to `assessable`.) - **Completed: 2026-07-03**
- [x] ✅ 3.5 `ExamGeneralSystemBody` — largely `assessable`; preset is inert (verified nothing regresses). - **Completed: 2026-07-03**

### 4. Verification & Testing
- [x] ✅ 4.1 Teleconsult render tests: assessable-first order; `in_person_only` collapsed + "In-person only" tag; opt-in expand works; recording data flips tag → "Patient-assisted"; no auto-open of in-person-only. — new `ExamSystemList teleconsult preset (tc-02)` suite. - **Completed: 2026-07-03**
- [x] ✅ 4.2 In-clinic render tests unchanged (no tag, original order, existing auto-open behaviour) — existing `ExamSystemList` / `examDerivationParity` suites pinned to `consultationType="in_clinic"`. - **Completed: 2026-07-03**
- [x] ✅ 4.3 `npx tsc --noEmit` (clean for touched files), `eslint` (clean), and the exam suites (68 tests) green for the slice. Pre-existing failures elsewhere belong to unrelated in-progress objective/subjective WIP. - **Completed: 2026-07-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/inputs/ExamSubsectionCollapsible.tsx (deemphasised + tag props; a11y-safe pill; open-state feasibility awareness)
UPDATE: frontend/components/cockpit/rx/inputs/ExamRespSystemBody.tsx  (teleconsult branch)
UPDATE: frontend/components/cockpit/rx/inputs/ExamCvsSystemBody.tsx   (teleconsult branch)
UPDATE: frontend/components/cockpit/rx/inputs/ExamAbdSystemBody.tsx   (teleconsult branch)
UPDATE: frontend/components/cockpit/rx/inputs/ExamCnsSystemBody.tsx   (teleconsult branch)
UPDATE: frontend/components/cockpit/rx/inputs/ExamGeneralSystemBody.tsx (verify; likely all-assessable)
UPDATE: frontend/components/cockpit/rx/inputs/__tests__/ExamSystemList.test.tsx (+ teleconsult cases)
DO NOT TOUCH: stored finding shape; chip toggle; scroll; in-clinic layout; derived text (tc-03)
```

**When updating existing code:** (MANDATORY)
- [ ] Re-read `useExamSubsectionOpenState` before parameterising it — it is shared by all 5 bodies; keep the in-clinic signature/behaviour intact (additive options only).
- [ ] Keep the "children stay mounted" guarantee so form state survives collapse.
- [ ] Confirm each body reads modality from the tc-01 selector, not `measurementContext`.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Display, de-emphasised, opt-in — never hidden** (`TC-D3`). An `in_person_only` subsection is always reachable; it is just muted, collapsed, and tagged until the doctor opts in.
- **In-clinic untouched.** The entire preset is gated on `isTeleconsult`; the in-clinic path must be byte-for-byte the same render.
- **No auto-fill.** In-person-only subsections never auto-open or auto-mark-normal in teleconsult.
- **Reuse the wrapper.** Extend `ExamSubsectionCollapsible` (additive props); do not fork a teleconsult-only component.
- a11y: tag is textual; opt-in expand is keyboard-operable; no PHI in labels.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** — render-only; writes unchanged.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Teleconsult: assessable subsections first; `in_person_only` greyed + collapsed + "In-person only" tag; opt-in expand; recording data flips to "Patient-assisted"; no auto-open of in-person-only.
- [ ] In-clinic: order, tags, and auto-open behaviour identical to pre-change.
- [ ] Findings entered in an expanded in-person-only subsection store exactly as today.
- [ ] a11y passes (textual tag, keyboard opt-in); lint + `tsc` + slice tests green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- [`task-tc-01-exam-remote-feasibility-schema.md`](./task-tc-01-exam-remote-feasibility-schema.md) — provides the flag + `isTeleconsult`.
- [`task-tc-03-scoped-normal-and-limitation-derivation.md`](./task-tc-03-scoped-normal-and-limitation-derivation.md) — the text side (scoped normal + caveat).
- [`task-tc-04-teleconsult-exam-close-gate.md`](./task-tc-04-teleconsult-exam-close-gate.md) — parity + a11y + verification.

---

**Last Updated:** 2026-07-02
**Pattern:** additive props on the shared `ExamSubsectionCollapsible` + modality-gated preset in each body; in-clinic path preserved.
