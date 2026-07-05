# Task sdp-06: `ResultsTimelineSection` in `PatientChartPanel`

> **Filename:** `task-sdp-06-results-timeline-section.md` in `soap-data-placement/p3-results-timeline/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Render sdp-05's timeline as a read-only **"Investigations & Results"** section in `PatientChartPanel`, mounted after Vitals (before Previous Rx). Each visit shows its date, ordered investigations (text), resulted rows (name · value · unit · interpretation), and a media indicator. Reuses the shipped chart-section pattern (`SectionWrapper` + count callback, like `PreviousRxSection` / `ProblemListSection`). **Read-only — no add/edit (authoring stays in SOAP, SDP-D5).**

**Program / Phase:** soap-data-placement · Phase 3 (investigations & results timeline)
**Batch:** [`plan-p3-soap-data-placement-results-timeline-batch.md`](../plan-p3-soap-data-placement-results-timeline-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-soap-data-placement-results-timeline.md`](./EXECUTION-ORDER-p3-soap-data-placement-results-timeline.md)
**Estimated Time:** ~3–4 hours
**Status:** 🗒 **DRAFTED** — not started. **Model: Sonnet** (depends on sdp-05).

**Change Type:**
- [ ] **Update existing** (`PatientChartPanel`) + **add** the section + API wrapper. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** sdp-05's `GET /chart/results`; the panel host + `SectionWrapper` + count-callback pattern in [`PatientChartPanel.tsx`](../../../../../../../../frontend/components/ehr/PatientChartPanel.tsx); read-only section clones in [`PreviousRxSection.tsx`](../../../../../../../../frontend/components/ehr/sections/PreviousRxSection.tsx) / [`ProblemListSection.tsx`](../../../../../../../../frontend/components/ehr/sections/ProblemListSection.tsx); the chart API wrappers (`getChartVitals` etc.) in [`lib/api.ts`](../../../../../../../../frontend/lib/api.ts).
- ❌ **What's missing:** `getPatientResultsTimeline`; the `ResultsTimelineSection`; its mount + count wiring in `PatientChartPanel`.

**Scope Guard:**
- Expected files touched: ≤ 4 — `lib/api.ts` (wrapper), a new `ResultsTimelineSection.tsx`, `PatientChartPanel.tsx` (mount + count state), tests. **DO NOT** add any write/edit affordance (read-only); **DO NOT** touch sdp-05's endpoint.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. API wrapper
- [x] ✅ 1.1 `getPatientResultsTimeline(patientId, token)` in `lib/api.ts`, mirroring `getChartVitals`. - **Completed: 2026-06-25** _(in `lib/api/patient-chart.ts`, matching `listPatientProblems`)_

### 2. Section component
- [x] ✅ 2.1 `ResultsTimelineSection`: fetch the timeline; render visits date-desc — each with date, ordered text, resulted rows, media indicator; loading / empty / error states (mirror a shipped section). - **Completed: 2026-06-25**
- [x] ✅ 2.2 Report the count up via the `onCountChange` callback for the `SectionWrapper` badge. - **Completed: 2026-06-25**

### 3. Panel mount
- [x] ✅ 3.1 Mount in `PatientChartPanel` after Vitals / before Previous Rx, wrapped in `SectionWrapper` (`hideAdd` — read-only); thread `patientId` / `token` / `layout` / `mode`. - **Completed: 2026-06-25**
- [x] ✅ 3.2 Honor desktop / in-call / mobile layouts + `readonly` mode. - **Completed: 2026-06-25**

### 4. Verification & Testing
- [x] ✅ 4.1 Tests: renders visits date-desc; empty state; count badge; read-only (no add/edit). - **Completed: 2026-06-25**
- [x] ✅ 4.2 `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice. - **Completed: 2026-06-25** _(slice tests + eslint on touched files green; repo-wide tsc has pre-existing unrelated errors)_

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/api.ts (getPatientResultsTimeline)
CREATE: frontend/components/ehr/sections/ResultsTimelineSection.tsx
UPDATE: frontend/components/ehr/PatientChartPanel.tsx (mount after Vitals + count state)
CREATE/UPDATE: __tests__ for the section + panel
DO NOT TOUCH: sdp-05 endpoint; any write/edit affordance
```

**When updating existing code:**
- [ ] Clone a shipped read-only section (`ProblemListSection` / `PreviousRxSection`) — do not hand-roll fetch/loading/empty patterns.
- [ ] Use `SectionWrapper` with `hideAdd`; mount position after Vitals.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Read-only (SDP-D5 / P3-D4).** No add/edit; authoring stays in SOAP.
- **Per-visit rows (P3-D2).** Ordered + resulted under the same visit, date-desc.
- **Layout-aware.** Works in desktop / in-call / mobile + `readonly`.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes — read-only** display of sdp-05's PHI projection.
  - [ ] **RLS verified?** **Yes** — inherits sdp-05's doctor-scoped endpoint.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] `ResultsTimelineSection` renders in `PatientChartPanel` after Vitals (count badge), read-only, across all panel layouts + `readonly`.
- [ ] Visits render date-desc with ordered + resulted + media indicator; empty state clean.
- [ ] `tsc`/lint/tests green for the slice.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Thin consumer of sdp-05 + the shipped chart-section pattern; the longitudinal "investigations + reports together" view the program set out to deliver.

---

## 🔗 Related Tasks

- [`task-sdp-05-results-timeline-endpoint.md`](./task-sdp-05-results-timeline-endpoint.md) — the endpoint consumed here.
- [`task-sdp-07-results-timeline-close-gate.md`](./task-sdp-07-results-timeline-close-gate.md) — correctness + a11y + gate.

---

**Last Updated:** 2026-06-25
**Pattern:** clone a read-only chart section + `SectionWrapper`; mount after Vitals.
**Reference:** `process/CODE_CHANGE_RULES.md`
