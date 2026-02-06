/**
 * Database Type Definitions
 *
 * This file contains TypeScript type definitions for all database models.
 * Types match the database schema exactly (see DB_SCHEMA.md and migrations).
 *
 * Type Mapping Rules:
 * - UUID → string
 * - TIMESTAMPTZ → Date
 * - TEXT → string
 * - INTEGER → number
 * - BOOLEAN → boolean
 * - JSONB → Record<string, unknown>
 * - CHECK constraints → union types
 * - Optional columns → optional properties (using ?)
 *
 * IMPORTANT:
 * - All types must match database schema exactly
 * - PHI fields are documented in JSDoc comments
 * - Insert types omit auto-generated fields (id, created_at, updated_at)
 * - Update types make all fields optional except id
 */

// ============================================================================
// Enum Types (Union Types)
// ============================================================================

/**
 * Appointment status values
 */
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

/**
 * Webhook provider platforms (includes payment gateways for idempotency)
 */
export type WebhookProvider = 'facebook' | 'instagram' | 'whatsapp' | 'razorpay' | 'paypal';

/**
 * Webhook processing status
 */
export type WebhookStatus = 'pending' | 'processed' | 'failed';

/**
 * Audit log operation status
 */
export type AuditLogStatus = 'success' | 'failure';

/**
 * Conversation platform
 */
export type ConversationPlatform = 'facebook' | 'instagram' | 'whatsapp';

/**
 * Conversation status
 */
export type ConversationStatus = 'active' | 'archived' | 'closed';

/**
 * Message sender type
 */
export type MessageSenderType = 'patient' | 'doctor' | 'system';

/**
 * Day of week (0=Sunday, 6=Saturday)
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ============================================================================
// Core Tables
// ============================================================================

/**
 * Appointment record from database
 *
 * Represents a scheduled appointment between a doctor and patient.
 * Contains PHI (patient_name, patient_phone) which is encrypted at rest.
 *
 * @property id - Unique appointment identifier (UUID)
 * @property doctor_id - Doctor who owns this appointment (UUID, references auth.users)
 * @property patient_name - Patient's full name (PHI - encrypted at rest)
 * @property patient_phone - Patient's phone number (PHI - encrypted at rest)
 * @property appointment_date - Scheduled date and time for appointment
 * @property status - Current appointment status
 * @property notes - Optional notes about the appointment
 * @property created_at - Timestamp when appointment was created
 * @property updated_at - Timestamp when appointment was last updated
 */
