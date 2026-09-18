/**
 * fbm-09 / fbm-10: Facebook Page comment webhook handler.
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
jest.mock('../../../src/services/facebook-connect-service');
jest.mock('../../../src/services/comment-lead-service');
jest.mock('../../../src/services/ai-service');
jest.mock('../../../src/services/doctor-settings-service');
jest.mock('../../../src/services/webhook-idempotency-service');
jest.mock('../../../src/services/instagram-service');
jest.mock('../../../src/services/notification-service', () => ({
  sendCommentLeadToDoctor: jest.fn(async () => undefined),
}));
jest.mock('../../../src/services/comment-outreach-language', () => ({
  resolveCommentOutreachLanguage: jest.fn(async () => 'en'),
}));
jest.mock('../../../src/services/automated-messaging-opt-out', () => ({
  shouldSkipCommentPrivateReply: jest.fn(async () => false),
}));

import { processFacebookCommentWebhook } from '../../../src/workers/facebook-comment-webhook-handler';
import * as facebookConnect from '../../../src/services/facebook-connect-service';
import * as commentLead from '../../../src/services/comment-lead-service';
import * as aiService from '../../../src/services/ai-service';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import * as idempotency from '../../../src/services/webhook-idempotency-service';
import * as instagramService from '../../../src/services/instagram-service';
import * as notification from '../../../src/services/notification-service';

const PAGE_ID = '1041330372407980';
const COMMENT_ID = 'comment-fb-1';
const USER_ID = 'user-psid-1';
const DOCTOR_ID = 'doctor-1';

function feedCommentPayload(overrides: Record<string, unknown> = {}) {
  return {
    object: 'page',
    entry: [
      {
        id: PAGE_ID,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              comment_id: COMMENT_ID,
              post_id: `${PAGE_ID}_123`,
              from: { id: USER_ID, name: 'PATIENT_TEST' },
              message: 'I want to book an appointment',
              ...overrides,
            },
          },
        ],
      },
    ],
  };
}

describe('processFacebookCommentWebhook (fbm-09/10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(facebookConnect.getDoctorIdByFacebookPageId).mockResolvedValue(DOCTOR_ID);
    jest.mocked(facebookConnect.getStoredFacebookPageIdForDoctor).mockResolvedValue(PAGE_ID);
    jest
      .mocked(facebookConnect.getFacebookPageAccessTokenForDoctor)
      .mockResolvedValue('page-tok');
    jest.mocked(facebookConnect.replyToFacebookComment).mockResolvedValue({ replyId: 'r1' });
    jest.mocked(commentLead.createCommentLead).mockResolvedValue({} as never);
    jest.mocked(aiService.classifyCommentIntent).mockResolvedValue({
      intent: 'book_appointment',
      confidence: 0.9,
    } as never);
    jest.mocked(doctorSettings.getDoctorSettings).mockResolvedValue({
      practice_name: 'Test Clinic',
      instagram_receptionist_paused: false,
    } as never);
    jest.mocked(idempotency.markWebhookProcessed).mockResolvedValue({} as never);
    jest.mocked(commentLead.canSendCommentPrivateReply).mockResolvedValue(true);
    jest.mocked(instagramService.sendInstagramPrivateReply).mockResolvedValue({} as never);
    jest.mocked(notification.sendCommentLeadToDoctor).mockResolvedValue(undefined as never);
  });

  it('skips when Page has no connected doctor', async () => {
    jest.mocked(facebookConnect.getDoctorIdByFacebookPageId).mockResolvedValue(null);
    await processFacebookCommentWebhook({
      eventId: COMMENT_ID,
      correlationId: 'c1',
      provider: 'facebook',
      payload: feedCommentPayload(),
    });
    expect(commentLead.createCommentLead).not.toHaveBeenCalled();
    expect(idempotency.markWebhookProcessed).toHaveBeenCalledWith(COMMENT_ID, 'facebook');
  });

  it('skips own Page comments', async () => {
    await processFacebookCommentWebhook({
      eventId: COMMENT_ID,
      correlationId: 'c1',
      provider: 'facebook',
      payload: feedCommentPayload({ from: { id: PAGE_ID, name: 'Halo Aid' } }),
    });
    expect(commentLead.createCommentLead).not.toHaveBeenCalled();
  });

  it('creates facebook lead and sends reply + Messenger DM for high intent', async () => {
    await processFacebookCommentWebhook({
      eventId: COMMENT_ID,
      correlationId: 'c1',
      provider: 'facebook',
      payload: feedCommentPayload(),
    });

    expect(commentLead.createCommentLead).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: DOCTOR_ID,
        commentId: COMMENT_ID,
        commenterIgId: USER_ID,
        platform: 'facebook',
        intent: 'book_appointment',
      }),
      'c1'
    );
    expect(instagramService.sendInstagramPrivateReply).toHaveBeenCalledWith(
      COMMENT_ID,
      expect.any(String),
      'c1',
      'page-tok',
      DOCTOR_ID
    );
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
    expect(facebookConnect.replyToFacebookComment).toHaveBeenCalledWith(
      COMMENT_ID,
      expect.any(String),
      'page-tok',
      'c1'
    );
  });

  it('skips private reply and public reply when daily cap is reached', async () => {
    jest.mocked(commentLead.canSendCommentPrivateReply).mockResolvedValue(false);
    await processFacebookCommentWebhook({
      eventId: COMMENT_ID,
      correlationId: 'c1',
      provider: 'facebook',
      payload: feedCommentPayload(),
    });
    expect(commentLead.createCommentLead).toHaveBeenCalled();
    expect(instagramService.sendInstagramPrivateReply).not.toHaveBeenCalled();
    expect(facebookConnect.replyToFacebookComment).not.toHaveBeenCalled();
  });

  it('skips non-add verbs', async () => {
    await processFacebookCommentWebhook({
      eventId: COMMENT_ID,
      correlationId: 'c1',
      provider: 'facebook',
      payload: feedCommentPayload({ verb: 'remove' }),
    });
    expect(commentLead.createCommentLead).not.toHaveBeenCalled();
  });
});
