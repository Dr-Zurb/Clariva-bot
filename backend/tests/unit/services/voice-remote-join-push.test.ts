/**
 * voice-C3 — Web Push when patient joins voice/video (T5.32).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const sendPushToUser = jest.fn<() => Promise<{ delivered: number; failed: number; revoked: number }>>();

jest.mock('../../../src/services/push-notification-service', () => ({
  sendPushToUser,
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { sendPatientJoinedCallPushToDoctor } from '../../../src/services/voice-remote-join-push-service';

const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DOCTOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('sendPatientJoinedCallPushToDoctor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendPushToUser.mockResolvedValue({ delivered: 1, failed: 0, revoked: 0 });
  });

  it('fans out doctor push with voice tag and dashboard deeplink', async () => {
    await sendPatientJoinedCallPushToDoctor({
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      modality: 'voice',
      correlationId: 'corr-voice-c3',
    });

    expect(sendPushToUser).toHaveBeenCalledWith({
      userId: DOCTOR_ID,
      payload: {
        title: 'Patient joined your call',
        body: 'Your patient is in the waiting room. Tap to join.',
        tag: `${SESSION_ID}:voice`,
        data: {
          sessionId: SESSION_ID,
          deeplink: `/dashboard/consult/${SESSION_ID}`,
          modality: 'voice',
        },
      },
    });
  });

  it('uses :video tag for video modality', async () => {
    await sendPatientJoinedCallPushToDoctor({
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      modality: 'video',
      correlationId: 'corr-voice-c3',
    });

    expect(sendPushToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          tag: `${SESSION_ID}:video`,
          data: expect.objectContaining({ modality: 'video' }),
        }),
      }),
    );
  });
});
