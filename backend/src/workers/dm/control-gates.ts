/**
 * DL-2 constitution control gates — ordered interceptors that short-circuit before stage logic.
 * Channel-free (no Instagram/transport); Phase 2/3 reuse the same gate list.
 */

import { handleRevocation } from '../../services/consent-service';
import { isEmergencyUserMessage, resolveSafetyMessage } from '../../utils/safety-messages';
import type { IntentDetectionResult } from '../../types/ai';
import { mergeTriage, type ConversationState } from '../../types/conversation';
import type { DoctorSettingsRow } from '../../types/doctor-settings';
import type { DmHandlerBranch } from '../../types/dm-instrumentation';

/** Minimal recent-turn shape gates read (no channel coupling). */
export interface DmGateRecentMessage {
  sender_type: string;
  content?: string | null;
}

export interface DmGateContext {
  state: ConversationState;
  recentMessages: DmGateRecentMessage[];
  intentResult: IntentDetectionResult;
  doctorSettings: DoctorSettingsRow | null;
  text: string;
  /** Precomputed by handler — emergency gate suppression during PHI collection. */
  inCollection: boolean;
  conversationId: string;
  patientId: string | null;
  correlationId: string;
}

export interface DmGateResult {
  branch: DmHandlerBranch;
  reply: string;
  nextState: ConversationState;
}

export interface DmControlGate {
  name: DmHandlerBranch;
  /** DL-2 rationale — why this gate sits where it does in the order. */
  rationale: string;
  fires(ctx: DmGateContext): boolean;
  handle(ctx: DmGateContext): Promise<DmGateResult> | DmGateResult;
}

/** RBH-09: Default when receptionist automation is paused (channel-agnostic copy). */
export const DEFAULT_RECEPTIONIST_PAUSE_MESSAGE =
  'Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.';

export function resolveReceptionistPauseMessage(settings: DoctorSettingsRow | null): string {
  const custom = settings?.instagram_receptionist_pause_message?.trim();
  if (custom) return custom;
  return DEFAULT_RECEPTIONIST_PAUSE_MESSAGE;
}

export const revokeConsentGate: DmControlGate = {
  name: 'revoke_consent',
  rationale:
    'DL-9 / DL-2: Patient consent revocation outranks automation, booking, and doctor pause — must win over everything.',
  fires(ctx) {
    return ctx.intentResult.intent === 'revoke_consent';
  },
  async handle(ctx) {
    const reply = await handleRevocation(
      ctx.conversationId,
      ctx.patientId as string,
      ctx.correlationId
    );
    return {
      branch: 'revoke_consent',
      reply,
      nextState: mergeTriage(
        {
          ...ctx.state,
          lastIntent: ctx.intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        },
        { reasonFirstTriagePhase: undefined, postMedicalConsultFeeAckSent: undefined }
      ),
    };
  },
};

export const receptionistPausedGate: DmControlGate = {
  name: 'receptionist_paused',
  rationale:
    'DL-9 / DL-2: Doctor pause switch outranks conversion and stage logic; handoff copy only (revoke handled first).',
  fires(ctx) {
    return ctx.doctorSettings?.instagram_receptionist_paused === true;
  },
  handle(ctx) {
    return {
      branch: 'receptionist_paused',
      reply: resolveReceptionistPauseMessage(ctx.doctorSettings),
      nextState: {
        ...ctx.state,
        lastIntent: ctx.intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      },
    };
  },
};

export const emergencyGate: DmControlGate = {
  name: 'emergency_safety',
  rationale:
    'DL-2 Safety: Acute emergency patterns and classified emergency intent outrank booking/fee/helpfulness; collection-only LLM emergency is suppressed unless the message is acute.',
  fires(ctx) {
    return (
      (isEmergencyUserMessage(ctx.text) || ctx.intentResult.intent === 'emergency') &&
      !(
        ctx.inCollection &&
        ctx.intentResult.intent === 'emergency' &&
        !isEmergencyUserMessage(ctx.text)
      )
    );
  },
  handle(ctx) {
    return {
      branch: 'emergency_safety',
      reply: resolveSafetyMessage('emergency', ctx.text),
      nextState: mergeTriage(
        {
          ...ctx.state,
          lastIntent: 'emergency',
          step: 'responded',
          updatedAt: new Date().toISOString(),
        },
        {
          reasonFirstTriagePhase: undefined,
          postMedicalConsultFeeAckSent: undefined,
          lastMedicalDeflectionAt: undefined,
        }
      ),
    };
  },
};

/** DL-2 priority order (documentation + tests): revoke → paused → emergency, all before stage routing. */
export const CONTROL_GATES: DmControlGate[] = [
  revokeConsentGate,
  receptionistPausedGate,
  emergencyGate,
];

/** Revoke + paused — evaluated at turn entry, before everything. */
export const HEAD_CONTROL_GATES: DmControlGate[] = CONTROL_GATES.slice(0, 2);

/**
 * Emergency — evaluated in `executeDmTurn` AFTER head gates but BEFORE `resolveStage` (rcp-08).
 *
 * rcp-08 promoted emergency to a true head gate. Previously (rcp-02..07) it ran inside the
 * legacy decide-chain, i.e. AFTER stage dispatch, so the cancel/reschedule step gates and other
 * flow-step stages claimed an emergency turn before emergency could fire. Hoisting it here makes
 * DL-2 (Safety first) literal: an emergency message wins over any in-flight flow step. The
 * in-collection suppression in `emergencyGate.fires` is unchanged, so non-acute "emergency"
 * intent mid-collection is still suppressed; acute messages always escalate.
 */
export const EMERGENCY_CONTROL_GATES: DmControlGate[] = [emergencyGate];

export async function evaluateControlGates(
  gates: readonly DmControlGate[],
  ctx: DmGateContext
): Promise<DmGateResult | null> {
  for (const gate of gates) {
    if (gate.fires(ctx)) {
      return await gate.handle(ctx);
    }
  }
  return null;
}
