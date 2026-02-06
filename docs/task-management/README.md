# Task Management

This folder contains task management documentation and templates.

**Purpose:** Standardize task creation, tracking, and completion across the project.

---

## 📚 Documentation

### Core Documents

1. **[TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md)** - Complete guide for task management
   - Rules and requirements
   - Task lifecycle
   - Best practices
   - Tracking guidelines

2. **[TASK_TEMPLATE.md](./TASK_TEMPLATE.md)** - Template for creating new tasks
   - Standard structure
   - Required sections
   - Format guidelines

3. **[CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md)** - Rules for tasks that **change** existing code
   - When to use: any task that updates, refactors, or removes existing behavior (not only new feature addition)
   - Audit current implementation → map impact → implement → remove obsolete code → update tests and docs
   - Use in addition to the guide when the task is "Update existing"

---

## 🎯 Quick Start

### Before Creating a Task

1. **MANDATORY:** Check existing codebase first
   - Search for related files, functions, patterns
   - Identify what's already implemented
   - Document existing code status
2. **Read** [TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md)
3. **Use** [TASK_TEMPLATE.md](./TASK_TEMPLATE.md) as starting point
4. **Review** reference documentation:
   - [STANDARDS.md](../Reference/STANDARDS.md)
   - [ARCHITECTURE.md](../Reference/ARCHITECTURE.md)
   - [RECIPES.md](../Reference/RECIPES.md)
   - [COMPLIANCE.md](../Reference/COMPLIANCE.md)

### Key Rules

1. **MUST:** Check existing codebase before creating task files
2. **MUST:** Add completion date when marking tasks complete
3. **MUST:** Use hierarchical numbering (1.1, 1.1.1, 1.2, etc.) for task breakdown
4. **MUST:** Update task status when state changes
5. **MUST:** Use template when creating new tasks
6. **MUST:** Reference standards before implementation
7. **MUST:** Document existing code status in "Current State" section
8. **When a task updates existing code:** MUST follow [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) (audit, impact, remove obsolete, tests, docs)
9. **When creating a migration:** MUST read all previous migrations (in order) to understand schema, naming, RLS, triggers, and how the project connects to the database — see [MIGRATIONS_AND_CHANGE.md](../Reference/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) §4

### Task Structure

- **Each major task = Separate file** (e.g., `e-task-1-project-setup.md`)
- **Inside each file = Hierarchical subtasks** with numbered breakdown:
  - Level 1: Main categories (1, 2, 3, etc.)
  - Level 2: Subtasks (1.1, 1.2, 2.1, etc.)
  - Level 3: Detailed steps (1.1.1, 1.1.2, 1.2.1, etc.)

---

## 📁 Task Locations

- **Daily Tasks:** `docs/Development/Daily-plans/YYYY-MM-DD/`
- **Monthly Plans:** `docs/Development/Monthly-plans/`
- **Learning Tasks:** `docs/Learning/YYYY-MM-DD/`

### Current active plan: MVP completion (2026-02-06)

Detailed implementation tasks for the two MVP must-haves (Connect Instagram + Doctor Setup) live in:

- **Daily plan:** [docs/Development/Daily-plans/2026-02-06/README.md](../Development/Daily-plans/2026-02-06/README.md)
- **Scope and acceptance criteria:** [docs/Development/Future Planning/MVP completion planning.md](../Development/Future%20Planning/MVP%20completion%20planning.md)

Tasks: e-task-1 through e-task-6 (Connect Instagram), e-task-7 through e-task-12 (Doctor Setup). Use [TASK_TEMPLATE.md](./TASK_TEMPLATE.md) and [TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md) when executing them.

---

## 🔗 Related Documentation

- [Task Management Guide](./TASK_MANAGEMENT_GUIDE.md)
- [Task Template](./TASK_TEMPLATE.md)
- [Code Change Rules](./CODE_CHANGE_RULES.md) — when changing existing code
- [Coding Standards](../Reference/STANDARDS.md)
- [Architecture Guide](../Reference/ARCHITECTURE.md)
- [Recipes](../Reference/RECIPES.md)
- [Compliance Guide](../Reference/COMPLIANCE.md)

---

**Last Updated:** 2026-01-30  
**Version:** 2.3.0 (Added CODE_CHANGE_RULES for tasks that change existing code)
