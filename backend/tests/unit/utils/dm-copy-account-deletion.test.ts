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
    const out = buildAccountDeletionExplainerDm({ language: 'en',
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

  it('LANG6-D4 / enByPolicy: language hi still renders English legal copy', () => {
    const en = buildAccountDeletionExplainerDm({
      language: 'en',
      citation: 'DPDP Act 2023 §9 / GDPR Article 9(3)',
      finalizedAt,
    });
    const hi = buildAccountDeletionExplainerDm({
      language: 'hi',
      citation: 'DPDP Act 2023 §9 / GDPR Article 9(3)',
      finalizedAt,
    });
    expect(hi).toBe(en);
    expect(hi).toContain('Your account is closed.');
  });

  it('throws when citation is empty', () => {
    expect(() =>
      buildAccountDeletionExplainerDm({ language: 'en', citation: '   ', finalizedAt }),
    ).toThrow(/citation is required/i);
  });

  it('deleted outcome does not claim recordings are retained', () => {
    const out = buildAccountDeletionExplainerDm({
      language: 'en',
      citation: 'DPDP Act 2023 §9 / GDPR Article 9(3)',
      finalizedAt,
      recordingOutcome: 'deleted',
    });
    expect(out).toContain('The consult recordings we held have been deleted.');
    expect(out).not.toContain('are not deleted');
  });

  it('deferred outcome names the citation and the hold date', () => {
    const out = buildAccountDeletionExplainerDm({
      language: 'en',
      citation: 'DPDP Act 2023 §9 / GDPR Article 9(3)',
      finalizedAt,
      recordingOutcome: 'deferred',
      recordingsHeldUntil: new Date('2029-04-26T00:00:00.000Z'),
    });
    expect(out).toContain('retained until 2029-04-26');
    expect(out).toContain('have not been deleted');
    expect(out).toContain('DPDP Act 2023 §9 / GDPR Article 9(3)');
  });

  it('mixed outcome does not claim full deletion', () => {
    const out = buildAccountDeletionExplainerDm({
      language: 'en',
      citation: 'DPDP Act 2023 §9',
      finalizedAt,
      recordingOutcome: 'mixed',
      recordingsHeldUntil: new Date('2029-01-01T00:00:00.000Z'),
    });
    expect(out).toContain('Some consult recordings were deleted');
    expect(out).toContain('Others are retained until 2029-01-01');
  });

  it('throws when finalizedAt is not a valid Date', () => {
    expect(() =>
      buildAccountDeletionExplainerDm({ language: 'en',
        citation: 'DPDP',
        finalizedAt: new Date('not-a-date'),
      }),
    ).toThrow(/finalizedAt must be a valid Date/i);
  });
});
