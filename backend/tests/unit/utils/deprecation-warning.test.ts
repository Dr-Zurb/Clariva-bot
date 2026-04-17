/**
 * Unit tests for the `warnDeprecation` helper introduced in Plan 03 · Task 11
 * Phase 1 (legacy `appointment_fee_minor` deprecation).
 *
 * Coverage matrix:
 *   - Flag OFF (default / production): helper is a no-op, logger never called.
 *   - Flag ON, first call for siteId: single structured `logger.warn`.
 *   - Flag ON, repeated call for same siteId: deduplicated (still one warn).
 *   - Flag ON, different siteIds: each emits exactly once.
 *   - `__resetDeprecationWarningsForTests` clears the dedup set between cases.
 */

// Mutable env stub so individual tests can flip the flag before import-reset.
const mockEnv = {
  DEPRECATION_WARNINGS_ENABLED: false as boolean,
};

jest.mock('../../../src/config/env', () => ({
  get env() {
    return mockEnv;
  },
}));

const mockLoggerWarn = jest.fn();
jest.mock('../../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  warnDeprecation,
  __resetDeprecationWarningsForTests,
} from '../../../src/utils/deprecation-warning';

describe('warnDeprecation (Plan 03 · Task 11 Phase 1)', () => {
  beforeEach(() => {
    mockLoggerWarn.mockClear();
    __resetDeprecationWarningsForTests();
    mockEnv.DEPRECATION_WARNINGS_ENABLED = false;
  });

  describe('flag OFF (production default)', () => {
    it('does not emit a log when the flag is disabled', () => {
      mockEnv.DEPRECATION_WARNINGS_ENABLED = false;
      warnDeprecation('appointment_fee_minor.render.ai_context', 'use catalog');
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it('remains silent for repeated calls when disabled', () => {
      mockEnv.DEPRECATION_WARNINGS_ENABLED = false;
      for (let i = 0; i < 5; i += 1) {
        warnDeprecation('appointment_fee_minor.render.dm_block', 'stay silent');
      }
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });

  describe('flag ON', () => {
    beforeEach(() => {
      mockEnv.DEPRECATION_WARNINGS_ENABLED = true;
    });

    it('emits a structured warn on the first call for a siteId', () => {
      warnDeprecation(
        'appointment_fee_minor.render.ai_context',
        'Use catalog modalities[*].price_minor instead.'
      );

      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
      const [context, message] = mockLoggerWarn.mock.calls[0]!;
      expect(context).toEqual({
        siteId: 'appointment_fee_minor.render.ai_context',
        deprecation: true,
      });
      expect(message).toContain('appointment_fee_minor.render.ai_context');
      expect(message).toContain('Use catalog modalities[*].price_minor instead.');
    });

    it('deduplicates subsequent calls for the same siteId', () => {
      warnDeprecation('appointment_fee_minor.render.dm_block', 'first');
      warnDeprecation('appointment_fee_minor.render.dm_block', 'second');
      warnDeprecation('appointment_fee_minor.render.dm_block', 'third');

      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
      const [, message] = mockLoggerWarn.mock.calls[0]!;
      expect(message).toContain('first');
    });

    it('emits once per distinct siteId', () => {
      warnDeprecation('appointment_fee_minor.render.ai_context', 'ctx');
      warnDeprecation('appointment_fee_minor.render.dm_block', 'dm');
      warnDeprecation('appointment_fee_minor.quote.legacy_fallback', 'quote');
      warnDeprecation('appointment_fee_minor.render.ai_context', 'ctx again');

      expect(mockLoggerWarn).toHaveBeenCalledTimes(3);
      const siteIds = mockLoggerWarn.mock.calls.map(
        ([context]) => (context as { siteId: string }).siteId
      );
      expect(new Set(siteIds)).toEqual(
        new Set([
          'appointment_fee_minor.render.ai_context',
          'appointment_fee_minor.render.dm_block',
          'appointment_fee_minor.quote.legacy_fallback',
        ])
      );
    });

    it('__resetDeprecationWarningsForTests re-arms the dedup set', () => {
      warnDeprecation('appointment_fee_minor.render.ai_context', 'first pass');
      warnDeprecation('appointment_fee_minor.render.ai_context', 'still dedup');
      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);

      __resetDeprecationWarningsForTests();
      warnDeprecation('appointment_fee_minor.render.ai_context', 'second pass');
      expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
    });
  });
});
