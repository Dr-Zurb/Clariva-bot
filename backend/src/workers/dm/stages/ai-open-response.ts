/**
 * Unmatched messages. Idle chats get the automated menu.
 * An in-progress step can still ask the model for a reply.
 */

import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import { buildAutomatedMenuMessage } from '../../../utils/instagram-greeting-copy';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';

function isIdleMenuTurn(ctx: DmTurnContext): boolean {
  return !ctx.inCollection && (!ctx.state.step || ctx.state.step === 'responded');
}

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
      turnLanguage,
      runGenerateResponse,
      buildAiContextForResponse,
    } = ctx;
    let state = initialState;
    const dmRoutingBranch: DmHandlerBranch = 'ai_open_response';
    if (isIdleMenuTurn(ctx)) {
      return {
        branch: dmRoutingBranch,
        reply: buildAutomatedMenuMessage(turnLanguage),
        nextState: state,
      };
    }
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
