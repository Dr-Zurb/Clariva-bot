/**
 * RBH-01: classifyInstagramDmFailureReason maps errors without logging PHI.
 */

import { describe, it, expect } from '@jest/globals';
import {
  classifyInstagramDmFailureReason,
} from '../../../src/services/webhook-metrics';
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
