# Row-Level Security (RLS) Policies
## Supabase Critical - Define Data Ownership & Access

**⚠️ CRITICAL: RLS is the primary security mechanism. All tables MUST have RLS enabled.**

---

## 🎯 Purpose

This file defines row-level security rules, who can read/write what, JWT claims used, and service role rules.

**This file owns:**
- Row-level security rules
- Who can read/write what
- JWT claims used
- Service role rules

**This file MUST NOT contain:**
- App logic (see ARCHITECTURE.md)
- Controller code (see RECIPES.md)
- Database schema (see DB_SCHEMA.md)

---

## 📋 Related Files

- [DB_SCHEMA.md](./DB_SCHEMA.md) - Database schema and table definitions
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Database usage patterns
- [COMPLIANCE.md](./COMPLIANCE.md) - Access control requirements

---

## 🔒 RLS Overview

**Rule:** RLS is enabled on all tables by default.

**Enforcement:**
- RLS policies are checked on every query
- Policies apply to all users **except service role**
- Policies are enforced at database level (not application level)

**CRITICAL:** Service role **can bypass RLS**; therefore its use is **extremely restricted**. Service role should ONLY be used:
- For admin operations that require system-level access
- In server-side functions that require unrestricted access
- With explicit approval and audit logging

**Benefits:**
- Defense in depth (security at database layer)
- Prevents data leakage even if application code has bugs
- Required for compliance (HIPAA)

---

## 👤 User Context

### JWT Claims

**Available in RLS policies:**
- `auth.uid()` - User ID from JWT
- `auth.jwt()` - Full JWT payload
- `auth.role()` - User role ('authenticated' | 'anon' | 'service_role')

**Example:**
```sql
-- Check if user ID matches
auth.uid() = doctor_id

-- Check user role
auth.role() = 'authenticated'
```

---

## 📊 Table Policies

### `appointments` Table

**RLS Enabled:** ✅ Yes

**Read Policy:**
```sql
-- Users can only read their own appointments
CREATE POLICY "Users can read own appointments"
ON appointments FOR SELECT
USING (auth.uid() = doctor_id);
```

**Insert Policy:**
```sql
-- Users can only create appointments for themselves
CREATE POLICY "Users can insert own appointments"
ON appointments FOR INSERT
WITH CHECK (auth.uid() = doctor_id);
```

**Update Policy:**
```sql
-- Users can only update their own appointments
CREATE POLICY "Users can update own appointments"
ON appointments FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);
```

**Delete Policy:**
```sql
-- Users can only delete their own appointments
CREATE POLICY "Users can delete own appointments"
ON appointments FOR DELETE
USING (auth.uid() = doctor_id);
```

**Rationale:**
- Doctors own their appointments
- Patients are identified by phone (not user accounts)
- Only appointment owner can access

---

### `payments` Table

**RLS Enabled:** ✅ Yes

**Read Policy:**
```sql
-- Doctors can read payments for their appointments
CREATE POLICY "Doctors can read own payments"
ON payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = payments.appointment_id
    AND appointments.doctor_id = auth.uid()
  )
);
```

**Insert Policy:**
```sql
-- Service role only (webhook worker creates payment records)
CREATE POLICY "Service role can insert payments"
ON payments FOR INSERT
WITH CHECK (auth.role() = 'service_role');
```

**Update Policy:**
```sql
-- Service role only (webhook worker updates status)
CREATE POLICY "Service role can update payments"
ON payments FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
```

**Delete Policy:** None (payments are immutable; no delete)

**Rationale:**
- Doctors read payments via appointments (doctor-only)
- Webhook worker (service role) creates/updates on payment events
- No user can insert/update payments directly

---

### `webhook_idempotency` Table

**RLS Enabled:** ✅ Yes

**Read Policy:**
```sql
-- Service role only (no user access)
CREATE POLICY "Service role can read webhook idempotency"
ON webhook_idempotency FOR SELECT
USING (auth.role() = 'service_role');
```

**Insert Policy:**
```sql
-- Service role only
CREATE POLICY "Service role can insert webhook idempotency"
ON webhook_idempotency FOR INSERT
WITH CHECK (auth.role() = 'service_role');
```

**Update Policy:**
```sql
-- Service role only
CREATE POLICY "Service role can update webhook idempotency"
ON webhook_idempotency FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
```

**Rationale:**
- Webhook processing is system-level (not user-level)
- No user should access webhook data
- Prevents data leakage

---

### `audit_logs` Table

**RLS Enabled:** ✅ Yes

**Read Policy:**
```sql
-- Users can read their own audit logs
-- Admins can read all audit logs
CREATE POLICY "Users can read own audit logs"
ON audit_logs FOR SELECT
USING (
  auth.uid() = user_id OR
  auth.jwt() ->> 'role' = 'admin'
  
  -- **CRITICAL:** Admin role claim MUST be minted server-side only (never client-controlled)
  -- Admin role claim MUST be mapped from a database table (e.g., user_roles table)
  -- NEVER trust client-provided role claims without server-side verification
);
```

**Insert Policy:**
```sql
-- Service role only (application inserts audit logs)
CREATE POLICY "Service role can insert audit logs"
ON audit_logs FOR INSERT
WITH CHECK (auth.role() = 'service_role');
```

