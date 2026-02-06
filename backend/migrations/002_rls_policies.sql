-- ============================================================================
-- Row Level Security (RLS) Policies Migration
-- ============================================================================
-- Migration: 002_rls_policies.sql
-- Date: 2026-01-20
-- Description: Creates RLS policies for all database tables
-- 
-- Purpose:
--   - Enforce data ownership (doctors can only access their own data)
--   - Isolate system tables (webhook_idempotency, audit_logs)
--   - Ensure compliance with HIPAA/GDPR requirements
--   - Provide defense in depth security at database layer
--
-- Policy Naming Convention:
--   - Descriptive names: "Users can read own appointments"
--   - Pattern: "[Who] can [action] [what]"
--   - Examples:
--     * "Users can read own appointments"
--     * "Service role can insert audit logs"
--     * "Doctors can read linked patients"
--
-- Important Notes:
--   - RLS is already enabled on all tables (from migration 001)
--   - Policies apply to all users except service role
--   - Service role bypasses RLS (use with extreme caution)
--   - Admin role claims must be server-side verified (never client-controlled)
-- ============================================================================

-- ============================================================================
-- 1. CORE TABLES POLICIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- appointments table policies
-- Pattern: Ownership-based (doctors own their appointments)
-- ----------------------------------------------------------------------------

-- SELECT: Users can only read their own appointments
CREATE POLICY "Users can read own appointments"
ON appointments FOR SELECT
USING (auth.uid() = doctor_id);

-- INSERT: Users can only create appointments for themselves
CREATE POLICY "Users can insert own appointments"
ON appointments FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

-- UPDATE: Users can only update their own appointments
CREATE POLICY "Users can update own appointments"
ON appointments FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

-- DELETE: Users can only delete their own appointments
CREATE POLICY "Users can delete own appointments"
ON appointments FOR DELETE
USING (auth.uid() = doctor_id);

-- ----------------------------------------------------------------------------
-- webhook_idempotency table policies
-- Pattern: Service role only (system-level operations)
-- ----------------------------------------------------------------------------

-- SELECT: Service role only (no user access)
CREATE POLICY "Service role can read webhook idempotency"
ON webhook_idempotency FOR SELECT
USING (auth.role() = 'service_role');

-- INSERT: Service role only
CREATE POLICY "Service role can insert webhook idempotency"
ON webhook_idempotency FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- UPDATE: Service role only
CREATE POLICY "Service role can update webhook idempotency"
ON webhook_idempotency FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- No DELETE policy (default deny - webhook data should not be deleted)

-- ----------------------------------------------------------------------------
-- audit_logs table policies
-- Pattern: Users can read own, admins can read all, service role can insert
-- ----------------------------------------------------------------------------

-- SELECT: Users can read their own audit logs OR admins can read all
CREATE POLICY "Users can read own audit logs"
ON audit_logs FOR SELECT
USING (
  auth.uid() = user_id OR
  auth.jwt() ->> 'role' = 'admin'
  
  -- **CRITICAL:** Admin role claim MUST be minted server-side only (never client-controlled)
  -- Admin role claim MUST be mapped from a database table (e.g., user_roles table)
  -- NEVER trust client-provided role claims without server-side verification
);

-- INSERT: Service role only (application inserts audit logs)
CREATE POLICY "Service role can insert audit logs"
ON audit_logs FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- No UPDATE or DELETE policies (immutable audit trail - default deny)

-- ============================================================================
-- 2. NEW TABLES POLICIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- patients table policies
-- Pattern: Related data access (doctors can read patients linked to their conversations)
-- Note: Patients are created/updated via webhook (service role), not by doctors directly
-- ----------------------------------------------------------------------------

-- SELECT: Doctors can read patients linked to their conversations
CREATE POLICY "Doctors can read linked patients"
ON patients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.patient_id = patients.id
    AND conversations.doctor_id = auth.uid()
  )
);

-- INSERT: Service role only (created via webhook/conversation)
CREATE POLICY "Service role can insert patients"
ON patients FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- UPDATE: Service role only (updated via webhook/conversation)
CREATE POLICY "Service role can update patients"
ON patients FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- DELETE: Service role only (data lifecycle management)
CREATE POLICY "Service role can delete patients"
ON patients FOR DELETE
USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- conversations table policies
-- Pattern: Ownership-based (doctors own their conversations)
-- Note: Conversations are created/updated via webhook (service role)
-- ----------------------------------------------------------------------------

-- SELECT: Doctors can read their own conversations
CREATE POLICY "Doctors can read own conversations"
ON conversations FOR SELECT
USING (auth.uid() = doctor_id);

-- INSERT: Service role only (created via webhook)
CREATE POLICY "Service role can insert conversations"
ON conversations FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- UPDATE: Service role only (updated via webhook)
CREATE POLICY "Service role can update conversations"
ON conversations FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- DELETE: Service role only (data lifecycle management)
CREATE POLICY "Service role can delete conversations"
ON conversations FOR DELETE
USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- messages table policies
-- Pattern: Related data access (doctors can read messages from their conversations)
-- Note: Messages are created/updated via webhook (service role)
-- ----------------------------------------------------------------------------

-- SELECT: Doctors can read messages from their own conversations
CREATE POLICY "Doctors can read messages from own conversations"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.doctor_id = auth.uid()
  )
);

-- INSERT: Service role only (created via webhook)
CREATE POLICY "Service role can insert messages"
ON messages FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- UPDATE: Service role only (if needed for corrections)
CREATE POLICY "Service role can update messages"
ON messages FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- DELETE: Service role only (data lifecycle management)
CREATE POLICY "Service role can delete messages"
ON messages FOR DELETE
USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- availability table policies
-- Pattern: Ownership-based (doctors own their availability)
-- ----------------------------------------------------------------------------

-- SELECT: Doctors can read their own availability
CREATE POLICY "Doctors can read own availability"
ON availability FOR SELECT
USING (auth.uid() = doctor_id);

-- INSERT: Doctors can insert their own availability
CREATE POLICY "Doctors can insert own availability"
ON availability FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

-- UPDATE: Doctors can update their own availability
CREATE POLICY "Doctors can update own availability"
ON availability FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

-- DELETE: Doctors can delete their own availability
CREATE POLICY "Doctors can delete own availability"
ON availability FOR DELETE
USING (auth.uid() = doctor_id);

-- ----------------------------------------------------------------------------
-- blocked_times table policies
-- Pattern: Ownership-based (doctors own their blocked times)
-- ----------------------------------------------------------------------------

-- SELECT: Doctors can read their own blocked times
CREATE POLICY "Doctors can read own blocked times"
ON blocked_times FOR SELECT
USING (auth.uid() = doctor_id);

-- INSERT: Doctors can insert their own blocked times
CREATE POLICY "Doctors can insert own blocked times"
ON blocked_times FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

-- UPDATE: Doctors can update their own blocked times
CREATE POLICY "Doctors can update own blocked times"
ON blocked_times FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

-- DELETE: Doctors can delete their own blocked times
CREATE POLICY "Doctors can delete own blocked times"
ON blocked_times FOR DELETE
USING (auth.uid() = doctor_id);

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next Steps:
-- 1. Test policies in Supabase SQL editor
-- 2. Verify doctors can only access their own data
-- 3. Verify service role can access system tables
-- 4. Verify cross-doctor data access is prevented
-- 5. Create TypeScript types (Task 3)
-- 6. Create database service helpers (Task 4)
-- ============================================================================
