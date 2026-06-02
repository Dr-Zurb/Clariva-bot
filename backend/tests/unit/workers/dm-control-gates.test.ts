/**
 * rcp-02: DL-2 control gate order + short-circuit semantics.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  CONTROL_GATES,
  HEAD_CONTROL_GATES,
  EMERGENCY_CONTROL_GATES,
  evaluateControlGates,
  revokeConsentGate,
  receptionistPausedGate,
  emergencyGate,
  resolveReceptionistPauseMessage,
  type DmGateContext,
} from '../../../src/workers/dm/control-gates';
import * as consentService from '../../../src/services/consent-service';

jest.mock('../../../src/services/consent-service', () => ({
  handleRevocation: jest.fn(),
}));

const mockHandleRevocation = consentService.handleRevocation as jest.MockedFunction<
  typeof consentService.handleRevocation
>;

function baseCtx(overrides: Partial<DmGateContext> = {}): DmGateContext {
  return {
    state: { step: 'responded', collectedFields: [], updatedAt: new Date().toISOString() },
    recentMessages: [],
    intentResult: { intent: 'greeting', confidence: 0.9 },
    doctorSettings: { timezone: 'Asia/Kolkata', instagram_receptionist_paused: false } as never,
    text: 'hello',
    inCollection: false,
    conversationId: 'conv-1',
    patientId: 'patient-1',
    correlationId: 'corr-1',
    ...overrides,
  };
}

describe('CONTROL_GATES (DL-2 order)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleRevocation.mockResolvedValue('Revocation recorded.');
  });

  it('lists gates in order: revoke → paused → emergency', () => {
    expect(CONTROL_GATES.map((g) => g.name)).toEqual([
      'revoke_consent',
      'receptionist_paused',
      'emergency_safety',
    ]);
  });

  it('revoke fires even when paused is also true (revoke wins)', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'revoke_consent', confidence: 1 },
      doctorSettings: {
        timezone: 'Asia/Kolkata',
        instagram_receptionist_paused: true,
      } as never,
    });
    expect(revokeConsentGate.fires(ctx)).toBe(true);
    expect(receptionistPausedGate.fires(ctx)).toBe(true);

    const headResult = await evaluateControlGates(HEAD_CONTROL_GATES, ctx);
    expect(headResult?.branch).toBe('revoke_consent');
    expect(mockHandleRevocation).toHaveBeenCalled();
  });

  it('paused fires before any conversion/stage logic runs', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'book_appointment', confidence: 1 },
      doctorSettings: {
        timezone: 'Asia/Kolkata',
        instagram_receptionist_paused: true,
      } as never,
      state: {
        step: 'collecting_all',
        collectedFields: ['name'],
        updatedAt: new Date().toISOString(),
      },
    });
    expect(receptionistPausedGate.fires(ctx)).toBe(true);

    const headResult = await evaluateControlGates(HEAD_CONTROL_GATES, ctx);
    expect(headResult?.branch).toBe('receptionist_paused');
    expect(headResult?.nextState.step).toBe('responded');
    expect(mockHandleRevocation).not.toHaveBeenCalled();
  });

  it('emergency fires for an emergency intent regardless of in-flight booking step', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'emergency', confidence: 1 },
      text: 'chest pain and cant breathe',
      inCollection: true,
      state: {
        step: 'collecting_all',
        collectedFields: ['name'],
        updatedAt: new Date().toISOString(),
      },
    });
    expect(emergencyGate.fires(ctx)).toBe(true);

    const result = await evaluateControlGates(EMERGENCY_CONTROL_GATES, ctx);
    expect(result?.branch).toBe('emergency_safety');
    expect(result?.nextState.lastIntent).toBe('emergency');
    expect(result?.reply.length).toBeGreaterThan(10);
  });

  it('suppresses LLM-only emergency during collection when message is not acute', () => {
    const ctx = baseCtx({
      intentResult: { intent: 'emergency', confidence: 0.9 },
      text: '200/100 this morning',
      inCollection: true,
      state: {
        step: 'collecting_all',
        collectedFields: ['name'],
        updatedAt: new Date().toISOString(),
      },
    });
    expect(emergencyGate.fires(ctx)).toBe(false);
  });

  it('a non-firing turn passes through to the stage chain unchanged', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'greeting', confidence: 1 },
    });
    expect(await evaluateControlGates(HEAD_CONTROL_GATES, ctx)).toBeNull();
    expect(await evaluateControlGates(EMERGENCY_CONTROL_GATES, ctx)).toBeNull();
  });

  it('each gate exposes a non-empty rationale string', () => {
    for (const gate of CONTROL_GATES) {
      expect(gate.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  it('resolveReceptionistPauseMessage uses custom copy when set', () => {
    expect(
      resolveReceptionistPauseMessage({
        instagram_receptionist_pause_message: '  Custom pause copy  ',
      } as never)
    ).toBe('Custom pause copy');
  });
});
