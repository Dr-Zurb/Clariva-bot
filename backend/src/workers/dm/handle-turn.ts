/**
 * rcp-08 / SAFETY-01: Shared decide + post-stage hooks for DM turns.
 * Handler shape: head gates (revoke → emergency → paused) → resolveStage → handle → autobook.
 */

import { isOpenEmergencyCrisis } from '../../types/conversation';
import { logDmEmergencySafetyDecision } from '../../services/webhook-metrics';
import {
  isEmergencyUserMessage,
  recentThreadHasAssistantEmergencyEscalation,
} from '../../utils/safety-messages';
import { emergencyGate, evaluateControlGates, HEAD_CONTROL_GATES } from './control-gates';
import { applyLearningPolicyAutobookAfterStage } from './stages/booking-funnel';
import {
  resolveStage,
  STAGE_ROUTER,
  type DmTurnContext,
  type DmTurnResult,
} from './stage-router';

export interface ExecuteDmTurnOptions {
  /** Conflict recovery: skip routing; always AI open response with conflict branch label. */
  conflictRecovery?: boolean;
}

/** Run control gates, stage router, and post-stage hooks for one DM turn. */
export async function executeDmTurn(
  turnCtx: DmTurnContext,
  options?: ExecuteDmTurnOptions
): Promise<DmTurnResult> {
  if (options?.conflictRecovery) {
    const { aiOpenResponseStage } = await import('./stages/ai-open-response');
    const result = await aiOpenResponseStage.handle(turnCtx);
    return { ...result, branch: 'conflict_recovery_ai' };
  }

  const gateCtx = turnCtx.gateCtx;
  const regexHit = isEmergencyUserMessage(gateCtx.text);
  const emergencyGateEligible = emergencyGate.fires(gateCtx);
  const crisisOpen = isOpenEmergencyCrisis(gateCtx.state);
  // Prefer persisted crisis window; text re-parse is fallback for in-flight threads.
  const priorEscalationInWindow =
    crisisOpen ||
    recentThreadHasAssistantEmergencyEscalation(
      gateCtx.recentMessages.map((m) => ({
        sender_type: m.sender_type,
        content: m.content ?? '',
      }))
    );

  // SAFETY-01: emergency is inside HEAD_CONTROL_GATES (before pause), so one pass covers revoke/emergency/pause.
  const headGateResult = await evaluateControlGates(HEAD_CONTROL_GATES, gateCtx);
  const headBranch = headGateResult?.branch ?? null;
  logDmEmergencySafetyDecision({
    correlationId: gateCtx.correlationId,
    regexHit,
    classifierIntent: gateCtx.intentResult.intent,
    emergencyGateEligible,
    emergencyGateFired: headBranch === 'emergency_safety',
    inCollection: gateCtx.inCollection,
    priorEscalationInWindow,
    crisisOpen,
    headBranch,
  });

  if (headGateResult) {
    return headGateResult;
  }

  const stage = resolveStage(turnCtx);
  let stageResult = await STAGE_ROUTER[stage].handle(turnCtx);

  stageResult = await applyLearningPolicyAutobookAfterStage(stageResult, turnCtx);
  return stageResult;
}
