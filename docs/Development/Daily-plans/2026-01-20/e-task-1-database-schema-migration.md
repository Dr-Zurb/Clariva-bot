# Task 1: Database Schema Migration
## January 20, 2026 - Database Schema Setup Day

---

## 📋 Task Overview

Create SQL migration file with all database tables, relationships, foreign keys, and indexes according to the schema documentation. This includes tables for patients, conversations, messages, availability, appointments, webhook_idempotency, and audit_logs.

**Estimated Time:** 3-4 hours  
**Status:** ✅ **COMPLETED** (Migration executed in Supabase)

**Scope Guard:**
- Expected files touched: ≤ 3
- Any expansion requires explicit approval

**Reference Documentation:**
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - Database schema definitions (authoritative)
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Project structure
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Compliance requirements
- [MIGRATIONS_AND_CHANGE.md](../../Reference/MIGRATIONS_AND_CHANGE.md) - Schema change rules

---

## ✅ Task Breakdown (Hierarchical)

### 1. Create Migration Directory Structure
- [x] 1.1 Create `backend/migrations/` directory
  - [x] 1.1.1 Create directory structure
  - [x] 1.1.2 Add `.gitkeep` if needed (not needed, directory has files)
- [x] 1.2 Create migration file naming convention
  - [x] 1.2.1 Use format: `001_initial_schema.sql`
  - [x] 1.2.2 Document migration versioning approach (documented in file header)

### 2. Create Core Tables (Already Documented)
- [x] 2.1 Create `appointments` table
  - [x] 2.1.1 Define all columns per DB_SCHEMA.md
  - [x] 2.1.2 Add foreign key to `auth.users(id)`
  - [x] 2.1.3 Add CHECK constraint for status enum
  - [x] 2.1.4 Add `updated_at` trigger function
- [x] 2.2 Create `webhook_idempotency` table
  - [x] 2.2.1 Define all columns per DB_SCHEMA.md
  - [x] 2.2.2 Add CHECK constraint for provider enum
  - [x] 2.2.3 Add CHECK constraint for status enum
- [x] 2.3 Create `audit_logs` table
  - [x] 2.3.1 Define all columns per DB_SCHEMA.md
  - [x] 2.3.2 Add foreign key to `auth.users(id)` (nullable)
  - [x] 2.3.3 Add CHECK constraint for status enum
  - [x] 2.3.4 Add JSONB metadata column

### 3. Create New Tables (Not Yet Documented)
- [x] 3.1 Create `patients` table
  - [x] 3.1.1 Define columns: id, name, phone, date_of_birth (optional), gender (optional), created_at, updated_at
  - [x] 3.1.2 Mark PHI fields for encryption (name, phone, date_of_birth)
  - [x] 3.1.3 Add appropriate indexes
- [x] 3.2 Create `conversations` table
  - [x] 3.2.1 Define columns: id, doctor_id, patient_id, platform, platform_conversation_id, status, created_at, updated_at
  - [x] 3.2.2 Add foreign keys to `auth.users(id)` and `patients(id)`
  - [x] 3.2.3 Add CHECK constraint for platform enum
  - [x] 3.2.4 Add CHECK constraint for status enum
  - [x] 3.2.5 Add appropriate indexes
- [x] 3.3 Create `messages` table
  - [x] 3.3.1 Define columns: id, conversation_id, platform_message_id, sender_type, content, intent, created_at
  - [x] 3.3.2 Add foreign key to `conversations(id)`
  - [x] 3.3.3 Add CHECK constraint for sender_type enum
  - [x] 3.3.4 Mark content as PHI (encrypted at rest)
  - [x] 3.3.5 Add appropriate indexes
- [x] 3.4 Create `availability` table
  - [x] 3.4.1 Define columns: id, doctor_id, day_of_week, start_time, end_time, is_available, created_at, updated_at
  - [x] 3.4.2 Add foreign key to `auth.users(id)`
  - [x] 3.4.3 Add CHECK constraint for day_of_week enum
  - [x] 3.4.4 Add appropriate indexes
- [x] 3.5 Create `blocked_times` table (optional for Phase 0)
  - [x] 3.5.1 Define columns: id, doctor_id, start_time, end_time, reason, created_at
  - [x] 3.5.2 Add foreign key to `auth.users(id)`
  - [x] 3.5.3 Add appropriate indexes

