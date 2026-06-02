/**
 * rcp-08: Default AI open-response stage — extracted from legacy decide-chain fallthrough.
 */

import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';

export const aiOpenResponseStage = {
  stage: 'ai_open_response',
  async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
    const {
      conversation,
      correlationId,
      text,
      recentMessages,
      intentResult,
      doctorContext,
      state: initialState,
      teleconsultCatalogRowCount,
      runGenerateResponse,
      buildAiContextForResponse,
    } = ctx;
    let state = initialState;
    const dmRoutingBranch: DmHandlerBranch = 'ai_open_response';
    const aiContext = await buildAiContextForResponse(
      conversation.id,
      state,
      recentMessages,
      correlationId,
      text,
      teleconsultCatalogRowCount
    );
    const replyText = await runGenerateResponse({
      conversationId: conversation.id,
      currentIntent: intentResult.intent,
      state,
      recentMessages,
      currentUserMessage: text,
      correlationId,
      doctorContext,
      context: aiContext,
    });
    return { branch: dmRoutingBranch, reply: replyText, nextState: state };
  },
} as DmStageHandler;
