# Task vh-01: Canonical tint ladder + shared `useDepthToneSurface()`; reconcile SOAP section roots

> **Filename:** `task-vh-01-tint-ladder-and-surface-helper.md` in `soap-card-visual-hierarchy/Tasks/`.
> **Links:** batch plan [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-soap-card-visual-hierarchy.md`](./EXECUTION-ORDER-soap-card-visual-hierarchy.md). Code paths **repo-relative**.

---

## 📋 Task Overview

Substrate for the batch. The depth-tone cue already works in Social History, but the tint values are ad-hoc (`bg-muted/10 · /15 · /20 · /25 · /30` appear across ~25 files) and the tone/rail class decision is duplicated inside both `CollapsibleContainer` and `CollapsibleEntryCard`. This task:

1. **Defines one canonical ladder** — a single recessed tint + a single raised surface (+ the neutral rail) — and documents it as the only values downstream tasks use.
2. **Extracts a shared `useDepthToneSurface()` helper** next to `useCollapsibleDepth`, returning the surface + rail classes for the current depth so a bespoke card (vh-03) can opt in with one line instead of copying class logic.
3. **Reconciles the top-level SOAP section roots** so depth tone starts from a consistent baseline in both subjective and objective (audit which roots should carry `depthTone`).

No behaviour change; no new tint palette; no touching `globals.css`.

**Program / Batch:** soap-card-visual-hierarchy · single batch (Wave 1)
**Plan:** [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md)
**Estimated Time:** ~2–3 hours
**Status:** Not started. **Model: Sonnet** — token consolidation + one hook + a root audit; shared components already own the logic, low blast radius.

**Change Type:**
- [ ] ✅ **Update existing** — consolidate tone logic behind a helper + sweep call sites. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** `CollapsibleDepthContext` / `useCollapsibleDepth` / `CollapsibleDepthProvider` in `frontend/components/ui/sticky-stack.tsx`; `depthTone` prop + inline recessed/raised class logic in `CollapsibleContainer.tsx` and `CollapsibleEntryCard.tsx`; Social History opts in via `depthTone` on its root.
- ⚠️ **Drift:** `bg-muted/10../30` variants scattered across `rx/**` (grep before editing — only the depth-tone call sites are in scope here; leave unrelated one-off tints alone unless they are part of the ladder).

**Scope Guard:**
- Expected files touched: `sticky-stack.tsx` (add helper), `CollapsibleContainer.tsx` + `CollapsibleEntryCard.tsx` (consume helper), the SOAP section roots being reconciled, and the depth-tone tint call sites they own.
- **DO NOT** edit `globals.css` or introduce a new palette token. **DO NOT** change any collapse/scroll/sticky behaviour. **DO NOT** sweep unrelated `bg-muted/*` usages that are not part of the depth ladder (e.g. one-off empty-state tints).

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Canonical ladder
- [ ] 1.1 Grep `bg-muted/` across `frontend/components/cockpit/rx/**` and `frontend/components/ui/` and list which are depth-tone surfaces vs unrelated one-offs.
- [ ] 1.2 Pick the single **recessed** value and single **raised** value (+ neutral rail) and record them in the batch README's ladder note.

### 2. Shared helper
- [ ] 2.1 Add `useDepthToneSurface()` (name is a suggestion) next to `useCollapsibleDepth`, deriving `{ surface, rail, recessed }` from the depth context + a `depthTone`/`active` flag.
- [ ] 2.2 Refactor `CollapsibleContainer` and `CollapsibleEntryCard` to consume the helper instead of inlining the class decision — **output classes must be identical to today** for Social History.

### 3. Reconcile section roots
- [ ] 3.1 Audit `SubjectiveSection` / `ObjectiveSection` (and any wrapping container) to decide the consistent `depthTone` baseline; apply only where the batch intends.
- [ ] 3.2 Confirm Social History still renders byte-identical after the refactor (visual + snapshot).

### 4. Verification gate
- [ ] 4.1 `cd frontend && npx tsc --noEmit` — no new errors in touched files.
- [ ] 4.2 `cd frontend && npm run lint` clean on touched files.
- [ ] 4.3 `cd frontend && npm test` green for the collapsible + social-history slice.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/ui/sticky-stack.tsx            (add useDepthToneSurface helper)
UPDATE: frontend/components/ui/CollapsibleContainer.tsx    (consume helper)
UPDATE: frontend/components/cockpit/rx/inputs/CollapsibleEntryCard.tsx (consume helper)
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx  (root audit, if needed)
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx   (root audit, if needed)
VERIFY (byte-identical): frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx
DO NOT TOUCH: frontend/app/globals.css (palette tokens); unrelated bg-muted/* one-offs
```

**When updating existing code:** (MANDATORY)
- [ ] Keep the emitted classes identical for the already-shipped Social History surface (this is a refactor, not a restyle).
- [ ] The helper must be a pure derivation of the depth context — no side effects, no scroll/sticky coupling.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **One ladder, one helper.** No new tint values; consolidate, don't add.
- **Opt-in preserved.** Context defaults to off; nothing outside opted-in roots changes.
- **No palette edits, no behaviour change** (VH-D1, VH-D6).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] ✅ **Data touched?** **N** — presentational only.
- [ ] ✅ **Any PHI in logs?** **No.**
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] One recessed + one raised value (+ neutral rail) in use across depth-tone call sites; old ladder variants removed from those sites.
- [ ] `useDepthToneSurface()` exists and both shared collapsibles consume it; Social History renders byte-identical.
- [ ] `tsc` + lint + slice tests green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Enables [`task-vh-02-chief-complaints-depth.md`](./task-vh-02-chief-complaints-depth.md), [`task-vh-03-exam-depth.md`](./task-vh-03-exam-depth.md), [`task-vh-04-category-color-and-icons.md`](./task-vh-04-category-color-and-icons.md).

---

**Last Updated:** 2026-07-05
**Pattern:** consolidate the shipped depth-tone logic behind one ladder + one hook before extending it.
