/**
 * cockpit-tabs.test.tsx — the Cockpit v3 flat tab registry (cv3t-01 · Phase 5).
 *
 * Structural contract only: `buildCockpitTabs` returns the five real leaf tabs
 * as uniform, top-level `PaneDefinition`s (no `children`), in a stable order,
 * with correct ids / titles / icons. The body tab flips Consult ↔ Visit-summary
 * by template id (and by derived state), and the walk-in subset is `[body,
 * plan]`. Render fns are NOT invoked here — this asserts the descriptor shape,
 * not the pane bodies (those are ported by reference, P5-DL-2).
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  buildCockpitTabs,
  buildWalkInCockpitTabs,
  renderConsultBodySurface,
  COCKPIT_TAB_ORDER,
  WALK_IN_TAB_IDS,
} from '@/lib/patient-profile/v3/cockpit-tabs';
import type { TelemedVideoContext } from '@/lib/patient-profile/templates';
import type { CockpitTemplate } from '@/lib/patient-profile/state';
import type { CockpitConsultationModality } from '@/lib/patient-profile/state';
import {
  Stethoscope,
  Pill,
  Quote,
  Activity,
  Video,
  Phone,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';

vi.mock('@/components/cockpit/rx/sections/AssessmentSection', () => ({
  AssessmentSection: () => (
    <div data-testid="pane-assessment-editor">assessment editor</div>
  ),
}));

vi.mock('@/components/cockpit/middle/BodyZone', () => ({
  BodyZone: ({ variant }: { variant: string }) => (
    <div
      data-testid="body-zone-surface"
      data-variant={variant}
      aria-label="Video consultation surface"
    />
  ),
}));

vi.mock('@/components/cockpit/middle/EndedConsultBody', () => ({
  EndedConsultBody: () => <div data-testid="ended-consult-surface" />,
}));

function fixtureCtx(
  overrides: Partial<TelemedVideoContext> = {},
  appointmentOverrides: Partial<TelemedVideoContext['appointment']> = {},
): TelemedVideoContext {
  return {
    appointment: {
      id: 'appt-1',
      doctor_id: 'doc-1',
      patient_id: 'pat-1',
      patient_name: 'Test Patient',
      patient_phone: null,
      patient_age: null,
      patient_sex: null,
      appointment_date: '2026-05-31T10:00:00Z',
      status: 'confirmed',
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      consultation_session: null,
      ...appointmentOverrides,
    },
    token: 'test-token',
    state: 'live',
    ...overrides,
  };
}

const EXPECTED_TITLES: Record<string, string> = {
  body: 'Consult',
  assessment: 'Assessment',
  plan: 'Plan',
  subjective: 'Subjective',
  objective: 'Objective',
};

const EXPECTED_ICONS = {
  assessment: Stethoscope,
  plan: Pill,
  subjective: Quote,
  objective: Activity,
} as const;

describe('buildCockpitTabs — flat registry shape (cv3t-01)', () => {
  it('returns the five leaf tabs in the canonical order', () => {
    const tabs = buildCockpitTabs(fixtureCtx(), 'telemed-video');
    expect(tabs).toHaveLength(5);
    expect(tabs.map((t) => t.id)).toEqual([...COCKPIT_TAB_ORDER]);
    expect(COCKPIT_TAB_ORDER).toEqual([
      'body',
      'subjective',
      'objective',
      'assessment',
      'plan',
    ]);
  });

  it('does not register Snapshot or History tabs (ribbon owns those)', () => {
    const ids = buildCockpitTabs(fixtureCtx(), 'telemed-video').map((t) => t.id);
    expect(ids).not.toContain('snapshot');
    expect(ids).not.toContain('history');
  });

  it('every tab is a uniform top-level leaf (no children/groupWrapper/direction)', () => {
    for (const tab of buildCockpitTabs(fixtureCtx(), 'telemed-video')) {
      expect(tab.children, `${tab.id} must be a leaf`).toBeUndefined();
      expect(tab.groupWrapper, `${tab.id} must not wrap a group`).toBeUndefined();
      expect(tab.direction, `${tab.id} must not set a group direction`).toBeUndefined();
      expect(typeof tab.render).toBe('function');
      expect(tab.icon, `${tab.id} must carry an icon`).toBeTruthy();
      expect(typeof tab.naturalSizePct).toBe('number');
      expect(typeof tab.minSizePx).toBe('number');
    }
  });

  it('keeps stable ids + titles for the five clean tabs', () => {
    const byId = new Map(
      buildCockpitTabs(fixtureCtx(), 'telemed-video').map((t) => [t.id, t]),
    );
    for (const [id, title] of Object.entries(EXPECTED_TITLES)) {
      expect(byId.get(id)?.title, `${id} title`).toBe(title);
    }
    for (const [id, icon] of Object.entries(EXPECTED_ICONS)) {
      expect(byId.get(id)?.icon, `${id} icon`).toBe(icon);
    }
  });

  it('assessment tab renders the full AssessmentSection editor (not the strip)', () => {
    const assessment = buildCockpitTabs(fixtureCtx(), 'telemed-video').find(
      (t) => t.id === 'assessment',
    );
    expect(assessment?.naturalSizePct).toBeGreaterThan(20);
    expect(assessment?.minSizePx).toBeGreaterThan(100);
    const { container } = render(assessment!.render!());
    expect(
      container.querySelector('[data-testid="pane-assessment-editor"]'),
    ).toBeTruthy();
  });

  it('has no standalone Investigations tab — folded into Plan (SOAP)', () => {
    const tabs = buildCockpitTabs(fixtureCtx(), 'telemed-video');
    const investigations = tabs.find((t) => t.id === 'investigations-orders');
    const plan = tabs.find((t) => t.id === 'plan');
    // Ordered investigations now live inside the Plan tab's InvestigationsChipRow.
    expect(investigations).toBeUndefined();
    expect(plan).toBeDefined();
    expect(plan?.children).toBeUndefined();
  });
});

describe('buildCockpitTabs — the Consult / Visit-summary body tab', () => {
  const liveCases: Array<{
    templateId: CockpitTemplate;
    icon: typeof Video;
  }> = [
    { templateId: 'telemed-video', icon: Video },
    { templateId: 'telemed-voice', icon: Phone },
    { templateId: 'telemed-text', icon: MessageSquare },
  ];

  for (const { templateId, icon } of liveCases) {
    it(`live ${templateId} → "Consult" with the modality icon`, () => {
      const body = buildCockpitTabs(fixtureCtx(), templateId).find(
        (t) => t.id === 'body',
      );
      expect(body?.id).toBe('body');
      expect(body?.title).toBe('Consult');
      expect(body?.icon).toBe(icon);
    });
  }

  it('review → "Visit summary" with the completed icon', () => {
    const body = buildCockpitTabs(
      fixtureCtx({ state: 'ended' }),
      'review',
    ).find((t) => t.id === 'body');
    expect(body?.title).toBe('Visit summary');
    expect(body?.icon).toBe(CheckCircle2);
  });

  it('derives the body label from ctx when no template id is passed', () => {
    const voiceBody = buildCockpitTabs(
      fixtureCtx({ state: 'live' }, { consultation_type: 'voice' }),
    ).find((t) => t.id === 'body');
    expect(voiceBody?.title).toBe('Consult');
    expect(voiceBody?.icon).toBe(Phone);

    const reviewBody = buildCockpitTabs(
      fixtureCtx({ state: 'ended' }),
    ).find((t) => t.id === 'body');
    expect(reviewBody?.title).toBe('Visit summary');
    expect(reviewBody?.icon).toBe(CheckCircle2);
  });

  it('keeps the id "body" across modality and review (drag-guard + persistence)', () => {
    const modalities: CockpitConsultationModality[] = ['video', 'voice', 'text'];
    for (const consultation_type of modalities) {
      const tabs = buildCockpitTabs(fixtureCtx({}, { consultation_type }));
      expect(tabs.some((t) => t.id === 'body')).toBe(true);
    }
    const reviewTabs = buildCockpitTabs(fixtureCtx({ state: 'terminal' }));
    expect(reviewTabs.some((t) => t.id === 'body')).toBe(true);
  });

  it('body tab render is a ConsultSurfaceSlot (stable host owns BodyZone)', () => {
    const body = buildCockpitTabs(fixtureCtx(), 'telemed-video').find(
      (t) => t.id === 'body',
    );
    const { container } = render(body!.render!());
    expect(
      container.querySelector('[data-testid="consult-surface-slot"]'),
    ).toBeTruthy();
  });

  it('renderConsultBodySurface builds the live BodyZone for the host', () => {
    const { container } = render(
      renderConsultBodySurface(fixtureCtx(), 'telemed-video'),
    );
    // BodyZone wraps ConsultationBodyPane; without mocks we at least get the
    // region landmark from BodyZone's aria-label.
    expect(
      container.querySelector('[aria-label="Video consultation surface"]'),
    ).toBeTruthy();
  });
});

describe('buildWalkInCockpitTabs — 2-tab subset (DL-5)', () => {
  it('returns exactly [body, plan] in order', () => {
    const tabs = buildWalkInCockpitTabs(fixtureCtx(), 'telemed-video');
    expect(tabs.map((t) => t.id)).toEqual([...WALK_IN_TAB_IDS]);
    expect(tabs.map((t) => t.id)).toEqual(['body', 'plan']);
  });

  it('reuses the same descriptors as the full registry (identical titles)', () => {
    const ctx = fixtureCtx();
    const full = new Map(
      buildCockpitTabs(ctx, 'telemed-video').map((t) => [t.id, t.title]),
    );
    for (const tab of buildWalkInCockpitTabs(ctx, 'telemed-video')) {
      expect(tab.title).toBe(full.get(tab.id));
    }
  });
});
