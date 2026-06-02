# Learning Topics - Row Level Security (RLS) Policies
## Task #2: Protecting Data at the Database Level

---

## 📚 What Are We Learning Today?

Today we're learning about **Row Level Security (RLS) Policies** - how to protect patient data at the database level so doctors can only access their own information. Think of it like **security guards and access cards in a hospital** - each doctor can only enter their own patient rooms, and system administrators have special access for maintenance tasks!

We'll learn about:
1. **What is Row Level Security?** - Database-level access control
2. **Why RLS is Critical** - Defense in depth for healthcare compliance
3. **JWT Claims & User Context** - How the database knows who you are
4. **RLS Policies** - Rules that control data access
5. **Service Role vs User Role** - Different access levels
6. **Policy Patterns** - Common patterns for different table types
7. **Testing RLS Policies** - How to verify security works
8. **Compliance & Security** - HIPAA and healthcare requirements

---

## 🎓 Topic 1: What is Row Level Security?

### What is RLS?

**Row Level Security (RLS)** is a database feature that controls who can access which rows of data in a table.

**Think of it like:**
- **Hospital Access Control** - Each doctor has a keycard that only opens their patient rooms
- **Security Guards** - Check your ID before allowing access
- **Locked File Cabinets** - Only authorized staff can access specific files

### How RLS Works

**Without RLS:**
- Application code must check permissions (can have bugs!)
- One bug = data breach
- Hard to audit access

