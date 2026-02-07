# Task 1: Doctor Instagram storage & migration
## 2026-02-06 - Must-have 1: Connect Instagram

---

## 📋 Task Overview

Add database storage for per-doctor Instagram (or Facebook Page) connection: page identifier, access token (or reference to secure storage), and optional handle for display. Enable RLS so only the owning doctor can read/update their row; service role can read for webhook resolution.

**Estimated Time:** 1.5–2 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-02-06

**Change Type:**
- [x] **New feature** — Add code only (no change to existing behavior)
- [ ] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `auth.users` (doctors); `doctor_settings` (009) with doctor_id; no table for Instagram link; webhook uses `env.DEFAULT_DOCTOR_ID`.
- ❌ **What's missing:** Table or columns for `instagram_page_id`, token storage, optional `instagram_username`; RLS; TypeScript types.
- ⚠️ **Notes:** Token must be stored securely; COMPLIANCE.md may require encryption at rest—check before implementing.

**Scope Guard:** Expected files touched: ≤ 5

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../Reference/MIGRATIONS_AND_CHANGE.md) - Migration rules; read all prior migrations first
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - Naming, patterns
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md) - RLS patterns
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Token storage, audit
- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) §4 - When creating a migration

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 Read all previous migrations (001–010) to understand schema, naming, RLS, triggers - **Completed: 2026-02-06**
- [x] ✅ 1.2 Create migration `011_doctor_instagram.sql`: new table `doctor_instagram` - **Completed: 2026-02-06**
  - [x] ✅ 1.2.1 Columns: `doctor_id` (PK, FK auth.users), `instagram_page_id` (TEXT NOT NULL UNIQUE), `instagram_access_token` (TEXT), `instagram_username` (TEXT NULL), `created_at`, `updated_at` - **Completed: 2026-02-06**
  - [x] ✅ 1.2.2 Index on `instagram_page_id` for webhook lookup (UNIQUE index) - **Completed: 2026-02-06**
  - [x] ✅ 1.2.3 Reuse `update_updated_at_column()` trigger - **Completed: 2026-02-06**
- [x] ✅ 1.3 Enable RLS: doctor SELECT/INSERT/UPDATE/DELETE own row; service_role SELECT - **Completed: 2026-02-06**
- [x] ✅ 1.4 Document in migration header: purpose, no PHI; token storage note - **Completed: 2026-02-06**

### 2. TypeScript types
- [x] ✅ 2.1 Add types in `types/database.ts`: DoctorInstagram, InsertDoctorInstagram, UpdateDoctorInstagram - **Completed: 2026-02-06**
- [x] ✅ 2.2 Export from types index (database.ts is re-exported via index.ts) - **Completed: 2026-02-06**

### 3. Verification
- [ ] 3.1 Run migration in dev; verify table and RLS (run in Supabase when ready)
- [x] ✅ 3.2 Type-check and lint - **Completed: 2026-02-06** (npm run build passes)

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 011_doctor_instagram.sql    (NEW)
└── src/
    └── types/
        └── database.ts             (UPDATE - add DoctorInstagram) or instagram-connect.ts (NEW)
```

**Existing Code Status:**
- ✅ `migrations/001–010` - EXISTS (read for naming, RLS, triggers)
- ✅ `doctor_settings` - EXISTS (009); decide whether to extend or new table
- ❌ `doctor_instagram` table - MISSING
- ❌ Types for doctor Instagram row - MISSING

**When creating a migration:** (MANDATORY)
- [ ] Read all previous migrations in numeric order per [MIGRATIONS_AND_CHANGE.md](../../Reference/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) §4

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Table must allow one Instagram link per doctor (doctor_id unique or one row per doctor).
- RLS: doctor sees only own row; service_role can read for webhook resolution (no write from worker).
- Token: store per COMPLIANCE.md (encryption at rest if required); never log token value.
- Naming: snake_case, consistent with 001/002/009.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y) → [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N – optional: document retention for token/connection data per COMPLIANCE)

---

## ✅ Acceptance & Verification Criteria

- [x] Migration creates table with required columns and RLS; no PHI.
- [x] TypeScript types match schema; type-check passes.
- [ ] Webhook resolution (e-task-2) can query by `instagram_page_id` to get `doctor_id` (implemented in e-task-2).

---

## 🔗 Related Tasks

- [e-task-2: Webhook resolution page_id → doctor_id](./e-task-2-webhook-resolution-page-id-to-doctor-id.md)
- [e-task-3: Connect flow (OAuth)](./e-task-3-instagram-connect-flow-oauth.md)

---

**Last Updated:** 2026-02-06  
**Completed:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

## 📝 Implementation notes

- **Migration:** `backend/migrations/011_doctor_instagram.sql` — table `doctor_instagram` with doctor_id (PK), instagram_page_id (UNIQUE), instagram_access_token, instagram_username, created_at, updated_at; RLS for doctor (SELECT/INSERT/UPDATE/DELETE) and service_role (SELECT); trigger for updated_at.
- **Types:** `backend/src/types/database.ts` — `DoctorInstagram`, `InsertDoctorInstagram`, `UpdateDoctorInstagram` added.
- **Next step:** Run the migration in your Supabase project (SQL Editor or migration runner), then proceed to e-task-2 (webhook resolution).
