# Task Management Guide

**Purpose:** This guide defines how tasks are created, tracked, and completed in the Clariva project.

**Location:** `docs/task-management/` - Reference this folder before creating any new tasks.

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

**MUST:** Review these documents before creating any task:

1. **[TASK_TEMPLATE.md](./TASK_TEMPLATE.md)** - Use this template
2. **[../Reference/STANDARDS.md](../Reference/STANDARDS.md)** - Coding standards
3. **[../Reference/ARCHITECTURE.md](../Reference/ARCHITECTURE.md)** - Project structure
4. **[../Reference/RECIPES.md](../Reference/RECIPES.md)** - Implementation patterns
5. **[../Reference/COMPLIANCE.md](../Reference/COMPLIANCE.md)** - Compliance requirements

---

## 📝 Task Lifecycle

### 1. Task Creation

1. Review [TASK_TEMPLATE.md](./TASK_TEMPLATE.md)
2. Check existing tasks in daily plans folder
3. Create task file using template
4. Set initial status: `⏳ PENDING`
5. Add to daily plan README.md

### 2. Task Execution

1. Update status to `🚧 IN PROGRESS` when starting
2. Work through hierarchical subtasks (1.1, 1.1.1, etc.)
3. Check off items as you complete them (at any level)
4. **MUST:** Add completion date when checking items
5. **SHOULD:** Mark parent task complete when all children are done
6. Document any issues or learnings in Notes section

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
- **[../Reference/STANDARDS.md](../Reference/STANDARDS.md)** - Coding standards
- **[../Reference/ARCHITECTURE.md](../Reference/ARCHITECTURE.md)** - Project structure
- **[../Reference/RECIPES.md](../Reference/RECIPES.md)** - Implementation patterns
- **[../Reference/COMPLIANCE.md](../Reference/COMPLIANCE.md)** - Compliance requirements
- **[../Development/Monthly-plans/](../Development/Monthly-plans/)** - Monthly development plans

---

## ⚠️ Important Reminders

1. **ALWAYS** add completion date when checking off items (at any hierarchical level)
2. **ALWAYS** use hierarchical numbering (1.1, 1.1.1, 1.2, etc.) for task breakdown
3. **ALWAYS** update task status when state changes
4. **ALWAYS** review task template before creating new tasks
5. **ALWAYS** reference STANDARDS.md, ARCHITECTURE.md, RECIPES.md, and COMPLIANCE.md
6. **NEVER** mark a task complete without recording the date
7. **SHOULD** mark parent tasks complete when all children are done

---

**Last Updated:** 2025-01-12  
**Version:** 2.0.0 (Added hierarchical task structure)
