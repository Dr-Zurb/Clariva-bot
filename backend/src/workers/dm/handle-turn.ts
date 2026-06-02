/**
 * rcp-08: Shared decide + post-stage hooks for Instagram DM turns.
 * Handler shape: head gates → emergency → resolveStage → handle → autobook → recording detour.
 */

import {
  evaluateControlGates,
  EMERGENCY_CONTROL_GATES,
  HEAD_CONTROL_GATES,
} from './control-gates';
import {
  applyLearningPolicyAutobookAfterStage,
  applyRecordingConsentDetourIfNeeded,
} from './stages/booking-funnel';
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

  const headGateResult = await evaluateControlGates(HEAD_CONTROL_GATES, turnCtx.gateCtx);
  if (headGateResult) {
    return headGateResult;
  }

  const emergencyGateResult = await evaluateControlGates(EMERGENCY_CONTROL_GATES, turnCtx.gateCtx);
  if (emergencyGateResult) {
    return emergencyGateResult;
  }

  const stage = resolveStage(turnCtx);
  let stageResult = await STAGE_ROUTER[stage].handle(turnCtx);

  stageResult = await applyLearningPolicyAutobookAfterStage(stageResult, turnCtx);
  stageResult = applyRecordingConsentDetourIfNeeded(stageResult, turnCtx.doctorContext);
  return stageResult;
}
