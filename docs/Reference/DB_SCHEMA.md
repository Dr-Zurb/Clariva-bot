# Database Schema
## Stop Agents from Inventing Columns

**⚠️ CRITICAL: This schema is authoritative. Do not add columns without explicit approval.**

---

## 🎯 Purpose

This file documents all database tables, columns, types, relationships, and indexes.

**This file owns:**
- Tables
- Columns
- Types
- Relationships
- Indexes
- "Never store X" notes

**This file MUST NOT contain:**
- SQL migrations (those are generated code)
- Business logic (see ARCHITECTURE.md)
- RLS policies (see RLS_POLICIES.md)

---

## 📋 Related Files

- [RLS_POLICIES.md](./RLS_POLICIES.md) - Row-level security rules
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Database usage patterns
- [COMPLIANCE.md](./COMPLIANCE.md) - PHI storage requirements

---

## 🗄️ Schema Overview

**Database:** Supabase (PostgreSQL)

**Auth:** Supabase Auth (separate from application schema)

**RLS:** Enabled on all tables (see RLS_POLICIES.md)

---

## 📊 Tables

### `appointments`

**Purpose:** Store appointment bookings

**Columns:**
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
doctor_id           UUID NOT NULL REFERENCES auth.users(id)
patient_id          UUID NULL REFERENCES patients(id) ON DELETE SET NULL  -- e-task-5: resolve patient for payment confirmation DM
patient_name        TEXT NOT NULL  -- Encrypted at rest (platform-level, Supabase encryption-at-rest)
patient_phone       TEXT NOT NULL  -- Encrypted at rest (platform-level, Supabase encryption-at-rest)
appointment_date    TIMESTAMPTZ NOT NULL
status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed'))
reason_for_visit    TEXT NULL  -- Patient main complaint/symptom (required for new bookings; migration 016)
notes               TEXT NULL  -- Optional patient extras + doctor default_notes (migration 016)
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:**
- `idx_appointments_doctor_id` ON `doctor_id`
- `idx_appointments_appointment_date` ON `appointment_date`
- `idx_appointments_doctor_status_date` ON `(doctor_id, status, appointment_date)` - **Composite index for common query pattern (filter by doctor + status + date)**
- `idx_appointments_patient_id` ON `patient_id` (e-task-5)

**Relationships:**
- `doctor_id` → `auth.users(id)` (many-to-one)
- `patient_id` → `patients(id)` (optional; used for payment confirmation DM)

**Never Store:**
- ❌ Patient DOB (not needed for appointments)
- ❌ Social security numbers
- ❌ Insurance information
- ❌ Medical records (not appointment system)

**RLS:** Enabled (see RLS_POLICIES.md)

---

### `patients`

**Purpose:** Store patient information (PHI). Supports placeholder patients per platform user (e-task-3).

**Columns:**
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
name                TEXT NOT NULL  -- Encrypted at rest (platform-level)
phone               TEXT NOT NULL  -- Encrypted at rest (platform-level)
date_of_birth       DATE           -- Optional
gender              TEXT           -- Optional
platform            TEXT           -- Platform name for placeholder lookup (e.g. instagram) - migration 004
platform_external_id TEXT          -- Platform user ID (e.g. Instagram PSID) - migration 004
consent_status      TEXT DEFAULT 'pending' CHECK (consent_status IN ('pending', 'granted', 'revoked'))  -- migration 005
consent_granted_at  TIMESTAMPTZ    -- When consent was granted - migration 005
consent_revoked_at  TIMESTAMPTZ    -- When consent was revoked - migration 006
consent_method      TEXT           -- How consent was obtained (e.g. instagram_dm) - migration 005
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:**
- `idx_patients_platform` ON `platform` (migration 004)
- `idx_patients_platform_external_id` UNIQUE ON `(platform, platform_external_id)` when both set (migration 004)
- `idx_patients_platform_external_id_col` ON `platform_external_id` (migration 007; single-column lookup)

**Relationships:**
- Referenced by `conversations.patient_id`

**RLS:** Enabled (doctor-only access; see RLS_POLICIES.md)

**See:** [COMPLIANCE.md](./COMPLIANCE.md) Section C (consent), Section F (lifecycle/revocation)

---

### `conversations`

**Purpose:** Store conversation threads between patients and doctors. Links platform DMs to doctor/patient.

