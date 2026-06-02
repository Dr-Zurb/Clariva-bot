/**
 * templates.test.ts — smoke for cockpit template factories (csf-02 / tmr-01 / cmr-06).
 *
 * Asserts leaf-id order, structural sizing metadata, and video-template
 * regression after the tmr-01 helper extraction and cmr-06 middle wiring.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React, { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import {
  getTelemedVideoTemplate,
  getTelemedVoiceTemplate,
  getTelemedTextTemplate,
  getReviewTemplate,
  type TelemedVideoContext,
} from '@/lib/patient-profile/templates';
import {
  flattenPaneDefinitions,
  type PaneDefinition,
} from '@/lib/patient-profile/types';
import { ChartRailWithEmptyState } from '@/components/patient-profile/panes/ChartRailWithEmptyState';

const EXPECTED_LEAF_ORDER = [
  'snapshot',
  'history',
  'body',
  'assessment',
  'investigations-orders',
  'plan',
  'subjective',
  'objective',
] as const;

// ecb-01 (2026-05-27): review template re-introduces the body leaf (was
// omitted) as the `<EndedConsultBody>` summary strip. Leaf count back to
// 8, matching the modality templates; the leaf id is unchanged (`body`)
// so layout persistence stays compatible across the modality / review
// switch.
const REVIEW_LEAF_ORDER = [
  'snapshot',
  'history',
  'body',
  'assessment',
  'investigations-orders',
  'plan',
  'subjective',
  'objective',
] as const;

/** Structural snapshot — strips render fns for deep-equal layout regression. */
function serializePaneTree(nodes: PaneDefinition[]): unknown[] {
  function serialize(node: PaneDefinition): Record<string, unknown> {
    const out: Record<string, unknown> = {
      id: node.id,
      title: node.title,
    };
    if (node.naturalSizePct !== undefined) {
      out.naturalSizePct = node.naturalSizePct;
    }
    if (node.minSizePx !== undefined) {
      out.minSizePx = node.minSizePx;
    }
    if (node.direction !== undefined) {
      out.direction = node.direction;
    }
    if (node.children && node.children.length > 0) {
      out.children = node.children.map(serialize);
    }
    return out;
  }
  return nodes.map(serialize);
}

/** Post-cmr-06 video template structural snapshot (body 42 / assessment 8 / bottom 50). */
const TELEMED_VIDEO_STRUCTURE_SNAPSHOT: unknown[] = [
  {
    id: 'left-column',
    title: 'Patient',
    naturalSizePct: 22,
    minSizePx: 240,
    children: [
      {
        id: 'snapshot',
        title: 'Snapshot',
        naturalSizePct: 40,
        minSizePx: 200,
      },
      {
        id: 'history',
        title: 'History',
        naturalSizePct: 60,
        minSizePx: 240,
      },
    ],
  },
  {
    id: 'middle-column',
    title: 'Consult',
    naturalSizePct: 56,
    minSizePx: 480,
    children: [
      {
        id: 'body',
        title: 'Body (Video)',
        naturalSizePct: 42,
        minSizePx: 280,
      },
      {
        id: 'assessment',
        title: 'Assessment',
        naturalSizePct: 8,
        minSizePx: 60,
      },
      {
        id: 'middle-bottom',
        title: 'Plan & Investigations',
        naturalSizePct: 50,
        minSizePx: 360,
        direction: 'horizontal',
        children: [
          {
            id: 'investigations-orders',
            title: 'Investigations',
            naturalSizePct: 40,
            minSizePx: 200,
          },
          {
            id: 'plan',
            title: 'Plan (Rx)',
            naturalSizePct: 60,
            minSizePx: 280,
          },
        ],
      },
    ],
  },
  {
    id: 'right-column',
    title: 'Chart Notes',
    naturalSizePct: 22,
    minSizePx: 240,
    children: [
      {
        id: 'subjective',
        title: 'Subjective',
        naturalSizePct: 50,
        minSizePx: 220,
      },
      {
        id: 'objective',
        title: 'Objective',
        naturalSizePct: 50,
        minSizePx: 220,
      },
    ],
  },
];

function fixtureCtx(
  overrides: Partial<TelemedVideoContext> = {},
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
      appointment_date: '2026-05-14T10:00:00Z',
      status: 'confirmed',
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      consultation_session: null,
    },
    token: 'test-token',
    state: 'live',
    ...overrides,
  };
}

/** DFS walk — every node in a template tree (groups + leaves). */
function walkPaneDefinitions(nodes: PaneDefinition[]): PaneDefinition[] {
  const out: PaneDefinition[] = [];
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length) {
      out.push(...walkPaneDefinitions(node.children));
    }
  }
  return out;
}

