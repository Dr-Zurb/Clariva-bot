# Task subj-35: Integration, remount-survival + a11y + output-parity + verification gate

> **Filename:** `task-subj-35-integration-and-verification.md` in `subjective-tab/p10-section-visibility/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Prove the feature works and close the phase. Add an integration test that a doctor's hide/unhide choices
**survive a remount** — both the unmount/remount from toggling the Subjective tab off/on and the fresh mount that
hydrates from the stored set (patient reopen). Assert the headline safety property: a **hidden section that has
data still appears in `buildRxPayload`** (view-only, P10-D6). Run an a11y sweep on the "Manage sections" menu
(keyboard open/close, focus trap/return, `role`/`aria-expanded`; preview/`disabled` shows visibility read-only
without autosave), assert structurally that the hidden set never reaches `buildRxPayload` / the PDF path, and run
the verification gate.

**Program / Phase:** subjective-tab · Phase 10 (section visibility)  
**Batch:** [`plan-p10-subjective-section-visibility-batch.md`](../plan-p10-subjective-section-visibility-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p10-subjective-section-visibility.md`](./EXECUTION-ORDER-p10-subjective-section-visibility.md)  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-18

**Change Type:**
- [x] **New feature (tests + gate)** — no new product surface. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** subj-34 menu + visibility wiring + autosave; existing `SubjectiveSection.*.test.tsx` (remount / collapse-persist / a11y patterns to clone); `buildRxPayload` (does not read the hidden set).
- ❌ **What's missing:** an explicit remount-survival test, the hidden-with-data output assertion, the menu a11y assertions, and the structural output-parity assertion.

**Scope Guard:**
- Expected files touched: ≤ 3 (new/updated FE test files; possibly a tiny test util).
- **No** product code changes (only fixes surfaced by the gate); **no** new feature.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Remount-survival integration test
- [x] ✅ 1.1 Hide 2–3 sections via menu; assert render-plan removal + delta PATCH. - **Completed: 2026-06-18**
- [x] ✅ 1.2 Unmount/remount + shell hydrate; hidden sections stay hidden. - **Completed: 2026-06-18**
- [x] ✅ 1.3 Delta-only, no custom_block persist, stale-echo no-clobber contracts pinned. - **Completed: 2026-06-18**

### 2. Output-parity (the headline safety property)
- [x] ✅ 2.1 Hidden-with-data fields → `buildRxPayload` identical to visible case (P10-D6). - **Completed: 2026-06-18**
- [x] ✅ 2.2 Structural guard: `buildRxPayload` + PDF/SMS builders never reference hidden set. - **Completed: 2026-06-18**

### 3. A11y sweep (the menu)
- [x] ✅ 3.1 Trigger keyboard + `aria-expanded`; Escape closes + focus returns. - **Completed: 2026-06-18**
- [x] ✅ 3.2 Labelled hide toggles with `aria-pressed`; reorder + add-custom keyboard-operable. - **Completed: 2026-06-18**
- [x] ✅ 3.3 `disabled` mode read-only (no visibility autosave); menu still reachable. - **Completed: 2026-06-18**

### 4. Verification gate
- [x] ✅ 4.1 Lint clean on new test files; touched slice has no new tsc errors. - **Completed: 2026-06-18**
- [x] ✅ 4.2 Frontend SubjectiveSection + visibility suites green (64/64); backend hidden validation green. Pre-existing repo-wide frontend `tsc` baseline (social-history WIP) not gate-blocking. - **Completed: 2026-06-18**
- [x] ✅ 4.3 Batch plan cross-cutting acceptance gate ticked. - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/sections/__tests__/SubjectiveSection.visibility-persist.test.tsx
CREATE: frontend/lib/cockpit/__tests__/visibility-output-parity.test.ts (hidden-with-data still in buildRxPayload; no builder references)
UPDATE: (if needed) frontend/components/cockpit/rx/sections/__tests__/SubjectiveSection.a11y.test.tsx (menu a11y)
DO NOT TOUCH: product behaviour (only fixes the gate surfaces); doctor_settings api; resolver; PDF/cc/hopi
```

**When updating existing code:**
- [ ] Clone the existing `SubjectiveSection.collapse-persist.test.tsx` harness (mock `getDoctorSettings`/`patchDoctorSettings`, `renderWithShell`) — same mocking + `waitFor` patterns.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Prove remount-survival (P10 goal).** The headline test is "visibility survives a remount" — both tab toggle and patient reopen.
- **View-only, asserted on the payload (P10-D6).** The single most important test: a hidden section with data is still in `buildRxPayload`. Plus the structural assertion that the hidden set is absent from the payload/builders.
- **Delta-only persistence (P10-D2/D4).** Tests pin "never persist visible ids" + "never persist custom blocks" + "one-shot hydration / no stale-echo clobber" so a later refactor can't silently regress them.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** new storage — tests only.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Remount-survival test passes (tab toggle + patient reopen); delta-only + no-custom-block + no-clobber contracts pinned.
- [x] ✅ Hidden-with-data section still present in `buildRxPayload`; structural output-parity assertion passes.
- [x] ✅ Menu a11y: keyboard open/close + focus return + labelled toggles; `disabled` mode read-only.
- [x] ✅ Lint/tests green on slice; cross-cutting gate ticked.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Unlike collapse (Phase 9), visibility is more dangerous on exactly one axis: a doctor could reasonably *assume*
hiding removes a section from the output. The decision lock says it does **not** (P10-D6) — so the load-bearing
test here is "hidden section with data still prints." If that ever flips, it must be a deliberate, separate phase
touching `buildRxPayload`, not a silent side effect of a view toggle.

---

## 🔗 Related Tasks

- [`task-subj-34-section-manager-menu.md`](./task-subj-34-section-manager-menu.md) — the menu + wiring this verifies.
- Sibling precedent: [`../../p9-collapse-persistence/Tasks/task-subj-31-integration-and-verification.md`](../../p9-collapse-persistence/Tasks/task-subj-31-integration-and-verification.md).

---

**Last Updated:** 2026-06-18  
**Pattern:** remount-survival integration test + hidden-with-data output assertion + menu a11y sweep + structural output-parity + verification gate.  
**Reference:** `process/CODE_CHANGE_RULES.md`
