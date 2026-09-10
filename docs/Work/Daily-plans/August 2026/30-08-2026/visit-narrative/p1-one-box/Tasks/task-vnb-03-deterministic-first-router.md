# Task vnb-03: Deterministic-first router in front of the AI fan-out

> **Filename:** `task-vnb-03-deterministic-first-router.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**

---

## 📋 Task Overview

Put the VNB-D2 recognizer ladder in front of the AI fan-out inside the visit-parse orchestrator, and widen its result DTO to carry every Phase-1 target. After this task, `spo2 98` and `amlodipine 5mg 1 tab od 30 days` cost **zero AI calls**, cue-delimited diagnosis/investigation lines go to their **resolver** clients, prose slices come back as routed appends, and only genuinely ambiguous text reaches the extractors.

**Program / Phase:** visit-narrative · Phase 1 (one box)
**Batch:** [`plan-p1-visit-narrative-one-box-batch.md`](../plan-p1-visit-narrative-one-box-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-visit-narrative-one-box.md`](./EXECUTION-ORDER-p1-visit-narrative-one-box.md)
**Estimated Time:** ~5 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — widens `visit-parse-orchestrator.ts`; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `visit-parse-orchestrator.ts` (segment → `parseComplaintWithAI` + `parseMedicineWithAI`, leftover-both fallback, abort, tiers, fail-soft per client). Deterministic recognizers, all unused by the box: `parseSetVitalCommand` (`command-bar-set-vital.ts`), `parseMedicineLine` (`medicine-line-parse.ts`) with `should-request-ai-med-parse.ts` gate and `rxMedicineFromParsed`, the complaint catalog behind `ComplaintAutocomplete`. Resolver clients `resolveDiagnosisWithAI` / `resolveInvestigationWithAI` (line-in, catalog-bound out), unused since asmt-07 / inv-lib-04.
- ❌ **What's missing:** The ladder; router handling for `vital` / `diagnosis` / `investigation` / prose slices; a widened DTO with a per-item deterministic-vs-AI provenance flag (vnb-04 renders the split).
- ⚠️ **Notes:** If the complaint catalog's match logic is not importable outside `ComplaintAutocomplete`, extracting a small pure helper from it is **in-scope** (extract, don't fork — the component must consume the same helper).

**Scope Guard:**
- Expected files touched: ≤ 6 (orchestrator + DTO, catalog-match helper extraction if needed, tests)
- **No new backend route. No new prompt file. No new redaction helper.** (VNB-D6)
- Do not modify the recognizers themselves — import them.
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-4, VN-DL-5, VN-DL-6, VN-Q3
- Batch locks VNB-D2, VNB-D3, VNB-D6
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Ladder (per slice, locked order — VNB-D2)
- [x] ✅ 1.1 Vital grammar first: a `vital` slice (or short leftover matching the grammar) resolves through `parseSetVitalCommand`; out-of-range / ambiguous falls through, never guesses. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Medicine line second: `parseMedicineLine` + the `should-request-ai-med-parse` gate. Passing parse → deterministic item; gate says AI-worthy → `parseMedicineWithAI` (VN-Q3: the box is never more trigger-happy than the capture bar). - **Completed: 2026-08-30**
- [x] ✅ 1.3 Complaint catalog third: exact/canonical match → deterministic complaint; otherwise fall through to the extractor. - **Completed: 2026-08-30**
- [x] ✅ 1.4 Cue-kind AI routing: `diagnosis` slice line → `resolveDiagnosisWithAI`; `investigation` slice line → `resolveInvestigationWithAI`; complaint/medicine slices → existing extractors; prose slices → routed-append items (no client call). - **Completed: 2026-08-30**
- [x] ✅ 1.5 No-cue leftover: unchanged existing both-extractors fan-out — after the single-line ladder (1.1–1.3) has had first shot at short inputs. - **Completed: 2026-08-30**

### 2. Resolver discipline (VNB-D3)
- [x] ✅ 2.1 Resolvers receive one cue-delimited line per call — payload-asserted in tests. - **Completed: 2026-08-30**
- [x] ✅ 2.2 Investigation terms re-resolve against the static catalog (the inv-lib-04 caller contract); unresolvable terms are dropped, not surfaced as free text. - **Completed: 2026-08-30**

### 3. Result DTO
- [x] ✅ 3.1 Widen the proposal DTO with groups for vitals / assessment / investigations / prose alongside subjective / plan, each item flagged deterministic-vs-AI. Lock the shape here — vnb-04 renders it and must not guess. - **Completed: 2026-08-30**
- [x] ✅ 3.2 Abort, tiers (`default` / `escalation`), and per-client fail-soft inherited unchanged across all clients. - **Completed: 2026-08-30**

### 4. Verification & Testing
- [x] ✅ 4.1 Per-input-class tests pinning exactly which recognizer/client fires and the AI call count (including zero). - **Completed: 2026-08-30**
- [x] ✅ 4.2 Resolver payload assertions (single line, never the paragraph). - **Completed: 2026-08-30**
- [x] ✅ 4.3 One client failing does not sink the others (fail-soft per group). - **Completed: 2026-08-30**
- [x] ✅ 4.4 `npx tsc --noEmit` + lint on touched files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/visit-parse-orchestrator.ts
UPDATE: frontend/lib/cockpit/__tests__/visit-parse-orchestrator.test.ts
MAYBE:  extract complaint-catalog match helper (import site: ComplaintAutocomplete)
```

**Existing Code Status:**
- ✅ Orchestrator, recognizers, four clients — EXIST. This task is composition.
- ❌ Ladder + widened DTO — MISSING.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Deterministic items carry everything apply needs (vnb-04 must not re-parse).
- No logging of slice text anywhere in the router (RFE3-D7 posture inherited).
- The ladder is closed: adding a recognizer or client beyond VNB-D2 is a **STOP**.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** No (client-side routing).
- [x] **Any PHI in logs?** No — router logs nothing.
- [x] **External API or AI call?** Existing four clients only, now called *less* for deterministic inputs.
- [x] **Retention / deletion impact?** No.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Call-count matrix locked by tests (zero-AI classes included).
- [x] Resolvers get lines; unresolvable terms dropped.
- [x] DTO covers all Phase-1 groups with the deterministic/AI flag.
- [x] Type-check + lint + tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

- Whole-line deterministic short-circuit only when slices are leftover / vital / medicine (so `Order:` / `Impression:` never get eaten by the medicine parser).
- Deterministic medicine requires a sig (dose / frequency / duration / dosage) so a bare catalog word like `fever` is not treated as a drug.
- `subjective` / `plan` arrays stay the existing card shapes so the current proposal UI compiles; new groups + `subjectiveSource` / `planSource` / `planParsed` are the vnb-04 lock.

---

## 🔗 Related Tasks

- [`task-vnb-02-segmenter-kinds.md`](./task-vnb-02-segmenter-kinds.md) (dependency)
- [`task-vnb-04-proposal-groups-and-apply.md`](./task-vnb-04-proposal-groups-and-apply.md) (renders this DTO)

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Recognizer ladder over existing clients, call-count pinned
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
