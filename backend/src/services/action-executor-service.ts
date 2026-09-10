/**
 * Action Executor Service — AI-to-System Instruction Layer
 *
 * Executes structured actions requested by the AI (from OpenAI tool calls).
 * Validates context and state before executing. No PHI in logs.
 *
 * @see docs/Work/Daily-plans/March 2026/2026-03-17/e-task-ai-system-instruction-layer.md
 */

import {
  cancelAppointmentForPatient,
  getAppointmentByIdForWorker,
} from './appointment-service';
import { sendAppointmentCancelledToDoctor } from './notification-service';
import { buildReschedulePageUrl } from './slot-selection-service';
import { logger } from '../config/logger';
import { formatRescheduleChoiceLinkDm } from '../utils/booking-link-copy';
import {
  buildAppointmentCancelledMessage,
  buildAppointmentNotFoundShortMessage,
  buildAppointmentPickNotFoundMessage,
  buildCancelConfirmPromptMessage,
  buildCancelDeclinedMessage,
} from '../utils/dm-copy';
import type {
  ActionContext,
  ActionResult,
  SystemAction,
  ToolCallFromAI,
} from '../types/system-actions';

/** Format appointment date for display (no PHI in logs) */
function formatAppointmentDate(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Parse OpenAI tool call into SystemAction.
 * Returns null if tool name/args are invalid.
 */
export function parseToolCallToAction(tool: ToolCallFromAI): SystemAction | null {
  try {
    if (tool.name === 'confirm_cancel') {
      const args = JSON.parse(tool.arguments || '{}') as { confirm?: boolean };
      const confirm = typeof args.confirm === 'boolean' ? args.confirm : true;
      return { type: 'confirm_cancel', confirm };
    }
    if (tool.name === 'pick_appointment') {
      const args = JSON.parse(tool.arguments || '{}') as { index?: number };
      const index = typeof args.index === 'number' ? args.index : 1;
      if (index < 1) return null;
      return { type: 'pick_appointment', index };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Execute a system action. Validates context; performs DB/notification updates.
 *
 * @param action - Parsed action from AI
 * @param ctx - Conversation and state context
 * @returns ActionResult with replyOverride and/or stateUpdate
 */
export async function executeAction(
  action: SystemAction,
  ctx: ActionContext
): Promise<ActionResult> {
  const { conversationId, doctorId, state, correlationId, language } = ctx;
  const tz = ctx.timezone ?? 'Asia/Kolkata';

  if (action.type === 'confirm_cancel') {
    if (state.step !== 'awaiting_cancel_confirmation') {
      logger.warn(
        { correlationId, step: state.step },
        'confirm_cancel rejected: wrong step'
      );
      return { success: false };
    }
    const cancelId = state.cancel?.appointmentId;
    if (!cancelId) {
      logger.warn({ correlationId }, 'confirm_cancel rejected: no cancel.appointmentId');
      return { success: false };
    }

    if (action.confirm) {
      const appointment = await getAppointmentByIdForWorker(cancelId, correlationId);
      if (!appointment || appointment.doctor_id !== doctorId || !appointment.patient_id) {
        return {
          success: true,
          replyOverride: buildAppointmentNotFoundShortMessage({ language }),
          stateUpdate: {
            step: 'responded',
            cancel: undefined,
            updatedAt: new Date().toISOString(),
          },
        };
      }
      await cancelAppointmentForPatient(
        cancelId,
        appointment.patient_id,
        doctorId,
        correlationId
      );
      const iso =
        typeof appointment.appointment_date === 'string'
          ? appointment.appointment_date
          : (appointment.appointment_date as Date).toISOString();
      const dateStr = formatAppointmentDate(iso, tz);
      sendAppointmentCancelledToDoctor(doctorId, cancelId, iso, correlationId).catch(
        (err) => {
          logger.warn(
            {
              correlationId,
              appointmentId: cancelId,
              error: err instanceof Error ? err.message : String(err),
            },
            'Appointment cancelled email failed (non-blocking)'
          );
        }
      );
      return {
        success: true,
        replyOverride: buildAppointmentCancelledMessage({
          language,
          dateDisplay: dateStr,
        }),
        stateUpdate: {
          step: 'responded',
          cancel: undefined,
          updatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      replyOverride: buildCancelDeclinedMessage({ language }),
      stateUpdate: {
        step: 'responded',
        cancel: undefined,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  if (action.type === 'pick_appointment') {
    const ids =
      state.step === 'awaiting_cancel_choice'
        ? state.cancel?.pendingAppointmentIds
        : state.step === 'awaiting_reschedule_choice'
          ? state.reschedule?.pendingAppointmentIds
          : undefined;
    if (!ids || action.index < 1 || action.index > ids.length) {
      return { success: false };
    }
    const chosenId = ids[action.index - 1]!;
    const appointment = await getAppointmentByIdForWorker(chosenId, correlationId);
    if (!appointment || appointment.doctor_id !== doctorId) {
      return {
        success: true,
        replyOverride: buildAppointmentPickNotFoundMessage({
          language,
          flow:
            state.step === 'awaiting_cancel_choice' ? 'cancel' : 'reschedule',
        }),
        stateUpdate: { step: 'responded', updatedAt: new Date().toISOString() },
      };
    }
    const dateStr = formatAppointmentDate(
      typeof appointment.appointment_date === 'string'
        ? appointment.appointment_date
        : (appointment.appointment_date as Date).toISOString(),
      tz
    );

    if (state.step === 'awaiting_cancel_choice') {
      return {
        success: true,
        replyOverride: buildCancelConfirmPromptMessage({
          language,
          dateDisplay: dateStr,
        }),
        stateUpdate: {
          step: 'awaiting_cancel_confirmation',
          cancel: { appointmentId: chosenId },
          updatedAt: new Date().toISOString(),
        },
      };
    }

    if (state.step === 'awaiting_reschedule_choice') {
      const url = buildReschedulePageUrl(conversationId, doctorId, chosenId);
      // lang-20 §3.4: honour queue-mode variants (was hardcoded slot copy).
      return {
        success: true,
        replyOverride: formatRescheduleChoiceLinkDm({ language: ctx.language, url, doctorSettings: ctx.doctorSettings }),
        stateUpdate: {
          step: 'awaiting_reschedule_slot',
          reschedule: { appointmentId: chosenId },
          updatedAt: new Date().toISOString(),
        },
      };
    }

    return { success: false };
  }

  return { success: false };
}
