/**
 * DL-2 constitution control gates — ordered interceptors that short-circuit before stage logic.
 * Channel-free (no Instagram/transport); Phase 2/3 reuse the same gate list.
 */

import { handleRevocation } from '../../services/consent-service';
import { buildReceptionistPauseDefaultMessage } from '../../utils/dm-copy';
import {
  isEmergencyUserMessage,
  recentThreadHasAssistantEmergencyEscalation,
  resolveSafetyMessage,
  userMessageSignalsPostEmergencyStability,
} from '../../utils/safety-messages';
import type { IntentDetectionResult } from '../../types/ai';
import {
  isOpenEmergencyCrisis,
  mergeSafety,
  mergeTriage,
  type ConversationState,
} from '../../types/conversation';
import type { DoctorSettingsRow } from '../../types/doctor-settings';
import type { DmHandlerBranch } from '../../types/dm-instrumentation';
import type { ConversationLanguage } from '../../utils/conversation-language';

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
  /** Turn-resolved reply language (lang-06) — emergency copy must not re-detect from text. */
  turnLanguage: ConversationLanguage;
  /** Precomputed by handler (stages still read this; emergency gate no longer suppresses on it). */
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

/** RBH-09 / lang-21: English default pause copy (re-export for callers that only need `en`). */
export const DEFAULT_RECEPTIONIST_PAUSE_MESSAGE =
  buildReceptionistPauseDefaultMessage({ language: 'en' });

/**
 * Pause handoff copy. Custom doctor message is returned **verbatim** (LANG5-D4) —
 * doctor-authored text is not ours to localize. Only the default arm uses `language`.
 */
export function resolveReceptionistPauseMessage(
  settings: DoctorSettingsRow | null,
  language: ConversationLanguage
): string {
  const custom = settings?.instagram_receptionist_pause_message?.trim();
  if (custom) {
    // LANG5-D4: do not translate or locale-dispatch doctor-authored pause copy.
    return custom;
  }
  return buildReceptionistPauseDefaultMessage({ language });
}

function threadHasPriorEmergencyEscalation(ctx: DmGateContext): boolean {
  if (isOpenEmergencyCrisis(ctx.state)) return true;
  return recentThreadHasAssistantEmergencyEscalation(
    ctx.recentMessages.map((m) => ({
      sender_type: m.sender_type,
      content: m.content ?? '',
    }))
  );
}

/** Mark open crisis window (also used by outbound emergency-number floor). */
export function markEmergencyCrisisOpen(
  state: ConversationState,
  opts?: { preserveEscalatedAt?: boolean }
): ConversationState {
  const now = new Date().toISOString();
  const escalatedAt =
    opts?.preserveEscalatedAt === true && state.safety?.escalatedAt
      ? state.safety.escalatedAt
      : now;
  return mergeSafety(
    mergeTriage(
      {
        ...state,
        lastIntent: 'emergency',
        step: 'responded',
        updatedAt: now,
      },
      {
        reasonFirstTriagePhase: undefined,
        postMedicalConsultFeeAckSent: undefined,
        lastMedicalDeflectionAt: undefined,
      }
    ),
    { escalatedAt, clearedAt: undefined }
  );
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
      ctx.correlationId,
      ctx.turnLanguage
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

/**
 * SAFETY ratchet (invariant):
 * - Acute regex hit always escalates and cannot be vetoed by collection/pause (revoke still wins).
 * - Classifier may escalate (`intent === emergency`) but never blocks a regex hit.
 * - Conversation funnel state (`inCollection`, step) must not affect eligibility.
 */
export const emergencyGate: DmControlGate = {
  name: 'emergency_safety',
  rationale:
    'DL-2 Safety ratchet: acute regex OR classified emergency outranks pause, booking, and stage logic; funnel state never suppresses eligibility (revoke still wins the head chain).',
  fires(ctx) {
    // Ratchet: do not read ctx.inCollection — funnel state must not suppress eligibility.
    return isEmergencyUserMessage(ctx.text) || ctx.intentResult.intent === 'emergency';
  },
  handle(ctx) {
    const priorEscalation = threadHasPriorEmergencyEscalation(ctx);
    return {
      branch: 'emergency_safety',
      reply: resolveSafetyMessage('emergency', ctx.turnLanguage, {
        emergencyVariant: priorEscalation ? 'reaffirm' : 'first',
      }),
      nextState: markEmergencyCrisisOpen(ctx.state),
    };
  },
};

/**
 * While a crisis window is open, reaffirm by default.
 * Allowlist: positive stability evidence (stages resume booking). Revoke wins earlier in the chain.
 */
export const openCrisisGate: DmControlGate = {
  name: 'emergency_safety',
  rationale:
    'Open crisis inversion: after escalatedAt, ordinary branches must not speak — reaffirm 112 unless the patient signals stability (booking resume) or revoke.',
  fires(ctx) {
    if (!isOpenEmergencyCrisis(ctx.state)) return false;
    if (userMessageSignalsPostEmergencyStability(ctx.text)) return false;
    return true;
  },
  handle(ctx) {
    return {
      branch: 'emergency_safety',
      reply: resolveSafetyMessage('emergency', ctx.turnLanguage, {
        emergencyVariant: 'reaffirm',
      }),
      nextState: markEmergencyCrisisOpen(ctx.state, { preserveEscalatedAt: true }),
    };
  },
};

export const receptionistPausedGate: DmControlGate = {
  name: 'receptionist_paused',
  rationale:
    'DL-9 / DL-2: Doctor pause switch outranks conversion and stage logic; handoff copy only (revoke + emergency handled first — SAFETY-01).',
  fires(ctx) {
    return ctx.doctorSettings?.instagram_receptionist_paused === true;
  },
  handle(ctx) {
    return {
      branch: 'receptionist_paused',
      reply: resolveReceptionistPauseMessage(ctx.doctorSettings, ctx.turnLanguage),
      nextState: {
        ...ctx.state,
        lastIntent: ctx.intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      },
    };
  },
};

/**
 * DL-2 priority order (SAFETY-01): revoke → acute emergency → open-crisis reaffirm → paused.
 * Open-crisis gate runs before pause so a paused doctor still gets crisis reaffirm.
 */
export const CONTROL_GATES: DmControlGate[] = [
  revokeConsentGate,
  emergencyGate,
  openCrisisGate,
  receptionistPausedGate,
];

/** Full head chain — evaluated at turn entry before `resolveStage`. */
export const HEAD_CONTROL_GATES: DmControlGate[] = CONTROL_GATES;

/**
 * Emergency-only slice (unit tests / composition). Acute + open-crisis before pause.
 */
export const EMERGENCY_CONTROL_GATES: DmControlGate[] = [emergencyGate, openCrisisGate];

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
