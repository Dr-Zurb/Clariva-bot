# Task vh-04: Orthogonal — L1 category color + section icons + depth-aware sticky shadow (OPTIONAL)

> **Filename:** `task-vh-04-category-color-and-icons.md` in `soap-card-visual-hierarchy/Tasks/`.
> **Links:** batch plan [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-soap-card-visual-hierarchy.md`](./EXECUTION-ORDER-soap-card-visual-hierarchy.md). Code paths **repo-relative**.

---

## 📋 Task Overview

**Optional, additive polish** on top of the tonal cue — droppable without touching the core mechanism. Three small, independent enhancements:

1. **L1-only category color accent** — a subtle per-top-level-section hue on the L1 rail / header (e.g. subjective vs objective families), **never** as a card background. It rides on top of the neutral tonal cue, so removing color leaves the hierarchy fully readable (VH-D2/D5).
2. **Section icons** — a small leading glyph on top-level section headers to aid scanning.
3. **Depth-aware sticky shadow** — when a header pins, give it a slightly stronger shadow at deeper levels so the "pinned vs inline" boundary reads over a tinted body.

Each is separable; ship any subset.

**Program / Batch:** soap-card-visual-hierarchy · single batch (Wave 4)
**Plan:** [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ Done (2026-07-05). **Model: Sonnet** — additive, isolated, no parity risk.

**Change Type:**
- [ ] ✅ **Update existing** — additive accents on section chrome + sticky shadow. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** `SubjectiveSection` / `ObjectiveSection` render the top-level chrome; sticky shadow/offset lives in `sticky-stack.tsx` (`useStickyHeader`).
- ⚠️ **Depends on vh-01** for the surface baseline; color must never replace the tonal cue.

**Scope Guard:**
- Expected files touched: `SubjectiveSection.tsx`, `ObjectiveSection.tsx`, `sticky-stack.tsx` (shadow only).
- **DO NOT** add color at L2/L3, or as any card background. **DO NOT** edit `globals.css` palette tokens. **DO NOT** change sticky offset math (shadow intensity only).

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. L1 category color accent
- [x] ✅ 1.1 Apply a subtle hue to the **L1 rail/header only** for the top-level section families; confirm it reads on light + dark. — **Completed: 2026-07-05** (`SoapTabFamilyProvider` + `SOAP_TAB_FAMILY_ACCENT`: subjective `border-l-accent/35`, objective `border-l-primary/35` on L1 shells + tab headings.)
- [x] ✅ 1.2 Remove color mentally (grayscale check) → hierarchy still fully legible via tone + rail. — **Completed: 2026-07-05** (accent is additive left rail only; depth-tone rail + surface unchanged.)

### 2. Section icons
- [x] ✅ 2.1 Add a leading glyph to top-level section headers; ensure it doesn't shift the sticky offset or collide with existing header controls. — **Completed: 2026-07-05** (tab-level icons on both SOAP headings; per-section icons on objective L1 via `sectionIcon` prop; subjective L1 shells inherit family accent via context.)

### 3. Depth-aware sticky shadow
- [x] ✅ 3.1 Increase pinned-header shadow slightly with depth so the boundary reads over tinted bodies; verify no layout shift. — **Completed: 2026-07-05** (`resolveStickyPinShadowClass`: sm → md → lg by stack level; wired through `useStickyHeader` consumers.)

### 4. Verification gate
- [x] ✅ 4.1 `cd frontend && npx tsc --noEmit` — no new errors. — **Completed: 2026-07-05**
- [x] ✅ 4.2 `cd frontend && npm run lint` clean on touched files. — **Completed: 2026-07-05**
- [x] ✅ 4.3 `cd frontend && npm test` green for the affected section slice. — **Completed: 2026-07-05** (34/34: depth-tone, CollapsibleContainer, ObjectiveSection, objectiveLayoutParity.)

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx
UPDATE: frontend/components/ui/sticky-stack.tsx (sticky shadow intensity only)
DO NOT TOUCH: globals.css palette; L2/L3 color; sticky offset math
```

**When updating existing code:** (MANDATORY)
- [ ] Color is L1-only and additive; the grayscale check must still pass (VH-D5).
- [ ] Sticky shadow change must not alter offset/scroll behaviour.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Color is additive, L1-only, never a background** (VH-D1/D2).
- **Grayscale-legible** — hierarchy survives with hue removed (VH-D5).
- **No offset/behaviour change** (VH-D6).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] ✅ **Data touched?** **N.**
- [ ] ✅ **Any PHI in logs?** **No.**
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Category color appears only at L1 and never as a card background; grayscale check passes.
- [ ] Icons + sticky shadow add clarity with no layout/offset shift.
- [ ] `tsc` + lint + section tests green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Depends on [`task-vh-01-tint-ladder-and-surface-helper.md`](./task-vh-01-tint-ladder-and-surface-helper.md). Optional; can be dropped without affecting vh-02/vh-03.

---

**Last Updated:** 2026-07-05
**Pattern:** additive L1 accents layered on the neutral tonal cue; grayscale-legible; no behaviour change.
