/**
 * RBH-01: classifyInstagramDmFailureReason maps errors without logging PHI.
 * RBH-12: pipeline timing log shape.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  classifyInstagramDmFailureReason,
  logWebhookInstagramDmPipelineTiming,
} from '../../../src/services/webhook-metrics';
import { logger } from '../../../src/config/logger';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ServiceUnavailableError,
  InternalError,
} from '../../../src/utils/errors';

describe('webhook-metrics classifyInstagramDmFailureReason', () => {
  it('maps AppError subclasses', () => {
    expect(classifyInstagramDmFailureReason(new UnauthorizedError())).toBe('unauthorized');
    expect(classifyInstagramDmFailureReason(new ForbiddenError())).toBe('forbidden');
    expect(classifyInstagramDmFailureReason(new NotFoundError())).toBe('not_found');
    expect(classifyInstagramDmFailureReason(new TooManyRequestsError())).toBe('rate_limit');
    expect(classifyInstagramDmFailureReason(new ServiceUnavailableError())).toBe(
      'service_unavailable'
    );
    expect(classifyInstagramDmFailureReason(new InternalError())).toBe('server_error');
    expect(classifyInstagramDmFailureReason(new AppError('bad', 400))).toBe('bad_request');
  });

  it('returns unknown for non-AppError', () => {
    expect(classifyInstagramDmFailureReason(new Error('oops'))).toBe('unknown');
    expect(classifyInstagramDmFailureReason('string')).toBe('unknown');
  });
});

describe('logWebhookInstagramDmPipelineTiming (RBH-12)', () => {
  beforeEach(() => {
    jest.mocked(logger.info).mockClear();
  });

  it('logs structured metric without message text', () => {
    logWebhookInstagramDmPipelineTiming({
      correlationId: 'c1',
      eventId: 'e1',
      doctorId: 'd1',
      intent: 'greeting',
      intentMs: 12,
      generateMs: 0,
      igSendMs: 45,
      handlerPreSendMs: 200,
      greetingFastPath: true,
      throttleSkipped: false,
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    const payload = jest.mocked(logger.info).mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.metric).toBe('webhook_instagram_dm_pipeline_timing');
    expect(payload.intentMs).toBe(12);
    expect(payload.generateMs).toBe(0);
    expect(payload.greetingFastPath).toBe(true);
  });
});