**Columns:**
```sql
id                      UUID PRIMARY KEY DEFAULT gen_random_uuid()
doctor_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
patient_id              UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE
platform                TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'whatsapp'))
platform_conversation_id TEXT NOT NULL   -- Platform-specific conversation ID
status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed'))
metadata                JSONB           -- Conversation state (step, lastIntent, collectedFields). No PHI. (migration 004)
created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Unique constraint:** `(doctor_id, platform, platform_conversation_id)`

**Indexes:**
- `idx_conversations_doctor_id` ON `doctor_id`
- `idx_conversations_patient_id` ON `patient_id`
- `idx_conversations_platform` ON `platform`
- `idx_conversations_platform_conversation_id` ON `platform_conversation_id`

**Relationships:**
- `doctor_id` → `auth.users(id)`
- `patient_id` → `patients(id)`
- Referenced by `messages.conversation_id`

**RLS:** Enabled (doctor-only read; service role for writes; see RLS_POLICIES.md)

**See:** [COMPLIANCE.md](./COMPLIANCE.md) Section G (conversation state, no PHI in metadata)

---

### `messages`

**Purpose:** Store individual messages in conversations. PHI in content (encrypted at rest).

**Columns:**
```sql
id                      UUID PRIMARY KEY DEFAULT gen_random_uuid()
conversation_id         UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
platform_message_id     TEXT NOT NULL   -- Platform-specific message ID
sender_type             TEXT NOT NULL CHECK (sender_type IN ('patient', 'doctor', 'system'))
content                 TEXT NOT NULL   -- Encrypted at rest (platform-level)
intent                  TEXT            -- Extracted intent (e.g. book_appointment, greeting)
created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Unique constraint:** `(conversation_id, platform_message_id)`

**Indexes:**
- `idx_messages_conversation_id` ON `conversation_id`
- `idx_messages_created_at` ON `created_at`
- `idx_messages_platform_message_id` ON `platform_message_id`

**Relationships:**
- `conversation_id` → `conversations(id)`

**RLS:** Enabled (doctor read via conversation; service role for writes; see RLS_POLICIES.md)

**Never Store:**
- ❌ Raw prompts or responses with PHI in application logs

---

### `webhook_idempotency`

**Purpose:** Prevent duplicate webhook processing

**Columns:**
```sql
event_id            TEXT PRIMARY KEY  -- Platform ID or hash
provider            TEXT NOT NULL CHECK (provider IN ('facebook', 'instagram', 'whatsapp', 'razorpay', 'paypal'))
received_at         TIMESTAMPTZ NOT NULL DEFAULT now()
status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed'))
processed_at        TIMESTAMPTZ
correlation_id      TEXT NOT NULL  -- Request correlation ID
error_message       TEXT
retry_count         INTEGER NOT NULL DEFAULT 0
```

**Indexes:**
- `idx_webhook_idempotency_provider` ON `provider`
- `idx_webhook_idempotency_status` ON `status`
- `idx_webhook_idempotency_received_at` ON `received_at`

**Never Store:**
- ❌ Webhook payload (contains PII) - use dead letter table if needed
- ❌ Patient identifiers in any form
- ❌ Message content (contains PHI)

**RLS:** Enabled (service role only - no user access)

**Retention:**
- Processed webhooks: 30 days
- Failed webhooks: 90 days

**See:** [WEBHOOKS.md](./WEBHOOKS.md) "Idempotency Strategy" section

**Payment webhooks (e-task-4):** Use provider='razorpay' or 'paypal' for payment gateway idempotency.

---

### `payments`

**Purpose:** Store payment records for appointment fees. Supports dual gateway (Razorpay India, PayPal International).

**Columns:**
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE
gateway             TEXT NOT NULL CHECK (gateway IN ('razorpay', 'paypal'))
gateway_order_id    TEXT NOT NULL   -- Gateway order/reference ID
gateway_payment_id  TEXT            -- Gateway payment ID (if different)
amount_minor        BIGINT NOT NULL -- Amount in smallest unit (paise INR, cents USD)
currency            TEXT NOT NULL   -- INR, USD, EUR, GBP
status              TEXT NOT NULL CHECK (status IN ('pending', 'captured', 'failed', 'refunded'))
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:**
- `idx_payments_appointment_id` ON `appointment_id`
- `idx_payments_gateway` ON `gateway`
- `idx_payments_gateway_order_id` ON `gateway_order_id` (for webhook reconciliation)

**Relationships:**
- `appointment_id` → `appointments(id)`

**Never Store:**
- ❌ Card numbers, CVV, full PAN
- ❌ Raw payment payloads

**RLS:** Enabled (doctor-only read via appointment; service role for writes)