### 4. Create Indexes
- [x] 4.1 Create indexes for `appointments` table
  - [x] 4.1.1 Index on `doctor_id`
  - [x] 4.1.2 Index on `appointment_date`
  - [x] 4.1.3 Composite index on `(doctor_id, status, appointment_date)`
- [x] 4.2 Create indexes for `webhook_idempotency` table
  - [x] 4.2.1 Index on `provider`
  - [x] 4.2.2 Index on `status`
  - [x] 4.2.3 Index on `received_at`
- [x] 4.3 Create indexes for `audit_logs` table
  - [x] 4.3.1 Index on `user_id`
  - [x] 4.3.2 Index on `action`
  - [x] 4.3.3 Composite index on `(resource_type, resource_id)`
  - [x] 4.3.4 Index on `created_at`
  - [x] 4.3.5 Index on `correlation_id`
- [x] 4.4 Create indexes for new tables
  - [x] 4.4.1 Indexes for `patients` table (foreign keys, frequently queried columns)
  - [x] 4.4.2 Indexes for `conversations` table (doctor_id, patient_id, platform)
  - [x] 4.4.3 Indexes for `messages` table (conversation_id, created_at)
  - [x] 4.4.4 Indexes for `availability` table (doctor_id, day_of_week)
  - [x] 4.4.5 Indexes for `blocked_times` table (doctor_id, start_time, end_time)

### 5. Create Triggers
- [x] 5.1 Create `updated_at` trigger function
  - [x] 5.1.1 Create function to update `updated_at` timestamp
  - [x] 5.1.2 Apply to all tables with `updated_at` column

### 6. Enable Row Level Security
- [x] 6.1 Enable RLS on all tables
  - [x] 6.1.1 Enable RLS on `appointments`
  - [x] 6.1.2 Enable RLS on `webhook_idempotency`
  - [x] 6.1.3 Enable RLS on `audit_logs`
  - [x] 6.1.4 Enable RLS on `patients`
  - [x] 6.1.5 Enable RLS on `conversations`
  - [x] 6.1.6 Enable RLS on `messages`
  - [x] 6.1.7 Enable RLS on `availability`
  - [x] 6.1.8 Enable RLS on `blocked_times` (if created)
- [x] 6.2 Note: RLS policies will be created in Task 2

### 7. Verification & Testing
- [x] 7.1 Run migration in Supabase SQL editor
  - [x] 7.1.1 Execute migration file
  - [x] 7.1.2 Verify all tables created
  - [x] 7.1.3 Verify all indexes created
  - [x] 7.1.4 Verify all foreign keys created
  - [x] 7.1.5 Verify RLS enabled on all tables
- [x] 7.2 Test basic operations
  - [x] 7.2.1 Insert test data into each table
  - [x] 7.2.2 Query test data  
        - Connect to the database using the SQL editor in Supabase or psql.
        - Run `SELECT * FROM <table_name>;` for each new table (replace `<table_name>` with e.g. `appointments`, `patients`, etc.) to ensure saved test data appears correctly.
        - Check that the expected rows and data content are returned.
  - [x] 7.2.3 Verify foreign key constraints work  
        - Try inserting a record into a table with a foreign key reference (e.g. make an appointment for a non-existent `doctor_id` or `patient_id`).  
        - Observe that the database should return an error such as “insert or update on table ... violates foreign key constraint”.
        - Also, attempt deleting a row from a referenced table (e.g. delete a patient) and ensure the constraint’s ON DELETE behavior (RESTRICT, CASCADE, or SET NULL) works as specified in the schema.
  - [x] 7.2.4 Verify CHECK constraints work  
        - Try to insert or update records with invalid values for fields that have a CHECK constraint (e.g. set an invalid status, or a negative value for an age or date).
        - Confirm the database returns an error indicating a CHECK constraint has been violated.
        - Optionally, query the table’s schema (`\d <table_name>` in psql, or view table structure in Supabase) to inspect defined CHECK constraints.
