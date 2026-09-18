/**
 * Instagram comment webhook branch (RBH-05).
 * entry[].changes[] field "comments" / "live_comments" - lead, optional private reply + public reply.
 */

import { logger } from '../config/logger';
import { logAuditEvent } from '../utils/audit-logger';
import { markWebhookProcessed } from '../services/webhook-idempotency-service';
import {
  sendInstagramPrivateReply,
  replyToInstagramComment,
  fetchCommentAuthorUsername,
} from '../services/instagram-service';
import {
  getInstagramAccessTokenForDoctor,
  getStoredInstagramPageIdForDoctor,
} from '../services/instagram-connect-service';
import { getDoctorSettings } from '../services/doctor-settings-service';
import { classifyCommentIntent, isPossiblyMedicalComment } from '../services/ai-service';
import { parseInstagramCommentPayload } from '../utils/webhook-event-id';
import { resolveDoctorIdFromComment } from '../services/comment-media-service';
import { canSendCommentPrivateReply, createCommentLead } from '../services/comment-lead-service';
import { shouldSkipCommentPrivateReply } from '../services/automated-messaging-opt-out';
import { resolveCommentOutreachLanguage } from '../services/comment-outreach-language';
import { sendCommentLeadToDoctor } from '../services/notification-service';
import { logWebhookCommentPipeline } from '../services/webhook-metrics';
import {
  buildCommentProactiveDmMessage,
  buildCommentPublicReplyText,
} from '../utils/dm-copy';
import type { CommentIntent } from '../types/ai';
import type { WebhookProvider } from '../types/webhook';

/** e-task-7: High-intent comment intents (reply + DM per COMMENTS_MANAGEMENT_PLAN). */
const HIGH_INTENT_COMMENT: Set<CommentIntent> = new Set([
  'book_appointment',
  'check_availability',
  'pricing_inquiry',
  'general_inquiry',
  'medical_query',
]);

/** e-task-7: Skip intents (no storage, no outreach). */
const SKIP_INTENT_COMMENT: Set<CommentIntent> = new Set(['spam', 'joke', 'unrelated', 'vulgar']);

export interface ProcessInstagramCommentWebhookParams {
  eventId: string;
  correlationId: string;
  provider: WebhookProvider;
  payload: unknown;
}

/**
 * Handle Instagram comment webhooks (after router confirms comment payload shape).
 */