export interface Appointment {
  id: string;
  doctor_id: string;
  patient_id?: string | null;  // Optional; links to patients.id for payment confirmation DM (e-task-5)
  patient_name: string;  // PHI
  patient_phone: string;  // PHI
  appointment_date: Date;
  status: AppointmentStatus;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Webhook idempotency record
 *
 * Prevents duplicate webhook processing by tracking processed events.
 * No PHI stored (only metadata).
 *
 * @property event_id - Platform-specific event ID or hash (primary key)
 * @property provider - Webhook provider platform
 * @property received_at - When webhook was received
 * @property status - Processing status
 * @property processed_at - When webhook was processed (null if pending/failed)
 * @property correlation_id - Request correlation ID for tracing
 * @property error_message - Error message if processing failed
 * @property retry_count - Number of retry attempts
 */
export interface WebhookIdempotency {
  event_id: string;
  provider: WebhookProvider;
  received_at: Date;
  status: WebhookStatus;
  processed_at?: Date;
  correlation_id: string;
  error_message?: string;
  retry_count: number;
}

/**
 * Audit log record
 *
 * Compliance audit trail for all system actions.
 * No PHI in metadata JSONB (only IDs and metadata).
 *
 * @property id - Unique audit log identifier (UUID)
 * @property correlation_id - Request correlation ID for tracing
 * @property user_id - User who performed the action (UUID, references auth.users, nullable for system operations)
 * @property action - Action performed (e.g., 'create_appointment', 'cancel_appointment')
 * @property resource_type - Type of resource affected (e.g., 'appointment', 'patient')
 * @property resource_id - ID of the resource affected (UUID, nullable)
 * @property status - Operation status (success or failure)
 * @property error_message - Error message if status is 'failure'
 * @property metadata - Additional context (JSONB, no PHI)
 * @property created_at - Timestamp when audit log was created
 */
export interface AuditLog {
  id: string;
  correlation_id: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  status: AuditLogStatus;
  error_message?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

/**
 * Dead letter queue record
 *
 * Stores failed webhook payloads after max retries.
 * Contains PHI/PII in encrypted payload (payload_encrypted).
 *
 * @property id - Unique dead letter record identifier (UUID)
 * @property event_id - Platform-specific event ID or hash
 * @property provider - Webhook provider platform
 * @property received_at - When webhook was originally received
 * @property correlation_id - Request correlation ID for tracing
 * @property payload_encrypted - Encrypted webhook payload (AES-256-GCM, contains PHI/PII)
 * @property error_message - Error message that caused failure
 * @property retry_count - Number of retry attempts before moving to dead letter queue
 * @property failed_at - When webhook was moved to dead letter queue
 */
export interface DeadLetterQueue {
  id: string;
  event_id: string;
  provider: WebhookProvider;
  received_at: Date;
  correlation_id: string;
  payload_encrypted: string;  // PHI/PII - encrypted
  error_message: string;
  retry_count: number;
  failed_at: Date;
}

/**
 * Dead letter queue record with decrypted payload
 *
 * Used when retrieving dead letter records for manual review.
 * Payload is decrypted only for authorized admin users.
 *
 * @property payload - Decrypted webhook payload (contains PHI/PII)
 */
export interface DeadLetterQueueWithDecrypted extends Omit<DeadLetterQueue, 'payload_encrypted'> {
  payload: unknown;  // Decrypted payload (contains PHI/PII)
}

// ============================================================================
// New Tables
// ============================================================================

/**
 * Patient record from database
 *
 * Stores patient information.
 * Contains PHI (name, phone, date_of_birth) which is encrypted at rest.
 *
 * @property id - Unique patient identifier (UUID)
 * @property name - Patient's full name (PHI - encrypted at rest)
 * @property phone - Patient's phone number (PHI - encrypted at rest)
 * @property date_of_birth - Patient's date of birth (PHI - encrypted at rest, optional)
 * @property gender - Patient's gender (optional, not PHI)
 * @property platform - Platform name for placeholder lookup (e.g. instagram, optional)
 * @property platform_external_id - Platform user ID for placeholder lookup (e.g. PSID, optional)
 * @property consent_status - Consent status: pending, granted, revoked (e-task-5)
 * @property consent_granted_at - When consent was granted (optional)
 * @property consent_revoked_at - When consent was revoked (optional)
 * @property consent_method - How consent was obtained (e.g. instagram_dm, optional)
 * @property created_at - Timestamp when record was created
 * @property updated_at - Timestamp when record was last updated
 */
export interface Patient {
  id: string;
  name: string;  // PHI
  phone: string;  // PHI
  date_of_birth?: Date;  // PHI (optional)
  gender?: string;
  platform?: string | null;
  platform_external_id?: string | null;
  consent_status?: 'pending' | 'granted' | 'revoked';
  consent_granted_at?: Date | null;
  consent_revoked_at?: Date | null;
  consent_method?: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Conversation record from database
 *
 * Represents a conversation thread between a patient and doctor.
 * Links patients to doctors via platform conversations.
 *
 * @property id - Unique conversation identifier (UUID)
 * @property doctor_id - Doctor who owns this conversation (UUID, references auth.users)
 * @property patient_id - Patient in this conversation (UUID, references patients)
 * @property platform - Platform where conversation occurs
 * @property platform_conversation_id - Platform-specific conversation ID
 * @property status - Current conversation status
 * @property metadata - Conversation state JSON (e.g. last intent, step; no PHI)
 * @property created_at - Timestamp when conversation was created
 * @property updated_at - Timestamp when conversation was last updated
 */
export interface Conversation {
  id: string;
  doctor_id: string;
  patient_id: string;
  platform: ConversationPlatform;
  platform_conversation_id: string;
  status: ConversationStatus;
  metadata?: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Message record from database
 *
 * Represents an individual message in a conversation.
 * Contains PHI (content) which is encrypted at rest.
 *
 * @property id - Unique message identifier (UUID)
 * @property conversation_id - Conversation this message belongs to (UUID, references conversations)
 * @property platform_message_id - Platform-specific message ID
 * @property sender_type - Who sent the message (patient, doctor, or system)
 * @property content - Message content (PHI - encrypted at rest)
 * @property intent - Extracted intent from message (e.g., 'book_appointment', 'cancel_appointment', optional)
 * @property created_at - Timestamp when message was created
 */
export interface Message {
  id: string;
  conversation_id: string;
  platform_message_id: string;
  sender_type: MessageSenderType;
  content: string;  // PHI
  intent?: string;
  created_at: Date;
}

/**
 * Availability record from database
 *
 * Represents a doctor's availability schedule.
 * No PHI (administrative data).
 *
 * @property id - Unique availability identifier (UUID)
 * @property doctor_id - Doctor who owns this availability (UUID, references auth.users)
 * @property day_of_week - Day of week (0=Sunday, 6=Saturday)
 * @property start_time - Start time for availability (TIME)
 * @property end_time - End time for availability (TIME)
 * @property is_available - Whether doctor is available during this time
 * @property created_at - Timestamp when record was created
 * @property updated_at - Timestamp when record was last updated
 */
export interface Availability {
  id: string;
  doctor_id: string;
  day_of_week: DayOfWeek;
  start_time: string;  // TIME type stored as string (HH:MM:SS format)
  end_time: string;  // TIME type stored as string (HH:MM:SS format)
  is_available: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Blocked time record from database
 *
 * Represents a blocked time slot for a doctor.
 * No PHI (administrative data).
 *
 * @property id - Unique blocked time identifier (UUID)
 * @property doctor_id - Doctor who owns this blocked time (UUID, references auth.users)
 * @property start_time - Start time for blocked period (TIMESTAMPTZ)
 * @property end_time - End time for blocked period (TIMESTAMPTZ)
 * @property reason - Optional reason for blocking this time
 * @property created_at - Timestamp when record was created
 */
export interface BlockedTime {
  id: string;
  doctor_id: string;
  start_time: Date;
  end_time: Date;
  reason?: string;
  created_at: Date;
}

/**
 * Doctor Instagram link record (e-task-1, MVP Connect Instagram)
 *
 * Per-doctor Instagram or Facebook Page connection for webhook resolution.
 * No PHI. Token must never be logged (COMPLIANCE).
 *
 * @property doctor_id - Doctor who owns this link (UUID, references auth.users)
 * @property instagram_page_id - Meta page/IG account ID (unique)
 * @property instagram_access_token - Access token (never log; encrypt at rest per platform)
 * @property instagram_username - Optional handle for display (e.g. "Connected as @handle")
 * @property created_at - When link was created
 * @property updated_at - When link was last updated
 */
export interface DoctorInstagram {
  doctor_id: string;
  instagram_page_id: string;
  instagram_access_token: string;
  instagram_username: string | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Insert Types (Omit auto-generated fields)
// ============================================================================

/**
 * Data required to create a new appointment
 * (Omits auto-generated fields: id, created_at, updated_at)
 */
export type InsertAppointment = Omit<Appointment, 'id' | 'created_at' | 'updated_at'>;

/**
 * Data required to create a new webhook idempotency record
 * (Omits auto-generated fields: received_at)
 */
export type InsertWebhookIdempotency = Omit<WebhookIdempotency, 'received_at'>;

/**
 * Data required to create a new dead letter queue record
 * (Omits auto-generated fields: id, received_at, failed_at)
 */
export type InsertDeadLetterQueue = Omit<DeadLetterQueue, 'id' | 'received_at' | 'failed_at'>;

/**
 * Data required to create a new audit log
 * (Omits auto-generated fields: id, created_at)
 */
export type InsertAuditLog = Omit<AuditLog, 'id' | 'created_at'>;

/**
 * Data required to create a new patient
 * (Omits auto-generated fields: id, created_at, updated_at)
 */
export type InsertPatient = Omit<Patient, 'id' | 'created_at' | 'updated_at'>;

/**
 * Data required to create a new conversation
 * (Omits auto-generated fields: id, created_at, updated_at)
 */
export type InsertConversation = Omit<Conversation, 'id' | 'created_at' | 'updated_at'>;

/**
 * Data required to create a new message
 * (Omits auto-generated fields: id, created_at)
 */
export type InsertMessage = Omit<Message, 'id' | 'created_at'>;

/**
 * Data required to create a new availability record
 * (Omits auto-generated fields: id, created_at, updated_at)
 */
export type InsertAvailability = Omit<Availability, 'id' | 'created_at' | 'updated_at'>;

/**
 * Data required to create a new blocked time
 * (Omits auto-generated fields: id, created_at)
 */
export type InsertBlockedTime = Omit<BlockedTime, 'id' | 'created_at'>;

/**
 * Data required to create a doctor Instagram link
 * (Omits auto-generated fields: created_at, updated_at)
 */
export type InsertDoctorInstagram = Omit<
  DoctorInstagram,
  'created_at' | 'updated_at'
>;

// ============================================================================
// Update Types (All fields optional except id)
// ============================================================================

/**
 * Data for updating an existing appointment
 * (All fields optional except id)
 */
export type UpdateAppointment = Partial<Omit<Appointment, 'id' | 'created_at' | 'updated_at'>> & {
  id: string;
};

/**
 * Data for updating an existing webhook idempotency record
 * (All fields optional except event_id)
 */
export type UpdateWebhookIdempotency = Partial<Omit<WebhookIdempotency, 'event_id' | 'received_at'>> & {
  event_id: string;
};

/**
 * Audit logs are immutable - no update type
 */

/**
 * Data for updating an existing patient
 * (All fields optional except id)
 */
export type UpdatePatient = Partial<Omit<Patient, 'id' | 'created_at' | 'updated_at'>> & {
  id: string;
};

/**
 * Data for updating an existing conversation
 * (All fields optional except id)
 */
export type UpdateConversation = Partial<Omit<Conversation, 'id' | 'created_at' | 'updated_at'>> & {
  id: string;
};

/**
 * Data for updating an existing message
 * (All fields optional except id)
 */
export type UpdateMessage = Partial<Omit<Message, 'id' | 'created_at'>> & {
  id: string;
};

/**
 * Data for updating an existing availability record
 * (All fields optional except id)
 */
export type UpdateAvailability = Partial<Omit<Availability, 'id' | 'created_at' | 'updated_at'>> & {
  id: string;
};

/**
 * Data for updating an existing blocked time
 * (All fields optional except id)
 */
export type UpdateBlockedTime = Partial<Omit<BlockedTime, 'id' | 'created_at'>> & {
  id: string;
};

/**
 * Data for updating an existing doctor Instagram link
 * (All fields optional except doctor_id; used for token refresh, username, disconnect)
 */
export type UpdateDoctorInstagram = Partial<
  Omit<DoctorInstagram, 'doctor_id' | 'created_at' | 'updated_at'>
> & {
  doctor_id: string;
};