function allBuiltInTemplates(): PaneDefinition[][] {
  const ctx = fixtureCtx();
  return [
    getTelemedVideoTemplate(ctx),
    getTelemedVoiceTemplate(ctx),
    getTelemedTextTemplate(ctx),
    getReviewTemplate(ctx),
  ];
}

const FORBIDDEN_GROUP_WRAPPER_CHROME = [
  'plan-action-footer',
  'safety-sticky-strip',
] as const;

describe('cpfg-03: groupWrapper invariant (P4-DL-4)', () => {
  afterEach(() => {
    cleanup();
  });

  it('no built-in template groupWrapper renders action/visual chrome or a provider', () => {
    for (const template of allBuiltInTemplates()) {
      for (const node of walkPaneDefinitions(template)) {
        if (!node.groupWrapper) continue;

        const { container } = render(
          node.groupWrapper(
            createElement('div', { 'data-testid': 'gw-children' }),
          ),
        );

        expect(
          container.querySelector('[data-testid="gw-children"]'),
          `[cpfg-03 / P4-DL-4] groupWrapper on "${node.id}" must render its children.`,
        ).toBeTruthy();

        for (const testId of FORBIDDEN_GROUP_WRAPPER_CHROME) {
          expect(
            container.querySelector(`[data-testid="${testId}"]`),
            `[cpfg-03 / P4-DL-4] groupWrapper on "${node.id}" renders forbidden chrome (${testId}). Lift action chrome to shell docks and visual chrome to leaf render — see Phase 4 cpfg-01/cpfg-02.`,
          ).toBeNull();
        }

        expect(
          container.textContent,
          `[cpfg-03 / P4-DL-4] groupWrapper on "${node.id}" renders ChartRailWithEmptyState. Anchor empty-state to the snapshot leaf render (cpfg-02).`,
        ).not.toContain('No patient context yet');

        for (const el of container.querySelectorAll('*')) {
          expect(
            el.tagName,
            `[cpfg-03 / P4-DL-4] groupWrapper on "${node.id}" must be layout-only DOM (<div>); found <${el.tagName.toLowerCase()}>.`,
          ).toBe('DIV');
        }

        cleanup();
      }
    }
  });
});

