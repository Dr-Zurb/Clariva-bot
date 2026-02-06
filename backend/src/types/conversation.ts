/**
 * Conversation State Types (e-task-3)
 *
 * State shape for multi-turn flow. Stored in conversations.metadata (no PHI).
 * Used for flow control (e.g. current intent, step) and response generation.
 */

import type { Intent } from './ai';

/**
 * Collection step values (e-task-4). No PHI; only step and field names in metadata.
 */
export type PatientCollectionStep =
  | 'collecting_name'
  | 'collecting_phone'
  | 'collecting_date_of_birth'
  | 'collecting_gender'
  | 'collecting_reason_for_visit'
  | 'consent'
  | 'selecting_slot'
  | string;

/**
 * Conversation state stored in conversations.metadata.
 * No PHI; safe for audit and logging (field names only).
 */
export interface ConversationState {
  /** Last detected intent (for context in next turn) */
  lastIntent?: Intent;
  /** Current step in flow (e.g. collecting_name, consent, selecting_slot, responded) */
  step?: string;
  /** Collected data keys only (no values; values are PHI - stored in memory/Redis until Task 5) */
  collectedFields?: string[];
  /** Timestamp of last state update (ISO string) */
  updatedAt?: string;
  /** When consent was first requested (ISO string); set when transitioning to step consent */
  consent_requested_at?: string;
  /** Date (YYYY-MM-DD) for slot selection; set when entering selecting_slot (e-task-3) */
  slotSelectionDate?: string;
}
