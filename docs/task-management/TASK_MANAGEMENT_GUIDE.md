# Task Management Guide

**Purpose:** This guide defines how tasks are created, tracked, and completed in the Clariva project.

**Location:** `docs/task-management/` - Reference this folder before creating any new tasks.

---

## 🛑 Task Planning vs Execution Boundary (MANDATORY)

Task files exist for **PLANNING** and **TRACKING** only.

**Tasks MUST:**
- Describe **WHAT** needs to be done
- Define acceptance and verification criteria

**Tasks MUST NOT:**
- Contain code or pseudo-code
- Define function signatures or schemas
- Specify exact implementation logic

**All implementation decisions belong in:**
- [RECIPES.md](../Reference/RECIPES.md) - Implementation patterns
- [STANDARDS.md](../Reference/STANDARDS.md) - Coding rules
- [ARCHITECTURE.md](../Reference/ARCHITECTURE.md) - Project structure
- Actual code files

**Rationale:**
- Prevents AI agents from inventing architecture in task files
- Keeps planning high-level and safe
- Maintains separation between "what" (tasks) and "how" (code/docs)

---

## ⛔ Cursor Stop Rules (MANDATORY)

If any of the following are unclear, task creation **MUST STOP** and ask:

- **Data sensitivity:** Is PHI involved? (Y/N)
- **RLS requirement:** Is Row-Level Security required? (Y/N)
- **External services:** Are external AI or APIs involved? (Y/N)
- **Schema/contract changes:** Will database schema or API contracts change? (Y/N)

**Default behavior:**
- Assume **STRICTEST** rules until clarified
- If PHI is possible → treat as PHI
- If RLS is unclear → assume RLS required
- If external service → assume consent + redaction required

**Rationale:**
- Prevents silent compliance violations
- Ensures global-ready task planning (US, EU, Japan, Middle East)
- Provides audit-friendly process proof

---

## 📋 Core Rules

### Rule 1: Date of Completion Tracking (MANDATORY)

**MUST:** When marking a task as complete (checking `[x]`), you MUST also record the date of completion.

**Format:**
```markdown
- [x] ✅ Task description - **Completed: YYYY-MM-DD**
```

**Example:**
```markdown
- [x] ✅ Create database configuration - **Completed: 2025-01-09**
- [x] ✅ Set up Supabase client - **Completed: 2025-01-09**
```

### Rule 2: Task Status Updates

**MUST:** Update task status with completion date when marking as done:

**Status Values:**
- `⏳ PENDING` - Not started
- `🚧 IN PROGRESS` - Currently working on
- `✅ COMPLETED` - Finished (must include completion date)
- `⏸️ BLOCKED` - Cannot proceed (must include reason)
- `❌ CANCELLED` - No longer needed (must include reason)

**Example:**
```markdown
**Status:** ✅ **COMPLETED** - **Completed: 2025-01-09**
```

### Rule 3: Task Document Structure

**MUST:** All task documents follow this structure:

```markdown
# Task Title
## Date - Day X

---

## 📋 Task Overview
[Description]

**Estimated Time:** X hours
**Status:** ⏳ **PENDING**
**Completed:** [Date when completed, if applicable]

---

## ✅ Task Breakdown (Hierarchical)

### 1. Main Category
- [ ] 1.1 Subtask
  - [ ] 1.1.1 Detailed step
  - [ ] 1.1.2 Another step
- [ ] 1.2 Another subtask
  - [ ] 1.2.1 Detailed step

---

## 📝 Notes

[Any notes, issues, or learnings]

---

**Last Updated:** YYYY-MM-DD
**Completed:** YYYY-MM-DD (if applicable)
```

### Rule 4: Hierarchical Task Numbering (MANDATORY)

**MUST:** Use hierarchical numbering for detailed task breakdown within each task file.

