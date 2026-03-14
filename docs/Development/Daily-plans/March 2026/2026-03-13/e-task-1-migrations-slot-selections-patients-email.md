# Task 1: Migrations — slot_selections, patients.email
## 2026-03-13

---

## 📋 Task Overview

Add database migrations for the redesigned appointment flow: (1) `slot_selections` table for storing user's slot choice from the external picker; (2) `patients.email` column for optional email (receipts).

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-13

**Change Type:**
- [x] **New feature** — New table and column

**Current State:**
- ✅ **What exists:** slot_selections table; patients.email column; migration 014 applied
- ✅ **What's done:** Migration run in SQL editor
- ⚠️ **Notes:** Patient types (database.ts, UpdatePatient) deferred to e-task-2 or e-task-5

**Scope Guard:**
- Expected files touched: 1–2 (migrations only)

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md) §4
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. slot_selections Table

- [x] 1.1 Create migration `014_slot_selections_and_patients_email.sql` — **Completed: 2026-03-13**
  - [x] 1.1.1 Create `slot_selections` table with: id, conversation_id (FK), doctor_id (FK), slot_start (TIMESTAMPTZ), created_at, consumed_at
  - [x] 1.1.2 Add UNIQUE(conversation_id) — one draft per conversation; new pick overwrites
  - [x] 1.1.3 Add indexes: conversation_id for lookup
  - [x] 1.1.4 Enable RLS; add service role policies (SELECT, INSERT, UPDATE) — backend-only access
- [ ] 1.2 Document in DB_SCHEMA.md (if applicable) — optional

### 2. patients.email Column

- [x] 2.1 Add `email` column to patients — **Completed: 2026-03-13**
  - [x] 2.1.1 `ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT NULL`
  - [x] 2.1.2 Add COMMENT for PHI/encryption note
- [ ] 2.2 Update patient types (database.ts, UpdatePatient) — done in e-task-2 or e-task-5

### 3. Verification

- [x] 3.1 Run migrations locally — **Completed: 2026-03-13**
- [x] 3.2 Verify slot_selections RLS (service role can insert/select)
- [x] 3.3 Verify patients.email nullable

---

## 📁 Files to Create/Update

```
backend/
└── migrations/
    └── 014_slot_selections_and_patients_email.sql   (NEW)
```

**Existing Code Status:**
- ✅ migrations/001–014 — EXISTS (014 applied)
- ✅ patients.email — added
- ✅ slot_selections — created

**When creating a migration:**
- [x] Read all previous migrations (001–013) in order
- [x] Follow naming: snake_case, existing trigger patterns
- [x] RLS: slot_selections is backend-only (service role)

---

## 🧠 Design Constraints

- slot_selections: No PHI; only conversation_id, doctor_id, slot_start, timestamps
- patients.email: PHI; encrypted at rest (platform-level Supabase)
- RLS: slot_selections accessed only by service role (select-slot API, no doctor UI)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – new table, new column)
  - [x] **RLS verified?** (Y – slot_selections service role; patients has existing RLS)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N – slot_selections can be purged old consumed_at; email follows patients lifecycle)

---

## ✅ Acceptance & Verification Criteria

- [x] slot_selections table exists with correct schema
- [x] patients.email column exists, nullable
- [x] Migrations run without error
- [x] RLS allows service role to insert/select slot_selections

---

## 📝 Migration Draft (Reference)

```sql
-- 014_slot_selections_and_patients_email.sql

-- 1. slot_selections table
CREATE TABLE IF NOT EXISTS slot_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  UNIQUE(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_selections_conversation_id ON slot_selections(conversation_id);

ALTER TABLE slot_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage slot selections"
  ON slot_selections FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. patients.email
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT NULL;
COMMENT ON COLUMN patients.email IS 'Optional; for receipts. Encrypted at rest (platform-level).';
```

---

## 🔗 Related Tasks

- [e-task-2: Collection flow redesign](./e-task-2-collection-flow-redesign.md)
- [e-task-3: Slot selection API](./e-task-3-slot-selection-api.md)
- [e-task-5: Webhook flow integration](./e-task-5-webhook-flow-integration.md)

---

**Last Updated:** 2026-03-13  
**Completed:** 2026-03-13
