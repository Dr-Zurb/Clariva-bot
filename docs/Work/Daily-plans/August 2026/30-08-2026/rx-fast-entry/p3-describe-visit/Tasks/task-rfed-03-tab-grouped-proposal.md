# Task rfed-03: Tab-grouped proposal panel

> **Filename:** `task-rfed-03-tab-grouped-proposal.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Render the orchestrator result as a confirm-to-apply panel grouped by SOAP tab. Per-item Add, per-tab Add all, dismiss / keep-as-typed. **The panel does not write form state** — it only calls callbacks rfed-04 will bind.

**Program / Phase:** rx-fast-entry · Phase 3 (describe-visit)
**Batch:** [`plan-p3-rx-fast-entry-describe-visit-batch.md`](../plan-p3-rx-fast-entry-describe-visit-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md`](./EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md)
**Estimated Time:** ~2 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [x] **New feature** — Add code only (no change to existing behavior)
- [ ] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `AiRefineProposal` — suggestion-only, per-item Add, Add all when multiple, Keep as typed vs dismiss. Complaint and medicine capture bars already host a proposal for **one** entity type.
- ❌ **What's missing:** A **two-tab** proposal (Subjective + Plan) with per-tab Add all and no global Add all.
- ⚠️ **Notes:** Extend the contract, do not rewrite `AiRefineProposal` into a mega-widget if a thin wrapper that renders two groups is smaller. Do not mount this at the top of the Rx form (RFE3-D3 / RFE-Q4) — rfed-04 places it on the capture-bar family. This task may ship the component unmounted, tested in isolation.

**Scope Guard:**
- Expected files touched: ≤ 5
- Any expansion requires explicit approval

**Reference Documentation:**
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-DL-6, RFE3-D4
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Panel
- [x] ✅ 1.1 Groups: Subjective (complaints) and Plan (medicines). Hide an empty group. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Per-item Add. Per-tab Add all when that tab has more than one item. - **Completed: 2026-08-30**
- [x] ✅ 1.3 **No** control that accepts every item across tabs in one click. - **Completed: 2026-08-30**
- [x] ✅ 1.4 Loading / error / empty copy stay non-blocking (same spirit as `AiRefineProposal`). Keep as typed when the caller provides it. - **Completed: 2026-08-30**

### 2. Verification & Testing
- [x] ✅ 2.1 Two groups render; Add all is scoped to one group. - **Completed: 2026-08-30**
- [x] ✅ 2.2 Querying the document for a global "Add all" that spans tabs fails (no such control). - **Completed: 2026-08-30**
- [x] ✅ 2.3 Callbacks fire with the item / tab identity; no form dispatch in this component. - **Completed: 2026-08-30**
- [x] ✅ 2.4 `npx tsc --noEmit` + lint. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/…/VisitParseProposal.tsx
        (name may vary; sit next to AiRefineProposal)
CREATE: sibling tests
```

**Existing Code Status:**
- ✅ `AiRefineProposal` — EXISTS; reuse visual language, do not break its current callers.
- ❌ Two-tab proposal — MISSING.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Confirm-to-apply (RFE-DL-6, RFE3-D4).
- No global Add all.
- No form writes in this file.
- No PHI in logs.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No.**
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No** (render only).
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Two-tab proposal matches the orchestrator DTO.
- [x] Per-tab Add all exists; global Add all does not.
- [x] Tests green; type-check + lint clean.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

- Component: `frontend/components/cockpit/rx/subjective/VisitParseProposal.tsx`. Unmounted; rfed-04 places it on the capture-bar family.
- Out-of-tab copy is the group heading (`N items for Plan →`). No tab navigation.
- Add all accessible names are `Add all Subjective` / `Add all Plan` so a global `^Add all$` query stays empty.

---

## 🔗 Related Tasks

- [`task-rfed-02-fanout-orchestrator.md`](./task-rfed-02-fanout-orchestrator.md)
- [`task-rfed-04-apply-and-gate.md`](./task-rfed-04-apply-and-gate.md)

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Suggestion panel, write-free
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
