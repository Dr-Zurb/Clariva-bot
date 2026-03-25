/**
 * OPD mode resolution (e-task-opd-03)
 */

import { describe, it, expect } from '@jest/globals';
import { resolveOpdModeFromSettings } from '../../../src/services/opd/opd-mode-service';

describe('resolveOpdModeFromSettings', () => {
  it('defaults to slot when null', () => {
    expect(resolveOpdModeFromSettings(null)).toBe('slot');
    expect(resolveOpdModeFromSettings(undefined)).toBe('slot');
  });

  it('respects queue when set', () => {
    expect(resolveOpdModeFromSettings({ opd_mode: 'queue' } as any)).toBe('queue');
  });

  it('treats slot explicitly', () => {
    expect(resolveOpdModeFromSettings({ opd_mode: 'slot' } as any)).toBe('slot');
  });
});
