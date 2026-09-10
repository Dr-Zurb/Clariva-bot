# Task rfeq-01: Static field index + Cmd-K `fields` source

> **Filename:** `task-rfeq-01-field-index-and-cmdk-source.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add a client-static field index and register it as a `fields` source on the shipped global command palette. Hits appear only on `/dashboard/appointments/:id`. Each hit navigates to that same appointment with `rxFocus` set. The form does not move yet — that is rfeq-02.

**Program / Phase:** rx-fast-entry · Phase 1 (field-search)
**Batch:** [`plan-p1-rx-fast-entry-field-search-batch.md`](../plan-p1-rx-fast-entry-field-search-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-rx-fast-entry-field-search.md`](./EXECUTION-ORDER-p1-rx-fast-entry-field-search.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `GlobalCommandPalette` has a `sourceRegistry` with one source (`patients`). `SearchSource.search` is async and receives `token`, `query`, `signal`. `handleSelect` always `router.push(item.routedTo)`. `CmdkSourceKey` is `"patients" | "appointments" | "drugs" | "settings"` — `fields` is absent. Label maps already exist: `SUBJECTIVE_SECTION_LABELS`, `OBJECTIVE_SECTION_LABELS`, `PLAN_SECTION_LABELS`, `ASSESSMENT_SECTION_LABELS`, plus vital labels on `vitals-schema` / categorical vitals. SOAP pane ids are `subjective` / `objective` / `assessment` / `plan` (`COCKPIT_TAB_ORDER`). Palette is a client component mounted from `DashboardShell`.
- ❌ **What's missing:** No field index. No `fields` source. Palette does not read the current path, so it cannot be route-aware. `CmdkSourceKey` has no `fields` member.
- ⚠️ **Notes:** The file comment says V1.1 sources "just append." That is true only for navigation sources. Do not add an action kind. The searcher may be synchronous under the async contract (return a resolved list). `shouldFilter={false}` — the source does its own match.

**Scope Guard:**
- Expected files touched: ≤ 5
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-DL-1, DL-2, RFE-Q1, RFE1-D1…D3, D5

---

## ✅ Task Breakdown (Hierarchical)

### 1. Field index
- [x] ✅ 1.1 Build a static index from the four section-label maps and the vital / categorical-vital labels. Each entry knows pane id, section id, optional field id, and display label. - **Completed: 2026-08-30**
  - [x] ✅ 1.1.1 Section entries cover every static section id (not `custom_block:` — RFE1-D3). - **Completed: 2026-08-30**
  - [x] ✅ 1.1.2 Vital entries live under pane `objective`, section `vitals`, field = the vital key (e.g. `vitalsSpo2`). - **Completed: 2026-08-30**
  - [x] ✅ 1.1.3 Labels are read from the registries, not recopied as string literals. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Match is case-insensitive substring (or the lightest fuzzy already used elsewhere in frontend search). No network. - **Completed: 2026-08-30**

### 2. Palette source
- [x] ✅ 2.1 Add `"fields"` to `CmdkSourceKey`. - **Completed: 2026-08-30**
- [x] ✅ 2.2 Register a `fields` source. `routedTo` is the current appointment path plus `rxFocus=pane.section` or `pane.section.field` (RFE1-D1). - **Completed: 2026-08-30**
- [x] ✅ 2.3 Source returns `[]` unless the current path is `/dashboard/appointments/:id`. - **Completed: 2026-08-30**
- [x] ✅ 2.4 Placeholder copy stays patient-first (RFE1-D5). A short secondary hint that fields work on an open visit is allowed. - **Completed: 2026-08-30**

### 3. Verification & Testing
- [x] ✅ 3.1 Unit-test the index: `spo2` hits Oxygen Saturation; `family` hits Family history; a custom-block id is absent. - **Completed: 2026-08-30**
- [x] ✅ 3.2 Unit-test route-awareness: appointment path → hits; any other path → empty. - **Completed: 2026-08-30**
- [x] ✅ 3.3 Confirm `SourceItem` still has only `id` / `label` / `subtitle` / `routedTo`. - **Completed: 2026-08-30**
- [x] ✅ 3.4 `npx tsc --noEmit` + lint on touched files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/search/rx-fields.ts          ← index + matcher (name may vary; keep it next to patients.ts)
CREATE: frontend/lib/search/__tests__/rx-fields.test.ts
UPDATE: frontend/lib/telemetry/cmdk.ts            ← add "fields" to CmdkSourceKey
UPDATE: frontend/components/layout/GlobalCommandPalette.tsx
```

**Existing Code Status:**
- ✅ `frontend/lib/search/patients.ts` — EXISTS; the sibling pattern for a source searcher.
- ✅ `frontend/components/layout/GlobalCommandPalette.tsx` — EXISTS; append one registry entry.
- ⚠️ `frontend/lib/telemetry/cmdk.ts` — EXISTS; union must include `fields` or `cmdkSelected` will not typecheck.
- ❌ Field index — MISSING.

**When updating existing code:**
- [x] ✅ Audit `sourceRegistry` and `handleSelect` before editing — they must stay navigation-only. - **Completed: 2026-08-30**
- [x] ✅ Map the change to: one new source + route-aware `routedTo`. No action callback. - **Completed: 2026-08-30**
- [x] ✅ Do not remove the patients source or change its searcher. - **Completed: 2026-08-30**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Navigation only (RFE-DL-1). The palette must not dispatch into the Rx form.
- Route-aware silence off an appointment (RFE-DL-2, RFE-Q1).
- No PHI in logs. Do not log the query string.
- Index is client-static (RFE1-D2). No new API.
- Custom blocks out (RFE1-D3).

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — client index + URL query only.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] ✅ On an open visit, Cmd-K lists matching fields with a Fields group heading. - **Completed: 2026-08-30** (wired; consumer is rfeq-02)
- [x] ✅ Off a visit, the same query lists no fields. - **Completed: 2026-08-30**
- [x] ✅ Selecting a field `router.push`es the same appointment with `rxFocus` set. The form may not yet focus (rfeq-02). - **Completed: 2026-08-30**
- [x] ✅ `SourceItem` has no action kind. - **Completed: 2026-08-30**
- [x] ✅ Type-check + lint clean; index + route-awareness tests green. - **Completed: 2026-08-30**

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

- `shouldFilter={false}` — match lives in `searchRxFields` (NFKC substring so `spo2` hits `SpO₂` via the field key + folded label).
- **Field hits are excluded from recents.** `RecentSourceKey` has no `fields` member; replaying a visit-scoped `routedTo` onto another appointment would be wrong. Documented here as the locked choice.
- Query cache is keyed by `pathname + query` so a `spo2` hit from a visit is never served on `/dashboard/patients-v2`.
- Repo-wide `tsc` still has pre-existing errors in unrelated files; touched files are clean. 10/10 `rx-fields` tests green. No browser tools in this session — smoke the palette on a live visit in rfeq-03.

---

## 🔗 Related Tasks

- [`task-rfeq-02-rx-focus-deep-link.md`](./task-rfeq-02-rx-focus-deep-link.md) — consumes the URL this task writes
- [`task-rfeq-03-field-search-gate.md`](./task-rfeq-03-field-search-gate.md) — phase gate

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Append a navigation source to a registry-ready palette
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
