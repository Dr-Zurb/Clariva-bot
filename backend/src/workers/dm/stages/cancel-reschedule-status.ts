/**
 * rcp-04: Cancel / reschedule / status stage — extracted from legacy decide-chain.
 */

import { getAppointmentByIdForWorker } from '../../../services/appointment-service';
import {
  executeAction,
  parseToolCallToAction,
} from '../../../services/action-executor-service';
import { hasCapturedPaymentForAppointment } from '../../../services/payment-service';
import {
  buildRelatedPatientIdsForWebhook,
  getMergedUpcomingAppointmentsForRelatedPatients,
} from '../../../services/webhook-appointment-helpers';
import { buildReschedulePageUrl } from '../../../services/slot-selection-service';
import {
  appointmentConsultationTypeToLabel,
  buildCancelChoiceListMessage,
  formatAppointmentChoiceDate,
  type CancelChoiceItem,
} from '../../../utils/dm-copy';
import {
  formatRescheduleChoiceLinkDm,
  formatRescheduleLinkDm,
} from '../../../utils/booking-link-copy';
import { localizeReply, detectPatientLanguageHint } from '../../../utils/localize-reply';
import {
  formatAppointmentStatusLine,
  isPostBookingAcknowledgment,
} from '../../../utils/dm-appointment-status';
import type { ConversationState } from '../../../types/conversation';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';
import { isCancelRescheduleStatusTurn } from './cancel-reschedule-status-predicate';

