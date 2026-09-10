/**
 * rcp-02 / SAFETY-01: DL-2 control gate order + short-circuit semantics.
 * Order: revoke → acute emergency → open-crisis reaffirm → paused.
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
  openCrisisGate,
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
    turnLanguage: 'en',
    inCollection: false,
    conversationId: 'conv-1',
    patientId: 'patient-1',
    correlationId: 'corr-1',
    ...overrides,
  };
}

const pausedSettings = {
  timezone: 'Asia/Kolkata',
  instagram_receptionist_paused: true,
} as never;

describe('CONTROL_GATES (DL-2 order)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleRevocation.mockResolvedValue('Revocation recorded.');
  });

  it('lists gates in order: revoke → acute emergency → open crisis → paused (SAFETY-01)', () => {
    expect(CONTROL_GATES).toEqual([
      revokeConsentGate,
      emergencyGate,
      openCrisisGate,
      receptionistPausedGate,
    ]);
    expect(CONTROL_GATES.map((g) => g.name)).toEqual([
      'revoke_consent',
      'emergency_safety',
      'emergency_safety',
      'receptionist_paused',
    ]);
    expect(HEAD_CONTROL_GATES).toEqual(CONTROL_GATES);
    expect(EMERGENCY_CONTROL_GATES).toEqual([emergencyGate, openCrisisGate]);
  });

  it('revoke fires even when paused is also true (revoke wins)', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'revoke_consent', confidence: 1 },
      doctorSettings: pausedSettings,
    });
    expect(revokeConsentGate.fires(ctx)).toBe(true);
    expect(receptionistPausedGate.fires(ctx)).toBe(true);

    const headResult = await evaluateControlGates(HEAD_CONTROL_GATES, ctx);
    expect(headResult?.branch).toBe('revoke_consent');
    expect(mockHandleRevocation).toHaveBeenCalledWith(
      'conv-1',
      'patient-1',
      'corr-1',
      'en'
    );
  });

  it('lang-21: revoke gate forwards turnLanguage into handleRevocation', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'revoke_consent', confidence: 1 },
      turnLanguage: 'hi-Latn',
    });
    await revokeConsentGate.handle(ctx);
    expect(mockHandleRevocation).toHaveBeenCalledWith(
      'conv-1',
      'patient-1',
      'corr-1',
      'hi-Latn'
    );
  });

  it('paused fires before any conversion/stage logic runs', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'book_appointment', confidence: 1 },
      doctorSettings: pausedSettings,
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

  it('SAFETY-01: acute emergency outranks pause', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'book_appointment', confidence: 1 },
      text: 'chest pain and cant breathe',
      doctorSettings: pausedSettings,
      inCollection: false,
    });
    expect(emergencyGate.fires(ctx)).toBe(true);
    expect(receptionistPausedGate.fires(ctx)).toBe(true);

    const headResult = await evaluateControlGates(HEAD_CONTROL_GATES, ctx);
    expect(headResult?.branch).toBe('emergency_safety');
    expect(headResult?.nextState.lastIntent).toBe('emergency');
    expect(headResult?.reply.length).toBeGreaterThan(10);
  });

  it('SAFETY-01: paused + non-emergency still receptionist_paused', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'book_appointment', confidence: 1 },
      text: 'I need an appointment tomorrow',
      doctorSettings: pausedSettings,
    });

    const headResult = await evaluateControlGates(HEAD_CONTROL_GATES, ctx);
    expect(headResult?.branch).toBe('receptionist_paused');
  });

  it('SAFETY-01: paused + LLM emergency mid-collection still escalates (emergency > pause)', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'emergency', confidence: 0.9 },
      text: '200/100 this morning',
      inCollection: true,
      doctorSettings: pausedSettings,
      state: {
        step: 'collecting_all',
        collectedFields: ['name'],
        updatedAt: new Date().toISOString(),
      },
    });
    expect(emergencyGate.fires(ctx)).toBe(true);

    const headResult = await evaluateControlGates(HEAD_CONTROL_GATES, ctx);
    expect(headResult?.branch).toBe('emergency_safety');
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

  it('LLM-only emergency during collection escalates (no mid-collection suppress)', () => {
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
    expect(emergencyGate.fires(ctx)).toBe(true);
  });

  it('a non-firing turn passes through to the stage chain unchanged', async () => {
    const ctx = baseCtx({
      intentResult: { intent: 'greeting', confidence: 1 },
    });
    expect(await evaluateControlGates(HEAD_CONTROL_GATES, ctx)).toBeNull();
  });

  it('each gate exposes a non-empty rationale string', () => {
    for (const gate of CONTROL_GATES) {
      expect(gate.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  it('resolveReceptionistPauseMessage uses custom copy when set', () => {
    expect(
      resolveReceptionistPauseMessage(
        {
          instagram_receptionist_pause_message: '  Custom pause copy  ',
        } as never,
        'en'
      )
    ).toBe('Custom pause copy');
  });

  it('lang-21 LANG5-D4: custom pause copy untouched on non-English thread', () => {
    expect(
      resolveReceptionistPauseMessage(
        {
          instagram_receptionist_pause_message: 'Doctor written Hindi pause',
        } as never,
        'hi-Latn'
      )
    ).toBe('Doctor written Hindi pause');
  });
});
