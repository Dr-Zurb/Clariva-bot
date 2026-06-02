# Learning Topics - Documentation & Improvements
## Task #7: Post Week 2 Polish

---

## 📚 What Are We Learning Today?

Today we're learning about **Documentation & Improvements** — how to keep reference docs in sync after a delivery phase, close documentation gaps, and fix subtle schema issues. Think of it like **updating the operations manual after the receptionist desk is fully staffed** — we align the monthly plan, RLS policies, DB schema, and architecture docs with what was actually built so future developers (and AI agents) have a single source of truth.

We'll learn about:
1. **Monthly plan alignment** – Mark completed phases DONE; keep status and deliverables in sync
2. **RLS policies documentation** – Document access rules for patients, conversations, messages
3. **DB_SCHEMA completeness** – Add conversations and messages; ensure all tables are documented
4. **ARCHITECTURE accuracy** – Keep services, config, and types trees current
5. **Migration index naming** – Avoid duplicate index names; fix conflicts with corrective migrations
6. **AI caching documentation** – Document in-memory vs Redis for multi-instance scaling
7. **Doc drift guard** – Verify links, run checks, record completion

---

## 🎓 Topic 1: Monthly Plan Alignment

### Why It Matters

The monthly plan is the high-level roadmap. When a week (e.g. Week 2) is complete, status must be updated so:
- Progress is visible at a glance
- Blocked or redundant work is avoided
- Handover to the next phase is clear

### What to Update

- **Status** – Change `⏳ PENDING` to `✅ DONE` for the completed week
- **Checkboxes** – Mark deliverables complete where applicable
- **Completion date** – Add when the week was finished

### Single Source of Truth

Daily plans (e.g. `2026-01-30/README.md`) track granular tasks; the monthly plan tracks phases. Both should agree on "Week 2 complete."

**Think of it like:**
- **Monthly plan** = "Week 2 receptionist training is done."
- **Daily plan** = "Tasks 1–6 completed on 2026-01-30."

---

## 🎓 Topic 2: RLS Policies Documentation

### What RLS_POLICIES.md Owns

- Row-level security rules
- Who can read/write what (doctor, service role, admin)
- JWT claims used in policies

### Tables That Need Documentation

After Week 2, these tables have data but may lack explicit RLS docs:

- **patients** – Doctor-only access (via `conversations.doctor_id` join) or service role for webhook processing
- **conversations** – Doctor owns via `doctor_id`; service role for system operations
- **messages** – Access via `conversation_id` → `doctor_id`; service role for storage

### MVP vs Future

MVP may use service role for all writes (webhook worker). Document both:
- **Current:** Service role used for webhook processing
- **Intended:** Doctor-scoped RLS for future multi-tenant or user-facing APIs

### Why It Matters

RLS is the primary security mechanism. Undocumented policies = unclear access model = compliance and security risk.

**Think of it like:**
- **RLS docs** = "Who has keys to which filing cabinets."

---

## 🎓 Topic 3: DB_SCHEMA Completeness

### What DB_SCHEMA.md Owns

- Tables, columns, types, relationships, indexes
- "Never store X" notes
- Migration references (e.g. "migration 004")

### Tables to Add

- **conversations** – Links doctor, patient, platform; stores `metadata` (state) from migration 004
- **messages** – Per-conversation messages; content, sender_type, intent

### Why Schema Docs Matter

- **AI agents** – DB_SCHEMA says "do not invent columns"
- **Developers** – Quick reference without reading migrations
- **Compliance** – Clear record of what data is stored where

### Alignment Rule

DB_SCHEMA must match migrations. When adding a table, pull columns from `001_initial_schema.sql` (or the migration that created it) and note any later migrations that add columns.

**Think of it like:**
- **DB_SCHEMA** = The blueprint of the filing system.

---

## 🎓 Topic 4: ARCHITECTURE Accuracy

### What ARCHITECTURE.md Owns

- Project structure (folders, files)
- Layer boundaries (routes → controllers → services)
- Import rules (who can import from whom)

### Keep the Tree Current