**Structure:**
- **Each major task = Separate file** (e.g., `e-task-1-project-setup.md`)
- **Inside each file = Hierarchical subtasks** with numbered breakdown

**Numbering Format:**
- **Level 1:** Main categories (1, 2, 3, etc.) - Use `###` heading
- **Level 2:** Subtasks (1.1, 1.2, 2.1, etc.) - Use `- [ ]` with number prefix
- **Level 3:** Detailed steps (1.1.1, 1.1.2, 1.2.1, etc.) - Use `  - [ ]` (indented) with number prefix
- **Level 4+:** Further breakdown if needed (1.1.1.1, etc.) - Use deeper indentation

**Example:**
```markdown
### 1. Database Setup
- [ ] 1.1 Create database configuration
  - [ ] 1.1.1 Create `src/config/database.ts` file
  - [ ] 1.1.2 Set up Supabase client initialization
  - [ ] 1.1.3 Add connection test function
- [ ] 1.2 Test database connection
  - [ ] 1.2.1 Run connection test
  - [ ] 1.2.2 Verify error handling

### 2. Controller Implementation
- [ ] 2.1 Create health controller
  - [ ] 2.1.1 Create `controllers/health-controller.ts`
  - [ ] 2.1.2 Implement getHealth function with asyncHandler
  - [ ] 2.1.3 Add JSDoc comments
```

**Completion Tracking:**
```markdown
- [x] ✅ 1.1 Create database configuration - **Completed: 2025-01-12**
  - [x] ✅ 1.1.1 Create `src/config/database.ts` file - **Completed: 2025-01-12**
  - [x] ✅ 1.1.2 Set up Supabase client initialization - **Completed: 2025-01-12**
```

---

## 📁 Task Organization

### Daily Plans Structure

Tasks are organized by date in `docs/Development/Daily-plans/YYYY-MM-DD/`:

```
docs/Development/Daily-plans/
├── 2025-01-09/
│   ├── e-task-1-project-setup.md      ← Major Task 1 (separate file)
│   ├── e-task-2-express-server.md     ← Major Task 2 (separate file)
│   ├── e-task-3-database.md            ← Major Task 3 (separate file)
│   └── README.md
└── 2025-01-10/
    ├── e-task-6-new-feature.md
    └── README.md
```

**Structure:**
- **Each major task = Separate file** (e.g., `e-task-1-project-setup.md`)
- **Inside each file = Hierarchical subtasks** with numbered breakdown (1.1, 1.1.1, 1.2, etc.)

### Task Naming Convention

**Format:** `e-task-{number}-{short-description}.md`

- `e-` prefix = Execution task (vs `l-` for learning)
- `{number}` = Sequential task number for that day
- `{short-description}` = Kebab-case description

**Examples:**
- `e-task-1-project-setup.md` - Contains hierarchical subtasks (1.1, 1.1.1, 1.2, etc.)
- `e-task-2-express-server.md` - Contains hierarchical subtasks (2.1, 2.1.1, 2.2, etc.)
- `e-task-3-database.md` - Contains hierarchical subtasks (3.1, 3.1.1, 3.2, etc.)

---

## ✅ Before Creating a New Task

**MANDATORY:** Follow these steps in order before creating any task:

### Step 0: Code Review (MANDATORY - NEW)

**MUST:** Check existing codebase before creating task file to identify:
- ✅ What's already implemented
- ✅ What files already exist
- ✅ What functions/services are already available
- ✅ What patterns are already in use

**How to Check:**
1. **Search codebase** for related files, functions, or patterns
2. **Read existing code** in relevant directories (controllers, services, routes, etc.)
3. **Check for similar implementations** that might already exist
4. **Identify gaps** between what exists and what's needed

**Why This Matters:**
- Prevents creating tasks for already-completed work
- Avoids missing existing implementations
- Reduces duplicate work
- Ensures accurate task scope

