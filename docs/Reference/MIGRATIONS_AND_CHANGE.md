# Migrations & Change Management
## Control Evolution Without Chaos

**⚠️ CRITICAL: How to evolve the system without breaking existing functionality or violating locked contracts.**

---

## 🎯 Purpose

This file defines rules for how the system can evolve over time while maintaining stability and backward compatibility.

**This file owns:**
- When schema can change
- How contracts evolve
- Backward compatibility rules
- Deprecation strategy
- Versioning rules

**This file MUST NOT contain:**
- Implementation details (see RECIPES.md)
- Current schema (see DB_SCHEMA.md)
- Current contracts (see CONTRACTS.md)

---

## 📋 Related Files

- [CONTRACTS.md](./CONTRACTS.md) - Current API contracts (locked)
- [DB_SCHEMA.md](./DB_SCHEMA.md) - Current database schema
- [STANDARDS.md](./STANDARDS.md) - Coding standards
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System structure

---

## 🔒 Change Control Principles

### Principle 1: Backward Compatibility is Default

**Rule:** Changes MUST be backward compatible unless explicitly breaking.

**Rationale:**
- Prevents breaking existing clients
- Enables gradual migration
- Maintains API stability

**Backward Compatible:**
- ✅ Adding optional fields
- ✅ Adding new endpoints
- ✅ Extending enums (adding values)
- ✅ Adding new error codes

**Breaking Changes:**
- ❌ Removing fields
- ❌ Renaming fields
- ❌ Changing field types
- ❌ Removing endpoints
- ❌ Changing response structure

---

### Principle 2: Breaking Changes Require Version Bump

**Rule:** Breaking changes MUST create new API version (`/v2`, `/v3`, etc.).

**Rationale:**
- Maintains old version for existing clients
- Enables gradual migration
- Prevents forced client updates

**Process:**
1. Create new version endpoint (`/api/v2/...`)
2. Keep old version functional (`/api/v1/...`)
3. Document migration path
4. Set deprecation timeline for old version

**Example:**
```
Breaking change: Remove `patientName` field
→ Create /api/v2/appointments (without patientName)
→ Keep /api/v1/appointments (with patientName)
→ Deprecate v1 after migration period
```

---

### Principle 3: Schema Changes Must Be Migrated

**Rule:** Database schema changes MUST use migration scripts.

**Rationale:**
- Enables reproducible deployments
- Maintains version control
- Prevents data loss

**Before creating a migration (MANDATORY):**
- **Read all previous migrations** (in order: `001_...`, `002_...`, etc.) to understand:
  - Existing tables, columns, indexes, and constraints
  - Naming conventions (snake_case, table names, FK references)
  - Triggers and functions already defined (e.g. `update_updated_at_column`)
  - RLS policies and patterns (service role vs. user policies)
  - How the project connects to the database (Supabase, auth.users, etc.)
- This ensures new migrations are consistent and do not duplicate or conflict with existing schema.

**Process:**
1. Read all existing migration files in the migrations folder (in numeric order).
2. Create migration script (next sequential number; follow existing patterns).
3. Test migration on dev database
4. Update DB_SCHEMA.md
5. Update TypeScript types
6. Deploy migration before code changes

**Example:**
```sql
-- migrations/20260117_add_notification_status.sql
ALTER TABLE appointments
ADD COLUMN notification_status TEXT DEFAULT 'pending'
CHECK (notification_status IN ('pending', 'sent', 'failed'));
```

---

## 📊 Change Types & Rules

### Type 1: API Contract Changes

#### Non-Breaking Changes (Allowed)

**Adding Optional Fields:**
```json
// Before
{ "success": true, "data": { "id": "123" } }

// After (backward compatible)
{ "success": true, "data": { "id": "123", "metadata": { ... } } }
```

