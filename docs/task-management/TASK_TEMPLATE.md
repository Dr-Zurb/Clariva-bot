# Task {Number}: {Task Title}
## {Date} - Day {X}

---

## 📋 Task Overview

{Brief description of what this task accomplishes}

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
- [STANDARDS.md](../../Reference/STANDARDS.md) - Coding rules and requirements
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Project structure
- [RECIPES.md](../../Reference/RECIPES.md) - Implementation patterns
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Compliance requirements

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
- [ ] Read all previous migrations (in numeric order) to understand schema, naming, RLS, triggers, and how the project connects to the database — see [MIGRATIONS_AND_CHANGE.md](../../Reference/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) §4

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

Describe constraints only:
- Rules from [STANDARDS.md](../../Reference/STANDARDS.md) that apply
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
- [ ] Response contracts are respected (see [CONTRACTS.md](../../Reference/CONTRACTS.md))
- [ ] Required tests are added or updated (see [TESTING.md](../../Reference/TESTING.md))
- [ ] Logs contain no PHI (see [COMPLIANCE.md](../../Reference/COMPLIANCE.md))
- [ ] Relevant docs are updated if patterns changed (see [AI_AGENT_RULES.md](../../Reference/AI_AGENT_RULES.md) "Doc Drift Guard")

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) for comprehensive completion checklist.

---

## 🐛 Issues Encountered & Resolved

**Issue:** {Description}  
**Solution:** {How it was resolved}

---

## 📝 Notes

{Any additional notes, learnings, or observations}

---

## 🔗 Related Tasks

- [Task X](./e-task-x-description.md)
- [Task Y](./e-task-y-description.md)

---

**Last Updated:** {YYYY-MM-DD}  
**Completed:** {YYYY-MM-DD} (if applicable)  
**Related Learning:** `docs/learning/{date}/l-task-{number}-{description}.md`  
**Pattern:** {Pattern or architecture used}  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.2.0 (Change type and CODE_CHANGE_RULES checklist for updating existing code)
