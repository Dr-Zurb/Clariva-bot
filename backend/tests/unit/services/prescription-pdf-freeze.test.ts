/**
 * clinic-branding-v1 · BRD-D4 — sent prescriptions cannot be re-rendered.
 */

import { describe, expect, it } from '@jest/globals';
import { assertUnsentForRegenerate } from '../../../src/utils/prescription-pdf-freeze';
import { ConflictError } from '../../../src/utils/errors';

describe('assertUnsentForRegenerate', () => {
  it('allows never-sent prescriptions', () => {
    expect(() => assertUnsentForRegenerate(null)).not.toThrow();
  });

  it('refuses a sent prescription', () => {
    expect(() => assertUnsentForRegenerate('2026-08-24T07:00:00.000Z')).toThrow(
      ConflictError,
    );
  });
});
