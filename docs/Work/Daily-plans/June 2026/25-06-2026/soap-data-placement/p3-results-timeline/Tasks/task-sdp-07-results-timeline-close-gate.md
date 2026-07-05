# Task sdp-07: Results-timeline close-gate (projection correctness + read-only + a11y + verification)

> **Filename:** `task-sdp-07-results-timeline-close-gate.md` in `soap-data-placement/p3-results-timeline/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close Phase 3 (and the SOAP data-placement program): prove the timeline **projection is correct** (ordered text + resulted rows attribute to the right visit/date; media count matches that visit's objective report-scan attachments), cover **empty / order-only / result-only** edge states, enforce **read-only** across every panel layout, run the **a11y** sweep, and pass the verification gate.

**Program / Phase:** soap-data-placement · Phase 3 (investigations & results timeline)
**Batch:** [`plan-p3-soap-data-placement-results-timeline-batch.md`](../plan-p3-soap-data-placement-results-timeline-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-soap-data-placement-results-timeline.md`](./EXECUTION-ORDER-p3-soap-data-placement-results-timeline.md)
**Estimated Time:** ~2–3 hours
**Status:** 🗒 **DRAFTED** — not started. **Model: Sonnet** (depends on sdp-05/06).

**Change Type:**
- [ ] **Verification + edge-case hardening** (no new surface). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** sdp-05's endpoint + sdp-06's section; existing chart-section + service tests to mirror.
- ❌ **What's missing:** the projection-correctness fixtures; the read-only-across-layouts assertion; the a11y sweep; the program-close verification.

**Scope Guard:**
- Expected files touched: ≤ 4 — service + section tests; minor edge-state hardening in the section if a gap is found. **DO NOT** add any write/edit affordance; **DO NOT** add schema; **DO NOT** expand scope into P6 trends/charts.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Projection correctness
- [x] ✅ 1.1 Fixtures: multi-visit patient with mixed ordered/resulted/media → assert per-visit attribution + date-desc ordering + media count. - **Completed: 2026-06-25**
- [x] ✅ 1.2 Edge states: no results (empty timeline), order-only visit, result-only visit. - **Completed: 2026-06-25**

### 2. Read-only + layouts
- [x] ✅ 2.1 Assert no add/edit affordance in any layout (desktop / in-call / mobile) + `readonly` mode. - **Completed: 2026-06-25**

### 3. a11y
- [x] ✅ 3.1 Timeline keyboard + screen-reader navigable; labels carry no PHI. - **Completed: 2026-06-25**

### 4. Verification gate (program close)
- [x] ✅ 4.1 `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice. - **Completed: 2026-06-25** _(slice tests + eslint green; repo-wide tsc has pre-existing unrelated errors)_
- [x] ✅ 4.2 `cd backend && npm test` green (pre-existing unrelated failures routed, not introduced). - **Completed: 2026-06-25** _(patient-chart-results-timeline: 10/10)_
- [x] ✅ 4.3 Confirm the program's binding decisions held: ordered=Plan / resulted=Objective surfaced read-only (SDP-D2), note ≠ chart (SDP-D5), no new schema (P3-D1). - **Completed: 2026-06-25**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE/UPDATE: backend/tests/unit/services/* (projection correctness + edge cases)
CREATE/UPDATE: frontend .../sections/__tests__/ResultsTimelineSection.test.tsx (read-only + layouts + a11y)
UPDATE (if a gap found): ResultsTimelineSection.tsx (edge-state hardening only)
DO NOT TOUCH: schema; write/edit affordances; SOAP authoring
```

**When updating existing code:**
- [ ] Mirror the existing chart-section + service test fixtures.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Correctness over scope.** Prove attribution + edge states; no new features.
- **Read-only + PHI-safe.** No write paths; no PHI in labels/logs.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes — read-only** (test fixtures over the projection).
  - [ ] **RLS verified?** **Yes** — inherits sdp-05's doctor-scoped endpoint.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Projection correctness + edge states proven; read-only across layouts; a11y operable.
- [ ] `tsc`/lint/tests green (FE + BE).
- [ ] Program decisions (SDP-D2/D5, P3-D1) confirmed held.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The program close-gate — mirrors the objective-tab close-gates' projection/parity + a11y posture, scoped to the read-only results timeline.

---

## 🔗 Related Tasks

- [`task-sdp-05-results-timeline-endpoint.md`](./task-sdp-05-results-timeline-endpoint.md) · [`task-sdp-06-results-timeline-section.md`](./task-sdp-06-results-timeline-section.md).

---

**Last Updated:** 2026-06-25
**Pattern:** projection-correctness fixtures + read-only/a11y sweep + verification gate (mirror the objective-tab close-gates).
**Reference:** `process/CODE_CHANGE_RULES.md`