**Example:**
```bash
# Before creating "webhook controller" task:
# 1. Search for webhook-related files
find . -name "*webhook*" -type f

# 2. Check if controller already exists
ls backend/src/controllers/webhook-controller.ts

# 3. Check if routes already exist
ls backend/src/routes/webhooks.ts

# 4. Review existing implementation
cat backend/src/controllers/webhook-controller.ts
```

**If Code Already Exists:**
- Mark existing items as ✅ **EXISTS** or ✅ **COMPLETE** in task file
- Only create tasks for missing functionality
- Update task scope to reflect actual work needed

**If the task changes existing behavior or code (not only adds new):**
- **MUST:** Follow [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) during planning and execution
- Use the "Change type: Update existing" option in the task file and complete the CODE_CHANGE_RULES checklist (audit → impact → implement → remove obsolete → tests → docs)

### Step 1: Review Documentation

**MUST:** Review these documents before creating any task:

1. **[TASK_TEMPLATE.md](./TASK_TEMPLATE.md)** - Use this template
2. **[../Reference/STANDARDS.md](../Reference/STANDARDS.md)** - Coding standards
3. **[../Reference/ARCHITECTURE.md](../Reference/ARCHITECTURE.md)** - Project structure
4. **[../Reference/RECIPES.md](../Reference/RECIPES.md)** - Implementation patterns
5. **[../Reference/COMPLIANCE.md](../Reference/COMPLIANCE.md)** - Compliance requirements

---

## 📝 Task Lifecycle

### 1. Task Creation

1. **MANDATORY:** Review existing codebase (see "Before Creating a New Task" → Step 0)
   - Search for related files, functions, patterns
   - Identify what's already implemented
   - Document existing code status in task file
2. Review [TASK_TEMPLATE.md](./TASK_TEMPLATE.md)
3. Check existing tasks in daily plans folder (avoid duplicates)
4. Create task file using template
5. **MUST:** Include "Current State" section documenting existing code
6. Set initial status: `⏳ PENDING` (or `⏳ PENDING (Partially Complete)` if code exists)
7. Add to daily plan README.md

### 2. Task Execution

1. Update status to `🚧 IN PROGRESS` when starting
2. **If the task changes existing code:** Complete the [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) checklist (audit → impact → implement → remove obsolete → tests → docs)
3. **If the task involves creating a new migration:** Read all previous migrations (in numeric order) before writing the migration to understand schema, naming, RLS, triggers, and how the project connects to the database — see [MIGRATIONS_AND_CHANGE.md](../Reference/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) §4
4. Work through hierarchical subtasks (1.1, 1.1.1, etc.)
5. Check off items as you complete them (at any level)
6. **MUST:** Add completion date when checking items
7. **SHOULD:** Mark parent task complete when all children are done
8. Document any issues or learnings in Notes section

### 3. Task Completion

1. Mark all hierarchical subtasks as complete with dates (1.1, 1.1.1, etc.)
2. Verify all parent tasks are marked complete when children are done
3. Update status to `✅ COMPLETED`
4. Add completion date to task header
5. Update "Last Updated" date
6. Add "Completed" date to footer
7. Document any final notes or learnings

### 4. Task Review

1. Verify all checklist items are complete
2. Ensure all completion dates are recorded
3. Update related documentation if needed
4. Mark task as reviewed

---

## 🎯 Best Practices

### Hierarchical Task Structure

**When to use hierarchical structure:**
- **SHOULD:** Use for tasks that take >1 hour
- **SHOULD:** Use for complex tasks with multiple steps
- **SHOULD:** Use when task has distinct phases or categories
- **MAY:** Use for simple tasks if it helps clarity

**Level depth recommendations:**
- **Level 1:** Main categories (3-7 categories per task)
- **Level 2:** Subtasks (2-5 subtasks per category)
- **Level 3:** Detailed steps (2-4 steps per subtask)
- **Level 4+:** Only if absolutely necessary for very complex tasks

