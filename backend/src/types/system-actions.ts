/**
 * System Actions — AI-to-System Instruction Layer
 *
 * Structured actions the AI can request the system to execute.
 * AI understands natural language; system executes deterministic actions.
 * No PHI in action params or logs.
 *
 * Valid when:
 * - confirm_cancel: state.step === 'awaiting_cancel_confirmation'
 * - pick_appointment: state.step === 'awaiting_cancel_choice' or 'awaiting_reschedule_choice'
 */

import type { ConversationState } from './conversation';

/** Tool call from OpenAI (name + raw JSON string arguments) */
export interface ToolCallFromAI {
  id: string;
  name: string;
  arguments: string;
}

/** Parsed action from AI tool call */
export type SystemAction =
  | { type: 'confirm_cancel'; confirm: boolean }
  | { type: 'pick_appointment'; index: number }
  | { type: 'no_action' };

/** Context passed to action executor */
export interface ActionContext {
  conversationId: string;
  doctorId: string;
  conversation: { id: string; patient_id: string; doctor_id: string; platform: string; platform_conversation_id: string };
  state: ConversationState;
  correlationId: string;
  timezone?: string;
}

/** Result of executing an action */
export interface ActionResult {
  success: boolean;
  /** Override the AI reply with this message (e.g. "Your appointment has been cancelled.") */
  replyOverride?: string;
  /** State updates to merge (e.g. clear cancelAppointmentId, set step to responded) */
  stateUpdate?: Partial<ConversationState>;
}

/** Response from generateResponseWithActions */
export interface AIResponseWithActions {
  reply: string;
  toolCalls?: ToolCallFromAI[];
}