**See:** [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) Payment Gateway section

---

### `doctor_settings` (e-task-4.1)

**Purpose:** Per-doctor appointment fee, currency, and country. When null, app uses env fallback (`APPOINTMENT_FEE_*`, `DEFAULT_DOCTOR_COUNTRY`).

**Columns:**
```sql
doctor_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
appointment_fee_minor  BIGINT NULL   -- Fee in smallest unit (paise/cents); NULL = use env
appointment_fee_currency TEXT NULL   -- e.g. INR, USD; NULL = use env
country                 TEXT NULL    -- Gateway routing (IN -> Razorpay, else PayPal); NULL = use env
created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:**
- `idx_doctor_settings_doctor_id` ON `doctor_id`

**Relationships:**
- `doctor_id` → `auth.users(id)` (one-to-one)

**RLS:** Enabled (doctor read/insert/update own row; service role can read for worker)

**See:** e-task-4.1-per-doctor-payment-settings.md

---

### `prescriptions` (migration 026)

**Purpose:** Store prescription records per appointment. PHI: diagnosis, medications, clinical notes. Doctor creates structured SOAP and/or photo prescription; sends to patient.

**Columns:**
```sql
id                      UUID PRIMARY KEY DEFAULT gen_random_uuid()
appointment_id          UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE
patient_id              UUID NULL REFERENCES patients(id) ON DELETE SET NULL  -- Denormalized for list-by-patient
doctor_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
type                    TEXT NOT NULL CHECK (type IN ('structured', 'photo', 'both'))
cc                      TEXT NULL   -- Chief complaint (SOAP Subjective)
hopi                    TEXT NULL   -- History of present illness
provisional_diagnosis   TEXT NULL   -- SOAP Assessment
investigations          TEXT NULL   -- Plan: labs, imaging ordered
follow_up               TEXT NULL   -- Plan: when to return
patient_education       TEXT NULL   -- Plan: advice, lifestyle
clinical_notes          TEXT NULL   -- Plan: additional notes
sent_to_patient_at      TIMESTAMPTZ NULL  -- When sent via DM/email
created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:**
- `idx_prescriptions_appointment_id` ON `appointment_id`
- `idx_prescriptions_patient_id` ON `patient_id`
- `idx_prescriptions_doctor_id` ON `doctor_id`
- `idx_prescriptions_created_at` ON `created_at` DESC

**Relationships:**
- `appointment_id` → `appointments(id)`
- `patient_id` → `patients(id)` (denormalized)
- `doctor_id` → `auth.users(id)`

**PHI:** Diagnosis, medications (via prescription_medicines), clinical notes. 7-year retention per COMPLIANCE.

**RLS:** Enabled (doctor-only via doctor_id). See RLS_POLICIES.md.

---

### `prescription_medicines` (migration 026)

**Purpose:** Medicines prescribed in a prescription.

**Columns:**
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE
medicine_name   TEXT NOT NULL
dosage          TEXT NULL
route           TEXT NULL    -- e.g. Oral, Topical
frequency       TEXT NULL    -- e.g. BD, TDS
duration        TEXT NULL    -- e.g. 5 days
instructions    TEXT NULL    -- e.g. After food
sort_order      INTEGER NOT NULL DEFAULT 0
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:**
- `idx_prescription_medicines_prescription_id` ON `prescription_id`

**Relationships:**
- `prescription_id` → `prescriptions(id)` ON DELETE CASCADE

**RLS:** Enabled (via parent prescription ownership).

---

### `prescription_attachments` (migration 026)

**Purpose:** Photo attachments (handwritten Rx, lab reports) for prescriptions. file_path = Supabase Storage path.

**Columns:**
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE
file_path       TEXT NOT NULL   -- Supabase Storage object path
file_type       TEXT NULL       -- e.g. image/jpeg
caption         TEXT NULL
uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:**
- `idx_prescription_attachments_prescription_id` ON `prescription_id`

**Relationships:**
- `prescription_id` → `prescriptions(id)` ON DELETE CASCADE

**RLS:** Enabled (via parent prescription ownership).

**PHI:** Stored images may contain handwritten prescription with diagnosis/meds.

---

### `audit_logs`

**Purpose:** Compliance audit trail