**Update/Delete Policy:**
```sql
-- No updates or deletes (immutable audit trail)
-- No policy = no access (default deny)
```

**Rationale:**
- Audit logs must be immutable (append-only)
- Users can review their own audit history
- Admins need full access for compliance reviews

---

### `patients` Table

**RLS Enabled:** ✅ Yes (migration 002)

**Current MVP:** Service role used for all writes (webhook worker creates/updates patients). Doctors can read patients linked to their conversations.

**Read Policy:**
```sql
-- Doctors can read patients linked to their conversations
CREATE POLICY "Doctors can read linked patients"
ON patients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.patient_id = patients.id
    AND conversations.doctor_id = auth.uid()
  )
);
```

**Insert/Update/Delete Policy:**
```sql
-- Service role only (created/updated via webhook/conversation flow)
CREATE POLICY "Service role can insert patients" ...
CREATE POLICY "Service role can update patients" ...
CREATE POLICY "Service role can delete patients" ...
```

**Rationale:**
- Patients are created by webhook worker (no user context) → service role for writes
- Doctors access patients only via their conversations (defense in depth)

---

### `conversations` Table

**RLS Enabled:** ✅ Yes (migration 002)

**Read Policy:**
```sql
-- Doctors can read their own conversations
CREATE POLICY "Doctors can read own conversations"
ON conversations FOR SELECT
USING (auth.uid() = doctor_id);
```

**Insert/Update/Delete Policy:**
```sql
-- Service role only (created/updated via webhook)
CREATE POLICY "Service role can insert conversations" ...
CREATE POLICY "Service role can update conversations" ...
CREATE POLICY "Service role can delete conversations" ...
```

**Rationale:**
- Conversations are created by webhook worker → service role for writes
- Doctors own their conversations (doctor_id = auth.uid())

---

### `messages` Table

**RLS Enabled:** ✅ Yes (migration 002)

**Read Policy:**
```sql
-- Doctors can read messages from their own conversations
CREATE POLICY "Doctors can read messages from own conversations"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.doctor_id = auth.uid()
  )
);
```

**Insert/Update/Delete Policy:**
```sql
-- Service role only (created via webhook)
CREATE POLICY "Service role can insert messages" ...
CREATE POLICY "Service role can update messages" ...
CREATE POLICY "Service role can delete messages" ...
```

**Rationale:**
- Messages are created by webhook worker → service role for writes
- Doctors access messages only via their conversations

---

## 🔑 Service Role Rules

### When to Use Service Role

**Service role MUST be used for:**
- Webhook processing (no user context)
- System-level operations (background jobs)
- Admin operations (when explicitly required)
- Audit log insertion (application-level, not user-level)

**Service role MUST NOT be used for:**
- ❌ User-initiated requests (use user context)
- ❌ Bypassing RLS "for convenience"
- ❌ Operations that should respect user permissions

**Example:**
```typescript
// ✅ CORRECT - Service role for webhook processing
const { data } = await supabaseAdmin
  .from('webhook_idempotency')
  .insert({ eventId, provider, status: 'processing' });

// ❌ WRONG - Service role to bypass user permissions
const { data } = await supabaseAdmin
  .from('appointments')
  .select('*'); // Bypasses RLS - WRONG
```

---

## 👥 Ownership Rules

### Appointment Ownership

**Rule:** Appointments belong to doctors (users).

**Enforcement:**
- `doctor_id` column must match `auth.uid()`
- RLS policy enforces `auth.uid() = doctor_id`
- Application code must validate ownership (defense in depth)

**Patient Data:**
- Patients are identified by phone (not user accounts)
- Patient data is stored encrypted
- Patient data is accessible only to appointment owner (doctor)

---

## 🔐 Permission Model

### Read Permissions

**Users can read:**
- Their own appointments
- Their own audit logs

**Users cannot read:**
- Other users' appointments
- Webhook data
- Other users' audit logs (unless admin)

---

### Write Permissions

**Users can write:**
- Their own appointments (create, update, delete)

**Users cannot write:**
- Other users' appointments
- Webhook data
- Audit logs (application-only)

---

### Admin Permissions

**Admins can read:**
- All appointments (for compliance reviews)
- All audit logs (for compliance reviews)

**Admins cannot write:**
- Appointments (unless explicitly allowed)
- Audit logs (immutable)

**Admin Detection:**
```sql
-- Check admin role in JWT
auth.jwt() ->> 'role' = 'admin'
```

---

## 🚫 Never Do These

**AI Agents MUST NEVER:**
- ❌ Disable RLS "for testing"
- ❌ Use service role to bypass user permissions
- ❌ Create policies that allow all users access
- ❌ Skip ownership validation in application code
- ❌ Expose user data to other users

**Rationale:**
- RLS is defense in depth
- Service role bypasses all security
- Broad access violates compliance
- Application validation can have bugs (use RLS as backup)

---

## 📝 Version

**Last Updated:** 2026-01-30  
**Version:** 1.1.0

---

## See Also

- [DB_SCHEMA.md](./DB_SCHEMA.md) - Table definitions
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Database usage patterns
- [COMPLIANCE.md](./COMPLIANCE.md) - Access control requirements