**Adding New Endpoints:**
- ✅ Always allowed (doesn't affect existing endpoints)

**Extending Enums:**
```typescript
// Before
status: 'pending' | 'confirmed' | 'cancelled'

// After (backward compatible)
status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
```

#### Breaking Changes (Require Version Bump)

**Removing Fields:**
```json
// Before
{ "data": { "id": "123", "name": "John" } }

// After (BREAKING)
{ "data": { "id": "123" } } // name removed
```

**Renaming Fields:**
```json
// Before
{ "data": { "userId": "123" } }

// After (BREAKING)
{ "data": { "user_id": "123" } } // userId renamed
```

**Changing Field Types:**
```json
// Before
{ "data": { "count": 5 } } // number

// After (BREAKING)
{ "data": { "count": "5" } } // string
```

**Changing Response Structure:**
```json
// Before
{ "success": true, "data": { "items": [...] } }

// After (BREAKING)
{ "result": { "items": [...] } } // different structure
```

---

### Type 2: Database Schema Changes

#### Safe Changes (Non-Breaking)

**Adding Columns (with default):**
```sql
ALTER TABLE appointments
ADD COLUMN notes TEXT DEFAULT NULL;
```
- ✅ Existing rows get default value
- ✅ Existing code continues to work

**Adding Indexes:**
```sql
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
```
- ✅ Performance improvement
- ✅ No functional changes

#### Breaking Changes (Require Migration)

**Removing Columns:**
```sql
-- ❌ BREAKING - Requires migration plan
ALTER TABLE appointments DROP COLUMN notes;
```
- **Process:**
  1. Remove column usage from code
  2. Deploy code changes
  3. Create migration to drop column
  4. Deploy migration

**Renaming Columns:**
```sql
-- ❌ BREAKING - Requires migration plan
ALTER TABLE appointments RENAME COLUMN patient_name TO patientName;
```
- **Process:**
  1. Add new column
  2. Migrate data
  3. Update code to use new column
  4. Deploy code
  5. Drop old column

**Changing Column Types:**
```sql
-- ❌ BREAKING - Requires migration plan
ALTER TABLE appointments ALTER COLUMN status TYPE TEXT;
```
- **Process:**
  1. Create migration with type conversion
  2. Test migration carefully
  3. Deploy migration
  4. Update code types

---

### Type 3: Code Pattern Changes

#### Refactoring Rules

**Allowed Refactoring:**
- ✅ Extract functions (behavior unchanged)
- ✅ Rename variables (scope unchanged)
- ✅ Improve code structure (behavior unchanged)
- ✅ Add comments/documentation

**Requires Approval:**
- ⚠️ Change function signatures (may break callers)
- ⚠️ Change error handling (may change behavior)
- ⚠️ Change validation logic (may reject previously valid input)

**Forbidden Refactoring:**
- ❌ Change public API contracts
- ❌ Change database schema without migration
- ❌ Remove functionality without deprecation

---

## 🔄 Migration Process

### Step 1: Plan Migration

**Document:**
- What is changing
- Why it's changing
- Breaking vs non-breaking
- Migration timeline
- Rollback plan

### Step 2: Create Migration Script

**For Database:**
```sql
-- migrations/YYYYMMDD_description.sql
BEGIN;
-- Migration SQL here
COMMIT;
```

**For API:**
```typescript
// Create new version endpoint
router.post('/api/v2/appointments', createAppointmentV2Controller);
// Keep old version
router.post('/api/v1/appointments', createAppointmentV1Controller);
```

### Step 3: Update Documentation

**Update:**
- DB_SCHEMA.md (if schema changed)
- CONTRACTS.md (if API changed)
- RECIPES.md (if patterns changed)
- STANDARDS.md (if rules changed)
- RLS_POLICIES.md (if RLS policies affected)

**RLS Migration Safety (MANDATORY):**

**Rule:** Anytime schema changes, explicitly verify RLS still matches.

**Checklist:**
- [ ] New columns added → Verify RLS policies still work (new columns may need policy updates)
- [ ] New tables created → Verify RLS is enabled and policies are created
- [ ] Columns renamed → Verify RLS policies reference correct column names
- [ ] Columns removed → Verify RLS policies don't reference removed columns
- [ ] Foreign keys changed → Verify RLS policies using joins still work

**Example:**
```sql
-- Schema change: Add new column
ALTER TABLE appointments ADD COLUMN notification_sent BOOLEAN DEFAULT FALSE;

-- RLS check: Verify existing policies still work
-- Existing policy: SELECT WHERE doctor_id = auth.uid()
-- ✅ Still works - new column doesn't affect policy

-- If policy needs update:
CREATE POLICY "doctors_can_view_notification_status"
ON appointments FOR SELECT
USING (doctor_id = auth.uid());
```

**Data Backfill Checklist (MANDATORY):**

**Rule:** If you add a new column with default null, you often still need a backfill for old rows.

**When Backfill is Needed:**
- New column with `DEFAULT NULL` → Old rows have NULL (may break queries/analytics)
- New column with `DEFAULT value` → Old rows have default, but may need computed values
- New computed column → All rows need computation
- New foreign key → All rows need relationship data

**Backfill Process:**
1. Add column with default (migration)
2. Deploy code that handles NULL gracefully
3. Create backfill script
4. Run backfill script (in batches for large tables)
5. Verify all rows updated
6. Update code to assume non-null (if applicable)

**Example:**
```sql
-- Step 1: Add column with default
ALTER TABLE appointments
ADD COLUMN notification_status TEXT DEFAULT 'pending'
CHECK (notification_status IN ('pending', 'sent', 'failed'));

-- Step 2: Backfill old rows (run after migration)
UPDATE appointments
SET notification_status = 'pending'
WHERE notification_status IS NULL;

-- Step 3: Verify
SELECT COUNT(*) FROM appointments WHERE notification_status IS NULL;
-- Should return 0
```

**AI Agents:** Never skip backfill for new columns - even with defaults, old rows may need explicit values.

### Step 4: Test Migration

**Test:**
- Migration script on dev database
- Old endpoints still work
- New endpoints work
- Backward compatibility verified

### Step 5: Deploy

**Deploy Order:**
1. Migration script (if database)
2. Code changes
3. Verify functionality
4. Monitor for issues

### Step 6: Deprecation (if breaking)

**Deprecation Timeline:**
- Announce deprecation (document)
- Provide migration guide
- Set deprecation date (6+ months)
- Remove after deprecation period

---

## 📅 Versioning Strategy

### API Versioning

**Format:** `/api/v1`, `/api/v2`, `/api/v3`

**Rules:**
- Major version for breaking changes
- Minor version for non-breaking additions (if needed)
- Maintain at least 2 versions during transition

**Example:**
```
/api/v1/appointments (old, deprecated)
/api/v2/appointments (new, current)
```

### Database Versioning

**Format:** Migration timestamps

**Rules:**
- Sequential migrations
- Never skip migration numbers
- Always test migrations

**Example:**
```
migrations/
  20260117_add_notification_status.sql
  20260120_rename_patient_name.sql
```

---

## 🚫 Forbidden Changes

**AI agents MUST refuse these changes:**

1. **Breaking contract changes without version bump**
   - Removing fields from CONTRACTS.md
   - Changing response structure
   - Removing endpoints

2. **Schema changes without migration**
   - Dropping columns directly
   - Renaming columns directly
   - Changing types without migration

3. **Removing functionality without deprecation**
   - Removing endpoints immediately
   - Removing features without notice

4. **Changing locked contracts**
   - Modifying CONTRACTS.md without approval
   - Changing middleware order (STANDARDS.md)

---

## ⚠️ AI Agent Enforcement

**AI agents MUST:**
- Identify breaking vs non-breaking changes
- Require version bump for breaking changes
- Create migration scripts for schema changes
- Update documentation for all changes
- Test migrations before deployment

**AI agents MUST NOT:**
- Make breaking changes without approval
- Skip migration scripts for schema changes
- Remove functionality without deprecation
- Change locked contracts without explicit approval

---

## 📝 Version

**Last Updated:** 2026-01-17  
**Version:** 1.0.0

---

## See Also

- [CONTRACTS.md](./CONTRACTS.md) - Contract versioning rules
- [DB_SCHEMA.md](./DB_SCHEMA.md) - Current schema
- [STANDARDS.md](./STANDARDS.md) - Coding standards
- [DECISION_RULES.md](./DECISION_RULES.md) - Conflict resolution