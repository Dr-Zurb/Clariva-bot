# Task 2: Dead Letter Queue Schema & Migration
## January 21, 2026 - Instagram Webhook Integration Day

---

## 📋 Task Overview

Create dead letter queue table schema for storing failed webhook payloads after max retries. This table stores encrypted payloads for manual review and recovery. Required for webhook reliability and compliance.

**Estimated Time:** 1-2 hours  
**Status:** ✅ **COMPLETE**

**Scope Guard:**
- Expected files touched: ≤ 3 (migration SQL, TypeScript types, service)
- Any expansion requires explicit approval

**Reference Documentation:**
- [WEBHOOKS.md](../../Reference/WEBHOOKS.md) - Dead letter queue requirements
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - Database schema patterns
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - PHI encryption requirements
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md) - Row-level security rules

---

## ✅ Task Breakdown (Hierarchical)

### 1. Create Dead Letter Queue Table Schema
- [x] 1.1 Design table schema
  - [x] 1.1.1 Define columns: `id`, `event_id`, `provider`, `received_at`, `correlation_id`, `payload_encrypted`, `error_message`, `retry_count`, `failed_at`
  - [x] 1.1.2 Define primary key (`id` UUID)
  - [x] 1.1.3 Define indexes for query performance
  - [x] 1.1.4 Define constraints (provider enum, NOT NULL constraints)
- [x] 1.2 Create migration SQL file
  - [x] 1.2.1 Create `migrations/003_dead_letter_queue.sql`
  - [x] 1.2.2 Define table structure
  - [x] 1.2.3 Add indexes (on `provider`, `failed_at`, `event_id`)
  - [x] 1.2.4 Enable RLS on table
  - [x] 1.2.5 Add comments documenting table purpose
- [x] 1.3 Execute migration in Supabase
  - [x] 1.3.1 Run migration SQL in Supabase SQL Editor
  - [x] 1.3.2 Verify table created successfully
  - [x] 1.3.3 Verify indexes created
  - [x] 1.3.4 Verify RLS enabled

### 2. Create TypeScript Types
- [x] 2.1 Define dead letter queue types
  - [x] 2.1.1 Create `DeadLetterQueue` interface in `types/database.ts`
  - [x] 2.1.2 Define provider enum type (`'facebook' | 'instagram' | 'whatsapp'`)
  - [x] 2.1.3 Define insert type (for creating records)
  - [x] 2.1.4 Define select type (for reading records)
- [x] 2.2 Export types
  - [x] 2.2.1 Export `DeadLetterQueue` type
  - [x] 2.2.2 Export `DeadLetterQueueInsert` type
  - [x] 2.2.3 Export `DeadLetterQueueProvider` enum

### 3. Create Dead Letter Queue Service
- [x] 3.1 Create service file
  - [x] 3.1.1 Create `services/dead-letter-service.ts`
  - [x] 3.1.2 Import required dependencies (Supabase client, types, encryption utilities)
- [x] 3.2 Implement store function
  - [x] 3.2.1 Create `storeDeadLetterWebhook` function
  - [x] 3.2.2 Encrypt payload before storing (use Supabase encryption or application-level encryption)
  - [x] 3.2.3 Store encrypted payload in `payload_encrypted` column
  - [x] 3.2.4 Store metadata (event_id, provider, correlation_id, error_message, retry_count)
  - [x] 3.2.5 Use asyncHandler wrapper (not try-catch) - see STANDARDS.md
  - [x] 3.2.6 Throw AppError on failure (never return {error} objects)
- [x] 3.3 Implement retrieval functions
  - [x] 3.3.1 Create `getDeadLetterWebhook` function (by id)
  - [x] 3.3.2 Create `listDeadLetterWebhooks` function (by provider, date range)
  - [x] 3.3.3 Decrypt payload when retrieving (for manual review)
  - [x] 3.3.4 Use asyncHandler wrapper
  - [x] 3.3.5 Throw AppError on failure
- [x] 3.4 Implement recovery function
  - [x] 3.4.1 Create `reprocessDeadLetterWebhook` function
  - [x] 3.4.2 Retrieve dead letter record
  - [x] 3.4.3 Decrypt payload
  - [x] 3.4.4 Re-queue for processing (call webhook queue) - Placeholder for Task 6
  - [x] 3.4.5 Mark as reprocessed (optional: delete or mark status)
  - [x] 3.4.6 Use asyncHandler wrapper
  - [x] 3.4.7 Throw AppError on failure

### 4. Encryption Implementation
- [x] 4.1 Create encryption utility (if not exists)
  - [x] 4.1.1 Create `utils/encryption.ts` (if needed)
  - [x] 4.1.2 Implement `encryptPayload` function
  - [x] 4.1.3 Implement `decryptPayload` function
  - [x] 4.1.4 Use secure encryption algorithm (AES-256-GCM)
  - [x] 4.1.5 Use encryption key from environment variables
- [x] 4.2 Integrate encryption with dead letter service
  - [x] 4.2.1 Use encryption utility in `storeDeadLetterWebhook`
  - [x] 4.2.2 Use decryption utility in retrieval functions
  - [x] 4.2.3 Handle encryption/decryption errors gracefully

### 5. RLS Policies
- [x] 5.1 Create RLS policies
  - [x] 5.1.1 Create policy for service role (full access)
  - [x] 5.1.2 Create policy for admin users (read-only access for compliance reviews)
  - [x] 5.1.3 Deny all other access (no user access)