**Columns:**
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
correlation_id      TEXT NOT NULL  -- Request correlation ID
user_id             UUID REFERENCES auth.users(id)
action              TEXT NOT NULL  -- e.g., 'create_appointment', 'cancel_appointment'
resource_type       TEXT NOT NULL  -- e.g., 'appointment'
resource_id         UUID
status              TEXT NOT NULL CHECK (status IN ('success', 'failure'))
error_message       TEXT
metadata            JSONB  -- Additional context (no PHI)
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Indexes:**
- `idx_audit_logs_user_id` ON `user_id`
- `idx_audit_logs_action` ON `action`
- `idx_audit_logs_resource_type_id` ON `resource_type`, `resource_id`
- `idx_audit_logs_created_at` ON `created_at`
- `idx_audit_logs_correlation_id` ON `correlation_id`

**Never Store:**
- ❌ PHI/PII in metadata JSONB
- ❌ Patient names, phones, DOBs
- ❌ Request bodies (may contain PHI)

**RLS:** Enabled (admin-only access for compliance reviews)

**Retention:** 7 years (compliance requirement)

**See:** [COMPLIANCE.md](./COMPLIANCE.md) "Audit Logging" section

---

## 🔒 Column Type Guidelines

### UUID vs TEXT

**Use UUID for:**
- Primary keys (auto-generated)
- Foreign keys to `auth.users(id)`
- Internal references

**Use TEXT for:**
- Patient names (with encryption at rest)
- Phone numbers (with encryption at rest)
- Email addresses (if stored)
- Free-form text fields

**Never Use:**
- ❌ VARCHAR with arbitrary length limits
- ❌ CHAR for variable-length strings

---

### Timestamps

**Always use:**
- `TIMESTAMPTZ` (timestamp with timezone)
- Default: `DEFAULT now()`
- Updated: `updated_at` triggers on UPDATE

**Never use:**
- ❌ `TIMESTAMP` without timezone
- ❌ Manual timestamp management in application code

---

### Encrypted Fields

**Encryption:**

**Platform-Level (Supabase):**
- All data encrypted at rest by Supabase platform (automatic)
- No application code required for basic encryption-at-rest
- `patient_name` and `patient_phone` are encrypted at platform storage level

**Field-Level (Optional for High-Risk PHI):**
- Application-level encryption can be added for extremely sensitive fields if required
- **AI Agents:** Do NOT implement column-level encryption unless explicitly requested (platform encryption is sufficient)

**See:** [COMPLIANCE.md](./COMPLIANCE.md) "Data Encryption" section

---

## 🔗 Relationships

### Foreign Key Rules

**Rules:**
- Always define foreign keys explicitly
- Use `ON DELETE CASCADE` for dependent records
- Use `ON DELETE RESTRICT` for critical relationships
- Never use soft deletes without explicit requirement

**Example:**
```sql
-- Cascade delete appointments when user is deleted
doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE

-- Restrict delete if appointments exist
doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
```

---

## 📑 Indexes

### Index Guidelines

**Create indexes for:**
- Foreign keys (for JOIN performance)
- Frequently queried columns
- WHERE clause columns
- ORDER BY columns
- Composite indexes for common query patterns

**Never create indexes for:**
- ❌ Low-cardinality columns (e.g., boolean flags)
- ❌ Columns never used in WHERE clauses
- ❌ Over-indexing (slows writes)

**Example:**
```sql
-- ✅ GOOD - Index on foreign key
CREATE INDEX idx_appointments_doctor_id ON appointments(doctor_id);

-- ✅ GOOD - Composite index for common query
CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, appointment_date);

-- ❌ REMOVED - Single-column index on status (low cardinality)
-- ✅ REPLACED WITH - Composite index for realistic query patterns (see indexes section above)
```

---

## 🚫 Never Store These

### PHI/PII

**MUST NEVER store:**
- Social security numbers
- Full addresses (unless required)
- Insurance numbers (unless required)
- Medical record numbers
- Any other PHI not explicitly required

**Rationale:**
- Compliance requirements (HIPAA)
- Minimize data exposure
- Reduce breach impact

---

### Sensitive System Data

**MUST NEVER store:**
- Plain-text passwords (use Supabase Auth)
- API keys (use environment variables)
- Encryption keys (use key management service)
- Access tokens (unless encrypted)

---

## 📝 Version

**Last Updated:** 2026-01-30  
**Version:** 1.1.0

---

## See Also

- [RLS_POLICIES.md](./RLS_POLICIES.md) - Row-level security
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Database usage patterns
- [COMPLIANCE.md](./COMPLIANCE.md) - PHI storage requirements
- [MIGRATIONS_AND_CHANGE.md](./MIGRATIONS_AND_CHANGE.md) - Schema change rules