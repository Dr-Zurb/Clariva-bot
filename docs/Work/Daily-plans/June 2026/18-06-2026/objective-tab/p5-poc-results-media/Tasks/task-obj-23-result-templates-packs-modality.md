# Task obj-23: Result templates + specialty packs + modality emphasis (`test_results` / `point_of_care` scopes)

> **Filename:** `task-obj-23-result-templates-packs-modality.md` in `objective-tab/p5-poc-results-media/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Bring P4's template engine to Zone C: extend the `doctor_rx_templates` scope set with `test_results` /
`point_of_care`, seed **POC specialty starter packs**, and wire **modality default emphasis** (in-person /
video / voice) onto P3's view-only seed. Templates/packs fill obj-20's structured rows via the reducer (P4-D2
form-state only); modality emphasis only changes *which sections lead/show by default* and **never** the derived
output. **Compose P4's engine — do not fork.** **No schema** (obj-20), **no row UI** (obj-21), **no media**
(obj-22).

**Program / Phase:** objective-tab · Phase 5 (point-of-care results + media)  
**Batch:** [`plan-p5-objective-tab-poc-results-media-batch.md`](../plan-p5-objective-tab-poc-results-media-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p5-objective-tab-poc-results-media.md`](./EXECUTION-ORDER-p5-objective-tab-poc-results-media.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **COMPLETE** (2026-06-19). Depends on **obj-21** (and **obj-20**).

> **Decision (migration / Opus gate):** the template `scope` set **is a DB CHECK constraint** (`doctor_rx_templates_scope_valid`, last widened by migration 153), so adding `test_results`/`point_of_care` **required a new enum-widen migration** — `155_doctor_rx_templates_result_scopes.sql` (additive, idempotent, RLS-unchanged clone of 153). This tripped the task's STOP/Opus gate, so it was implemented Opus-grade. The structured rows reuse `objective_json` under a new `testResultsJson` key (NO new column).
>
> **Decision (modality emphasis supersedes obj-22's media default):** obj-23 owns the modality-emphasis layer and §3.1 specifies *uploads* for both async and video. So the media strip is now **visible** for `voice`/`text` (patient-reported + uploads) and `video` (observed + uploads), and `point_of_care` is hidden over `video` (no chairside POC). This revises obj-22's interim "media hidden for async" placeholder; view-only, doctor override still wins, `buildRxPayload` byte-unchanged.

**Change Type:**
- [x] **Update existing** (extend P4 template engine + P3 seed) + one additive scope-widen migration. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** P4's scope engine [`apply-objective-template.ts`](../../../../../../../../frontend/lib/cockpit/apply-objective-template.ts) + reusable button + picker variant; the `doctor_rx_templates` scope enum (migrations 141/149/153); P4's specialty packs [`objective-specialty-packs.ts`](../../../../../../../../frontend/lib/cockpit/objective-specialty-packs.ts); P3's modality/specialty seed [`objective-default-layout.ts`](../../../../../../../../frontend/lib/cockpit/objective-default-layout.ts) (`resolveDefaultLayout`, `normalizeSpecialty`); obj-20's `testResultsStructured` + reducer.
- ❌ **What's missing:** the `test_results` / `point_of_care` template scopes; result-row save/apply in the engine; POC pack content; modality emphasis for the result/POC/media sections.

**Scope Guard:**
- Expected files touched: ≤ 6 (scope enum migration **only if** the scope set lives in a CHECK constraint — confirm; else type/Zod); the apply engine; the specialty-pack catalog; the modality seed; section-button wiring; tests. **No** new row UI (obj-21), **no** media (obj-22).

> **⚠️ Confirm:** adding `test_results`/`point_of_care` to the template `scope` enum may need a small migration (clone of 153's enum-widen). If so, this task inherits the migration hard rule (Opus) — surface before coding; otherwise it stays Sonnet.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Result template scopes
- [x] ✅ 1.1 Add `test_results` / `point_of_care` to the template scope set (type/Zod both sides + enum-widen migration 155 — the CHECK required it). - **Completed: 2026-06-19**
- [x] ✅ 1.2 Extend the apply engine: `buildObjectiveTemplateSavePayload` / `buildObjectiveTemplateApplyActions` handle the result scopes (save captures only that source's rows; apply merges via `SET_TEST_RESULTS`, replacing only that source); `objective_full` save/apply now also carries `testResultsJson`. - **Completed: 2026-06-19**

### 2. POC specialty packs
- [x] ✅ 2.1 POC starter rows added to the catalog (cardiology → ECG; pulmonology → SpO₂ + peak-flow; gp/unknown → RBS/glucometer), applied through the engine (`objective_full`), savable as a per-doctor template. - **Completed: 2026-06-19**

### 3. Modality default emphasis
- [x] ✅ 3.1 Modality emphasis wired (in_clinic → full + POC; video → observed + uploads, POC hidden; voice/text → patient-reported + uploads) onto P3's seed for the result/POC/media sections — content emphasis only, view-only, doctor override wins (P3-D5 / OBJ-D6). - **Completed: 2026-06-19**

### 4. Verification & Testing
- [x] ✅ 4.1 Tests: result-scope save captures only its source's rows; scoped apply replaces only that source (other rows untouched); `objective_full` composes results; POC packs apply through the engine; modality emphasis changes default order/visibility but `buildRxPayload` is byte-unchanged (parity gate). - **Completed: 2026-06-19**
- [x] ✅ 4.2 `frontend` tsc clean (touched files; pre-existing social-history/api noise only), lint clean on touched files, affected vitest green; `backend` tsc clean, migration-155 + scope-validation + rx-template-service tests green. Pre-existing Subjective `waitFor`/`CarryForwardButton` + ESM noise unchanged. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/apply-objective-template.ts (test_results/point_of_care save/apply + objective_full compose)
UPDATE: frontend/types/rx-template.ts (+ backend mirror) (result scope values)
UPDATE: backend/src/utils/validation.ts (result scope values) [+ migration ONLY if scope is a CHECK enum — confirm]
UPDATE: frontend/lib/cockpit/objective-specialty-packs.ts (POC starter rows)
UPDATE: frontend/lib/cockpit/objective-default-layout.ts (modality emphasis for result/POC/media)
DO NOT TOUCH: obj-20 schema/derivation; obj-21 row UI internals; obj-22 media internals
```

**When updating existing code:**
- [x] ✅ Compose, don't fork — result scopes are new cases in `apply-objective-template.ts`, the same picker/button, one engine.
- [x] ✅ Form-state only (P4-D2): templates/packs dispatch reducer actions only; no server chart writes / layout config / derived text on apply.
- [x] ✅ Modality emphasis is view-only (OBJ-D6): `buildRxPayload` byte-parity proven in the engine + `objectiveTemplateParity` tests; obj-24 closes the gate.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reuse P4's scope engine (P5-D6 / P4-D1/D2).** Add scopes + cases; one engine, one picker.
- **Packs are static starter content (P4-D4).** Applied via the engine, savable per-doctor; never auto-persist.
- **Modality emphasis layers on P3's seed (OBJ-D6).** Content/visibility emphasis only; never derived output.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] ✅ **Data touched?** **Yes** — per-doctor template scopes + the scope enum-widen migration 155.
  - [x] ✅ **RLS verified?** **Yes** — inherits the doctor-scoped template policy (migration 091); the widen does not touch RLS.
- [x] ✅ **Any PHI in logs?** **No** — template presets are config, not PHI; nothing logged.
- [x] ✅ **External API or AI call?** **No.**
- [x] ✅ **Retention / deletion impact?** **No** — additive CHECK widen, no column/data change.

> **STOP/Opus gate:** the scope set **is** a DB CHECK enum → enum-widen migration 155 was required → implemented Opus-grade.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ `test_results`/`point_of_care` template scopes save/apply only their own rows via the reducer; `objective_full` composes them; POC specialty packs apply through the engine and are savable.
- [x] ✅ Modality emphasis changes default order/visibility for result/POC/media sections only; `buildRxPayload` byte-unchanged; doctor override wins.
- [x] ✅ `tsc`/lint/tests green (touched files; only pre-existing unrelated noise remains).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The Zone-C analog of P4's `obj-17/18` over result rows, plus the modality-emphasis content layer that P3 left as view-only seed. Closes the templating story for Objective once obj-24 proves parity.

---

## 🔗 Related Tasks

- [`task-obj-17-…`](../../p4-exam-templates/Tasks/task-obj-17-form-state-scoped-objective-templates.md) · [`task-obj-18-…`](../../p4-exam-templates/Tasks/task-obj-18-specialty-exam-packs.md) — the engine + pack patterns extended here.
- [`task-obj-21-structured-poc-result-rows.md`](./task-obj-21-structured-poc-result-rows.md) — the rows these templates fill.

---

**Last Updated:** 2026-06-19  
**Pattern:** extend P4's scope engine + specialty-pack catalog with result scopes + a view-only modality emphasis layer.  
**Reference:** `process/CODE_CHANGE_RULES.md`
