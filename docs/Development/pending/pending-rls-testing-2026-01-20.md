# Pending: RLS Policies Testing Tasks
## Task 2: RLS Policies Setup - Testing & Verification

**Status:** ⏳ **PENDING**  
**Reason:** No frontend or user creation system available yet  
**Original Task:** [e-task-2-rls-policies.md](../Daily-plans/2026-01-20/e-task-2-rls-policies.md)  
**Date Created:** 2026-01-20  
**Task Date:** 2026-01-20

---

## 📋 Pending Tasks

### 5.1.3 Test with authenticated user (should see own data only)

**Prerequisites:**
- Frontend application with user authentication
- User creation system (doctor accounts)
- Supabase Auth configured

**Steps:**
- Log in to the Supabase dashboard as a test user (doctor) with a regular account (not service role or admin).
- Use the Table Editor or run SQL queries in the SQL Editor for each table (e.g., `appointments`, `conversations`, `messages`, `availability`, etc.).
- Confirm that:
  - The user can view only data where their `auth.uid()` matches the `doctor_id` or where relevant ownership logic applies (e.g., their own appointments, conversations, availability, messages).
  - The user cannot view, insert, update, or delete data belonging to other doctors/users.
- Try to query or edit another doctor's data directly (via SQL) and verify an error (permission denied) is returned.
- Repeat for all relevant tables.

**Tables to Test:**
- `appointments` - Should only see own appointments
- `conversations` - Should only see own conversations
- `messages` - Should only see messages from own conversations
- `availability` - Should only see own availability
- `blocked_times` - Should only see own blocked times
- `patients` - Should only see patients linked to own conversations
- `audit_logs` - Should only see own audit logs

---

### 5.1.4 Test with service role (should see all data)

**Prerequisites:**
- Service role key available
- Understanding of service role usage

**Steps:**
- Use the Supabase SQL Editor or psql client with the service role key (set your DB connection string's JWT token with the service role secret).
- Perform SELECT, INSERT, UPDATE, and DELETE operations on each table.
- Confirm that:
  - Service role queries (with `auth.role() = 'service_role'`) can read all records in every table, regardless of ownership fields (e.g., all doctors, all conversations, audit logs, etc.).
  - Service role can perform actions allowed for system workflows (e.g., inserting/updating patient records, processing audit logs, managing lifecycle).
  - Test that these elevated permissions are restricted to the service role (no regular users should have these capabilities).

**Tables to Test:**
- `webhook_idempotency` - Service role should have full access
- `audit_logs` - Service role should be able to INSERT
- `patients` - Service role should be able to INSERT/UPDATE/DELETE
- `conversations` - Service role should be able to INSERT/UPDATE/DELETE
- `messages` - Service role should be able to INSERT/UPDATE/DELETE

---

### 5.1.5 Test with different user (should NOT see other user's data)

**Prerequisites:**
- Multiple test users (doctors) created
- Test data for each user

**Steps:**
- Log in as a second test user (another doctor) whose records are disjoint from the first test user.
- Attempt to access data belonging to the first test user, especially in shared tables (appointments, conversations, availability).
- Confirm that:
  - Data from the first user/doctor is NOT visible or accessible. Only the second user's own data is returned.
  - Attempting to ACCESS, UPDATE, or DELETE other user data returns a permission denied error.
- Try using the RESTful API, client libraries, and direct SQL queries to verify consistent enforcement.

**Test Scenarios:**
1. User A tries to read User B's appointments → Should fail
2. User A tries to update User B's availability → Should fail
3. User A tries to delete User B's conversations → Should fail
4. User A tries to read User B's audit logs → Should fail (unless admin)

---

## 🔗 Related Files

- **Main Task:** [e-task-2-rls-policies.md](../Daily-plans/2026-01-20/e-task-2-rls-policies.md)
- **RLS Policies SQL:** `backend/migrations/002_rls_policies.sql`
- **Reference:** [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md)

---

## 📝 Notes

- These tasks require a functional authentication system
- Testing should be done once user creation and authentication are implemented
- Service role testing can be done earlier if needed (doesn't require frontend)
- Consider creating test scripts for automated testing once infrastructure is ready

---

**Last Updated:** 2026-01-20
