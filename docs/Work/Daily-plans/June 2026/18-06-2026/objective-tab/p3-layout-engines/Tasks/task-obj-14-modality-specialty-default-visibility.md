# Task obj-14: modality-aware + specialty default visibility (OBJ-D6)

> **Filename:** `task-obj-14-modality-specialty-default-visibility.md` in `objective-tab/p3-layout-engines/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

The objective-specific headline of Phase 3 (OBJ-D6): seed the **default** objective section order
+ hidden set from the consult **modality** (in-person → full exam; video → observed-on-video +
home vitals; voice/async → patient-reported + uploads) and the doctor's **specialty** (emphasis
per `exam-catalog.md` §E2). The seed computes the *default* only — an explicit doctor override
(stored order/hidden from obj-11/12) **always wins**, and the seed never reaches output (P3-D5 /
P3-D3). Pure, deterministic resolver feeding obj-12's visibility resolver.

**Program / Phase:** objective-tab · Phase 3 (layout engines)  
**Batch:** [`plan-p3-objective-tab-layout-engines-batch.md`](../plan-p3-objective-tab-layout-engines-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-objective-tab-layout-engines.md`](./EXECUTION-ORDER-p3-objective-tab-layout-engines.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **COMPLETE** (2026-06-19) — pure resolver + layering helper + component wiring + unit/integration tests all done; `tsc`/eslint clean on touched files.

> **Resolved (2026-06-19):** the earlier blocker (modality/specialty not in `ObjectiveSection` context) was closed by sourcing them through the shell: `useRxFormProviderSetup` computes the seed once (`getAppointmentById` → `consultation_type`; `getDoctorSettings` → `specialty`) and exposes an optional `objectiveSeed` on `RxFormProviderSetup`. `ObjectiveSection` reads `shell.objectiveSeed` (no extra fetch in the cockpit) and falls back to fetching it only on the standalone mount — mirroring how it already sources order/collapse/hidden. This adds **one** file beyond the ≤4 guard (`useRxFormProviderSetup.ts`); the addition is a small, additive plumbing field (optional, no behaviour change for existing callers).

**Change Type:**
- [ ] **New feature** — a pure default-seed resolver layered under the doctor-override resolver; no output change.

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-09 default order + obj-12's `resolveVisibleSections`; the consult **modality** source (appointment / consult type) and the doctor **specialty** (doctor profile); `exam-catalog.md` §E2 (specialty emphasis) + §G (modality emphasis).
- ❌ **What's missing:** any modality/specialty → default order/hidden mapping, or its layering under the override resolver.

**Scope Guard:**
- Expected files touched: ≤ 4 (seed resolver lib + `ObjectiveSection`/resolver wiring + tests).
- **No** new persistence (defaults are computed, not stored — only the doctor's explicit override is stored), **no** template content (P4). Seed resolver + layering only.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Seed resolver
- [x] ✅ 1.1 `resolveDefaultLayout({ modality, specialty })` → `{ defaultOrder, defaultHidden }`. Modality map: in_clinic = full exam; video = observed exam + home vitals (legacy free-text hidden); voice/text = `test_results` lead + patient-reported vitals (structured + legacy exam hidden). - **Completed: 2026-06-19** (`objective-default-layout.ts`). *Note: section registry is coarse — "palpation" is a system within the `exam` card, not a section, so video de-emphasises legacy free-text rather than palpation.*
- [x] ✅ 1.2 Specialty emphasis layered on the modality default. - **Completed: 2026-06-19** *with a scope note:* §E2 packs target systems/custom blocks (P/V, MSE), not top-level sections, so at section granularity specialty only **reorders** the visible sections (brings the specialty's priority sections forward); it never hides/unhides. Richer system/template emphasis is P4/P5.
- [x] ✅ 1.3 Pure + deterministic; unknown modality/specialty falls back to the obj-09 default order (never hides everything). - **Completed: 2026-06-19**

### 2. Layer under the override resolver (override-wins)
- [x] ✅ 2.1/2.2 `resolveEffectiveLayout({ seed, storedOrder, storedHidden })` → `{ baseOrder, hidden }`: stored order wins as the base (else seed); stored hidden wins **wholesale** (else seed). - **Completed: 2026-06-19** (pure helper + tests). *Semantics note: obj-12 stores a hidden set that cannot express "un-hide a seed-hidden section". Layering hidden as **wholesale override** (matching order), rather than a union, lets a doctor who has configured visibility still show a section the seed would hide — avoiding an un-showable section. The P10-D4 explicitly-shown tri-state is a follow-up.*
- [x] ✅ 2.2 Wire the seed into `ObjectiveSection` (`baseOrder` → `resolveInitialSectionOrder`; `hidden` → seeded `hiddenIds` → `resolveVisibleSections`). - **Completed: 2026-06-19** Seed travels via `shell.objectiveSeed` (cockpit) or a standalone fetch; folded into the **initial** order/hidden state with the autosave guard-refs set to the seeded value so nothing persists until the doctor edits.
- [x] ✅ 2.3 Seed never persisted on mount / never reaches `buildRxPayload`. - **Completed: 2026-06-19** Guard-refs prevent any autosave from the seed alone (integration test); `buildRxPayload` ignores order/hidden entirely (obj-12 view-only proof).

### 3. Verification & Testing
- [x] ✅ 3.1 Each modality produces the expected default order/hidden; specialty emphasis reorders correctly (unit). - **Completed: 2026-06-19**
- [x] ✅ 3.2 Stored order/hidden override wins; untouched sections follow the seed (unit, via `resolveEffectiveLayout`). - **Completed: 2026-06-19**
- [x] ✅ 3.3 Unknown modality/specialty → registry default (no all-hidden) (unit). - **Completed: 2026-06-19**
- [x] ✅ 3.4 `tsc` clean on touched files; targeted vitest green; eslint clean. - **Completed: 2026-06-19** (helper unit suite + new `ObjectiveSection.modality-seed.test.tsx`; full objective + `lib/cockpit` suites: 717 passing).
- [x] ✅ Component-level §2.2/2.3 verification — seed default applies (video/voice), override wins wholesale, seed never persisted on mount (`ObjectiveSection.modality-seed.test.tsx`). - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/objective-default-layout.ts
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx (layer seed under override)
UPDATE: frontend/components/cockpit/rx/useRxFormProviderSetup.ts (compute + expose objectiveSeed)
CREATE: frontend/lib/cockpit/__tests__/objective-default-layout.test.ts
CREATE: frontend/components/cockpit/rx/sections/__tests__/ObjectiveSection.modality-seed.test.tsx
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Seed is the DEFAULT only** (P3-D5) — a deliberate doctor choice always wins; the seed never overrides a stored setting and is never written back.
- **Pure + deterministic** — no I/O, no `Date.now`; modality + specialty in, order/hidden out. Unit-tested like `vitals-derive.ts`.
- **Never all-hidden** — unknown inputs fall back to the registry default so the tab is never blank.
- **View-only** (P3-D3) — the seed never reaches `buildRxPayload`; output is unchanged.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** (pure resolver; reads modality/specialty already in context).
- [ ] **Any PHI in logs?** **No**.
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Modality + specialty produce the expected default order/hidden seed.
- [x] ✅ Doctor override wins (wholesale); untouched practices follow the seed.
- [x] ✅ Unknown inputs → registry default; seed never persisted, never in output.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-12-visibility-and-manage-sections-menu.md`](./task-obj-12-visibility-and-manage-sections-menu.md) — the resolver this seed layers under.
- [`task-obj-15-layout-close-gate.md`](./task-obj-15-layout-close-gate.md) — proves the seed never reaches output.

---

**Last Updated:** 2026-06-19  
**Pattern:** `vitals-derive.ts` pure resolver discipline + `exam-catalog.md` §E2/§G emphasis tables.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
