# Task vnb-04: Proposal groups + apply for every target

> **Filename:** `task-vnb-04-proposal-groups-and-apply.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**

---

## 📋 Task Overview

Make every router output land in the form. `VisitParseProposal` gains Vitals / Assessment / Investigations / prose groups next to Subjective / Plan, and the box applies through write paths the form already trusts. The VNB-D4 trust split lands here: deterministic items apply on Enter (capture-bar-equivalent trust); everything model-touched is a confirm card.

**Program / Phase:** visit-narrative · Phase 1 (one box)
**Batch:** [`plan-p1-visit-narrative-one-box-batch.md`](../plan-p1-visit-narrative-one-box-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-visit-narrative-one-box.md`](./EXECUTION-ORDER-p1-visit-narrative-one-box.md)
**Estimated Time:** ~5 hours
**Status:** ✅ Complete — 2026-08-30

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — widens proposal + apply + `VisitDescribeBar` wiring; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `VisitParseProposal` (Subjective + Plan groups, per-item accept, per-tab Add all); `visit-parse-apply.ts` (`complaintFromAiParsed`, `medicinesFromAiParsed`); `applySetVitalWrites` (+ unhide-if-hidden via the command bar's shown-set path); diagnosis and investigation commit paths on their sections; `setField` for prose sections.
- ✅ **Now present:** Proposal groups for Vitals / Assessment / Investigations / prose; apply wiring through existing writers; deterministic-on-Enter + applied summary; `VisitDescribeBar` callbacks for the widened DTO.
- ⚠️ **Notes:** Deterministic medicine items convert via `rxMedicineFromParsed` (not the AI converter). Vitals may need unhide-before-write — same behavior the `/` command bar ships. Prose appends preserve existing text (VNB-D5).

**Scope Guard:**
- Expected files touched: ≤ 8 (proposal, apply module, `VisitDescribeBar`, host wiring, tests)
- **No third writer:** every write goes through `applySetVitalWrites`, existing dispatch actions (`ADD_COMPLAINT` / `ADD_MEDICINE` / diagnosis / investigation commit paths), or `setField`. Inventing a new commit path is a **STOP**.
- No global Add all (VN-DL-5 / RFE-DL-6 inheritance).
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-5, VN-Q4
- Batch locks VNB-D4, VNB-D5
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Proposal groups
- [x] ✅ 1.1 Groups: Subjective / Vitals / Assessment / Investigations / Medications / prose-targets. Empty groups hidden (existing behavior). - **Completed: 2026-08-30**
- [x] ✅ 1.2 Per-item accept everywhere; per-tab Add all for extractor output only; **no** global Add all. - **Completed: 2026-08-30**
- [x] ✅ 1.3 Deterministic items that applied on Enter render as an applied summary line (visible, not re-confirmable), so the doctor sees what landed. - **Completed: 2026-08-30**

### 2. Apply wiring
- [x] ✅ 2.1 Vitals → `applySetVitalWrites` incl. unhide-if-hidden (BP / glucose reading arrays included — the grammar's write shapes already handle them). - **Completed: 2026-08-30**
- [x] ✅ 2.2 Deterministic medicines → `rxMedicineFromParsed` → `ADD_MEDICINE`; AI medicines → existing `medicinesFromAiParsed` path. - **Completed: 2026-08-30**
- [x] ✅ 2.3 Complaints → `complaintFromAiParsed` / catalog-equivalent → `ADD_COMPLAINT`. - **Completed: 2026-08-30**
- [x] ✅ 2.4 Diagnoses → the assessment section's existing commit path (catalog-coded rows only). - **Completed: 2026-08-30**
- [x] ✅ 2.5 Investigations → the plan section's existing commit path (catalog re-resolve inherited from vnb-03). - **Completed: 2026-08-30**
- [x] ✅ 2.6 Prose → `setField` append with separator; never replaces existing text. - **Completed: 2026-08-30**

### 3. Box wiring (VNB-D4 split)
- [x] ✅ 3.1 On Enter: deterministic items apply immediately; AI groups render as cards; input clears only for what applied, keeps text on dismiss ("keep as typed" spirit preserved). - **Completed: 2026-08-30**
- [x] ✅ 3.2 Dismiss / keep-as-typed writes nothing (existing contract). - **Completed: 2026-08-30**

### 4. Verification & Testing
- [x] ✅ 4.1 Mixed paragraph end-to-end: deterministic vital + medicine land on Enter; complaint/diagnosis/investigation/prose cards await accept; accepting each lands via the pinned path. - **Completed: 2026-08-30**
- [x] ✅ 4.2 Prose append preserves pre-existing section text. - **Completed: 2026-08-30**
- [x] ✅ 4.3 Hidden vital gets shown then written (command-bar parity). - **Completed: 2026-08-30**
- [x] ✅ 4.4 No write of any AI item without accept (silent-fill regression suite). - **Completed: 2026-08-30**
- [x] ✅ 4.5 `npx tsc --noEmit` + lint on touched files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/subjective/VisitParseProposal.tsx
UPDATE: frontend/lib/cockpit/visit-parse-apply.ts
UPDATE: frontend/components/cockpit/rx/subjective/VisitDescribeBar.tsx
UPDATE: host wiring from vnb-01 mounts
UPDATE: __tests__ for the four files above
```

**Existing Code Status:**
- ✅ All five apply paths — EXIST. This task is wiring, not invention.
- ✅ New groups + trust split — wired.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Existing card shapes only; no third result type beyond the vnb-03 DTO.
- Accessibility parity with the current proposal (labels, keyboard accept).
- No logging of item content; accept events are counts + kind (vnb-05 wires dims).

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** Rx form state only (existing dispatch paths).
- [x] **Any PHI in logs?** No.
- [x] **External API or AI call?** None beyond vnb-03's routing.
- [x] **Retention / deletion impact?** No.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Every router output group renders and applies via a pre-existing write path.
- [x] Deterministic-on-Enter / AI-confirm split locked by tests.
- [x] No silent AI writes; no global Add all.
- [x] Type-check + lint + tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** FormBar test mocked `useRxForm` without re-exporting `EMPTY_RX_MEDICINE`, so `rxMedicineFromParsed` threw and the parse catch painted a false “couldn’t read” state.
**Solution:** Partial-mock `RxFormContext` via `importOriginal`. Apply deterministic writes *after* the parse try/catch so a converter miss cannot look like a parse miss.

---

## 📝 Notes

- The applied-summary line for deterministic items matters: the doctor pasted one paragraph — they must see that the vital landed without hunting the grid.

---

## 🔗 Related Tasks

- [`task-vnb-03-deterministic-first-router.md`](./task-vnb-03-deterministic-first-router.md) (DTO owner)
- [`task-vnb-05-telemetry-and-gate.md`](./task-vnb-05-telemetry-and-gate.md)

---

**Last Updated:** 2026-08-30
**Pattern:** Cross-tab apply through existing writers, trust split pinned
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