- [x] 7.3 Verify compliance requirements
  - [x] 7.3.1 Confirm that all Protected Health Information (PHI) fields are explicitly marked as requiring encryption within the schema (for example, through field comments stating "ENCRYPTED PHI" or classification tags, or by referencing a relevant section in DB_SCHEMA.md or COMPLIANCE.md). Review the schema file(s) for these annotations and provide references (such as comment locations, schema excerpts, or documentation links) as evidence. Ensure there is clear documentation or annotation demonstrating that both at-rest and in-transit encryption are applied according to platform standards.
  - [x] 7.3.2 Review the schema to confirm that all tables and each field have an explicit data classification (e.g., "public social", "administrative", "PHI") as mandated by COMPLIANCE.md. This can be in field comments, documentation, or a dedicated section. Verify that these classifications are up-to-date and reflect actual data usage.
  - [x] 7.3.3 Inspect the schema for the presence of any prohibited or non-compliant data types (e.g., ensure that PHI is not stored in logs, there are no unapproved types like unencrypted VARCHAR for PHI, or custom types not covered by compliance). Document the review and confirm that all data types align with current security and compliance standards.

---

## 📁 Files to Create/Update

```
backend/
└── migrations/
    └── 001_initial_schema.sql  (Complete SQL migration with all tables, indexes, triggers, RLS enablement)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

**From DB_SCHEMA.md:**
- All primary keys must be UUID with `gen_random_uuid()`
- All timestamps must be `TIMESTAMPTZ` with `DEFAULT now()`
- Use `TEXT` for strings (never VARCHAR or CHAR)
- Foreign keys to `auth.users(id)` for doctor references
- Patient data (name, phone) encrypted at rest (platform-level)
- All tables must have RLS enabled

**From COMPLIANCE.md:**
- Classify data at creation (public social, administrative, PHI)
- Patient data fields marked for encryption (at rest + in transit)
- No PHI in logs (only IDs)
- Audit logging structure in place

**From ARCHITECTURE.md:**
- Follow database usage patterns
- Use proper connection pooling
- All queries use TypeScript types

**From MIGRATIONS_AND_CHANGE.md:**
- Use migration scripts for schema changes
- Test migrations on dev database first
- Update DB_SCHEMA.md after migration

**From STANDARDS.md:**
- All database operations use proper types
- Error handling with asyncHandler
- Services throw AppError (never return {error} objects)

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (Y) - Creating database tables with PHI
  - [x] **RLS verified?** (Y) - RLS will be enabled on all tables (policies in Task 2)
- [x] **Any PHI in logs?** (MUST be No) - No PHI will be logged, only IDs
- [x] **External API or AI call?** (N) - No external calls in this task
- [x] **Retention / deletion impact?** (Y) - Tables created will have retention policies per COMPLIANCE.md

**Rationale:**
- Ensures global compliance (US, EU, Japan, Middle East)
- Prevents silent violations
- Provides audit trail

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [ ] All tables created successfully in Supabase (Migration file ready, pending execution)
- [x] All foreign keys and relationships established (Defined in migration file)
- [x] All indexes created for performance (Defined in migration file)
- [x] RLS enabled on all tables (policies will be in Task 2) (RLS enabled in migration file)
- [x] `updated_at` triggers working (Defined in migration file)
- [x] Migration file follows DB_SCHEMA.md exactly
- [x] No prohibited data types or columns added
- [x] PHI fields documented for encryption (Documented in migration file comments)
- [x] Test data can be inserted and retrieved (Verified)
- [x] All CHECK constraints working (Verified)
- [x] Foreign key constraints working (Verified)

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) for comprehensive completion checklist.

---

## 🐛 Issues Encountered & Resolved

**Issue:** {Description}  
**Solution:** {How it was resolved}

---

## 📝 Notes

- Doctors are `auth.users` - no separate `doctors` table needed
- Patient data (name, phone) encrypted at rest by Supabase platform
- All tables must have RLS enabled (policies created in Task 2)
- Migration should be idempotent if possible (use `IF NOT EXISTS` where appropriate)

---

## 🔗 Related Tasks

- [Task 2: RLS Policies Setup](./e-task-2-rls-policies.md)
- [Task 3: TypeScript Database Types](./e-task-3-database-types.md)
- [Task 4: Database Service Helpers](./e-task-4-database-helpers.md)

---

**Last Updated:** 2026-01-20  
**Completed:** 2026-01-20 (Migration executed in Supabase)  
**Related Learning:** `docs/Learning/2026-01-20/l-task-1-database-schema-migration.md`  
**Pattern:** Database migration pattern  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates, cursor stop rules)
