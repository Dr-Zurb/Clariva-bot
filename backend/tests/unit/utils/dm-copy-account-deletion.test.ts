/**
 * Unit tests for `buildAccountDeletionExplainerDm` (Plan 02 · Task 33).
 *
 * Kept intentionally minimal — the builder is a pure string function, so
 * the tests are a snapshot of the shape and a pair of input-validation
 * error paths. Matches the testing posture the other Task-27 DM builders
 * adopted: one happy-path snapshot, explicit empty-input failures, no
 * branching beyond what the builder itself has.
 */

import { describe, it, expect } from '@jest/globals';
import { buildAccountDeletionExplainerDm } from '../../../src/utils/dm-copy';

describe('buildAccountDeletionExplainerDm', () => {
  const finalizedAt = new Date('2026-04-26T10:15:00.000Z');

  it('renders the explainer with the citation and finalized date', () => {
    const out = buildAccountDeletionExplainerDm({
      citation: 'DPDP Act 2023 §9 / GDPR Article 9(3)',
      finalizedAt,
    });
    expect(out).toContain('Your account is closed.');
    expect(out).toContain('2026-04-26');
    expect(out).toContain('DPDP Act 2023 §9 / GDPR Article 9(3)');
    expect(out).toContain(
      'retained per DPDP Act 2023 §9 / GDPR Article 9(3)',
    );
    // Legal safety-net: must explicitly mention retention (not just "kept") +
    // the doctor-access clause the task copy summary pinned.
    expect(out).toContain('are not deleted');
    expect(out).toContain('Your doctor still has access');
  });

  it('throws when citation is empty', () => {
    expect(() =>
      buildAccountDeletionExplainerDm({ citation: '   ', finalizedAt }),
    ).toThrow(/citation is required/i);
  });

  it('throws when finalizedAt is not a valid Date', () => {
    expect(() =>
      buildAccountDeletionExplainerDm({
        citation: 'DPDP',
        finalizedAt: new Date('not-a-date'),
      }),
    ).toThrow(/finalizedAt must be a valid Date/i);
  });
});
