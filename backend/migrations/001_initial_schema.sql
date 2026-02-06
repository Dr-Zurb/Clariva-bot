-- ============================================================================
-- Initial Database Schema Migration
-- ============================================================================
-- Migration: 001_initial_schema.sql
-- Date: 2026-01-20
-- Description: Creates all database tables, indexes, triggers, and enables RLS
-- 
-- Tables Created:
--   - Core: appointments, webhook_idempotency, audit_logs
--   - New: patients, conversations, messages, availability, blocked_times
--
-- Note: RLS policies will be created in migration 002_rls_policies.sql
-- ============================================================================

-- ============================================================================
-- 1. CORE TABLES (Already Documented in DB_SCHEMA.md)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- appointments table
-- Purpose: Store appointment bookings
-- PHI: patient_name, patient_phone (encrypted at rest by Supabase platform)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_name        TEXT NOT NULL,  -- Encrypted at rest (platform-level, Supabase encryption-at-rest)
    patient_phone       TEXT NOT NULL,  -- Encrypted at rest (platform-level, Supabase encryption-at-rest)
    appointment_date    TIMESTAMPTZ NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- webhook_idempotency table
-- Purpose: Prevent duplicate webhook processing
-- No PHI stored (only metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_idempotency (
    event_id            TEXT PRIMARY KEY,  -- Platform ID or hash
    provider            TEXT NOT NULL CHECK (provider IN ('facebook', 'instagram', 'whatsapp')),
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    processed_at        TIMESTAMPTZ,
    correlation_id      TEXT NOT NULL,  -- Request correlation ID
    error_message       TEXT,
    retry_count         INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- audit_logs table
-- Purpose: Compliance audit trail
-- No PHI in metadata JSONB (only IDs and metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id      TEXT NOT NULL,  -- Request correlation ID
    user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action              TEXT NOT NULL,  -- e.g., 'create_appointment', 'cancel_appointment'
    resource_type       TEXT NOT NULL,  -- e.g., 'appointment'
    resource_id         UUID,
    status              TEXT NOT NULL CHECK (status IN ('success', 'failure')),
    error_message       TEXT,
    metadata            JSONB,  -- Additional context (no PHI)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. NEW TABLES (Not Yet Documented in DB_SCHEMA.md)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- patients table
-- Purpose: Store patient information
-- PHI: name, phone, date_of_birth (encrypted at rest by Supabase platform)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,  -- Encrypted at rest (platform-level, Supabase encryption-at-rest)
    phone               TEXT NOT NULL,  -- Encrypted at rest (platform-level, Supabase encryption-at-rest)
    date_of_birth       DATE,  -- Optional, encrypted at rest (platform-level)
    gender              TEXT,  -- Optional
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- conversations table
-- Purpose: Store conversation threads between patients and doctors
-- Links patients to doctors via platform conversations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id               UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    platform                TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'whatsapp')),
    platform_conversation_id TEXT NOT NULL,  -- Platform-specific conversation ID
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Ensure unique platform conversation per doctor
    UNIQUE(doctor_id, platform, platform_conversation_id)
);

-- ----------------------------------------------------------------------------
-- messages table
-- Purpose: Store individual messages in conversations
-- PHI: content (encrypted at rest by Supabase platform)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id         UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    platform_message_id     TEXT NOT NULL,  -- Platform-specific message ID
    sender_type             TEXT NOT NULL CHECK (sender_type IN ('patient', 'doctor', 'system')),
    content                 TEXT NOT NULL,  -- Encrypted at rest (platform-level, Supabase encryption-at-rest)
    intent                  TEXT,  -- Extracted intent from message (e.g., 'book_appointment', 'cancel_appointment')
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Ensure unique platform message per conversation
    UNIQUE(conversation_id, platform_message_id)
);

-- ----------------------------------------------------------------------------
-- availability table
-- Purpose: Store doctor availability schedules
-- No PHI (administrative data)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS availability (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_of_week         INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),  -- 0=Sunday, 6=Saturday
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    is_available        BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Ensure unique availability per doctor per day
    UNIQUE(doctor_id, day_of_week, start_time, end_time)
);

-- ----------------------------------------------------------------------------
-- blocked_times table (Optional for Phase 0)
-- Purpose: Store blocked time slots for doctors
-- No PHI (administrative data)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocked_times (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    start_time          TIMESTAMPTZ NOT NULL,
    end_time            TIMESTAMPTZ NOT NULL,
    reason              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Ensure no overlapping blocked times (application-level validation recommended)
    CHECK (end_time > start_time)
);

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Indexes for appointments table
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_appointment_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_status_date ON appointments(doctor_id, status, appointment_date);

-- ----------------------------------------------------------------------------
-- Indexes for webhook_idempotency table
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_provider ON webhook_idempotency(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_status ON webhook_idempotency(status);
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_received_at ON webhook_idempotency(received_at);

-- ----------------------------------------------------------------------------
-- Indexes for audit_logs table
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type_id ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);

-- ----------------------------------------------------------------------------
-- Indexes for patients table
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);  -- For patient lookup by phone

-- ----------------------------------------------------------------------------
-- Indexes for conversations table
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversations_doctor_id ON conversations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_patient_id ON conversations(patient_id);
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON conversations(platform);
CREATE INDEX IF NOT EXISTS idx_conversations_platform_conversation_id ON conversations(platform_conversation_id);

-- ----------------------------------------------------------------------------
-- Indexes for messages table
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_platform_message_id ON messages(platform_message_id);

-- ----------------------------------------------------------------------------
-- Indexes for availability table
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_availability_doctor_id ON availability(doctor_id);
CREATE INDEX IF NOT EXISTS idx_availability_day_of_week ON availability(day_of_week);
CREATE INDEX IF NOT EXISTS idx_availability_doctor_day ON availability(doctor_id, day_of_week);

-- ----------------------------------------------------------------------------
-- Indexes for blocked_times table
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_blocked_times_doctor_id ON blocked_times(doctor_id);
CREATE INDEX IF NOT EXISTS idx_blocked_times_start_time ON blocked_times(start_time);
CREATE INDEX IF NOT EXISTS idx_blocked_times_end_time ON blocked_times(end_time);
CREATE INDEX IF NOT EXISTS idx_blocked_times_doctor_time_range ON blocked_times(doctor_id, start_time, end_time);

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function to update updated_at timestamp
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Apply updated_at trigger to all tables with updated_at column
-- ----------------------------------------------------------------------------
CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_availability_updated_at
    BEFORE UPDATE ON availability
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Note: RLS policies will be created in migration 002_rls_policies.sql
-- This section only enables RLS on all tables

-- Enable RLS on all tables
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_times ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next Steps:
-- 1. Run migration 002_rls_policies.sql to create RLS policies
-- 2. Create TypeScript types (Task 3)
-- 3. Create database service helpers (Task 4)
-- ============================================================================
