/**
 * DL-2 constitution control gates — ordered interceptors that short-circuit before stage logic.
 * Channel-free (no Instagram/transport); Phase 2/3 reuse the same gate list.
 */

import {
  isStartMessagingText,
  isStopMessagingText,
  persistAutomatedMessagingOptIn,
  persistAutomatedMessagingOptOut,
} from '../../services/automated-messaging-opt-out';
import { handleRevocation } from '../../services/consent-service';
import {
  buildAutomatedMessagingStartAckMessage,
  buildAutomatedMessagingStopAckMessage,
  buildReceptionistPauseDefaultMessage,
} from '../../utils/dm-copy';
import {
  isEmergencyUserMessage,
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
  /** Migration 239 stamp. NULL/omitted = not opted out. */
  automatedMessagingOptedOutAt?: string | null;
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
export const DEFAULT_RECEPTIONIST_PAUSE_MESSAGE = buildReceptionistPauseDefaultMessage({
  language: 'en',
});

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

/** Legacy helper — Meta send no longer opens a crisis window. Kept for tests. */
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
 * Meta/IG never classifies or directs emergency (no 112/108). The gate still
 * intercepts so mid-funnel collection cannot continue on an acute phrase.
 * Reply is the same receptionist line as medical_query. No /book on this turn.
 */
export const emergencyGate: DmControlGate = {
  name: 'emergency_safety',
  rationale:
    'Intercept acute regex OR classified emergency so intake cannot continue; Meta reply is receptionist FAQ only — no 112, no appointment link (revoke still wins the head chain).',
  fires(ctx) {
    // Do not read ctx.inCollection — funnel state must not suppress the intercept.
    return isEmergencyUserMessage(ctx.text) || ctx.intentResult.intent === 'emergency';
  },
  handle(ctx) {
    return {
      branch: 'emergency_safety',
      reply: resolveSafetyMessage('medical_query', ctx.turnLanguage),
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

/**
 * Legacy crisis window: still intercept vague follow-ups so stages do not
 * collect, but reply is receptionist FAQ — never 112.
 */
export const openCrisisGate: DmControlGate = {
  name: 'emergency_safety',
  rationale:
    'If escalatedAt is still set, intercept vague follow-ups with receptionist FAQ (no 112). Stability allowlist falls through to booking.',
  fires(ctx) {
    if (!isOpenEmergencyCrisis(ctx.state)) return false;
    if (userMessageSignalsPostEmergencyStability(ctx.text)) return false;
    return true;
  },
  handle(ctx) {
    return {
      branch: 'emergency_safety',
      reply: resolveSafetyMessage('medical_query', ctx.turnLanguage),
      nextState: {
        ...ctx.state,
        lastIntent: ctx.intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      },
    };
  },
};

function isOptedOutOfAutomatedMessaging(ctx: DmGateContext): boolean {
  const stamp = ctx.automatedMessagingOptedOutAt;
  return typeof stamp === 'string' && stamp.trim().length > 0;
}

/**
 * Messaging opt-out (mca-07). After emergency, before pause.
 * Stop phrases persist the flag and acknowledge. Mere inbound after stop
 * does not re-enable automation (empty reply). Explicit START clears it.
 */
export const messagingOptOutGate: DmControlGate = {
  name: 'automated_messaging_opt_out',
  rationale:
    'MCA-DL-6 / Dev Policies §5: stop automated Meta messages immediately; acute intercept still wins (receptionist FAQ, not 112); doctor manual reply stays open.',
  fires(ctx) {
    if (isStopMessagingText(ctx.text)) return true;
    if (!isOptedOutOfAutomatedMessaging(ctx)) return false;
    return true;
  },
  async handle(ctx) {
    const optedOut = isOptedOutOfAutomatedMessaging(ctx);
    if (optedOut && isStartMessagingText(ctx.text)) {
      await persistAutomatedMessagingOptIn(ctx.conversationId, ctx.correlationId);
      return {
        branch: 'automated_messaging_opt_in',
        reply: buildAutomatedMessagingStartAckMessage({ language: ctx.turnLanguage }),
        nextState: {
          ...ctx.state,
          lastIntent: ctx.intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        },
      };
    }

    if (isStopMessagingText(ctx.text)) {
      if (optedOut) {
        return {
          branch: 'automated_messaging_opt_out',
          reply: '',
          nextState: {
            ...ctx.state,
            lastIntent: ctx.intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          },
        };
      }
      await persistAutomatedMessagingOptOut(ctx.conversationId, ctx.correlationId);
      return {
        branch: 'automated_messaging_opt_out',
        reply: buildAutomatedMessagingStopAckMessage({ language: ctx.turnLanguage }),
        nextState: {
          ...ctx.state,
          lastIntent: ctx.intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      branch: 'automated_messaging_opt_out',
      reply: '',
      nextState: {
        ...ctx.state,
        lastIntent: ctx.intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      },
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
 * DL-2 priority order (SAFETY-01): revoke → acute intercept → (open-crisis disabled) → messaging opt-out → paused.
 * Acute intercept still outranks pause and STOP so we do not collect; reply is receptionist FAQ, not 112.
 */
export const CONTROL_GATES: DmControlGate[] = [
  revokeConsentGate,
  emergencyGate,
  openCrisisGate,
  messagingOptOutGate,
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
