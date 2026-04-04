/**
 * e-task-dm-03: Turn context helpers — fee catalog thread text + medical deflection flag
 */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/services/ai-service', () => ({
  redactPhiForAI: (s: string) => s,
}));

import { buildDmTurnContext, buildFeeCatalogMatchText } from '../../../src/utils/dm-turn-context';

describe('dm-turn-context', () => {
  describe('buildFeeCatalogMatchText', () => {
    it('joins patient lines and appends current text when not duplicate', () => {
      const out = buildFeeCatalogMatchText('video please', [
        { sender_type: 'patient', content: 'blood sugar has been high' },
        { sender_type: 'system', content: 'Here are fees...' },
      ]);
      expect(out).toContain('blood sugar');
      expect(out).toContain('video please');
    });

    it('drops pricing-only patient lines so matcher focuses on clinical thread (e-task-dm-05)', () => {
      const out = buildFeeCatalogMatchText('video please', [
        { sender_type: 'patient', content: 'How much for consult?' },
      ]);
      expect(out).not.toContain('How much');
      expect(out).toContain('video please');
    });

    it('returns undefined when there is nothing to match', () => {
      expect(buildFeeCatalogMatchText('', [])).toBeUndefined();
    });
  });

  describe('buildDmTurnContext', () => {
    it('sets recentMedicalDeflection from state TTL', () => {
      const now = buildDmTurnContext(
        'hi',
        [],
        { lastMedicalDeflectionAt: new Date().toISOString() }
      );
      expect(now.recentMedicalDeflection).toBe(true);

      const stale = buildDmTurnContext('hi', [], {
        lastMedicalDeflectionAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
      });
      expect(stale.recentMedicalDeflection).toBe(false);
    });
  });
});
