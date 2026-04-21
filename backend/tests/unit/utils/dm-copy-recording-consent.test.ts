/**
 * Unit tests — Plan 02 · Task 27 DM-copy builders.
 *
 * Covers `buildRecordingConsentAskMessage` + `buildRecordingConsentExplainer`
 * in `backend/src/utils/dm-copy.ts`. We assert *shape + semantics*, not an
 * inline snapshot of the entire block — that's what the snapshot suite in
 * `dm-copy.snap.test.ts` is for. If the copy drifts, these tests should
 * still pass for the cases they pin (version stamp trailer, practice-name
 * interpolation, empty/undefined fallbacks, body-v1 embed contract).
 *
 * Why not reuse `dm-copy.snap.test.ts`?
 *   - That suite is a single long snapshot file; adding Task-27 snapshots
 *     there is fine for final wiring, but this unit-level assertion suite
 *     gives a faster failure signal during the Task 27 sprint and is
 *     easier to read when the master snapshot file is a thousand lines.
 *   - Both can coexist: the snapshot suite adds the golden fixtures in a
 *     follow-up commit (see task-27 acceptance criteria).
 */

import { describe, expect, it } from '@jest/globals';
import {
  buildRecordingConsentAskMessage,
  buildRecordingConsentExplainer,
  RECORDING_CONSENT_COPY_VERSION,
} from '../../../src/utils/dm-copy';
import { RECORDING_CONSENT_BODY_V1 } from '../../../src/constants/recording-consent';

describe('buildRecordingConsentAskMessage', () => {
  it('uses the fallback "this clinic" when no practice name is passed', () => {
    const msg = buildRecordingConsentAskMessage();
    expect(msg).toContain('this clinic');
    expect(msg).toMatch(/\*\*Yes\*\*/);
    expect(msg).toMatch(/\*\*No\*\*/);
  });

  it('interpolates the practice name when provided', () => {
    const msg = buildRecordingConsentAskMessage({ practiceName: 'Acme Health' });
    expect(msg).toContain('Acme Health');
    expect(msg).not.toContain('this clinic');
  });

  it('trims whitespace around a practice name and falls back on empty strings', () => {
    const trimmed = buildRecordingConsentAskMessage({ practiceName: '   Clinic B   ' });
    expect(trimmed).toContain('Clinic B');

    const blank = buildRecordingConsentAskMessage({ practiceName: '   ' });
    expect(blank).toContain('this clinic');
  });
});

describe('buildRecordingConsentExplainer', () => {
  it('embeds the v1 body copy verbatim (single source of truth)', () => {
    const msg = buildRecordingConsentExplainer({ version: 'v1.0' });
    expect(msg).toContain(RECORDING_CONSENT_BODY_V1);
  });

  it('renders the version trailer exactly once', () => {
    const msg = buildRecordingConsentExplainer({ version: 'v1.0' });
    const matches = msg.match(/Consent version:\s*v1\.0/g);
    expect(matches).toHaveLength(1);
  });

  it('includes a binary reply prompt aligned with the booking-page modal CTAs', () => {
    const msg = buildRecordingConsentExplainer({ version: 'v1.0' });
    expect(msg).toMatch(/\*\*Yes\*\*/);
    expect(msg).toMatch(/\*\*No\*\*/);
  });

  it('interpolates practice name into the opener line', () => {
    const msg = buildRecordingConsentExplainer({
      version: 'v1.0',
      practiceName: 'Hopeful Clinic',
    });
    expect(msg).toContain('at Hopeful Clinic');
  });

  it('falls back to "the clinic" when practice name is empty', () => {
    const msg = buildRecordingConsentExplainer({ version: 'v1.0', practiceName: '' });
    expect(msg).toContain('at the clinic');
  });

  it('throws when version is missing or blank (upstream wiring bug)', () => {
    expect(() => buildRecordingConsentExplainer({ version: '' })).toThrow(/version is required/);
    expect(() =>
      buildRecordingConsentExplainer({ version: undefined as unknown as string }),
    ).toThrow(/version is required/);
  });
});

describe('RECORDING_CONSENT_COPY_VERSION re-export', () => {
  it('matches the current constants version token', () => {
    expect(RECORDING_CONSENT_COPY_VERSION).toBe('v1.0');
  });
});
