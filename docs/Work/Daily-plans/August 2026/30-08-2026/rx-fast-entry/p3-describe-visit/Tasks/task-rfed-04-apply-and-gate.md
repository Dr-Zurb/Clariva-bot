# Task rfed-04: Apply + capture-bar wire + Phase 3 gate (Opus)

> **Filename:** `task-rfed-04-apply-and-gate.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Bind the proposal callbacks to the **existing** subjective / plan apply paths, mount the flow on the capture-bar family (mic-first), emit counts-only accept telemetry, and close the Phase 3 / program gate.

**Model:** pick **Opus (max thinking)** before starting. Five-plus files and an AI-backed apply path.

**Program / Phase:** rx-fast-entry · Phase 3 (describe-visit)
**Batch:** [`plan-p3-rx-fast-entry-describe-visit-batch.md`](../plan-p3-rx-fast-entry-describe-visit-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md`](./EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `ComplaintCaptureBar` + `MedicineCaptureBar` already parse a **single line** and commit via their parent sections. `buildSubjectiveTemplateApplyActions` and the plan medicines apply helpers already turn structured payloads into `RxForm` actions. `use-speech-recognition.ts` is the dictation hook. rfed-01..03 (once shipped) own segment → fan-out → panel.
- ❌ **What's missing:** A capture-bar entry that accepts a **paragraph** (type or mic), runs the orchestrator, shows the two-tab panel, and commits accepted items through those apply helpers. Phase 3 gate unchecked.
- ⚠️ **Notes:** File budget will exceed 5. That is expected and is why this task is Opus — stay on the capture-bar family + apply helpers. Do not "also" add a command-bar verb or a top-of-form box.

**Scope Guard:**
- Expected files touched: capture bars + their section parents + apply wiring + tests. **STOP** if the diff reaches diagnosis, investigation, exam, or a new backend route.
- Any expansion beyond Subjective + Plan capture requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-Q4, RFE3-D3, D4, D5, D7
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Wire
- [x] ✅ 1.1 Extend the capture-bar family so a longer utterance / paste can run the orchestrator (mic-first; typed paragraph allowed). Do not add a new box above the SOAP tabs. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Mount the rfed-03 panel on that bar. Out-of-tab heading when the capturing tab is not the item's tab. - **Completed: 2026-08-30**
- [x] ✅ 1.3 Accept → existing apply helpers / the same commit the capture bars already use for AI cards. Keep as typed → commit the raw line to the capturing tab's free-text / complaint name, never drop it. - **Completed: 2026-08-30**

### 2. Telemetry
- [x] ✅ 2.1 Counts-only: proposals shown (per tab kind), items accepted (per tab kind), items dismissed. **No** paragraph, name, or drug string parameter. - **Completed: 2026-08-30**

### 3. Gate
- [x] ✅ 3.1 Tick the Phase 3 batch acceptance gate and the product-plan program gate items that this phase owns. - **Completed: 2026-08-30**
- [ ] 3.2 Manual smoke: dictate/paste a mixed sentence; accept one complaint and one medicine; confirm both land; confirm nothing else wrote itself. — **residual:** no authenticated browser in this session. Written in the batch Notes.
- [x] ✅ 3.3 Grep: no new parse route; no diagnosis/investigation client; no global Add all; no log of the paragraph. - **Completed: 2026-08-30**
- [x] ✅ 3.4 `npx tsc --noEmit` + lint + targeted tests (segmenter, orchestrator, panel, apply wiring). Existing capture-bar tests still pass. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: ComplaintCaptureBar.tsx / MedicineCaptureBar.tsx (or a thin shared
        paragraph entry they both use — audit first, do not fork two orchestrators)
UPDATE: SubjectiveSection.tsx / PlanSection.tsx commit callbacks as needed
UPDATE: tests for the capture bars + a visit-level apply test
UPDATE: phase + product-plan gate checkboxes when green
```

**Existing Code Status:**
- ✅ Apply builders — EXIST; reuse.
- ✅ Speech hook — EXISTS; reuse.
- ⚠️ Capture bars — EXIST; they are one-line today. This task is the paragraph path.
- ❌ Third writer — must not appear.

**When updating existing code:**
- [x] Audit the current AI-accept path on each bar before adding a second commit.
- [x] Remove any prototype "parse the whole SOAP blob" if one appeared during rfed-02 (it must not have).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Capture-bar family only (RFE3-D3, RFE-Q4).
- Existing apply paths only (RFE3-D5).
- Confirm-to-apply; no global Add all (RFE3-D4).
- Counts-only telemetry (RFE3-D7).
- No PHI in logs.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes — existing visit complaint + medicine fields via the Rx form.** No new column.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **Yes** — the two existing parse clients (wired in rfed-02).
  - [x] **Consent + redaction confirmed?** **Yes** — inherited. No new prompt.
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] A mixed paragraph proposes both tabs; accept writes only what was accepted.
- [x] Keep as typed does not lose the source line.
- [x] No new backend route. No third parser.
- [x] Phase 3 batch gate is green.
- [x] Type-check + lint + targeted tests green. Manual smoke in Notes.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

- Shared entry: `VisitDescribeBar` on ComplaintList + MedicineCaptureBar. One orchestrator. Mic uses `use-speech-recognition` (hidden when unsupported).
- Apply: `complaintFromAiParsed` + `ADD_COMPLAINT`; `rxMedicineFromAiMedicine` + Plan `onAddMedicines` / `ADD_MEDICINE`. No third writer.
- Telemetry: `[ehr:rxvisit]` shown / accepted / dismissed — counts + tab kind only.
- **Live smoke residual:** no authenticated browser. Operator: paste `Complaint: fever. Plan: azithromycin 500` on either bar → accept one of each → both land; nothing else writes.
- Ran on Auto at operator request.

---

## 🔗 Related Tasks

- [`task-rfed-03-tab-grouped-proposal.md`](./task-rfed-03-tab-grouped-proposal.md)
- [Phase 2](../../p2-command-bar/) — command bar stays independent

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Wire orchestrator to existing capture + apply
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