describe('getTelemedVideoTemplate', () => {
  it('produces the canonical 8-leaf pane order', () => {
    const tree = getTelemedVideoTemplate(fixtureCtx());
    const { paneOrder } = flattenPaneDefinitions(tree);
    expect(paneOrder).toEqual([...EXPECTED_LEAF_ORDER]);
    expect(paneOrder).toHaveLength(8);
  });

  it('registers every leaf in paneById', () => {
    const tree = getTelemedVideoTemplate(fixtureCtx());
    const { paneById } = flattenPaneDefinitions(tree);
    for (const id of EXPECTED_LEAF_ORDER) {
      expect(paneById[id]?.id).toBe(id);
    }
  });

  it('matches post-cmr-06 structural snapshot', () => {
    const tree = getTelemedVideoTemplate(fixtureCtx());
    expect(serializePaneTree(tree)).toEqual(TELEMED_VIDEO_STRUCTURE_SNAPSHOT);
  });

  it('wires investigations-orders to InvestigationsPane (cmi-02)', () => {
    const src = readFileSync(
      join(__dirname, '../templates.tsx'),
      'utf8',
    );
    expect(src).toContain('<InvestigationsPane');
    expect(src).not.toMatch(/<PanePlaceholder\s/);
  });

  it('wires cmr-06 middle components (assessment, body zone, overlays, merge)', () => {
    const src = readFileSync(
      join(__dirname, '../templates.tsx'),
      'utf8',
    );
    expect(src).toContain('<AssessmentStrip');
    expect(src).toContain('<BodyZone');
    expect(src).not.toMatch(/import \{ SafetyStickyStrip \}/);
    expect(src).not.toMatch(/import \{ PlanActionFooter \}/);
    expect(src).not.toMatch(/import \{ RxFormActionsBridgeProvider \}/);
    expect(src).toContain('<InvestigationsAutoMerge');
    expect(src).toContain('groupWrapper');
    expect(src).toContain('@[720px]/middle-bottom:block');
    expect(src).toContain('actionsInFooter');
    expect(src).toContain('dxLifted');
    expect(src).toContain('safetyLifted');
    expect(src).toContain('subjectiveLifted');
    expect(src).toContain('objectiveLifted');
    expect(src).toContain('entryModeLifted');
    expect(src).toContain('photoLifted');
  });

  it('middle-bottom groupWrapper is layout-only (cpfg-01)', () => {
    const { paneById } = flattenPaneDefinitions(getTelemedVideoTemplate(fixtureCtx()));
    const middleBottom = paneById['middle-bottom'];
    expect(middleBottom?.groupWrapper).toBeDefined();

    render(
      middleBottom!.groupWrapper!(
        createElement(
          'div',
          { 'data-testid': 'middle-bottom-children' },
          'content',
        ),
      ),
    );

    expect(screen.getByTestId('middle-bottom-children')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-action-footer')).toBeNull();
    expect(screen.queryByTestId('safety-sticky-strip')).toBeNull();
    expect(
      screen.getByTestId('middle-bottom-children').parentElement?.parentElement,
    ).toHaveClass('@container/middle-bottom');
  });

  it('wires snapshot and history to R-CHART panes (cce-04)', () => {
    const src = readFileSync(
      join(__dirname, '../templates.tsx'),
      'utf8',
    );
    expect(src).toContain('<SnapshotPane');
    expect(src).toContain('<HistoryPane');
    expect(src).not.toContain('<PatientChartPane');
  });

  it('leaf-anchors ChartRailWithEmptyState on snapshot, not left-column (cpfg-02)', () => {
    const ctx = fixtureCtx();
    const { paneById } = flattenPaneDefinitions(getTelemedVideoTemplate(ctx));
    const leftColumn = paneById['left-column'];
    const snapshot = paneById.snapshot;

    expect(leftColumn?.groupWrapper).toBeUndefined();

    const rendered = snapshot!.render!();
    expect(rendered.type).toBe(ChartRailWithEmptyState);
    expect(rendered.props.appointmentId).toBe(ctx.appointment.id);
    expect(rendered.props.patientId).toBe(ctx.appointment.patient_id);
    expect(rendered.props.token).toBe(ctx.token);
  });

  it('imports pane icons from pane-icons SoT (cpv-07)', () => {
    const src = readFileSync(
      join(__dirname, '../templates.tsx'),
      'utf8',
    );
    expect(src).toContain("from './pane-icons'");
    expect(src).toContain('PANE_ICONS');
    expect(src).toContain('BODY_VARIANT_ICONS');
    expect(src).not.toMatch(/from 'lucide-react'/);
  });
});

describe('getTelemedVoiceTemplate', () => {
  it('produces the canonical 8-leaf pane order', () => {
    const { paneOrder } = flattenPaneDefinitions(
      getTelemedVoiceTemplate(fixtureCtx()),
    );
    expect(paneOrder).toEqual([...EXPECTED_LEAF_ORDER]);
  });

  it('sizes Body at 15%, assessment at 8%, bottom row at 77%', () => {
    const { paneById } = flattenPaneDefinitions(
      getTelemedVoiceTemplate(fixtureCtx()),
    );
    expect(paneById.body?.naturalSizePct).toBe(15);
    expect(paneById.body?.minSizePx).toBe(60);
    expect(paneById.assessment?.naturalSizePct).toBe(8);
    expect(paneById['middle-bottom']?.naturalSizePct).toBe(77);
  });
});

describe('getTelemedTextTemplate', () => {
  it('produces the canonical 8-leaf pane order', () => {
    const { paneOrder } = flattenPaneDefinitions(
      getTelemedTextTemplate(fixtureCtx()),
    );
    expect(paneOrder).toEqual([...EXPECTED_LEAF_ORDER]);
  });

  it('sizes Body at 40%, assessment at 8%, bottom row at 52%', () => {
    const { paneById } = flattenPaneDefinitions(
      getTelemedTextTemplate(fixtureCtx()),
    );
    expect(paneById.body?.naturalSizePct).toBe(40);
    expect(paneById.assessment?.naturalSizePct).toBe(8);
    expect(paneById['middle-bottom']?.naturalSizePct).toBe(52);
  });
});

describe('getReviewTemplate', () => {
  it('includes the body leaf as the EndedConsultBody strip (ecb-01)', () => {
    const { paneOrder, paneById } = flattenPaneDefinitions(
      getReviewTemplate(fixtureCtx()),
    );
    expect(paneOrder).toEqual([...REVIEW_LEAF_ORDER]);
    expect(paneOrder).toHaveLength(8);
    expect(paneById.body?.id).toBe('body');
    expect(paneById.body?.title).toBe('Visit summary');
    expect(paneById.assessment?.id).toBe('assessment');
  });

  it('sizes body at 12%, assessment at 8%, bottom row at 80% (ecb-01)', () => {
    const { paneById } = flattenPaneDefinitions(
      getReviewTemplate(fixtureCtx()),
    );
    expect(paneById.body?.naturalSizePct).toBe(12);
    expect(paneById.body?.minSizePx).toBe(64);
    expect(paneById.assessment?.naturalSizePct).toBe(8);
    expect(paneById['middle-bottom']?.naturalSizePct).toBe(80);
  });

  it('wires EndedConsultBody when bodyVariant is "review"', () => {
    const src = readFileSync(
      join(__dirname, '../templates.tsx'),
      'utf8',
    );
    expect(src).toContain('<EndedConsultBody');
    expect(src).toContain("opts.bodyVariant === 'review'");
  });
});
