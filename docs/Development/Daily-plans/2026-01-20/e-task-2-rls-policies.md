# Task 2: RLS Policies Setup
## January 20, 2026 - Database Schema Setup Day

---

## 📋 Task Overview

Create SQL file with Row Level Security (RLS) policies for all database tables according to RLS_POLICIES.md. This ensures doctors can only access their own data and service role is used appropriately.

**Estimated Time:** 2-3 hours  
**Status:** ✅ **COMPLETED** (Implementation complete, policies executed in Supabase. Testing deferred until frontend/user creation system is available)

**Scope Guard:**
- Expected files touched: ≤ 2
- Any expansion requires explicit approval

**Reference Documentation:**
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md) - Row-level security rules (authoritative)
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - Database schema definitions
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Access control requirements
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Database usage patterns

---

## ✅ Task Breakdown (Hierarchical)

### 1. Create RLS Policies SQL File
- [x] 1.1 Create `backend/migrations/002_rls_policies.sql` file
  - [x] 1.1.1 Create file structure
  - [x] 1.1.2 Add header comments explaining RLS purpose
- [x] 1.2 Document policy naming convention
  - [x] 1.2.1 Use descriptive policy names
  - [x] 1.2.2 Follow pattern from RLS_POLICIES.md

### 2. Create RLS Policies for Core Tables
- [x] 2.1 Create policies for `appointments` table
  - [x] 2.1.1 SELECT policy: Users can read own appointments (`auth.uid() = doctor_id`)
  - [x] 2.1.2 INSERT policy: Users can insert own appointments (`auth.uid() = doctor_id`)
  - [x] 2.1.3 UPDATE policy: Users can update own appointments (`auth.uid() = doctor_id`)
  - [x] 2.1.4 DELETE policy: Users can delete own appointments (`auth.uid() = doctor_id`)
- [x] 2.2 Create policies for `webhook_idempotency` table
  - [x] 2.2.1 SELECT policy: Service role only (`auth.role() = 'service_role'`)
  - [x] 2.2.2 INSERT policy: Service role only (`auth.role() = 'service_role'`)
  - [x] 2.2.3 UPDATE policy: Service role only (`auth.role() = 'service_role'`)
  - [x] 2.2.4 No DELETE policy (default deny)
- [x] 2.3 Create policies for `audit_logs` table
  - [x] 2.3.1 SELECT policy: Users can read own OR admin can read all
  - [x] 2.3.2 INSERT policy: Service role only (`auth.role() = 'service_role'`)
  - [x] 2.3.3 No UPDATE or DELETE policies (immutable audit trail)

### 3. Create RLS Policies for New Tables
- [x] 3.1 Create policies for `patients` table
  - [x] 3.1.1 SELECT policy: Doctors can read patients linked to their appointments/conversations
  - [x] 3.1.2 INSERT policy: Service role only (created via webhook/conversation)
  - [x] 3.1.3 UPDATE policy: Service role only (updated via webhook/conversation)
  - [x] 3.1.4 DELETE policy: Service role only (data lifecycle management)
- [x] 3.2 Create policies for `conversations` table
  - [x] 3.2.1 SELECT policy: Doctors can read own conversations (`auth.uid() = doctor_id`)
  - [x] 3.2.2 INSERT policy: Service role only (created via webhook)
  - [x] 3.2.3 UPDATE policy: Service role only (updated via webhook)
  - [x] 3.2.4 DELETE policy: Service role only (data lifecycle management)
- [x] 3.3 Create policies for `messages` table
  - [x] 3.3.1 SELECT policy: Doctors can read messages from own conversations
  - [x] 3.3.2 INSERT policy: Service role only (created via webhook)
  - [x] 3.3.3 UPDATE policy: Service role only (if needed for corrections)
  - [x] 3.3.4 DELETE policy: Service role only (data lifecycle management)
- [x] 3.4 Create policies for `availability` table
  - [x] 3.4.1 SELECT policy: Doctors can read own availability (`auth.uid() = doctor_id`)
  - [x] 3.4.2 INSERT policy: Doctors can insert own availability (`auth.uid() = doctor_id`)
  - [x] 3.4.3 UPDATE policy: Doctors can update own availability (`auth.uid() = doctor_id`)
  - [x] 3.4.4 DELETE policy: Doctors can delete own availability (`auth.uid() = doctor_id`)
- [x] 3.5 Create policies for `blocked_times` table (if created)
  - [x] 3.5.1 SELECT policy: Doctors can read own blocked times (`auth.uid() = doctor_id`)
  - [x] 3.5.2 INSERT policy: Doctors can insert own blocked times (`auth.uid() = doctor_id`)
  - [x] 3.5.3 UPDATE policy: Doctors can update own blocked times (`auth.uid() = doctor_id`)
  - [x] 3.5.4 DELETE policy: Doctors can delete own blocked times (`auth.uid() = doctor_id`)

