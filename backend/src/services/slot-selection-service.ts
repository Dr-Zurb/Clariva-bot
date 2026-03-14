/**
 * Slot Selection Service (e-task-3)
 *
 * Handles external slot picker flow: save selection, send proactive message, return redirect URL.
 * No PHI in logs; slot time only in message.
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import {
  findConversationById,
  getConversationState,
  updateConversationState,
} from './conversation-service';
import { getConnectionStatus } from './instagram-connect-service';
import { getInstagramAccessTokenForDoctor } from './instagram-connect-service';
import { sendInstagramMessage } from './instagram-service';
import { getDoctorSettings } from './doctor-settings-service';
import { verifyBookingToken, generateBookingToken } from '../utils/booking-token';
import { InternalError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors';

/**
 * Save or overwrite slot selection for a conversation.
 * Upserts by conversation_id (one draft per conversation).
 */
export async function saveSlotSelection(
  conversationId: string,
  doctorId: string,
  slotStart: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { error } = await admin
    .from('slot_selections')
    .upsert(
      {
        conversation_id: conversationId,
        doctor_id: doctorId,
        slot_start: slotStart,
      },
      { onConflict: 'conversation_id' }
    );

  if (error) {
    const { handleSupabaseError } = await import('../utils/db-helpers');
    handleSupabaseError(error, correlationId);
  }
}

/**
 * Get redirect URL for doctor (Instagram DM).
 * Returns https://instagram.com/{username} or fallback to instagram.com.
 */
export async function getRedirectUrlForDoctor(doctorId: string): Promise<string> {
  const status = await getConnectionStatus(doctorId);
  const username = status.username?.trim();
  if (username) {
    return `https://instagram.com/${username.replace(/^@/, '')}`;
  }
  return 'https://instagram.com';
}

/**
 * Format slot for display (e.g. "Tuesday Mar 14 at 2:00 PM").
 */
function formatSlotForDisplay(slotStart: string, timezone: string): string {
  const d = new Date(slotStart);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Build booking page URL with token.
 */
export function buildBookingPageUrl(conversationId: string, doctorId: string): string {
  const baseUrl = env.BOOKING_PAGE_URL?.trim() || 'https://example.com/book';
  const token = generateBookingToken(conversationId, doctorId);
  return `${baseUrl.replace(/\/$/, '')}?token=${token}`;
}

export interface ProcessSlotSelectionResult {
  success: boolean;
  redirectUrl: string;
}

/**
 * Process slot selection: verify token, save, update conversation state, send proactive message.
 *
 * @param token - Booking token from request
 * @param slotStart - ISO datetime string
 * @param correlationId - Request correlation ID
 * @returns { success, redirectUrl }
 */
export async function processSlotSelection(
  token: string,
  slotStart: string,
  correlationId: string
): Promise<ProcessSlotSelectionResult> {
  const { conversationId, doctorId } = verifyBookingToken(token);

  const slotDate = new Date(slotStart);
  if (isNaN(slotDate.getTime())) {
    throw new ValidationError('Invalid slotStart format (expected ISO datetime)');
  }
  if (slotDate < new Date()) {
    throw new ValidationError('Cannot select a slot in the past');
  }

  const conversation = await findConversationById(conversationId, correlationId);
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }
  if (conversation.doctor_id !== doctorId) {
    throw new UnauthorizedError('Token does not match conversation');
  }

  const slotEnd = new Date(slotDate.getTime() + 30 * 60 * 1000);
  const doctorSettings = await getDoctorSettings(doctorId);
  const timezone = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const dateStr = formatSlotForDisplay(slotStart, timezone);

  await saveSlotSelection(conversationId, doctorId, slotStart, correlationId);

  const state = await getConversationState(conversationId, correlationId);
  const newState = {
    ...state,
    step: 'confirming_slot',
    slotToConfirm: {
      start: slotDate.toISOString(),
      end: slotEnd.toISOString(),
      dateStr,
    },
    updatedAt: new Date().toISOString(),
  };
  await updateConversationState(conversationId, newState, correlationId);

  const redirectUrl = await getRedirectUrlForDoctor(doctorId);
  const bookingLink = buildBookingPageUrl(conversationId, doctorId);
  const message =
    `You selected **${dateStr}**. Reply Yes to confirm, or No to pick another time. [Change slot](${bookingLink})`;

  const recipientId = conversation.platform_conversation_id;
  if (!recipientId || conversation.platform !== 'instagram') {
    return { success: true, redirectUrl };
  }

  const accessToken = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
  if (accessToken) {
    try {
      await sendInstagramMessage(recipientId, message, correlationId, accessToken);
    } catch {
      // Fail-open: selection saved, state updated; user can still confirm in chat
    }
  }

  return { success: true, redirectUrl };
}
