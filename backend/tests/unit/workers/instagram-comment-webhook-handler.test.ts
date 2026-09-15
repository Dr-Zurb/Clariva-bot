/**
 * Instagram comment webhook: private reply + daily cap.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('../../../src/services/webhook-metrics', () => ({
  logWebhookCommentPipeline: jest.fn(),
}));
jest.mock('../../../src/services/instagram-connect-service');
jest.mock('../../../src/services/comment-media-service');
jest.mock('../../../src/services/comment-lead-service');
jest.mock('../../../src/services/ai-service');
jest.mock('../../../src/services/doctor-settings-service');
jest.mock('../../../src/services/webhook-idempotency-service');
jest.mock('../../../src/services/instagram-service');
jest.mock('../../../src/services/comment-outreach-language', () => ({
  resolveCommentOutreachLanguage: jest.fn(async () => 'en'),
}));
jest.mock('../../../src/services/notification-service', () => ({
  sendCommentLeadToDoctor: jest.fn(async () => undefined),
}));

import { processInstagramCommentWebhook } from '../../../src/workers/instagram-comment-webhook-handler';
import * as igConnect from '../../../src/services/instagram-connect-service';
import * as commentMedia from '../../../src/services/comment-media-service';
import * as commentLead from '../../../src/services/comment-lead-service';
import * as aiService from '../../../src/services/ai-service';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import * as idempotency from '../../../src/services/webhook-idempotency-service';
import * as instagramService from '../../../src/services/instagram-service';

const ENTRY_ID = 'ig-entry-1';
const COMMENT_ID = 'ig-comment-1';
const COMMENTER_ID = 'ig-user-1';
const MEDIA_ID = 'ig-media-1';
const DOCTOR_ID = 'doctor-1';

function commentPayload() {
  return {
    object: 'instagram',
    entry: [
      {
        id: ENTRY_ID,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: 'comments',
            value: {
              id: COMMENT_ID,
              text: 'I want to book an appointment',
              from: { id: COMMENTER_ID, username: 'patient_test' },
              media: { id: MEDIA_ID },
            },
          },
        ],
      },
    ],
  };
}

describe('processInstagramCommentWebhook private reply', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(commentMedia.resolveDoctorIdFromComment).mockResolvedValue(DOCTOR_ID);
    jest.mocked(igConnect.getStoredInstagramPageIdForDoctor).mockResolvedValue('ig-page-1');
    jest.mocked(igConnect.getInstagramAccessTokenForDoctor).mockResolvedValue('ig-tok');
    jest.mocked(commentLead.createCommentLead).mockResolvedValue({} as never);
    jest.mocked(commentLead.canSendCommentPrivateReply).mockResolvedValue(true);
    jest.mocked(aiService.classifyCommentIntent).mockResolvedValue({
      intent: 'book_appointment',
      confidence: 0.9,
    } as never);
    jest.mocked(doctorSettings.getDoctorSettings).mockResolvedValue({
      practice_name: 'Test Clinic',
      instagram_receptionist_paused: false,
    } as never);
    jest.mocked(idempotency.markWebhookProcessed).mockResolvedValue({} as never);
    jest.mocked(instagramService.sendInstagramPrivateReply).mockResolvedValue({} as never);
    jest.mocked(instagramService.replyToInstagramComment).mockResolvedValue({ replyId: 'r1' });
  });

  it('sends a private reply keyed by comment id, not commenter user id', async () => {
    await processInstagramCommentWebhook({
      eventId: COMMENT_ID,
      correlationId: 'c1',
      provider: 'instagram',
      payload: commentPayload(),
    });

    expect(instagramService.sendInstagramPrivateReply).toHaveBeenCalledWith(
      COMMENT_ID,
      expect.any(String),
      'c1',
      'ig-tok'
    );
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
    expect(instagramService.replyToInstagramComment).toHaveBeenCalled();
  });

  it('skips private reply and public reply when daily cap is reached', async () => {
    jest.mocked(commentLead.canSendCommentPrivateReply).mockResolvedValue(false);

    await processInstagramCommentWebhook({
      eventId: COMMENT_ID,
      correlationId: 'c1',
      provider: 'instagram',
      payload: commentPayload(),
    });

    expect(commentLead.createCommentLead).toHaveBeenCalled();
    expect(instagramService.sendInstagramPrivateReply).not.toHaveBeenCalled();
    expect(instagramService.replyToInstagramComment).not.toHaveBeenCalled();
  });
});