**Benefits:**
1. **Clarity:** Easy to see what needs to be done at each level
2. **Progress Tracking:** Can track completion at any level (1.1, 1.1.1, etc.)
3. **Organization:** Logical grouping of related tasks
4. **Scalability:** Can break down complex tasks into manageable pieces
5. **Documentation:** Self-documenting task structure

### Checklist Items

- **MUST:** Be specific and actionable
- **MUST:** Include completion date when checked
- **MUST:** Use hierarchical numbering (1.1, 1.1.1, etc.)
- **SHOULD:** Break large tasks into smaller items
- **SHOULD:** Include verification steps

**Good Example (Hierarchical):**
```markdown
### 1. Database Setup
- [x] ✅ 1.1 Create database configuration - **Completed: 2025-01-09**
  - [x] ✅ 1.1.1 Create `src/config/database.ts` file - **Completed: 2025-01-09**
  - [x] ✅ 1.1.2 Set up Supabase client initialization - **Completed: 2025-01-09**
- [x] ✅ 1.2 Test database connection - **Completed: 2025-01-09**
  - [x] ✅ 1.2.1 Run connection test - **Completed: 2025-01-09**
  - [x] ✅ 1.2.2 Verify error handling - **Completed: 2025-01-09**
```

**Bad Example (Flat, vague):**
```markdown
- [x] Database stuff
- [ ] More database work
```

### Status Updates

- **MUST:** Update status when task state changes
- **MUST:** Include completion date with status
- **SHOULD:** Update status at least once per day when working on task

### Notes Section

- **SHOULD:** Document issues encountered and solutions
- **SHOULD:** Record learnings for future reference
- **SHOULD:** Note any deviations from plan
- **SHOULD:** Include links to related resources

---

## 📊 Task Tracking

### Daily Review

At the end of each day:
1. Review all tasks worked on
2. Update statuses and completion dates
3. Document progress in Notes
4. Plan next day's tasks

### Weekly Review

At the end of each week:
1. Review all completed tasks
2. Verify completion dates are recorded
3. Update monthly plan with progress
4. Identify any blocked or cancelled tasks

---

## 🔗 Related Documentation

- **[TASK_TEMPLATE.md](./TASK_TEMPLATE.md)** - Template for creating new tasks
- **[CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md)** - Rules for tasks that change existing code (audit, impact, remove obsolete, tests, docs)
- **[../Reference/STANDARDS.md](../Reference/STANDARDS.md)** - Coding standards
- **[../Reference/ARCHITECTURE.md](../Reference/ARCHITECTURE.md)** - Project structure
- **[../Reference/RECIPES.md](../Reference/RECIPES.md)** - Implementation patterns
- **[../Reference/COMPLIANCE.md](../Reference/COMPLIANCE.md)** - Compliance requirements
- **[../Development/Monthly-plans/](../Development/Monthly-plans/)** - Monthly development plans

---

## ⚠️ Important Reminders

1. **ALWAYS** check existing codebase before creating task files (MANDATORY)
2. **ALWAYS** document existing code status in "Current State" section
3. **ALWAYS** add completion date when checking off items (at any hierarchical level)
4. **ALWAYS** use hierarchical numbering (1.1, 1.1.1, 1.2, etc.) for task breakdown
5. **ALWAYS** update task status when state changes
6. **ALWAYS** review task template before creating new tasks
7. **ALWAYS** reference STANDARDS.md, ARCHITECTURE.md, RECIPES.md, and COMPLIANCE.md
8. **When a task changes existing code:** ALWAYS follow [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md)
9. **NEVER** mark a task complete without recording the date
10. **NEVER** create tasks for already-implemented functionality without documenting it
11. **SHOULD** mark parent tasks complete when all children are done

---

**Last Updated:** 2026-01-30  
**Version:** 2.3.0 (Added CODE_CHANGE_RULES for tasks that change existing code)
