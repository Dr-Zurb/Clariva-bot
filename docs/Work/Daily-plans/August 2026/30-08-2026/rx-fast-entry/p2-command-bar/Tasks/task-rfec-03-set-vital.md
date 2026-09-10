# Task rfec-03: Set a vital from the command bar + telemetry + gate

> **Filename:** `task-rfec-03-set-vital.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Parse a deterministic `field value` command (`spo2 98`, `temp 38.2`) and write that vital through the existing Rx form dispatch. If the vital is hidden, unhide first (rfec-02 path). Ship counts-only command-bar telemetry. Close the Phase 2 gate.

**Program / Phase:** rx-fast-entry · Phase 2 (command-bar)
**Batch:** [`plan-p2-rx-fast-entry-command-bar-batch.md`](../plan-p2-rx-fast-entry-command-bar-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-rx-fast-entry-command-bar.md`](./EXECUTION-ORDER-p2-rx-fast-entry-command-bar.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** Vitals write through `RxFormContext` like every other objective field. Visibility is `vitals_hidden` + `CORE_CLASSIC_VITAL_KEYS`. Schema holds units, steps, and labels (`vitalsSpo2` → Oxygen Saturation). Command bar (rfec-01/02) can jump and unhide.
- ❌ **What's missing:** No command grammar. No command-bar telemetry module. Phase 2 gate unchecked.
- ⚠️ **Notes:** This is not an AI parse. Ambiguous commands must not write. BP is two keys (`vitalsBpSystolic` / `vitalsBpDiastolic`) — a single `bp 120/80` is allowed if it maps unambiguously to both; otherwise offer two set actions. Do not extend `cmdkSearched` with a query string.

**Scope Guard:**
- Expected files touched: ≤ 5
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-DL-4, RFE-Q6, RFE2-D4, D5

---

## ✅ Task Breakdown (Hierarchical)

### 1. Grammar
- [x] ✅ 1.1 Deterministic parse: leading field token(s) + a value. Field token matches vital aliases (schema label, common short names). Value must satisfy that vital's existing numeric/categorical constraints (out of range → no write, offer the jump instead). - **Completed: 2026-08-30**
- [x] ✅ 1.2 Ambiguous field token → pick list, no write. - **Completed: 2026-08-30**
- [x] ✅ 1.3 If the vital is hidden, unhide (rfec-02) then set. - **Completed: 2026-08-30**

### 2. Telemetry
- [x] ✅ 2.1 New counts-only helpers (own prefix, not `[ehr:cmdk]` unless you can prove the payload shape stays identical and still cannot carry the command). Events: opened, searched (length), selected (kind only: jump / unhide / set). - **Completed: 2026-08-30**
- [x] ✅ 2.2 Function signatures have **no** parameter for the raw command or the value. - **Completed: 2026-08-30**

### 3. Gate
- [x] ✅ 3.1 Tick the Phase 2 batch acceptance gate. - **Completed: 2026-08-30**
- [ ] 3.2 Manual smoke: `/` → `spo2 98` writes; `/` → `family` shows the section; Cmd-K still searches patients. — **residual:** no authenticated browser in this session. Written in the batch Notes. Grammar + bar Vitest cover the same paths.
- [x] ✅ 3.3 Grep: no `console.debug` of the command string. - **Completed: 2026-08-30**
- [x] ✅ 3.4 `npx tsc --noEmit` + lint + targeted tests. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/command-bar-set-vital.ts     ← pure grammar + tests
CREATE: frontend/lib/telemetry/…                          ← counts-only command-bar events
UPDATE: command bar (apply set; emit telemetry)
UPDATE: phase batch gate checkboxes when green
```

**Existing Code Status:**
- ✅ Rx form vital fields — EXIST; dispatch through the form, do not write the DOM.
- ✅ `cmdk.ts` — EXISTS; **do not** add a query argument.
- ❌ Grammar + command-bar telemetry — MISSING.

**When updating existing code:**
- [x] Audit the vital write path on `RxFormContext` / objective fields before adding a second writer.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Vitals only (RFE2-D4, RFE-Q6). No free-text SOAP writes.
- Deterministic. No AI call.
- Telemetry cannot carry the command (RFE-DL-4, RFE2-D5).
- No PHI in logs.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes — existing visit vital fields via the Rx form.** No new column. Same persist/autosave the doctor already has.
- [x] **Any PHI in logs?** **No.** (A set-value command is clinical content — length only.)
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `spo2 98` sets SpO₂ to 98 through the form (unhiding if needed).
- [x] Out-of-range / ambiguous commands do not write.
- [x] Telemetry helpers cannot accept the raw command.
- [x] Phase 2 batch gate is green.
- [x] Type-check + lint + grammar + bar tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** Wiring Plan / Assessment / Objective *section* Show plus set-value would exceed the 5-file budget.
**Solution:** Set-value is the primary work. The rfec-02 Show residual stays written (Subjective + Vitals only). Do not start Phase 3.

---

## 📝 Notes

- Plan / Assessment / Objective *section* Show is still a residual (same as rfec-02). Seam is already `registerRxHiddenSource` — those tabs are not registered.
- Telemetry lives at `frontend/lib/telemetry/rx-command-bar.ts` (`[ehr:rxcmd]`). Signature tests live next to the grammar so we did not add a 6th file.
- **Live `/` smoke residual:** no authenticated browser pass. Operator: visit → `/` → `spo2 98` writes; `/` → `family` shows Family history; Cmd-K still searches patients.

---

## 🔗 Related Tasks

- [`task-rfec-02-unhide-section.md`](./task-rfec-02-unhide-section.md)
- [Phase 3](../../p3-describe-visit/) — next; Opus

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Deterministic command → existing form write
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
