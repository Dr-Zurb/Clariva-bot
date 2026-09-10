/**
 * DL-11 stage router scaffold (rcp-03) — dispatch seam for the decide-chain.
 * Channel-free types; legacy handler wired via dynamic import to avoid circular deps.
 */

import type { IntentDetectionResult } from '../../types/ai';
import type { ConversationState } from '../../types/conversation';
import type { DoctorSettingsRow } from '../../types/doctor-settings';
import type { DmHandlerBranch } from '../../types/dm-instrumentation';
import type { Conversation } from '../../types/database';
import type { Message } from '../../types';
import type {
  DoctorContext,
  GenerateResponseContext,
  GenerateResponseInput,
  GenerateResponseWithActionsInput,
} from '../../services/ai-service';
import type { AIResponseWithActions } from '../../types/system-actions';
import type { ReturningPatientProfile } from '../../types/returning-patient';
import type { ConversationLanguage } from '../../utils/conversation-language';
import type { FeeComposeLanguageOpts } from '../../utils/dm-reply-composer';
import type { DmGateContext } from './control-gates';
import { isBookingEntryTurn } from './stages/booking-entry-predicate';
import { isBookingFunnelTurn } from './stages/booking-funnel-predicate';
import { isCancelRescheduleStatusTurn } from './stages/cancel-reschedule-status-predicate';
import { isIdleFeeTriageTurn } from './stages/idle-fee-triage-predicate';
import { isServiceMatchTurn } from './stages/service-match-predicate';

export type DmStage =
  | 'cancel_reschedule_status'
  | 'service_match'
  | 'booking_funnel'
  | 'idle_fee_triage'
  | 'booking_entry'
  | 'ai_open_response';

export interface DmTurnTiming {
  dmGenerateMs: number;
}

export interface DmTurnContext {
  state: ConversationState;
  conversation: Conversation;
  doctorId: string;
  correlationId: string;
  text: string;
  /**
   * Resolved sticky reply language for this turn (lang-03).
   * Required — emitters must not re-detect from text (p2).
   */
  turnLanguage: ConversationLanguage;
  recentMessages: Message[];
  intentResult: IntentDetectionResult;
  doctorSettings: DoctorSettingsRow | null;
  doctorContext: DoctorContext | undefined;
  gateCtx: DmGateContext;
  inCollection: boolean;
  isBookIntent: boolean;
  justStartingCollection: boolean;
  signalsFeePricing: boolean;
  feeIdleRoutedByAnaphora: boolean;
  feeComposerOpts: FeeComposeLanguageOpts & {
    showModalityBreakdown?: boolean;
    llmCatalogNarrow?: {
      correlationId: string;
      recentUserMessages?: string[];
      doctorProfile?: import('../../services/service-catalog-matcher').MatchServiceCatalogDoctorProfile | null;
    };
  };
  bookingFeeComposerOpts: FeeComposeLanguageOpts & {
    showModalityBreakdown?: boolean;
    llmCatalogNarrow?: {
      correlationId: string;
      recentUserMessages?: string[];
      doctorProfile?: import('../../services/service-catalog-matcher').MatchServiceCatalogDoctorProfile | null;
    };
  };
  teleconsultCatalogRowCount: number;
  channelReplyPick: ReturnType<typeof import('../../utils/dm-consultation-channel').parseConsultationChannelUserReply>;
  lastBotAskedForDetails: boolean;
  recentDmForClinical: { sender_type: string; content: string }[];
  timing: DmTurnTiming;
  /** rcp-20: PHI-safe returning-patient profile (dormant until rcp-21..24 consume it). */
  returningProfile?: ReturningPatientProfile;
  /** turnLanguage is injected by run-conversation-turn (lang-04); stages must not omit/override it. */
  runGenerateResponse: (input: Omit<GenerateResponseInput, 'turnLanguage'>) => Promise<string>;
  runGenerateResponseWithActions: (
    input: Omit<GenerateResponseWithActionsInput, 'turnLanguage'>
  ) => Promise<AIResponseWithActions>;
  buildAiContextForResponse: (
    conversationId: string,
    state: ConversationState,
    recentMessages: Message[],
    correlationId: string,
    text: string,
    teleconsultCatalogRowCount: number | null | undefined
  ) => Promise<GenerateResponseContext>;
  fallbackReply: string;
}

export interface DmTurnResult {
  branch: DmHandlerBranch;
  reply: string;
  nextState: ConversationState;
}

export interface DmStageHandler {
  stage: DmStage;
  handle(ctx: DmTurnContext): Promise<DmTurnResult>;
}

/** Pick the handler for this turn. Real stages checked before ai_open_response default. */
export function resolveStage(ctx: DmTurnContext): DmStage {
  if (isCancelRescheduleStatusTurn(ctx)) return 'cancel_reschedule_status';
  if (isServiceMatchTurn(ctx)) return 'service_match';
  if (isBookingFunnelTurn(ctx)) return 'booking_funnel';
  if (isIdleFeeTriageTurn(ctx)) return 'idle_fee_triage';
  if (isBookingEntryTurn(ctx)) return 'booking_entry';
  return 'ai_open_response';
}

export const STAGE_ROUTER: Record<DmStage, DmStageHandler> = {
  cancel_reschedule_status: {
    stage: 'cancel_reschedule_status',
    async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
      const { cancelRescheduleStatusStage } = await import('./stages/cancel-reschedule-status');
      return cancelRescheduleStatusStage.handle(ctx);
    },
  },
  service_match: {
    stage: 'service_match',
    async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
      const { serviceMatchStage } = await import('./stages/service-match');
      return serviceMatchStage.handle(ctx);
    },
  },
  booking_funnel: {
    stage: 'booking_funnel',
    async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
      const { bookingFunnelStage } = await import('./stages/booking-funnel');
      return bookingFunnelStage.handle(ctx);
    },
  },
  idle_fee_triage: {
    stage: 'idle_fee_triage',
    async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
      const { idleFeeTriageStage } = await import('./stages/idle-fee-triage');
      return idleFeeTriageStage.handle(ctx);
    },
  },
  booking_entry: {
    stage: 'booking_entry',
    async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
      const { bookingEntryStage } = await import('./stages/booking-entry');
      return bookingEntryStage.handle(ctx);
    },
  },
  ai_open_response: {
    stage: 'ai_open_response',
    async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
      const { aiOpenResponseStage } = await import('./stages/ai-open-response');
      return aiOpenResponseStage.handle(ctx);
    },
  },
};
