/**
 * cockpit telemetry — cpv-08 visual-system landed event
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackCockpitPolishVisualSystemLanded } from '@/lib/patient-profile/telemetry';

describe('trackCockpitPolishVisualSystemLanded (cpv-08)', () => {
  beforeEach(() => {
    window.__cockpitPolishVisualSystemLanded = undefined;
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires cockpit_polish.visual_system_landed once per session', () => {
    const payload = { appointmentId: 'appt-1', batch: 'cpv' as const };

    trackCockpitPolishVisualSystemLanded(payload);
    trackCockpitPolishVisualSystemLanded(payload);

    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(console.debug).toHaveBeenCalledWith(
      '[telemetry]',
      'cockpit_polish.visual_system_landed',
      payload,
    );
    expect(window.__cockpitPolishVisualSystemLanded).toBe(true);
  });
});