When new services or types are added, update the structure tree:
- **services/** – ai-service, collection-service, consent-service
- **config/** – openai.ts
- **types/** – ai.ts, conversation.ts

### Why It Matters

Outdated trees mislead developers and AI agents. "Where does intent detection live?" should be answerable from ARCHITECTURE.

**Think of it like:**
- **ARCHITECTURE** = The org chart of the codebase.

---

## 🎓 Topic 5: Migration Index Naming

### The Problem

PostgreSQL index names must be unique. If migration 004 has:

```sql
CREATE UNIQUE INDEX idx_patients_platform_external_id ON patients (platform, platform_external_id) ...;
CREATE INDEX idx_patients_platform_external_id ON patients(platform_external_id);
```

The second `CREATE INDEX` uses the same name as the first → conflict.

### Fix Options

1. **Migration 007 (corrective)** – Drop the duplicate index if it exists, create with a new name (e.g. `idx_patients_platform_external_id_col`)
2. **Fix 004 directly** – If 004 has not been applied in any environment, edit 004 to use distinct names

### Naming Convention

- Composite index: `idx_<table>_<col1>_<col2>`
- Single-column: `idx_<table>_<col>` or `idx_<table>_<col>_col` to avoid collision

**Think of it like:**
- **Index names** = Labels on drawers; no two drawers can have the same label.

---

## 🎓 Topic 6: AI Caching Documentation

### In-Memory vs Redis

- **Intent cache (ai-service)** – In-memory `Map`; per-process; not shared across instances
- **preConsentStore (collection-service)** – In-memory; per-process; PHI held until consent

### Multi-Instance Implication

When scaling to multiple workers or app instances:
- Intent cache hits are per-process → same message may hit OpenAI more than once across instances
- preConsentStore is per-process → collected PHI in one worker is not visible to another

### What to Document

- **Current:** In-memory; sufficient for single-instance MVP
- **Future:** Redis (or shared store) required for multi-worker / horizontal scaling
- **TTL:** Document or implement TTL for preConsentStore to avoid orphaned PHI

**Think of it like:**
- **In-memory** = Sticky notes on one desk.
- **Redis** = Shared bulletin board all desks can see.

---

## 🎓 Topic 7: Doc Drift Guard

### Verification Checklist

- Run type-check and lint (no new errors)
- Verify doc links resolve (no broken `[text](path)` links)
- Update README or daily plan if completion affects them
- Record completion date on the task

### When to Run This

After any delivery phase or major feature. Documentation debt compounds; small, frequent updates beat big catch-ups.

**Think of it like:**
- **Doc drift guard** = "Did we update the manual after changing the process?"

---

## 📝 Summary

### Key Takeaways

1. **Monthly plan** – Mark completed phases DONE; keep status in sync with daily plans.
2. **RLS_POLICIES** – Document patients, conversations, messages; note MVP vs intended policies.
3. **DB_SCHEMA** – Add conversations and messages; align with migrations.
4. **ARCHITECTURE** – Keep services, config, and types trees current.
5. **Migration indexes** – Unique names; use corrective migration or fix source if not yet applied.
6. **AI caching** – Document in-memory limitation; Redis for multi-instance.
7. **Doc drift guard** – Verify links, run checks, record completion.

### Next Steps

After completing this task:

1. Reference docs are aligned with Week 2 deliverables.
2. Future tasks (e.g. Week 3) can rely on accurate schema and architecture.
3. Deferred items (AI rate limiting, cost monitoring, lint cleanup) remain in backlog.

### Remember

- **Documentation is code** – Treat it with the same care as implementation.
- **Single source of truth** – DB_SCHEMA, RLS_POLICIES, ARCHITECTURE are authoritative.
- **Doc after ship** – Update docs when you ship; don't let them drift.

---

**Last Updated:** 2026-01-30  
**Related Task:** [Task 7: Documentation & Improvements](../../Work/Daily-plans/2026-01-30/e-task-7-documentation-and-improvements.md)  
**Reference Documentation:**
- [DB_SCHEMA.md](../../Reference/engineering/architecture/DB_SCHEMA.md)
- [RLS_POLICIES.md](../../Reference/engineering/compliance/RLS_POLICIES.md)
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md)
- [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [MIGRATIONS_AND_CHANGE.md](../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)