export const cancelRescheduleStatusStage: DmStageHandler = {
  stage: 'cancel_reschedule_status',
  async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
    if (!isCancelRescheduleStatusTurn(ctx)) {
      throw new Error('cancel_reschedule_status stage invoked but predicate did not match');
    }
    const {
      conversation,
      doctorId,
      correlationId,
      text,
      recentMessages,
      intentResult,
      doctorSettings,
      doctorContext,
      runGenerateResponseWithActions,
      fallbackReply,
    } = ctx;
    let state = ctx.state;
    let dmRoutingBranch: DmHandlerBranch = 'unknown';
    let replyText: string = fallbackReply;

  if (state.step === 'awaiting_cancel_choice') {
        dmRoutingBranch = 'cancel_flow_numeric';
        // Cancel flow: user picks which appointment (1, 2, 3...)
        const ids = state.cancel?.pendingAppointmentIds ?? [];
        const trimmed = text.trim();
        const num = parseInt(trimmed, 10);
        if (num >= 1 && num <= ids.length) {
          const chosenId = ids[num - 1]!;
          const appointment = await getAppointmentByIdForWorker(chosenId, correlationId);
          if (!appointment || appointment.doctor_id !== doctorId) {
            replyText = "That appointment wasn't found. Please try again or say 'cancel appointment' to start over.";
            state = { ...state, step: 'responded', updatedAt: new Date().toISOString() };
          } else {
            const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
            const iso = typeof appointment.appointment_date === 'string'
              ? appointment.appointment_date
              : (appointment.appointment_date as Date).toISOString();
            const dateStr = formatAppointmentStatusLine(iso, '', tz).replace(' ()', '');
            replyText = `Cancel appointment on ${dateStr}? Reply **Yes** or **No**.`;
            state = {
              ...state,
              step: 'awaiting_cancel_confirmation',
              cancel: { appointmentId: chosenId },
              updatedAt: new Date().toISOString(),
            };
          }
        } else {
          replyText = `Please reply 1, 2, or ${ids.length}.`;
        }
  } else if (state.step === 'awaiting_cancel_confirmation') {
        dmRoutingBranch = 'cancel_flow_confirm';
        // Fast-path: clear yes/no executes immediately (no AI). Prevents AI returning text without tool call.
        const lower = text.trim().toLowerCase();
        const isYes = /^(yes|yeah|yep|ok|okay|cancel|confirm)$/.test(lower);
        const isNo = /^(no|nope|keep|don't|dont)$/.test(lower);
        let executedReply: string | undefined;
        let executedStateUpdate: Partial<ConversationState> | undefined;

        if (state.cancel?.appointmentId && (isYes || isNo)) {
          const action = { type: 'confirm_cancel' as const, confirm: isYes };
          const result = await executeAction(action, {
            conversationId: conversation.id,
            doctorId,
            conversation,
            state,
            correlationId,
            timezone: doctorSettings?.timezone ?? undefined,
          });
          if (result.success && result.replyOverride) {
            executedReply = result.replyOverride;
            executedStateUpdate = result.stateUpdate;
          }
        }

        if (!executedReply) {
          // AI path: natural language (2737, go ahead, etc.)
          const aiResult = await runGenerateResponseWithActions({
            conversationId: conversation.id,
            currentIntent: intentResult.intent,
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
            doctorContext,
            availableTools: ['confirm_cancel'],
          });
          if (aiResult.toolCalls?.length) {
            for (const tc of aiResult.toolCalls) {
              if (tc.name !== 'confirm_cancel') continue;
              const action = parseToolCallToAction(tc);
              if (!action || action.type !== 'confirm_cancel') continue;
              const result = await executeAction(action, {
                conversationId: conversation.id,
                doctorId,
                conversation,
                state,
                correlationId,
                timezone: doctorSettings?.timezone ?? undefined,
              });
              if (result.success && result.replyOverride) {
                executedReply = result.replyOverride;
                executedStateUpdate = result.stateUpdate;
                break;
              }
            }
          }
          if (!executedReply) {
            executedReply = aiResult.reply;
          }
        }

        replyText = executedReply || "Please reply **Yes** to cancel or **No** to keep your appointment.";
        if (executedStateUpdate) {
          state = { ...state, ...executedStateUpdate };
        }
  } else if (state.step === 'awaiting_reschedule_choice') {
        dmRoutingBranch = 'reschedule_flow_numeric';
        // Reschedule flow: user picks which appointment (1, 2, 3...)
        const ids = state.reschedule?.pendingAppointmentIds ?? [];
        const trimmed = text.trim();
        const num = parseInt(trimmed, 10);
        if (num >= 1 && num <= ids.length) {
          const chosenId = ids[num - 1]!;
          const appointment = await getAppointmentByIdForWorker(chosenId, correlationId);
          if (!appointment || appointment.doctor_id !== doctorId) {
            replyText = "That appointment wasn't found. Please try again or say 'reschedule appointment' to start over.";
            state = { ...state, step: 'responded', updatedAt: new Date().toISOString() };
          } else {
            const url = buildReschedulePageUrl(conversation.id, doctorId, chosenId);
            replyText = formatRescheduleChoiceLinkDm(url, doctorSettings);
            state = {
              ...state,
              step: 'awaiting_reschedule_slot',
              reschedule: { appointmentId: chosenId },
              updatedAt: new Date().toISOString(),
            };
          }
        } else {
          replyText = `Please reply 1, 2, or ${ids.length}.`;
        }
  } else if (intentResult.intent === 'check_appointment_status') {
        dmRoutingBranch = 'check_appointment_status';
        const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
        const askingForSelfOnly = /\b(my\s+appointment|what\s+about\s+my\s+appointment)\b/i.test(text.trim());
        const patientIdsList = askingForSelfOnly
          ? [conversation.patient_id]
          : buildRelatedPatientIdsForWebhook(conversation.patient_id, state);
        const upcoming = await getMergedUpcomingAppointmentsForRelatedPatients(
          patientIdsList,
          doctorId,
          correlationId
        );
        const resolveStatus = async (a: (typeof upcoming)[0]): Promise<string> => {
          if (a.status === 'confirmed') return 'confirmed';
          const paid = await hasCapturedPaymentForAppointment(a.id, correlationId);
          return paid ? 'confirmed' : a.status;
        };
        const formatWithName = (a: (typeof upcoming)[0], displayStatus: string) => {
          const iso = typeof a.appointment_date === 'string' ? a.appointment_date : a.appointment_date.toISOString();
          const line = formatAppointmentStatusLine(iso, displayStatus, tz);
          const isForSelf = a.patient_id === conversation.patient_id;
          return isForSelf ? line : `For **${a.patient_name || 'them'}**: ${line}`;
        };
        const hasSelfAppointment = upcoming.some((a) => a.patient_id === conversation.patient_id);
        if (upcoming.length === 0) {
          replyText = await localizeReply(
            "You don't have any upcoming appointments. Say 'book appointment' to schedule one.",
            {}, detectPatientLanguageHint(text), correlationId
          );
        } else if (askingForSelfOnly && !hasSelfAppointment) {
          const other = upcoming[0];
          const iso = typeof other.appointment_date === 'string' ? other.appointment_date : other.appointment_date.toISOString();
          const displayStatus = await resolveStatus(other);
          const line = formatAppointmentStatusLine(iso, displayStatus, tz);
          replyText = `You don't have an appointment for yourself yet. The appointment on ${line} is for **${other.patient_name || 'someone else'}**. Would you like to book one for yourself?`;
        } else if (upcoming.length === 1) {
          const a = upcoming[0];
          const displayStatus = await resolveStatus(a);
          replyText = `Your next appointment is on ${formatWithName(a, displayStatus)}.`;
        } else {
          const capped = upcoming.slice(0, 10);
          const statusLines: string[] = [];
          for (let idx = 0; idx < capped.length; idx++) {
            const a = capped[idx]!;
            const displayStatus = await resolveStatus(a);
            statusLines.push(`${idx + 1}. ${formatWithName(a, displayStatus)}`);
          }
          replyText = `You have ${upcoming.length} upcoming appointment${upcoming.length > 1 ? 's' : ''}:\n\n${statusLines.join('\n')}`;
          if (upcoming.length > 10) {
            replyText += `\n\n(showing first 10)`;
          }
        }
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        };
  } else if (intentResult.intent === 'cancel_appointment') {
        dmRoutingBranch = 'cancel_appointment_intent';
        const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
        const patientIdsList = buildRelatedPatientIdsForWebhook(conversation.patient_id, state);
        const upcoming = await getMergedUpcomingAppointmentsForRelatedPatients(
          patientIdsList,
          doctorId,
          correlationId
        );
        if (upcoming.length === 0) {
          replyText = "You don't have any upcoming appointments. Say 'book appointment' to schedule one.";
          state = { ...state, lastIntent: intentResult.intent, step: 'responded', updatedAt: new Date().toISOString() };
        } else if (upcoming.length === 1) {
          const a = upcoming[0]!;
          const iso = typeof a.appointment_date === 'string' ? a.appointment_date : (a.appointment_date as Date).toISOString();
          const item: CancelChoiceItem = {
            dateDisplay: formatAppointmentChoiceDate(iso, tz),
            modalityLabel: appointmentConsultationTypeToLabel(a.consultation_type ?? undefined),
          };
          replyText = buildCancelChoiceListMessage({ items: [item] });
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'awaiting_cancel_confirmation',
            cancel: { appointmentId: a.id },
            updatedAt: new Date().toISOString(),
          };
        } else {
          const items: CancelChoiceItem[] = upcoming.map((a) => {
            const iso = typeof a.appointment_date === 'string' ? a.appointment_date : (a.appointment_date as Date).toISOString();
            return {
              dateDisplay: formatAppointmentChoiceDate(iso, tz),
              modalityLabel: appointmentConsultationTypeToLabel(a.consultation_type ?? undefined),
            };
          });
          replyText = buildCancelChoiceListMessage({ items });
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'awaiting_cancel_choice',
            cancel: { pendingAppointmentIds: upcoming.map((a) => a.id) },
            updatedAt: new Date().toISOString(),
          };
        }
  } else if (intentResult.intent === 'reschedule_appointment') {
        dmRoutingBranch = 'reschedule_appointment_intent';
        const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
        const patientIdsList = buildRelatedPatientIdsForWebhook(conversation.patient_id, state);
        const upcoming = await getMergedUpcomingAppointmentsForRelatedPatients(
          patientIdsList,
          doctorId,
          correlationId
        );
        if (upcoming.length === 0) {
          replyText = "You don't have any upcoming appointments. Say 'book appointment' to schedule one.";
          state = { ...state, lastIntent: intentResult.intent, step: 'responded', updatedAt: new Date().toISOString() };
        } else if (upcoming.length === 1) {
          const a = upcoming[0]!;
          const url = buildReschedulePageUrl(conversation.id, doctorId, a.id);
          replyText = formatRescheduleLinkDm(url, doctorSettings);
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'awaiting_reschedule_slot',
            reschedule: { appointmentId: a.id },
            updatedAt: new Date().toISOString(),
          };
        } else {
          const lines = upcoming.map((a, i) => {
            const iso = typeof a.appointment_date === 'string' ? a.appointment_date : (a.appointment_date as Date).toISOString();
            return `${i + 1}) ${formatAppointmentStatusLine(iso, '', tz).replace(' ()', '')}`;
          });
          replyText = `Which appointment would you like to reschedule?\n\n${lines.join('\n')}\n\nReply 1, 2, or ${upcoming.length}.`;
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'awaiting_reschedule_choice',
            reschedule: { pendingAppointmentIds: upcoming.map((a) => a.id) },
            updatedAt: new Date().toISOString(),
          };
        }
  } else if (
        state.step === 'responded' &&
        isPostBookingAcknowledgment(text, recentMessages)
      ) {
        dmRoutingBranch = 'post_booking_ack';
        replyText = "Great - you're all set. Let us know if you need anything else.";
                state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        };
  }

    return { branch: dmRoutingBranch, reply: replyText, nextState: state };
  },
};
