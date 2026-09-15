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
  logDmEmergencyIntentDowngraded,
  logDmEmergencySafetyDecision,
  logDmLanguageDecision,
  logWebhookInstagramDmPipelineTiming,
  logWebhookMessageEditDropped,
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
  MessageWindowExpiredError,
} from '../../../src/utils/errors';

describe('webhook-metrics classifyInstagramDmFailureReason', () => {
  it('maps AppError subclasses', () => {
    expect(classifyInstagramDmFailureReason(new UnauthorizedError())).toBe('unauthorized');
    expect(classifyInstagramDmFailureReason(new ForbiddenError())).toBe('forbidden');
    expect(classifyInstagramDmFailureReason(new NotFoundError())).toBe('not_found');
    expect(classifyInstagramDmFailureReason(new TooManyRequestsError())).toBe('rate_limit');
    expect(classifyInstagramDmFailureReason(new MessageWindowExpiredError())).toBe('window_expired');
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

describe('logWebhookMessageEditDropped (RBH-11)', () => {
  beforeEach(() => {
    jest.mocked(logger.info).mockClear();
  });

  it('logs aggregate-safe fields and stable alert marker without text or mid', () => {
    logWebhookMessageEditDropped({
      correlationId: 'c-edit',
      provider: 'instagram',
      hasText: true,
      hasSender: false,
      hasMid: true,
      numEdit: 1,
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [payload, msg] = jest.mocked(logger.info).mock.calls[0]!;
    expect(msg).toBe('webhook_metric_webhook_message_edit_dropped_total');
    const p = payload as Record<string, unknown>;
    expect(p.metric).toBe('webhook_message_edit_dropped_total');
    expect(p.alertMarker).toBe('rbh11_message_edit_dropped');
    expect(p.hasText).toBe(true);
    expect(p.hasSender).toBe(false);
    expect(p.hasMid).toBe(true);
    expect(p.numEdit).toBe(1);
    expect(p).not.toHaveProperty('text');
    expect(p).not.toHaveProperty('mid');
  });
});

describe('logDmEmergencyIntentDowngraded', () => {
  beforeEach(() => {
    jest.mocked(logger.info).mockClear();
  });

  it('logs reason and alert marker without message text', () => {
    logDmEmergencyIntentDowngraded({
      correlationId: 'c-emg',
      reason: 'post_escalation_stability',
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [payload, msg] = jest.mocked(logger.info).mock.calls[0]!;
    expect(msg).toBe('webhook_metric_dm_emergency_intent_downgraded_total');
    const p = payload as Record<string, unknown>;
    expect(p.metric).toBe('dm_emergency_intent_downgraded_total');
    expect(p.alertMarker).toBe('dm_emergency_intent_downgraded');
    expect(p.reason).toBe('post_escalation_stability');
    expect(p.correlationId).toBe('c-emg');
    expect(p).not.toHaveProperty('text');
    expect(p).not.toHaveProperty('messageText');
  });
});

describe('logDmEmergencySafetyDecision', () => {
  beforeEach(() => {
    jest.mocked(logger.info).mockClear();
  });

  it('logs decision booleans without message text', () => {
    logDmEmergencySafetyDecision({
      correlationId: 'c-safe',
      regexHit: true,
      classifierIntent: 'greeting',
      emergencyGateEligible: true,
      emergencyGateFired: true,
      inCollection: false,
      priorEscalationInWindow: false,
      crisisOpen: false,
      headBranch: 'emergency_safety',
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [payload, msg] = jest.mocked(logger.info).mock.calls[0]!;
    expect(msg).toBe('webhook_metric_dm_emergency_safety_decision_total');
    const p = payload as Record<string, unknown>;
    expect(p.metric).toBe('dm_emergency_safety_decision_total');
    expect(p.alertMarker).toBe('dm_emergency_safety_decision');
    expect(p.regexHit).toBe(true);
    expect(p.classifierIntent).toBe('greeting');
    expect(p.emergencyGateEligible).toBe(true);
    expect(p.emergencyGateFired).toBe(true);
    expect(p.crisisOpen).toBe(false);
    expect(p.headBranch).toBe('emergency_safety');
    expect(p).not.toHaveProperty('text');
    expect(p).not.toHaveProperty('messageText');
  });
});

describe('logDmLanguageDecision', () => {
  beforeEach(() => {
    jest.mocked(logger.info).mockClear();
  });

  it('logs counts and codes without message text or marker identities', () => {
    logDmLanguageDecision({
      correlationId: 'c-lang',
      storedBefore: null,
      resolved: 'hi-Latn',
      changed: true,
      reason: 'markers',
      hiMarkerCount: 3,
      paMarkerCount: 1,
      paExclusiveCount: 0,
      accumulationWindowSize: 2,
      classifierLanguage: null,
      classifierAgreed: null,
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [payload, msg] = jest.mocked(logger.info).mock.calls[0]!;
    expect(msg).toBe('webhook_metric_dm_language_decision_total');
    const p = payload as Record<string, unknown>;
    expect(p.metric).toBe('dm_language_decision_total');
    expect(p.alertMarker).toBe('dm_language_decision');
    expect(p.resolved).toBe('hi-Latn');
    expect(p.changed).toBe(true);
    expect(p.reason).toBe('markers');
    expect(p.hiMarkerCount).toBe(3);
    expect(p.paMarkerCount).toBe(1);
    expect(p.paExclusiveCount).toBe(0);
    expect(p.accumulationWindowSize).toBe(2);
    expect(p.classifierLanguage).toBeNull();
    expect(p.classifierAgreed).toBeNull();
    expect(p).not.toHaveProperty('text');
    expect(p).not.toHaveProperty('messageText');
    expect(p).not.toHaveProperty('markers');
    expect(p).not.toHaveProperty('markerList');
  });
});
