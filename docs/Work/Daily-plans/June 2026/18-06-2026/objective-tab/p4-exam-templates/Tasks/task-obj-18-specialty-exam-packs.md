# Task obj-18: Specialty exam packs (static starter catalog per §E2; apply via obj-17; layered under doctor overrides + P3 seed)

> **Filename:** `task-obj-18-specialty-exam-packs.md` in `objective-tab/p4-exam-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Ship **specialty exam packs** (`exam-catalog.md` §E2): a static, read-only frontend catalog of objective
**starter content** keyed by specialty (e.g. Cardiology → vitals + BP detail + CVS + peripheral pulses;
Paediatrics → vitals + HC/growth + general + resp + abd). A doctor sees the pack(s) for their specialty,
**previews and applies** one through obj-17's apply engine (filling `examFindings` / `vitals_*` /
`objectiveCustomSections`), then can **save** the result as their own per-doctor template. Packs **fill
content** on top of P3's modality/specialty **visibility** seed — they never auto-persist and a doctor
override always wins.

**Program / Phase:** objective-tab · Phase 4 (exam templates + specialty packs)  
**Batch:** [`plan-p4-objective-tab-exam-templates-batch.md`](../plan-p4-objective-tab-exam-templates-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p4-objective-tab-exam-templates.md`](./EXECUTION-ORDER-p4-objective-tab-exam-templates.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ⏳ **PENDING** — Sonnet. Depends on **obj-17** (apply engine) + P3 `normalizeSpecialty`.

**Change Type:**
- [ ] **New feature** — a static pack catalog + a preview/apply/save affordance. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-17's `apply-objective-template.ts` engine + reusable Templates button; P3's [`objective-default-layout.ts`](../../../../../../../../frontend/lib/cockpit/objective-default-layout.ts) (`normalizeSpecialty`, `SpecialtyEmphasis`) — the same specialty bucketing this reuses; [`exam-schema.ts`](../../../../../../../../frontend/lib/cockpit/exam-schema.ts) (per-system normal one-liners + abnormal chips to seed pack content); the doctor specialty source already plumbed in P3 (via `getDoctorSettings`).
- ❌ **What's missing:** the pack catalog; the affordance to preview/apply/save a pack.

**Scope Guard:**
- Expected files touched: ≤ 5 (pack catalog; the pack affordance UI; a small hook to resolve packs by specialty; a test; minimal `ObjectiveSection` mount). **No** migration, **no** per-doctor seeding job (packs are read-only static content), **no** new apply engine (reuse obj-17), **no** server write.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · exam-catalog §E2.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Pack catalog
- [ ] 1.1 `objective-specialty-packs.ts`: a static, typed catalog mapping each `SpecialtyEmphasis` bucket (P3 `normalizeSpecialty`) → one or more named packs. Each pack is an `objective_json`-shaped bundle (exam findings seeds + emphasised vitals + optional custom-section titles), built from `exam-schema.ts` normal lines where possible. Read-only; deterministic; no I/O.
- [ ] 1.2 Cover the §E2 buckets: GP/medicine, cardiology, pulmonology, gynaecology, obstetrics, paediatrics, orthopaedics, dermatology, ENT, ophthalmology, psychiatry, neurology. `unknown`/`gp` → a sensible general pack (never empty, never blank).

### 2. Affordance
- [ ] 2.1 Resolve the doctor's specialty (P3's existing source) → `normalizeSpecialty` → the matching pack(s); surface them in the objective Templates affordance (e.g. a "Specialty packs" group in the picker or a small starter strip).
- [ ] 2.2 Preview → apply a pack through obj-17's `buildObjectiveTemplateApplyActions` (filling form state only); show the same applying/applied state as obj-17. The doctor can then **save** the filled state as their own `objective_full` template (obj-17 path).

### 3. Layering rules
- [ ] 3.1 Packs **fill content**; they never write `doctor_settings` layout/visibility (P3 owns that) and never auto-persist (P4-D4). Applying a pack into a non-empty exam follows obj-17's merge semantics; a doctor's saved template/edit always wins.
- [ ] 3.2 Packs compose with P3's modality/specialty **visibility** seed without conflict (content vs. visibility are orthogonal layers) — document the interaction in code.

### 4. Verification & Testing
- [ ] 4.1 Tests: `normalizeSpecialty` bucket → expected pack; pack apply fills the expected `examFindings`/`vitals`; pack never writes config or persists; `buildRxPayload` derives identically to hand-entry of the same content.
- [ ] 4.2 Scoped vitest green; `tsc`/eslint clean on touched files.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/objective-specialty-packs.ts (static catalog keyed by SpecialtyEmphasis)
CREATE: frontend/lib/cockpit/__tests__/objective-specialty-packs.test.ts
CREATE/UPDATE: a small resolver hook + the pack affordance (in the objective Templates surface)
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx (mount the pack affordance, minimal)
DO NOT TOUCH: obj-17's apply engine internals (consume it); P3 layout/visibility config; buildRxPayload
```

**When updating existing code:**
- [ ] Reuse P3's `normalizeSpecialty`/`SpecialtyEmphasis` verbatim — do not re-bucket specialties.
- [ ] Reuse obj-17's apply engine — packs are just a content source for the same dispatch path.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Packs are seeded starter content, not schema (P4-D4).** Static read-only catalog; no migration, no per-doctor seeding.
- **Content layer, not visibility layer.** Packs fill exam content; P3's seed controls section visibility/order — orthogonal. A doctor override always wins over both.
- **Never auto-persist / never auto-apply.** Packs are doctor-invoked; applying fills form state only; saving (optional) goes through obj-17's per-doctor template path.
- **Long tail stays content (OBJ-D3).** Specialty systems (P/V, MSE, ROM) live as pack/custom-section content, not typed schema.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** new persistence — packs are static; applying fills form state; saving reuses obj-17's per-doctor template write.
- [ ] **Any PHI in logs?** **No** (packs are synthetic starter content).
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] A doctor sees the pack(s) for their specialty bucket; previewing + applying fills the expected objective form state through obj-17's engine; saving creates a per-doctor template.
- [ ] Packs never write layout/visibility config and never auto-persist; a doctor override always wins; `buildRxPayload` derives identically to hand-entry.
- [ ] `tsc`/lint/scoped tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is the **headline** of P4 — the payoff that makes templating specialty-aware. It deliberately stays a static catalog (no migration/seeding) so v1 ships cheaply; once usage proves which packs doctors keep, promoting popular packs to typed schema or shared templates is a later decision.

---

## 🔗 Related Tasks

- [`task-obj-14-modality-specialty-default-visibility.md`](../../p3-layout-engines/Tasks/task-obj-14-modality-specialty-default-visibility.md) — the P3 seed (`normalizeSpecialty`) this reuses; packs are its content counterpart.
- [`task-obj-17-form-state-scoped-objective-templates.md`](./task-obj-17-form-state-scoped-objective-templates.md) — the apply engine packs consume.

---

**Last Updated:** 2026-06-19  
**Pattern:** static specialty-keyed starter catalog applied through the shipped scoped-apply engine; content layered under doctor overrides + the P3 visibility seed.  
**Reference:** `process/CODE_CHANGE_RULES.md` · `exam-catalog.md` §E2
