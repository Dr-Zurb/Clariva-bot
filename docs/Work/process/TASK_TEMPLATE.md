# Task {Prefix}-{NN}: {Task Title}

> **Filename:** `task-{prefix}-{NN}-{slug}.md` in the phase's `Tasks/` folder.
> **Relative-link note:** this file lives deep in the phased structure (`…/<program>/p{N}-<slug>/Tasks/`). The `../`-depth links below (Batch, Execution order, sibling tasks) are written **relative to that destination**. When you reference shared `process/` or `Reference/` docs, use the depth from the cheat sheet in [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md) §7 (a `Tasks/` file is six `../` from `docs/Work/`).

---

## 📋 Task Overview

{Brief description of what this task accomplishes}

**Program / Phase:** {program-slug} · Phase {N} ({phase-slug})  
**Batch:** [`plan-p{N}-{program}-{slug}-batch.md`](../plan-p{N}-{program}-{slug}-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p{N}-{program}-{slug}.md`](./EXECUTION-ORDER-p{N}-{program}-{slug}.md)  
**Estimated Time:** {X} hours  
**Status:** ⏳ **PENDING**  
**Completed:** {YYYY-MM-DD} (when completed)

**Change Type:** (Choose one)
- [ ] **New feature** — Add code only (no change to existing behavior)
- [ ] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md)

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** {List existing files, functions, or implementations}
- ❌ **What's missing:** {List what needs to be created or implemented}
- ⚠️ **Notes:** {Any important notes about existing code, naming differences, etc.}

**Scope Guard:**
- Expected files touched: ≤ 5
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) - Rules when changing existing code (audit, impact, remove obsolete)
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - Coding rules and requirements
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Project structure
- [RECIPES.md](../../Reference/engineering/development/RECIPES.md) - Implementation patterns
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - Compliance requirements

---

## ✅ Task Breakdown (Hierarchical)

**MUST:** Use hierarchical numbering for detailed task breakdown. Each major task file contains subtasks with numbered hierarchy.

**Numbering Format:**
- **Level 1:** Main categories (1, 2, 3, etc.) - Use `###` heading
- **Level 2:** Subtasks (1.1, 1.2, 2.1, etc.) - Use `- [ ]` with number prefix
- **Level 3:** Detailed steps (1.1.1, 1.1.2, 1.2.1, etc.) - Use `  - [ ]` (indented) with number prefix
- **Level 4+:** Further breakdown if needed (1.1.1.1, etc.) - Use deeper indentation

### 1. {Main Category 1}
- [ ] 1.1 {Subtask description}
  - [ ] 1.1.1 {Detailed step}
  - [ ] 1.1.2 {Detailed step}
  - [ ] 1.1.3 {Verification step}
- [ ] 1.2 {Subtask description}
  - [ ] 1.2.1 {Detailed step}
  - [ ] 1.2.2 {Detailed step}

### 2. {Main Category 2}
- [ ] 2.1 {Subtask description}
  - [ ] 2.1.1 {Detailed step}
  - [ ] 2.1.2 {Detailed step}
- [ ] 2.2 {Subtask description}
  - [ ] 2.2.1 {Detailed step}

### 3. Verification & Testing
- [ ] 3.1 Run type-check
- [ ] 3.2 Test functionality
- [ ] 3.3 Verify against standards
- [ ] 3.4 Update documentation

**Note:** When marking items as complete, use format: `- [x] ✅ 1.1.1 Task description - **Completed: YYYY-MM-DD**`

---

## 📁 Files to Create/Update

```
{File structure or list of files}
```

**Existing Code Status:** (MANDATORY - Document what already exists)
- ✅ `{file-path}` - EXISTS ({status: complete, partial, placeholder})
- ❌ `{file-path}` - MISSING (needs to be created)
- ⚠️ `{file-path}` - EXISTS but needs updates ({what needs updating})

**When updating existing code:** (MANDATORY if Change Type = "Update existing")
- [ ] Audit current implementation (files, callers, config/env) — see [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md)
- [ ] Map desired change to concrete code changes (what to add, change, remove)
- [ ] Remove obsolete code and config (env, defaults, dead branches)
- [ ] Update tests and docs/env per CODE_CHANGE_RULES

**When creating a migration:** (MANDATORY if task adds or changes DB schema)
- [ ] Read all previous migrations (in numeric order) to understand schema, naming, RLS, triggers, and how the project connects to the database — see [MIGRATIONS_AND_CHANGE.md](../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) §4

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

Describe constraints only:
- Rules from [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) that apply
- Architectural boundaries (what layer is affected)
- Compliance or security considerations
- Performance or observability expectations

**DO NOT include:**
- Code or pseudo-code
- Logic or step-by-step implementation
- Function signatures or schemas

**Example:**
- "Controller must use `successResponse` helper (STANDARDS.md)"
- "Service layer must not import Express types (ARCHITECTURE.md)"
- "No PHI in logs (COMPLIANCE.md)"

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [ ] **Data touched?** (Y / N)
  - If Yes → [ ] **RLS verified?** (Y / N)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (Y / N)
  - If Yes → [ ] **Consent + redaction confirmed?** (Y / N)
- [ ] **Retention / deletion impact?** (Y / N)

**Rationale:**
- Ensures global compliance (US, EU, Japan, Middle East)
- Prevents silent violations
- Provides audit trail

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [ ] Functional behavior matches task overview
- [ ] Response contracts are respected (see [CONTRACTS.md](../../Reference/engineering/architecture/CONTRACTS.md))
- [ ] Required tests are added or updated (see [TESTING.md](../../Reference/engineering/development/TESTING.md))
- [ ] Logs contain no PHI (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md))
- [ ] Relevant docs are updated if patterns changed (see [AI_AGENT_RULES.md](../../Reference/engineering/development/AI_AGENT_RULES.md) "Doc Drift Guard")

**See also:** [DEFINITION_OF_DONE.md](../../Reference/engineering/development/DEFINITION_OF_DONE.md) for comprehensive completion checklist.

---

## 🐛 Issues Encountered & Resolved

**Issue:** {Description}  
**Solution:** {How it was resolved}

---

## 📝 Notes

{Any additional notes, learnings, or observations}

---

## 🔗 Related Tasks

- [`task-{prefix}-{NN}-{slug}.md`](./task-{prefix}-{NN}-{slug}.md) — sibling task in this phase
- [Prior phase](../../p{N-1}-{slug}/) — the phase this one builds on (decision lock inherited)

---

**Last Updated:** {YYYY-MM-DD}  
**Completed:** {YYYY-MM-DD} (if applicable)  
**Pattern:** {Pattern or architecture used}  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` (adjust `../` depth per §7 cheat sheet when saved under `Tasks/`)

---

**Version:** 2.3.0 (Phased-plan metadata fields: Program/Phase, Batch, Execution order; relative-link depth note)