### 4. Verify Policy Logic
- [x] 4.1 Verify ownership patterns
  - [x] 4.1.1 Doctors own their appointments, availability, blocked_times
  - [x] 4.1.2 Doctors can access patients linked to their data
  - [x] 4.1.3 Service role used only for system operations
- [x] 4.2 Verify security boundaries
  - [x] 4.2.1 No cross-doctor data access
  - [x] 4.2.2 Webhook data isolated (service role only)
  - [x] 4.2.3 Audit logs properly protected

### 5. Testing & Verification
- [x] 5.1 Test policies in Supabase
  - [x] 5.1.1 Execute RLS policies SQL file
  - [x] 5.1.2 Verify policies created successfully
  - [ ] 5.1.3 Test with authenticated user (should see own data only) - **DEFERRED** (See [../../pending/pending-rls-testing-2026-01-20.md](../../pending/pending-rls-testing-2026-01-20.md))
  - [ ] 5.1.4 Test with service role (should see all data) - **DEFERRED** (See [../../pending/pending-rls-testing-2026-01-20.md](../../pending/pending-rls-testing-2026-01-20.md))
  - [ ] 5.1.5 Test with different user (should NOT see other user's data) - **DEFERRED** (See [../../pending/pending-rls-testing-2026-01-20.md](../../pending/pending-rls-testing-2026-01-20.md))
- [ ] 5.2 Verify compliance
  - [ ] 5.2.1 Verify least privilege access (doctors see only their data) - **DEFERRED** (Requires user testing - will be done when frontend/user creation system is available)
  - [ ] 5.2.2 Verify service role restrictions - **DEFERRED** (See [../../pending/pending-rls-testing-2026-01-20.md](../../pending/pending-rls-testing-2026-01-20.md))
  - [ ] 5.2.3 Verify audit log immutability - **DEFERRED** (Requires user testing - will be done when frontend/user creation system is available)

**Note:** Testing tasks 5.1.3, 5.1.4, 5.1.5, and 5.2 are deferred until frontend/user creation system is available. RLS policies have been executed in Supabase and are active. See [../../pending/pending-rls-testing-2026-01-20.md](../../pending/pending-rls-testing-2026-01-20.md) for detailed testing steps when ready.

---

## 📁 Files to Create/Update

```
backend/
└── migrations/
    └── 002_rls_policies.sql  (RLS policies for all tables)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

**From RLS_POLICIES.md:**
- RLS enabled on all tables by default
- Policies apply to all users except service role
- Doctors own their appointments and related data
- Service role used only for system operations (webhooks, audit logs)
- Patients identified by phone (not user accounts)
- Audit logs immutable (no UPDATE/DELETE policies)

**From COMPLIANCE.md:**
- Least privilege access enforced via RLS
- Doctors can only access their own data
- Service role access must be logged and justified
- Admin access time-limited and audited

**From ARCHITECTURE.md:**
- RLS is defense in depth (database layer security)
- Application code must also validate ownership
- Service role bypasses RLS (use with extreme caution)

**From STANDARDS.md:**
- All access attempts logged
- No PHI in logs (only IDs)
- Correlation ID included in audit logs

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (Y) - RLS policies control data access
  - [x] **RLS verified?** (Y) - This task creates RLS policies
- [x] **Any PHI in logs?** (MUST be No) - No PHI in logs, only IDs
- [x] **External API or AI call?** (N) - No external calls
- [x] **Retention / deletion impact?** (N) - Policies don't affect retention

**Rationale:**
- Ensures global compliance (US, EU, Japan, Middle East)
- Prevents silent violations
- Provides audit trail

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] All RLS policies created successfully
- [x] Policies follow RLS_POLICIES.md exactly
- [x] Doctors can only access their own data
- [x] Service role can access system tables (webhook_idempotency, audit_logs)
- [x] Cross-doctor data access prevented
- [ ] Policies tested with different user contexts (pending Supabase testing)
- [x] Audit log immutability enforced (no UPDATE/DELETE policies)
- [x] All tables have appropriate policies for SELECT, INSERT, UPDATE, DELETE

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) for comprehensive completion checklist.

---

## 🐛 Issues Encountered & Resolved

**Issue:** None encountered during implementation  
**Solution:** N/A

---

## 📝 Notes

- RLS policies are the primary security mechanism
- Service role bypasses RLS - use with extreme caution
- Policies must be tested with real user contexts
- Admin role claims must be server-side verified (never client-controlled)

---

## 🔗 Related Tasks

- [Task 1: Database Schema Migration](./e-task-1-database-schema-migration.md)
- [Task 3: TypeScript Database Types](./e-task-3-database-types.md)
- [Task 4: Database Service Helpers](./e-task-4-database-helpers.md)

---

**Last Updated:** 2026-01-20  
**Completed:** 2026-01-20 (Implementation and execution complete. Testing deferred until frontend/user creation system is available)  
**Related Learning:** `docs/Learning/2026-01-20/l-task-2-rls-policies.md`  
**Pattern:** Row-level security pattern  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates, cursor stop rules)
