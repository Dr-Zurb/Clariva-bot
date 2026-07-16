# Task vh-02: Chief-complaints depth cue

> **Filename:** `task-vh-02-chief-complaints-depth.md` in `soap-card-visual-hierarchy/Tasks/`.
> **Links:** batch plan [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-soap-card-visual-hierarchy.md`](./EXECUTION-ORDER-soap-card-visual-hierarchy.md). Code paths **repo-relative**.

---

## 📋 Task Overview

Opt the chief-complaints area into the depth-tone + rail cue. Complaints nest deeply (section → complaint card → associated-complaints panel → per-associated cards) and today they all sit on the same white surface, which is exactly the "which card owns this field" confusion the batch fixes. These components already use the shared `CollapsibleContainer` / `CollapsibleEntryCard`, so opting in is mostly wiring `depthTone` from the section root and verifying the existing collapse-on-expand scroll still lands correctly.

**Program / Batch:** soap-card-visual-hierarchy · single batch (Wave 2)
**Plan:** [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md)
**Estimated Time:** ~2–3 hours
**Status:** Not started. **Model: Sonnet** — already on the shared collapsibles; wiring + scroll verification, low blast radius.

**Change Type:**
- [ ] ✅ **Update existing** — enable depth tone on the complaints subtree. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** `ComplaintList` renders complaints via `CollapsibleContainer`/`CollapsibleEntryCard`; `ComplaintCard` holds the per-complaint body; `AssociatedComplaintsPanel` nests associated complaints; scroll behaviour lives in `frontend/lib/cockpit/complaint-card-scroll.ts` (+ test).
- ⚠️ **Depends on vh-01:** use the `useDepthToneSurface()` helper / canonical ladder from vh-01 — do not re-derive tint classes here.

**Scope Guard:**
- Expected files touched: `ComplaintList.tsx`, `ComplaintCard.tsx`, `AssociatedComplaintsPanel.tsx` (+ tests if selectors change).
- **DO NOT** change complaint data shape, ordering, add/remove logic, or the scroll offsets. **DO NOT** restyle chips/severity indicators (status color stays where it is).

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Opt in
- [ ] 1.1 Enable `depthTone` at the complaints section root so the context flows to `ComplaintCard` + `AssociatedComplaintsPanel`.
- [ ] 1.2 Confirm the alternating recessed/raised tone + neutral rail render at each level (section → card → associated).

### 2. Behaviour parity
- [ ] 2.1 Expand/collapse a complaint and an associated complaint — verify no scroll-target regression (`complaint-card-scroll.ts`).
- [ ] 2.2 Confirm sticky complaint headers stay opaque over tinted bodies.

### 3. Verification gate
- [ ] 3.1 `cd frontend && npx tsc --noEmit` — no new errors.
- [ ] 3.2 `cd frontend && npm run lint` clean on touched files.
- [ ] 3.3 `cd frontend && npm test` green for `ComplaintList.test.tsx` + `complaint-card-scroll.test.ts` (update selectors only if a wrapper was added).

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintList.tsx
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintCard.tsx
UPDATE: frontend/components/cockpit/rx/subjective/AssociatedComplaintsPanel.tsx
UPDATE (if selectors change): .../subjective/__tests__/ComplaintList.test.tsx ; frontend/lib/cockpit/__tests__/complaint-card-scroll.test.ts
REUSE: useDepthToneSurface() / canonical ladder from vh-01
DO NOT TOUCH: complaint data/ordering/scroll offsets; severity chips
```

**When updating existing code:** (MANDATORY)
- [ ] Reuse the vh-01 helper; do not inline tint classes.
- [ ] Keep collapse + scroll behaviour identical.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Tone/rail only** — no chip or severity restyle (VH-D1).
- **Behaviour frozen** — collapse/scroll/sticky unchanged (VH-D6).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] ✅ **Data touched?** **N.**
- [ ] ✅ **Any PHI in logs?** **No.**
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Alternating tone + rail visible at complaint / associated levels.
- [ ] Collapse + scroll behaviour unchanged; sticky headers opaque.
- [ ] `tsc` + lint + complaint tests green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Depends on [`task-vh-01-tint-ladder-and-surface-helper.md`](./task-vh-01-tint-ladder-and-surface-helper.md). Sibling of [`task-vh-03-exam-depth.md`](./task-vh-03-exam-depth.md).

---

**Last Updated:** 2026-07-05
**Pattern:** opt an already-shared-collapsible subtree into the depth-tone context; verify scroll parity.
