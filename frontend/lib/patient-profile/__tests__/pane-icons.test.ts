/**
 * pane-icons — unit tests (cpv-07 / DL-9)
 */

import { describe, it, expect } from 'vitest';
import {
  PANE_ICONS,
  BODY_VARIANT_ICONS,
  getPaneIcon,
} from '@/lib/patient-profile/pane-icons';
import {
  Heart,
  Clock,
  Beaker,
  Pill,
  MessageSquare,
  Activity,
  Video,
  Phone,
  Quote,
  Stethoscope,
  CheckCircle2,
} from 'lucide-react';

describe('pane-icons (cpv-07 B + csl-02)', () => {
  it('maps every canonical pane id to an icon', () => {
    expect(PANE_ICONS.snapshot).toBe(Heart);
    expect(PANE_ICONS.history).toBe(Clock);
    expect(PANE_ICONS.body).toBe(Video);
    expect(PANE_ICONS.assessment).toBe(Stethoscope);
    expect(PANE_ICONS['investigations-orders']).toBe(Beaker);
    expect(PANE_ICONS.plan).toBe(Pill);
    expect(PANE_ICONS.subjective).toBe(Quote);
    expect(PANE_ICONS.objective).toBe(Activity);
  });

  it('subjective and body=text use distinct icons (csl-02 collision fix)', () => {
    expect(PANE_ICONS.subjective).not.toBe(BODY_VARIANT_ICONS.text);
  });

  it('getPaneIcon returns the mapped icon or undefined', () => {
    expect(getPaneIcon('snapshot')).toBe(Heart);
    expect(getPaneIcon('assessment')).toBe(Stethoscope);
    expect(getPaneIcon('unknown-pane')).toBeUndefined();
  });

  it('BODY_VARIANT_ICONS covers all body variants', () => {
    expect(BODY_VARIANT_ICONS.video).toBe(Video);
    expect(BODY_VARIANT_ICONS.voice).toBe(Phone);
    expect(BODY_VARIANT_ICONS.text).toBe(MessageSquare);
    // ecb-01 (2026-05-27): review variant remapped from Video → CheckCircle2
    // so the toggle-bar icon for the body pane in completed/terminal state
    // semantically reads as "visit done" rather than a misleading camera.
    expect(BODY_VARIANT_ICONS.review).toBe(CheckCircle2);
  });

  it('review variant icon is distinct from video (ecb-01)', () => {
    expect(BODY_VARIANT_ICONS.review).not.toBe(BODY_VARIANT_ICONS.video);
  });
});
