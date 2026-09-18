import { describe, expect, it } from '@jest/globals';
import {
  RECORDING_ATTESTATION_CLAUSES,
  RECORDING_ATTESTATION_POLICY_VERSION,
} from '../../../src/constants/recording-attestation';

describe('recording attestation constants (rec-11)', () => {
  it('pins the six charter clauses verbatim', () => {
    expect(RECORDING_ATTESTATION_CLAUSES).toHaveLength(6);
    expect([...RECORDING_ATTESTATION_CLAUSES]).toEqual([
      'Every voice and video consult is audio-recorded. You cannot disable this.',
      'You cannot delete a recording. Deletion is policy-driven and automatic.',
      'The patient has the same access you do, self-serve for 90 days.',
      'Your replays are logged and the patient is notified.',
      'Streaming only. No download, no re-recording, no sharing outside the platform.',
      'Video capture requires explicit patient consent, every single time.',
    ]);
  });

  it('uses a clearly marked draft version until REC-D2', () => {
    expect(RECORDING_ATTESTATION_POLICY_VERSION).toBe('DRAFT-REC-D2-UNAPPROVED');
    expect(RECORDING_ATTESTATION_POLICY_VERSION).not.toBe('v1.0');
  });
});