export async function processInstagramCommentWebhook(
  params: ProcessInstagramCommentWebhookParams
): Promise<void> {
  const { eventId, correlationId, provider, payload } = params;

  const parsed = parseInstagramCommentPayload(payload);
  if (!parsed) {
    logger.info(
      { eventId, provider, correlationId },
      'Instagram comment webhook: unparseable payload, marking processed'
    );
    logWebhookCommentPipeline({
      correlationId,
      eventId,
      outcome: 'skipped',
      skipReason: 'unparseable',
    });
    await markWebhookProcessed(eventId, provider);
    return;
  }

  const { commentId, commenterIgId, commentText, mediaId, entryId, commenterUsername } = parsed;
  let resolvedUsername = commenterUsername;
  const doctorId = entryId
    ? await resolveDoctorIdFromComment(entryId, mediaId, correlationId)
    : null;

  if (!doctorId) {
    logger.info(
      { eventId, provider, correlationId, entryId, mediaId },
      'Comment: no doctor resolved, marking processed'
    );
    logWebhookCommentPipeline({
      correlationId,
      eventId,
      outcome: 'skipped',
      skipReason: 'no_doctor',
    });
    await markWebhookProcessed(eventId, provider);
    return;
  }

  const doctorPageId = await getStoredInstagramPageIdForDoctor(doctorId, correlationId);
  if (doctorPageId && commenterIgId === doctorPageId) {
    logger.info(
      { eventId, provider, correlationId, commentId },
      'Comment: own-bot reply, skipping processing'
    );
    logWebhookCommentPipeline({
      correlationId,
      eventId,
      doctorId,
      outcome: 'skipped',
      skipReason: 'own_bot',
    });
    await markWebhookProcessed(eventId, provider);
    return;
  }

  const intentResult = await classifyCommentIntent(commentText, correlationId);
  let intent = intentResult.intent;

  if (SKIP_INTENT_COMMENT.has(intent)) {
    const skipIntentsForSecondStage = new Set<CommentIntent>(['spam', 'joke', 'unrelated']);
    if (skipIntentsForSecondStage.has(intent)) {
      logger.info(
        { eventId, correlationId, originalIntent: intent },
        'Comment: running second-stage medical check'
      );
      const possiblyMedical = await isPossiblyMedicalComment(commentText, correlationId);
      if (possiblyMedical) {
        intent = 'medical_query';
        logger.info(
          { eventId, provider, correlationId, originalIntent: intentResult.intent },
          'Comment: second-stage override to medical_query'
        );
      } else {
        logger.info(
          { eventId, provider, correlationId, intent },
          'Comment: skip intent, no outreach'
        );
        logWebhookCommentPipeline({
          correlationId,
          eventId,
          doctorId,
          outcome: 'skipped',
          skipReason: 'low_intent',
          intent,
        });
        await markWebhookProcessed(eventId, provider);
        return;
      }
    } else {
      logger.info(
        { eventId, provider, correlationId, intent },
        'Comment: skip intent, no outreach'
      );
      logWebhookCommentPipeline({
        correlationId,
        eventId,
        doctorId,
        outcome: 'skipped',
        skipReason: 'low_intent',
        intent,
      });
      await markWebhookProcessed(eventId, provider);
      return;
    }
  }

  const settings = await getDoctorSettings(doctorId);
  const isHighIntent = HIGH_INTENT_COMMENT.has(intent);
  let dmSent = false;
  let publicReplySent = false;
  let commentDoctorTokenPresent = false;

  // Resolve @username before/with outreach token (webhook often already has it).
  const doctorTokenEarly = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
  if (!resolvedUsername && doctorTokenEarly) {
    resolvedUsername = await fetchCommentAuthorUsername(commentId, doctorTokenEarly, correlationId);
  }

  await createCommentLead(
    {
      doctorId,
      commentId,
      commenterIgId,
      commentText,
      mediaId,
      intent,
      confidence: intentResult.confidence,
      commenterUsername: resolvedUsername,
      publicReplySent: false,
      dmSent: false,
    },
    correlationId
  );

  const receptionistPaused = settings?.instagram_receptionist_paused === true;
  const underDailyCap =
    isHighIntent && !receptionistPaused
      ? await canSendCommentPrivateReply(doctorId, correlationId)
      : true;
  if (isHighIntent && !receptionistPaused && !underDailyCap) {
    logger.info(
      { eventId, provider, correlationId },
      'Comment: daily private-reply cap reached, skipping outreach'
    );
  }

  if (isHighIntent && !receptionistPaused && underDailyCap) {
    const doctorToken =
      doctorTokenEarly ?? (await getInstagramAccessTokenForDoctor(doctorId, correlationId));
    commentDoctorTokenPresent = !!doctorToken;
    if (doctorToken) {
      const skipPrivate = await shouldSkipCommentPrivateReply({
        doctorId,
        platform: 'instagram',
        commenterPlatformId: commenterIgId,
        correlationId,
      });
      // LANG5-D6: language from linked conversation only — never from comment text.
      const language = await resolveCommentOutreachLanguage(
        doctorId,
        'instagram',
        commenterIgId,
        correlationId
      );
      const dmMessage = buildCommentProactiveDmMessage({
        language,
        intent,
        practiceName: settings?.practice_name ?? undefined,
        specialty: settings?.specialty ?? undefined,
        addressSummary: settings?.address_summary ?? undefined,
      });
      try {
        if (!skipPrivate) {
          await sendInstagramPrivateReply(commentId, dmMessage, correlationId, doctorToken, doctorId);
          dmSent = true;
        }
      } catch (dmErr) {
        logger.warn(
          {
            correlationId,
            commentId,
            error: dmErr instanceof Error ? dmErr.message : String(dmErr),
          },
          'Comment: private reply failed'
        );
      }

      try {
        const replyResult = await replyToInstagramComment(
          commentId,
          buildCommentPublicReplyText({
            commentId,
            username: resolvedUsername,
          }),
          doctorToken,
          correlationId
        );
        publicReplySent = !!replyResult;
      } catch (replyErr) {
        logger.warn(
          {
            correlationId,
            commentId,
            error: replyErr instanceof Error ? replyErr.message : String(replyErr),
          },
          'Comment: public reply failed'
        );
      }

      if (dmSent || publicReplySent) {
        await createCommentLead(
          {
            doctorId,
            commentId,
            commenterIgId,
            commentText,
            mediaId,
            intent,
            confidence: intentResult.confidence,
            commenterUsername: resolvedUsername,
            publicReplySent,
            dmSent,
          },
          correlationId
        );
      }
    }
  }

  sendCommentLeadToDoctor(doctorId, { intent, commentPreview: commentText }, correlationId).catch(
    (err) => {
      logger.warn(
        { correlationId, doctorId, error: err instanceof Error ? err.message : String(err) },
        'Comment lead email failed (non-blocking)'
      );
    }
  );

  logWebhookCommentPipeline({
    correlationId,
    eventId,
    doctorId,
    outcome: 'processed',
    intent,
    highIntent: isHighIntent,
    dmSent,
    publicReplySent,
    doctorTokenPresent:
      isHighIntent && !receptionistPaused && underDailyCap ? commentDoctorTokenPresent : undefined,
    automationSkipped:
      isHighIntent && receptionistPaused
        ? 'receptionist_paused'
        : isHighIntent && !underDailyCap
          ? 'daily_cap'
          : undefined,
  });

  await markWebhookProcessed(eventId, provider);
  await logAuditEvent({
    correlationId,
    userId: undefined,
    action: 'webhook_processed',
    resourceType: 'webhook',
    status: 'success',
    metadata: {
      event_id: eventId,
      provider,
      type: 'comment',
      comment_id: commentId,
      intent,
      dm_sent: dmSent,
      public_reply_sent: publicReplySent,
    },
  });
}
