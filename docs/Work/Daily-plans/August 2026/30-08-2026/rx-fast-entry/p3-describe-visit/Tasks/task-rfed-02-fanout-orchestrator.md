# Task rfed-02: Fan-out orchestrator (Opus)

> **Filename:** `task-rfed-02-fanout-orchestrator.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Given a paragraph (and rfed-01 slices), call **only** `parseComplaintWithAI` and `parseMedicineWithAI` on the matching slices, collect a tab-grouped proposal payload, and fail soft. **No UI apply.** **No new endpoint.**

**Model:** pick **Opus (max thinking)** before starting. This is an AI-path task.

**Program / Phase:** rx-fast-entry · Phase 3 (describe-visit)
**Batch:** [`plan-p3-rx-fast-entry-describe-visit-batch.md`](../plan-p3-rx-fast-entry-describe-visit-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md`](./EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [x] **New feature** — Add code only (no change to existing behavior)
- [ ] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `parseComplaintWithAI` / `parseMedicineWithAI` clients (tier `default` | `escalation`, `AbortSignal`). `ComplaintCaptureBar` and `MedicineCaptureBar` already call them per line. Server services redact PHI, bound output, fail soft, and audit metadata-only. rfed-01 (once shipped) returns slices.
- ❌ **What's missing:** A visit-level orchestrator that fans slices to those two clients and returns a grouped proposal DTO.
- ⚠️ **Notes:** Diagnosis and investigation clients exist — **do not import them**. A new SOAP parse route is a **STOP**.

**Scope Guard:**
- Expected files touched: ≤ 5
- Any expansion requires explicit approval — and this task must **not** use expansion as a reason to add a third parser.

**Reference Documentation:**
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-DL-5, DL-7, DL-8, RFE3-D1, D2, D6, D7
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Fan-out
- [x] ✅ 1.1 `complaint` slices → complaint client only. `medicine` slices → medicine client only. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Single `leftover` (no cues) → **both** clients, same original text, in parallel. - **Completed: 2026-08-30**
- [x] ✅ 1.3 `ignored` slices → no call. - **Completed: 2026-08-30**
- [x] ✅ 1.4 Tier: `default` on auto; `escalation` only when the caller says refine (explicit ✨). Honour `AbortSignal`. - **Completed: 2026-08-30**
- [x] ✅ 1.5 Per-client failure → that tab's list is empty; the other tab may still succeed. Never throw to the doctor. - **Completed: 2026-08-30**

### 2. Result shape
- [x] ✅ 2.1 Group by tab (`subjective` / `plan`). Each item is the existing AI-parsed complaint or medicine shape (do not invent a third card type). - **Completed: 2026-08-30**
- [x] ✅ 2.2 Lock the DTO in tests with mocked clients. rfed-03 consumes this shape as-is. - **Completed: 2026-08-30**

### 3. Verification & Testing
- [x] ✅ 3.1 Mocked clients: cue split does not cross-send. - **Completed: 2026-08-30**
- [x] ✅ 3.2 Leftover path calls both once. - **Completed: 2026-08-30**
- [x] ✅ 3.3 One client reject → other tab still populated. - **Completed: 2026-08-30**
- [x] ✅ 3.4 Grep the new module: no diagnosis / investigation imports; no `console` of the paragraph. - **Completed: 2026-08-30**
- [x] ✅ 3.5 `npx tsc --noEmit` + lint. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/visit-parse-orchestrator.ts
CREATE: frontend/lib/cockpit/__tests__/visit-parse-orchestrator.test.ts
```

**Existing Code Status:**
- ✅ Both parse clients — EXIST; call them.
- ✅ Server guarantees — EXIST; do not re-implement redaction on the client.
- ❌ Orchestrator — MISSING.

**When creating:**
- [x] Do not add a backend file. If you believe you need one, STOP.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Two clients only (RFE3-D1).
- Inherit redaction/audit (RFE-DL-8, RFE3-D7). Client must not log the paragraph.
- Mini vs flagship tiers unchanged (RFE3-D6).
- Fail soft (same as the services).

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** new storage. Existing parse routes only.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **Yes** — existing complaint + medicine parse only.
  - [x] **Consent + redaction confirmed?** **Yes** — inherited from those services (`redactPhiForAI`, metadata-only audit). This task does not add a prompt.
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Tests prove no cross-send except the leftover-both path.
- [x] No new route. No third parser import.
- [x] Result shape is stable for rfed-03.
- [x] Type-check + lint + orchestrator tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

- DTO: `VisitParseProposal` `{ sourceText, tier, subjective, plan }` in `frontend/lib/cockpit/visit-parse-orchestrator.ts`. rfed-03 consumes this as-is.
- Leftover prefix beside a cue is **not** the both-parsers path (RFE3-D2). Only a lone leftover (no cues) goes to both.
- `fieldSpec` is `complaintFieldSpecForParse` — same resolve + painscale/temperature filter as `ComplaintList`.
- Ran on Auto at operator request. No new route.

---

## 🔗 Related Tasks

- [`task-rfed-01-cue-segmenter.md`](./task-rfed-01-cue-segmenter.md)
- [`task-rfed-03-tab-grouped-proposal.md`](./task-rfed-03-tab-grouped-proposal.md)

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Orchestrator over existing bounded parsers
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