**With RLS:**
- Database enforces permissions (can't bypass!)
- Defense in depth (even if app code has bugs)
- Required for healthcare compliance (HIPAA)

**Think of it like:**
- **Without RLS** = Trusting application code to check permissions (risky!)
- **With RLS** = Database automatically blocks unauthorized access (secure!)

### Real-World Analogy

**Hospital without RLS:**
- Doctor A can see all patients (even Doctor B's patients)
- One bug in application code = data breach
- No way to prevent unauthorized access at database level

**Hospital with RLS:**
- Doctor A can only see their own patients
- Even if application code has bugs, database blocks unauthorized access
- Security enforced at multiple layers (defense in depth)

---

## 🎓 Topic 2: Why RLS is Critical

### Defense in Depth

**RLS is one layer of security:**
1. **Application Layer** - Code checks permissions
2. **Database Layer (RLS)** - Database enforces permissions
3. **Network Layer** - Encryption in transit
4. **Storage Layer** - Encryption at rest

**Think of it like:**
- **Multiple Security Layers** - Like a hospital with guards, keycards, and locked doors
- **If one layer fails** - Other layers still protect data
- **RLS is the last line of defense** - Even if application code has bugs

### Compliance Requirements

**HIPAA Requirements:**
- Must enforce access controls
- Must prevent unauthorized data access
- Must audit all access attempts
- Must use least privilege (users see only what they need)

**RLS Provides:**
- Automatic access control at database level
- Prevents unauthorized access even if application has bugs
- Required for HIPAA compliance

**Think of it like:**
- **Legal Requirement** - Like fire safety codes for hospitals
- **Not Optional** - Must have RLS for healthcare data
- **Audit Trail** - All access attempts logged automatically

### Benefits of RLS

**Security Benefits:**
- Prevents data leakage even if application code has bugs
- Enforces access control at database level (can't bypass)
- Automatic protection for all queries

**Compliance Benefits:**
- Meets HIPAA access control requirements
- Provides audit trail
- Demonstrates security measures

**Think of it like:**
- **Automatic Protection** - Like automatic locks on hospital doors
- **Can't Bypass** - Even if you know the system, RLS still blocks unauthorized access
- **Always Active** - Works for every query automatically

---

## 🎓 Topic 3: JWT Claims & User Context

### What is a JWT?

**JWT (JSON Web Token)** is like an **ID badge** that tells the database who you are.

**Think of it like:**
- **Hospital ID Badge** - Shows your name, role, and access level
- **Security Pass** - Proves you're authorized
- **Identity Card** - Database uses it to check permissions

### JWT Claims Available in RLS

**Three main claims:**
1. **`auth.uid()`** - Your user ID (who you are)
2. **`auth.role()`** - Your role ('authenticated', 'anon', 'service_role')
3. **`auth.jwt()`** - Full JWT payload (all information)

**Example:**
```sql
-- Check if you're the doctor who owns this appointment
auth.uid() = doctor_id

-- Check if you're an authenticated user
auth.role() = 'authenticated'

-- Check if you're an admin (from JWT payload)
auth.jwt() ->> 'role' = 'admin'
```

**Think of it like:**
- **auth.uid()** = Your employee ID number
- **auth.role()** = Your job title (doctor, nurse, admin)
- **auth.jwt()** = Your full ID badge with all details

### How Database Uses JWT

**When you make a query:**
1. Database receives your JWT
2. Extracts your user ID and role
3. Checks RLS policies using your identity
4. Returns only rows you're allowed to see

**Think of it like:**
- **You request data** = Show me my appointments
- **Database checks JWT** = Who are you? (Doctor A)
- **RLS policy checks** = Can Doctor A see this appointment? (Only if doctor_id = Doctor A)
- **Returns data** = Only appointments where doctor_id = Doctor A

---

## 🎓 Topic 4: RLS Policies

### What is a Policy?

A **policy** is a rule that defines who can access what data.

**Think of it like:**
- **Security Rule** = "Doctors can only see their own patients"
- **Access Rule** = "Service role can access webhook data"
- **Permission Rule** = "Users can read their own audit logs"

### Policy Structure

**Every policy has:**
- **Name** - Descriptive name (e.g., "Users can read own appointments")
- **Operation** - SELECT, INSERT, UPDATE, or DELETE
- **Condition** - When the policy applies (e.g., `auth.uid() = doctor_id`)

**Example:**
```sql
CREATE POLICY "Users can read own appointments"
ON appointments FOR SELECT
USING (auth.uid() = doctor_id);
```

**Think of it like:**
- **Policy Name** = Rule description
- **ON table** = Which table this rule applies to
- **FOR SELECT** = This rule applies to reading data
- **USING condition** = When you can read (only your own appointments)

### Policy Operations

**Four types of operations:**
1. **SELECT** - Who can read data
2. **INSERT** - Who can create new data
3. **UPDATE** - Who can modify existing data
4. **DELETE** - Who can remove data

**Think of it like:**
- **SELECT** = Can you view this file?
- **INSERT** = Can you create a new file?
- **UPDATE** = Can you edit this file?
- **DELETE** = Can you delete this file?

### USING vs WITH CHECK

**USING clause:**
- Used for SELECT and DELETE
- Checks existing rows
- "Can you see/delete this existing row?"

**WITH CHECK clause:**
- Used for INSERT and UPDATE
- Checks new/modified rows
- "Can you create/update a row with these values?"

**Example:**
```sql
-- SELECT policy (check existing row)
CREATE POLICY "Users can read own appointments"
ON appointments FOR SELECT
USING (auth.uid() = doctor_id);

-- INSERT policy (check new row)
CREATE POLICY "Users can insert own appointments"
ON appointments FOR INSERT
WITH CHECK (auth.uid() = doctor_id);
```

**Think of it like:**
- **USING** = "Can you access this existing file?" (checks current state)
- **WITH CHECK** = "Can you create a file with this name?" (checks what you're trying to do)

---

## 🎓 Topic 5: Service Role vs User Role

### What is Service Role?

**Service Role** is like a **master key** that bypasses all security rules.

**Think of it like:**
- **Hospital Administrator Key** - Opens all doors
- **System Maintenance Access** - For automated tasks
- **Emergency Override** - Use only when absolutely necessary

### When to Use Service Role

**Service Role MUST be used for:**
- Webhook processing (no user context - system operation)
- System-level operations (background jobs, scheduled tasks)
- Audit log insertion (application-level, not user-level)
- Admin operations (when explicitly required)

**Think of it like:**
- **Webhook Processing** = Automated system task (no user logged in)
- **Background Jobs** = Scheduled maintenance tasks
- **Audit Logs** = System records actions (not user actions)

### When NOT to Use Service Role

**Service Role MUST NOT be used for:**
- ❌ User-initiated requests (use user context instead)
- ❌ Bypassing RLS "for convenience" (security risk!)
- ❌ Operations that should respect user permissions

**Think of it like:**
- **User Requests** = Doctor requests their appointments (use user role)
- **Bypassing Security** = Using master key when regular key should work (dangerous!)
- **Respecting Permissions** = Following security rules (use user role)

### Service Role Dangers

**Why Service Role is Dangerous:**
- Bypasses ALL RLS policies
- Can access ANY data (even other doctors' patients)
- No access control (full database access)

**Think of it like:**
- **Master Key** = Opens every door in the hospital
- **No Restrictions** = Can access any patient file
- **Use with Caution** = Only for system operations, never for user requests

---

## 🎓 Topic 6: Policy Patterns

### Pattern 1: Ownership-Based Access

**Use for:** Tables where users own their data (appointments, availability)

**Pattern:**
```sql
-- Users can only access their own data
CREATE POLICY "Users can read own appointments"
ON appointments FOR SELECT
USING (auth.uid() = doctor_id);
```

**Think of it like:**
- **Ownership Check** = "Is this your appointment?" (doctor_id matches your ID)
- **Only Your Data** = Can only see appointments where you're the doctor

**Tables using this pattern:**
- `appointments` - Doctors own their appointments
- `availability` - Doctors own their availability schedules
- `blocked_times` - Doctors own their blocked times

---

### Pattern 2: Service Role Only

**Use for:** System tables (webhook_idempotency, audit_logs insertion)

**Pattern:**
```sql
-- Only service role can access
CREATE POLICY "Service role can read webhook idempotency"
ON webhook_idempotency FOR SELECT
USING (auth.role() = 'service_role');
```

**Think of it like:**
- **System-Only Access** = Only automated systems can access
- **No User Access** = Regular users cannot see this data
- **Security Isolation** = Webhook data separate from user data

**Tables using this pattern:**
- `webhook_idempotency` - System-only (webhook processing)
- `audit_logs` INSERT - System-only (application inserts logs)

---

### Pattern 3: Related Data Access

**Use for:** Tables where users can access related data (patients linked to appointments)

**Pattern:**
```sql
-- Doctors can read patients linked to their appointments
CREATE POLICY "Doctors can read linked patients"
ON patients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.patient_id = patients.id
    AND appointments.doctor_id = auth.uid()
  )
);
```

**Think of it like:**
- **Related Access** = "Can you see this patient?" (Only if you have an appointment with them)
- **Linked Data** = Access to related records (patients linked to your appointments)

**Tables using this pattern:**
- `patients` - Doctors can see patients linked to their appointments/conversations
- `messages` - Doctors can see messages from their conversations

---

### Pattern 4: Immutable Audit Trail

**Use for:** Audit logs (no updates or deletes allowed)

**Pattern:**
```sql
-- Users can read their own audit logs
CREATE POLICY "Users can read own audit logs"
ON audit_logs FOR SELECT
USING (auth.uid() = user_id);

-- Service role can insert (no UPDATE/DELETE policies = immutable)
CREATE POLICY "Service role can insert audit logs"
ON audit_logs FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- No UPDATE or DELETE policies = default deny (immutable)
```

**Think of it like:**
- **Append-Only** = Can add new records, but never change or delete
- **Immutable** = Once written, cannot be modified
- **Audit Trail** = Complete history of all actions

**Tables using this pattern:**
- `audit_logs` - Immutable audit trail (no UPDATE/DELETE)

---

## 🎓 Topic 7: Testing RLS Policies

### Why Test RLS?

**Testing ensures:**
- Policies work correctly
- Users can only access their own data
- Service role works for system operations
- Security boundaries are enforced

**Think of it like:**
- **Security Testing** = Testing locks and access cards
- **Verification** = Making sure security works as expected
- **Compliance** = Proving security measures are in place

### Testing Checklist

**Test with Authenticated User:**
1. Login as Doctor A
2. Try to read Doctor A's appointments → Should succeed
3. Try to read Doctor B's appointments → Should fail (return empty or error)
4. Try to create appointment for Doctor A → Should succeed
5. Try to create appointment for Doctor B → Should fail

**Test with Service Role:**
1. Use service role client
2. Try to read webhook_idempotency → Should succeed
3. Try to insert audit_logs → Should succeed
4. Try to read all appointments → Should succeed (bypasses RLS)

**Test with Different Users:**
1. Login as Doctor A → See only Doctor A's data
2. Login as Doctor B → See only Doctor B's data
3. Verify no cross-access → Doctor A cannot see Doctor B's data

**Think of it like:**
- **Test Each Scenario** = Test all access patterns
- **Verify Security** = Make sure unauthorized access is blocked
- **Document Results** = Keep records of security testing

---

## 🎓 Topic 8: Compliance & Security

### HIPAA Requirements

**Access Control Requirements:**
- Must enforce least privilege (users see only what they need)
- Must prevent unauthorized access
- Must audit all access attempts
- Must use defense in depth (multiple security layers)

**RLS Provides:**
- Automatic least privilege enforcement
- Prevents unauthorized access at database level
- Required for HIPAA compliance

**Think of it like:**
- **Legal Requirement** = HIPAA mandates access controls
- **RLS Compliance** = Meets HIPAA access control requirements
- **Audit Trail** = All access attempts logged automatically

### Least Privilege Principle

**What is Least Privilege?**
- Users should have minimum access needed
- Doctors see only their own patients
- System operations use service role appropriately

**RLS Enforces:**
- Automatic least privilege (can't see other doctors' data)
- No way to bypass (database-level enforcement)
- Required for compliance

**Think of it like:**
- **Minimum Access** = Only access what you need for your job
- **Automatic Enforcement** = Database automatically restricts access
- **Compliance** = Meets security best practices

### Defense in Depth

**Multiple Security Layers:**
1. **Application Layer** - Code checks permissions
2. **Database Layer (RLS)** - Database enforces permissions
3. **Network Layer** - Encryption in transit
4. **Storage Layer** - Encryption at rest

**Why Multiple Layers?**
- If one layer fails, others still protect
- RLS is the last line of defense
- Even if application code has bugs, RLS blocks unauthorized access

**Think of it like:**
- **Multiple Locks** = Like a hospital with guards, keycards, and locked doors
- **Backup Security** = If one security measure fails, others still work
- **Defense in Depth** = Multiple layers of protection

---

## 🎓 Topic 9: Common Policy Patterns by Table Type

### Doctor-Owned Tables

**Tables:** `appointments`, `availability`, `blocked_times`

**Pattern:**
```sql
-- All operations: Users can only access their own data
CREATE POLICY "Users can read own appointments"
ON appointments FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own appointments"
ON appointments FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own appointments"
ON appointments FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own appointments"
ON appointments FOR DELETE
USING (auth.uid() = doctor_id);
```

**Think of it like:**
- **Full Control** = Doctors can create, read, update, delete their own data
- **No Cross-Access** = Cannot access other doctors' data
- **Ownership-Based** = Access based on ownership (doctor_id)

---

### System-Only Tables

**Tables:** `webhook_idempotency` (all operations), `audit_logs` (INSERT only)

**Pattern:**
```sql
-- Service role only (no user access)
CREATE POLICY "Service role can read webhook idempotency"
ON webhook_idempotency FOR SELECT
USING (auth.role() = 'service_role');
```

**Think of it like:**
- **System Access Only** = Only automated systems can access
- **No User Access** = Regular users cannot see this data
- **Isolated** = System data separate from user data

---

### Related Data Tables

**Tables:** `patients`, `messages` (linked to conversations)

**Pattern:**
```sql
-- Doctors can read patients linked to their appointments
CREATE POLICY "Doctors can read linked patients"
ON patients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.patient_id = patients.id
    AND appointments.doctor_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.patient_id = patients.id
    AND conversations.doctor_id = auth.uid()
  )
);
```

**Think of it like:**
- **Linked Access** = Can access related data (patients linked to your appointments)
- **Relationship-Based** = Access based on relationships (appointments, conversations)
- **Indirect Access** = Access through relationships, not direct ownership

---

### Immutable Tables

**Tables:** `audit_logs` (no UPDATE/DELETE)

**Pattern:**
```sql
-- Users can read their own audit logs
CREATE POLICY "Users can read own audit logs"
ON audit_logs FOR SELECT
USING (auth.uid() = user_id);

-- Service role can insert (no UPDATE/DELETE = immutable)
CREATE POLICY "Service role can insert audit logs"
ON audit_logs FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- No UPDATE or DELETE policies = default deny (immutable)
```

**Think of it like:**
- **Append-Only** = Can add new records, but never change or delete
- **Immutable** = Once written, cannot be modified
- **Audit Trail** = Complete history of all actions

---

## 🎓 Topic 10: Policy Best Practices

### Policy Naming

**Good Policy Names:**
- Descriptive and clear
- Indicate who can do what
- Example: "Users can read own appointments"

**Bad Policy Names:**
- Vague or unclear
- Don't indicate purpose
- Example: "policy1", "read_policy"

**Think of it like:**
- **Good Name** = "Doctors can access their own patient files" (clear purpose)
- **Bad Name** = "policy_123" (unclear purpose)

---

### Policy Organization

**Organize by:**
- Table (group policies by table)
- Operation (SELECT, INSERT, UPDATE, DELETE)
- Purpose (user access, service role, admin)

**Think of it like:**
- **Grouped by Table** = All appointments policies together
- **Grouped by Operation** = All SELECT policies, then INSERT, etc.
- **Clear Structure** = Easy to find and maintain

---

### Testing Policies

**Always Test:**
- User can access their own data
- User cannot access other users' data
- Service role works for system operations
- Policies work for all operations (SELECT, INSERT, UPDATE, DELETE)

**Think of it like:**
- **Comprehensive Testing** = Test all access scenarios
- **Security Verification** = Make sure unauthorized access is blocked
- **Compliance** = Prove security measures work

---

## ✅ Learning Checklist

Before moving to implementation, make sure you understand:

- [x] ✅ What Row Level Security is and why we need it
- [x] ✅ Why RLS is critical for healthcare compliance
- [x] ✅ How JWT claims work (auth.uid(), auth.role(), auth.jwt())
- [x] ✅ How RLS policies control data access
- [x] ✅ Difference between service role and user role
- [x] ✅ When to use service role (system operations only)
- [x] ✅ Common policy patterns (ownership, service role, related data, immutable)
- [x] ✅ How to test RLS policies
- [x] ✅ How RLS enforces least privilege
- [x] ✅ How RLS provides defense in depth
- [x] ✅ Policy best practices (naming, organization, testing)

---

## 🎯 Next Steps

Once you understand all these concepts:
1. We'll create the RLS policies SQL file
2. Define policies for all tables
3. Set up ownership-based policies for doctor-owned tables
4. Set up service role policies for system tables
5. Set up related data policies for linked tables
6. Test policies with different user contexts

**Remember:** Learn first, then build! 🚀

---

## 🔗 Key Concepts Summary

**Row Level Security:**
- Database-level access control
- Enforces permissions at database layer
- Required for healthcare compliance (HIPAA)

**JWT Claims:**
- auth.uid() = User ID
- auth.role() = User role
- auth.jwt() = Full JWT payload

**Policy Patterns:**
- Ownership-based = Users access their own data
- Service role only = System operations
- Related data = Access through relationships
- Immutable = Append-only (no UPDATE/DELETE)

**Service Role:**
- Bypasses all RLS policies
- Use only for system operations
- Never use for user-initiated requests

**Compliance:**
- RLS enforces least privilege
- Provides defense in depth
- Required for HIPAA compliance
- All access attempts logged

---

**Last Updated:** January 20, 2026  
**Related Task:** Task 2 - RLS Policies Setup  
**Status:** 📚 Ready to Learn