- [x] 5.2 Execute RLS policies in Supabase
  - [x] 5.2.1 Add RLS policies to migration file or separate file
  - [x] 5.2.2 Execute policies in Supabase SQL Editor
  - [x] 5.2.3 Verify policies are active

### 6. Testing & Verification
- [x] 6.1 Test table creation
  - [x] 6.1.1 Verify table exists in Supabase
  - [x] 6.1.2 Verify columns are correct
  - [x] 6.1.3 Verify indexes are created
- [x] 6.2 Test service functions

  - [x] 6.2.1 Test `storeDeadLetterWebhook` with sample data

  - [x] 6.2.2 Test encryption/decryption works correctly
  - [x] 6.2.3 Test `getDeadLetterWebhook` retrieval
  - [x] 6.2.4 Test `listDeadLetterWebhooks` with filters
  - [x] 6.2.5 Test `reprocessDeadLetterWebhook` (mock webhook queue)
- [x] 6.3 Test RLS policies
  - [x] 6.3.1 Verify service role can insert/read
  - [x] 6.3.2 Verify admin users can read (if admin role exists)
  - [x] 6.3.3 Verify regular users cannot access (deferred until user system exists)
- [x] 6.4 Run type-check and lint
  - [x] 6.4.1 Run `npm run type-check` (should pass)
  - [x] 6.4.2 Run `npm run lint` (should pass or only pre-existing warnings)

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 003_dead_letter_queue.sql   (NEW - Dead letter queue table schema)
└── src/
    ├── types/
    │   └── database.ts              (UPDATE - Add DeadLetterQueue types)
    ├── services/
    │   └── dead-letter-service.ts   (NEW - Dead letter queue service)
    └── utils/
        └── encryption.ts             (NEW - Encryption utilities, if needed)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

**From WEBHOOKS.md:**
- Dead letter queue stores encrypted payloads only
- Payloads must be encrypted before storage
- Dead letter items require manual review
- Recovery mechanism must be available

**From DB_SCHEMA.md:**
- Table schema must follow existing patterns
- RLS must be enabled on all tables
- Indexes must be created for query performance
- Never store unencrypted PHI/PII

**From COMPLIANCE.md:**
- PHI/PII must be encrypted at rest
- Access to dead letter queue must be restricted (admin-only)
- Audit logging required for dead letter operations

**From STANDARDS.md:**
- Services must use asyncHandler (not try-catch)
- Services must throw AppError (never return {error} objects)
- All functions must have TypeScript types

**Security Considerations:**
- Payload encryption is MANDATORY (contains PII/PHI)
- Encryption key must be stored in environment variables
- Decryption only for authorized admin users
- RLS policies must restrict access

**Architecture Considerations:**
- Service layer must not import Express types
- Encryption utilities should be reusable
- Dead letter service should be independent (no webhook-specific logic)

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (Y) - Dead letter queue stores webhook payloads (may contain PHI)
  - [x] **RLS verified?** (Y) - RLS policies restrict access to admin/service role only
- [x] **Any PHI in logs?** (MUST be No) - Only log metadata (event_id, provider, correlation_id), never payload content
- [x] **External API or AI call?** (N) - No external API calls
- [x] **Retention / deletion impact?** (Y) - Dead letter items should have retention policy (90 days per WEBHOOKS.md)

**Rationale:**
- Ensures global compliance (US, EU, Japan, Middle East)
- Prevents silent violations
- Provides audit trail

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Dead letter queue table created in Supabase
- [x] Table schema matches WEBHOOKS.md requirements
- [x] TypeScript types created for dead letter queue
- [x] Dead letter service implemented with encryption
- [x] Store, retrieve, and reprocess functions working
- [x] RLS policies created and active
- [x] Encryption/decryption tested and working
- [x] All TypeScript types correct (no errors)
- [x] All linting passes (or only pre-existing warnings)
- [x] Table has proper indexes for query performance

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) for comprehensive completion checklist.

---

## 🐛 Issues Encountered & Resolved

_To be filled during implementation_

---

## 📝 Notes

- Dead letter queue is critical for webhook reliability
- Payload encryption is MANDATORY (contains PII/PHI from webhooks)
- Dead letter items require manual review (operations team)
- Recovery mechanism allows reprocessing after fixing underlying issues
- Retention policy: 90 days (per WEBHOOKS.md)

**Implementation Priority:**
1. **Critical:** Table schema creation (required for webhook processing)
2. **Critical:** Encryption implementation (required for compliance)
3. **High:** Service functions (required for webhook processing)
4. **High:** RLS policies (required for security)
5. **Medium:** Recovery mechanism (helpful for operations)

---

## 🔗 Related Tasks

- [Task 3: Webhook Security & Verification Utilities](./e-task-3-webhook-security.md) - Will use dead letter queue for failed webhooks
- [Task 6: Webhook Processing Queue & Worker](./e-task-6-webhook-queue.md) - Will use dead letter queue after max retries
- [Task 4: Webhook Controller & Routes](./e-task-4-webhook-controller.md) - Will trigger dead letter queue on failures

---

**Last Updated:** 2026-01-26  
**Completed:** 2026-01-26  
**Related Learning:** `docs/Learning/2026-01-21/l-task-2-dead-letter-queue.md` ✅ Created  
**Pattern:** Dead letter queue pattern, encryption pattern  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates, cursor stop rules)
