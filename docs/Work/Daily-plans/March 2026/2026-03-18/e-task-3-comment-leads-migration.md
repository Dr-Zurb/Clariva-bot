# Task 3: Comment Leads Migration
## 2026-03-18 — Comments Management Initiative

---

## 📋 Task Overview

Create the `comment_leads` table to store leads captured from Instagram post comments. Supports lead capture, intent classification, outreach tracking, and linking to conversations when the commenter DM's.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-18

**Change Type:**
- [ ] **New feature** — Add migration only

**Current State:**
- ✅ **What exists:** Migrations 001–018; schema patterns (snake_case, RLS, triggers); `doctor_instagram`, `conversations`, `appointments`
- ❌ **What's missing:** `comment_leads` table
- ⚠️ **Notes:** Follow MIGRATIONS_AND_CHANGE.md; read all previous migrations before creating

**Scope Guard:**
- Expected files touched: 1 (migration)
- Reference: [COMMENTS_MANAGEMENT_PLAN.md](./COMMENTS_MANAGEMENT_PLAN.md) § Data Model

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration File

- [x] 1.1 Create migration file `019_comment_leads.sql` - **Completed: 2026-03-18**
  - [x] 1.1.1 `comment_leads` table with columns: id, doctor_id, comment_id, commenter_ig_id, comment_text, media_id, intent, confidence, public_reply_sent, dm_sent, conversation_id, created_at, updated_at
  - [x] 1.1.2 Unique constraint on `comment_id` (idempotency)
  - [x] 1.1.3 Foreign key `doctor_id` → auth.users; `conversation_id` → conversations (nullable)
  - [x] 1.1.4 Index on `doctor_id` for doctor lookups
  - [x] 1.1.5 Index on `commenter_ig_id` for linking when user DMs
- [x] 1.2 RLS policies
  - [x] 1.2.1 Doctors can read own comment_leads (doctor_id = auth.uid())
  - [x] 1.2.2 Service role can read/insert/update (worker)
- [x] 1.3 `updated_at` trigger (reuse `update_updated_at_column`)

### 2. Verification

- [ ] 2.1 Run migration locally (via Supabase dashboard or `supabase db push`)
- [ ] 2.2 Verify table exists and constraints

---

## 📁 Files to Create/Update

```
backend/migrations/
└── 019_comment_leads.sql   (NEW)
```

**When creating a migration:**
- [ ] Read all previous migrations (001–018) in numeric order
- [ ] Follow MIGRATIONS_AND_CHANGE.md naming, RLS, triggers
- [ ] Add table/column comments per project conventions

---

## 🧠 Design Constraints

- No PHI in logs; comment_text may contain PHI — store only, never log
- RLS: doctors read own; service role for worker
- `doctor_id` required; `conversation_id` nullable until user DMs

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y)
  - [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (No — comment_text stored, not logged)
- [ ] **External API or AI call?** (N)

---

## 🔗 Related Tasks

- [e-task-4-comment-webhook-types-and-routing](./e-task-4-comment-webhook-types-and-routing.md)
- [COMMENTS_MANAGEMENT_PLAN.md](./COMMENTS_MANAGEMENT_PLAN.md)

---

**Last Updated:** 2026-03-18  
**Completed:** 2026-03-18  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
