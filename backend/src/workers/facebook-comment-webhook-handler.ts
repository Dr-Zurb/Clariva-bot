/**
 * Facebook Page feed comment webhook (fbm-09 / fbm-10).
 * object=page, field=feed, item=comment — lead + optional public reply + Messenger DM.
 */

import { logger } from '../config/logger';
import { logAuditEvent } from '../utils/audit-logger';
import { markWebhookProcessed } from '../services/webhook-idempotency-service';
import {
  sendInstagramMessage,
  COMMENT_PUBLIC_REPLY_TEXT,
  fetchCommentAuthorUsername,
} from '../services/instagram-service';
import {
  getDoctorIdByFacebookPageId,
  getFacebookPageAccessTokenForDoctor,
  getStoredFacebookPageIdForDoctor,
  replyToFacebookComment,
} from '../services/facebook-connect-service';
import { getDoctorSettings } from '../services/doctor-settings-service';
import { classifyCommentIntent, isPossiblyMedicalComment } from '../services/ai-service';
import { parseFacebookPageCommentPayload } from '../utils/webhook-event-id';
import { createCommentLead } from '../services/comment-lead-service';
import { resolveCommentOutreachLanguage } from '../services/comment-outreach-language';
import { sendCommentLeadToDoctor } from '../services/notification-service';
import { logWebhookCommentPipeline } from '../services/webhook-metrics';
import { buildCommentProactiveDmMessage } from '../utils/dm-copy';
import type { CommentIntent } from '../types/ai';
import type { WebhookProvider } from '../types/webhook';

const HIGH_INTENT_COMMENT: Set<CommentIntent> = new Set([
  'book_appointment',
  'check_availability',
  'pricing_inquiry',
  'general_inquiry',
  'medical_query',
]);

const SKIP_INTENT_COMMENT: Set<CommentIntent> = new Set(['spam', 'joke', 'unrelated', 'vulgar']);

export interface ProcessFacebookCommentWebhookParams {
  eventId: string;
  correlationId: string;
  provider: WebhookProvider;
  payload: unknown;
}

/**
 * Handle Facebook Page feed comment webhooks.
 */
export async function processFacebookCommentWebhook(
  params: ProcessFacebookCommentWebhookParams
): Promise<void> {
  const { eventId, correlationId, provider, payload } = params;

  const parsed = parseFacebookPageCommentPayload(payload);
  if (!parsed) {
    logger.info(
      { eventId, provider, correlationId },
      'Facebook comment webhook: unparseable payload, marking processed'
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

  const {
    commentId,
    commenterUserId,
    commentText,
    postId,
    pageId,
    verb,
    commenterUsername,
  } = parsed;
  let resolvedUsername = commenterUsername;

  if (verb !== 'add') {
    logger.info(
      { eventId, provider, correlationId, verb },
      'Facebook comment webhook: non-add verb, skipping'
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

  if (!commentText) {
    logger.info(
      { eventId, provider, correlationId, commentId },
      'Facebook comment: blank text, skipping'
    );
    await markWebhookProcessed(eventId, provider);
    return;
  }

  const doctorId = pageId
    ? await getDoctorIdByFacebookPageId(pageId, correlationId)
    : null;

  if (!doctorId) {
    logger.info(
      { eventId, provider, correlationId, pageId },
      'Facebook comment: no doctor for Page id'
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

  const doctorPageId = await getStoredFacebookPageIdForDoctor(doctorId, correlationId);
  if (doctorPageId && commenterUserId === doctorPageId) {
    logger.info(
      { eventId, provider, correlationId, commentId },
      'Facebook comment: own Page comment, skipping'
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
      const possiblyMedical = await isPossiblyMedicalComment(commentText, correlationId);
      if (possiblyMedical) {
        intent = 'medical_query';
      } else {
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

  const pageTokenEarly = await getFacebookPageAccessTokenForDoctor(
    doctorId,
    correlationId
  );
  if (!resolvedUsername && pageTokenEarly) {
    resolvedUsername = await fetchCommentAuthorUsername(
      commentId,
      pageTokenEarly,
      correlationId
    );
  }

  await createCommentLead(
    {
      doctorId,
      commentId,
      commenterIgId: commenterUserId,
      commentText,
      mediaId: postId,
      intent,
      confidence: intentResult.confidence,
      platform: 'facebook',
      commenterUsername: resolvedUsername,
      publicReplySent: false,
      dmSent: false,
    },
    correlationId
  );

  // Shared pause flag with Instagram receptionist for v1 (FBM2 pause parity).
  const receptionistPaused = settings?.instagram_receptionist_paused === true;

  if (isHighIntent && !receptionistPaused) {
    const pageToken =
      pageTokenEarly ??
      (await getFacebookPageAccessTokenForDoctor(doctorId, correlationId));
    commentDoctorTokenPresent = !!pageToken;
    if (pageToken) {
      // LANG5-D6: language from linked conversation only — never from comment text.
      const language = await resolveCommentOutreachLanguage(
        doctorId,
        'facebook',
        commenterUserId,
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
        await sendInstagramMessage(commenterUserId, dmMessage, correlationId, pageToken);
        dmSent = true;
      } catch (dmErr) {
        logger.warn(
          {
            correlationId,
            commentId,
            error: dmErr instanceof Error ? dmErr.message : String(dmErr),
          },
          'Facebook comment: proactive Messenger DM failed'
        );
      }

      try {
        const replyResult = await replyToFacebookComment(
          commentId,
          COMMENT_PUBLIC_REPLY_TEXT,
          pageToken,
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
          'Facebook comment: public reply failed'
        );
      }

      if (dmSent || publicReplySent) {
        await createCommentLead(
          {
            doctorId,
            commentId,
            commenterIgId: commenterUserId,
            commentText,
            mediaId: postId,
            intent,
            confidence: intentResult.confidence,
            platform: 'facebook',
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
        'Facebook comment lead email failed (non-blocking)'
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
    doctorTokenPresent: isHighIntent && !receptionistPaused ? commentDoctorTokenPresent : undefined,
    automationSkipped: isHighIntent && receptionistPaused ? 'receptionist_paused' : undefined,
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
      type: 'facebook_comment',
      comment_id: commentId,
      intent,
      dm_sent: dmSent,
      public_reply_sent: publicReplySent,
    },
  });
}
