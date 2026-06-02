# Task Management Guide

**Purpose:** How tasks are created, tracked, and completed in the Clariva project.

**Location:** `docs/Work/process/` — reference this folder before creating any new tasks.

> **Big plans are phased.** For anything bigger than a ~1-week batch, the work is split into phases that each live in one program folder. **Read [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md) before creating a plan folder, a phase folder, or the next phase of an in-flight program** — it owns the folder structure and the cross-day rule (later phases go in the original program folder, not the new day's date). This guide owns the per-task lifecycle below.

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
- [RECIPES.md](../../Reference/engineering/development/RECIPES.md) - Implementation patterns
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - Coding rules
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Project structure
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

### Rule 1: Record completion dates (MANDATORY)

When you check `[x]`, record the date — at **every** hierarchical level. Never mark a task complete without it.

```markdown
- [x] ✅ 1.1 Create database configuration - **Completed: 2025-01-09**
```

### Rule 2: Status vocabulary

- `⏳ PENDING` — not started
- `🚧 IN PROGRESS` — currently working on
- `✅ COMPLETED` — finished (must include completion date)
- `⏸️ BLOCKED` — cannot proceed (must include reason)
- `❌ CANCELLED` — no longer needed (must include reason)

### Rule 3: Task document structure

Every task file follows the skeleton in **[TASK_TEMPLATE.md](./TASK_TEMPLATE.md)** — the canonical copy-paste version: Overview + status → hierarchical Task Breakdown → Notes → footer dates. Don't reinvent the shape.

### Rule 4: Hierarchical task numbering (MANDATORY)

One major task = one file (`task-<prefix>-NN-<slug>.md`). Inside the file, break work into numbered subtasks:

- **Level 1** — main categories: `### 1.`, `### 2.` (3–7 per task)
- **Level 2** — subtasks: `- [ ] 1.1` (2–5 per category)
- **Level 3** — detailed steps: `  - [ ] 1.1.1`
- **Level 4+** — only if a complex task genuinely needs it

```markdown
### 1. Database Setup
- [ ] 1.1 Create database configuration
  - [ ] 1.1.1 Create `src/config/database.ts`
  - [ ] 1.1.2 Set up Supabase client initialization
- [ ] 1.2 Test database connection
```

Reserve hierarchy for tasks taking >1 hour or with distinct phases; a one-step task can stay flat.

---

## 📁 Task Organization

> **Folder structure is owned by [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md).** The summary below is enough to place a task file correctly; read that guide before creating a new program or phase folder.

### Daily Plans Structure

Tasks live in dated **batch** folders. A batch is one phase of a program. Big programs are split into phases; each phase is a `p{N}-<slug>/` subfolder of the program folder, and the program folder lives under the date its **first** phase was planned:

```
docs/Work/Daily-plans/<Month YYYY>/<DD-MM-YYYY>/
└── <program-slug>/                     ← ONE folder per program (e.g. cockpit-v3/)
    ├── README.md                       ← phase index (execute top-to-bottom)
    ├── p0-<slug>/
    │   ├── plan-p0-<program>-<slug>-batch.md   ← batch plan (what + why)
    │   └── Tasks/
    │       ├── EXECUTION-ORDER-p0-<program>-<slug>.md   ← who-runs-what-when
    │       └── task-<prefix>-NN-<slug>.md              ← individual task files
    └── p1-<slug>/ …                    ← next phase (same program folder, even if planned later)
```

A small, self-contained batch (< ~1 week, one acceptance gate) skips the `pN-` subfolders and puts `Tasks/` directly under the program folder.

**Key rules (full detail in [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md)):**
- **One program = one folder.** Every phase is a `p{N}-<slug>/` subfolder inside it.
- **Phases planned on later days still go in the ORIGINAL program folder**, not under the later day's date. The later day's `README.md` links across to it.
- **Each task = a separate file** in the phase's `Tasks/` folder; inside each file = hierarchical subtasks (1.1, 1.1.1, …).

### Task Naming Convention

**Format:** `task-<prefix>-NN-<short-description>.md`

- `<prefix>` = the program's short task prefix, stable across phases (e.g. `cv3d`, `brr`, `cpf`, `rcp`).
- `NN` = task number, **continuous across phases** for traceability (Phase 1 = `brr-01..04`, Phase 2 = `brr-05..09`, …). Don't restart at 01 each phase.
- `<short-description>` = kebab-case theme of the task.

**Examples:**
- `task-cv3d-01-tab-drag-sources-and-dnd-context.md`
- `task-brr-10-detail-drawer.md`
- `task-rcp-01-persist-once-state-sink.md`

> Older batches use a legacy `e-task-{number}-{desc}.md` naming (`e-` = execution, `l-` = learning). New work uses the `task-<prefix>-NN-` form above.

---

## ✅ Before Creating a New Task

Do these in order:

**Step 0 — Review the existing codebase (MANDATORY).** Search for related files, functions, and patterns; read the relevant controllers / services / routes; identify the gap between what exists and what's actually needed.
- If code already exists → mark it ✅ **EXISTS** in the task file's "Current State" section and scope the task to only the missing work.
- If the task **changes existing behaviour** (not pure-additive) → follow **[CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md)** (audit → impact → implement → remove obsolete → tests → docs).

**Step 1 — Review the canonical docs before writing:**
[TASK_TEMPLATE.md](./TASK_TEMPLATE.md) ·
[STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) ·
[ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) ·
[RECIPES.md](../../Reference/engineering/development/RECIPES.md) ·
[COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 📝 Task Lifecycle

**1. Creation** — Do Step 0 + Step 1 above, then create the file from the template with a "Current State" section, set status `⏳ PENDING` (or `⏳ PENDING (Partially Complete)` if code already exists), and link it in the batch `README.md`.

**2. Execution**
1. Status → `🚧 IN PROGRESS`.
2. **If the task changes existing code:** complete the [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) checklist (audit → impact → implement → remove obsolete → tests → docs).
3. **If the task adds a migration:** read all previous migrations in numeric order first — to understand schema, naming, RLS, triggers, and DB wiring. See [MIGRATIONS_AND_CHANGE.md](../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) §4.
4. Work through subtasks (1.1, 1.1.1, …), checking items off **with completion dates**; mark a parent done when its children are.
5. Record issues / learnings in the Notes section.

**3. Completion** — All subtasks checked with dates → status `✅ COMPLETED`; add the completion date to the header + footer and bump "Last Updated".

**4. Review** — Verify every item and date is recorded, and update any related documentation the change affects.

---

## 🎯 Best Practices

- **Checklist items:** specific, actionable, and verifiable — one concrete outcome each. Avoid vague rows like "database stuff".
- **Status:** update the moment state changes; include the date with `✅ COMPLETED`, and a reason with `⏸️ BLOCKED` / `❌ CANCELLED`.
- **Notes:** capture issues + their solutions, deviations from the plan, and links to related work for future reference.

---

## 📊 Review cadence

Update statuses and completion dates as you go — don't batch them at end of day. During review, promote anything parked in your capture inbox ([`capture/inbox.md`](../capture/inbox.md)) into a real Daily-plan / Taskmaster task; the inbox is **not** the execution backlog.

---

## 🔗 Related Documentation

- **[PHASED-PLANS-GUIDE.md](./PHASED-PLANS-GUIDE.md)** - Folder structure for phased plans + the cross-day rule (read before creating a plan/phase folder)
- **[TASK_TEMPLATE.md](./TASK_TEMPLATE.md)** - Template for creating new tasks
- **[EXECUTION-ORDER-GUIDELINES.md](./EXECUTION-ORDER-GUIDELINES.md)** - Wave/lane ordering within a batch
- **[AGENT-EXECUTION-EFFICIENCY-GUIDE.md](./AGENT-EXECUTION-EFFICIENCY-GUIDE.md)** - Model selection + cost per task
- **[CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md)** - Rules for tasks that change existing code (audit, impact, remove obsolete, tests, docs)
- **[../../Reference/engineering/development/STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)** - Coding standards
- **[../../Reference/engineering/architecture/ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md)** - Project structure
- **[../../Reference/engineering/development/RECIPES.md](../../Reference/engineering/development/RECIPES.md)** - Implementation patterns
- **[../../Reference/engineering/compliance/COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)** - Compliance requirements

---

## ⚠️ Non-negotiables

- **NEVER** put code, signatures, or schemas in a task file (planning/execution boundary above).
- **NEVER** mark a task complete without recording the completion date.
- **NEVER** create a task for already-built work without documenting it as ✅ EXISTS.
- **ALWAYS** clear the Cursor Stop Rules (PHI / RLS / external / schema) before creating the task.
- **When a task changes existing code:** ALWAYS follow [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md).

---

**Last Updated:** 2026-05-31  
**Version:** 2.5.0 (De-duplicated the codebase-review and numbering rules to one place each; trimmed generic PM padding — Benefits list, Daily/Weekly review, repeated examples)
