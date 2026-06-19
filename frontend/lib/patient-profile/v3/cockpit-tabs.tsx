'use client';

/**
 * cockpit-tabs.tsx — the Cockpit v3 flat tab registry (cv3t-01 · Phase 5).
 *
 * Returns the eight real leaf tabs as uniform, self-contained `PaneDefinition`s
 * (no `children` / `groupWrapper` / `direction`), each rendering its existing
 * pane body BY REFERENCE. This is the v3 replacement for the nested column
 * template in `templates.tsx`, which the legacy `PatientProfileShell` keeps
 * using until cv3x-03 deletes it.
 *
 * Design locks (see `task-cv3t-01-flat-tab-registry.md`):
 *   - P5-DL-2 — port by reference; never rewrite a pane body. Each `render`
 *     below mounts the same component with the same props as the template
 *     factory; `RxPane`'s lifted-prop set is transplanted verbatim.
 *   - P5-DL-1 / v3-DL-2 — uniform, self-contained tabs. No tab references a
 *     sibling; cross-tab state flows only through the shared providers mounted
 *     above the shell (`RxFormProvider` / `RxSafetyProvider` / …).
 *   - P5-DL-4 — Investigations and Plan are INDEPENDENT tabs: no
 *     `@[720px]/middle-bottom` container query, no `InvestigationsAutoMerge`.
 *     Both still write the shared `investigationsOrders` field, so the
 *     decouple cannot split state.
 *   - P5-DL-3 / P0-DL-1 — legacy `templates.tsx` is untouched. The type-only
 *     import of the cockpit context below is the one remaining coupling; it is
 *     relocated by cv3x-03 when the column factories are deleted.
 *
 * The body tab is relabelled "Consult" (live) / "Visit summary" (review) with a
 * modality/state icon, branching `BodyZone` ↔ `EndedConsultBody` internally —
 * one tab, internal switch (no second tab). The shell keys the live-drag guard
 * off the stable id `body`.
 */

import { createRef, type RefObject } from 'react';
import type React from 'react';
import type { PaneDefinition } from '@/lib/patient-profile/v3/foundation';
import {
  mapStateToTemplate,
  canEditPrescriptionDraft,
  type CockpitTemplate,
} from '@/lib/patient-profile/state';
// Type-only: the cockpit context contract the page builds (P5-DL-3 — relocated
// by cv3x-03 when templates.tsx is deleted; no runtime coupling).
import type {
  TelemedVideoContext,
  TelemedVideoLauncherHandle,
} from '@/lib/patient-profile/templates';
import {
  PANE_ICONS,
  BODY_VARIANT_ICONS,
} from '@/lib/patient-profile/pane-icons';
import SnapshotPane from '@/components/patient-profile/panes/SnapshotPane';
import { ChartRailWithEmptyState } from '@/components/patient-profile/panes/ChartRailWithEmptyState';
import HistoryPane from '@/components/patient-profile/panes/HistoryPane';
import InvestigationsPane from '@/components/patient-profile/panes/InvestigationsPane';
import RxPane from '@/components/patient-profile/panes/RxPane';
import SubjectivePane from '@/components/patient-profile/panes/SubjectivePane';
import ObjectivePane from '@/components/patient-profile/panes/ObjectivePane';
import { AssessmentStrip } from '@/components/cockpit/middle/AssessmentStrip';
import { BodyZone } from '@/components/cockpit/middle/BodyZone';
import { EndedConsultBody } from '@/components/cockpit/middle/EndedConsultBody';

// Prop-type bridges (mirror templates.tsx; the duplication dies with cv3x-03).
type PaneAppointment = React.ComponentProps<typeof SnapshotPane>['appointment'];
type PaneLauncherRef = React.ComponentProps<typeof BodyZone>['launcherRef'];
type LiveBodyVariant = 'video' | 'voice' | 'text';
type BodyVariant = LiveBodyVariant | 'review';

/** Fallback when `ctx.launcherRef` is omitted (tests / smoke fixtures). */
const FALLBACK_LAUNCHER_REF: RefObject<TelemedVideoLauncherHandle> =
  createRef<TelemedVideoLauncherHandle>();

/**
 * Stable left-to-right tab order. The palette + blank-seed (cv3t-02) read this
 * so "what tabs exist" stays a single source of truth.
 */
export const COCKPIT_TAB_ORDER = [
  'snapshot',
  'history',
  'body',
  'assessment',
  'investigations-orders',
  'plan',
  'subjective',
  'objective',
] as const;

/** Walk-in subset (no chart, DL-5): the consult body + the Rx plan, in order. */
export const WALK_IN_TAB_IDS = ['body', 'plan'] as const;

/**
 * Resolve the body leaf variant from the dispatched template id — the faithful
 * mirror of `templates.tsx`'s `dispatchedTemplate` switch (review ⇒ summary
 * strip; otherwise the modality drives the live body + icon).
 */
function bodyVariantFor(templateId: CockpitTemplate): BodyVariant {
  switch (templateId) {
    case 'review':
      return 'review';
    case 'telemed-voice':
      return 'voice';
    case 'telemed-text':
      return 'text';
    case 'telemed-video':
    default:
      return 'video';
  }
}

/** Body row natural height hint per live variant (matches the template budgets). */
function liveBodyHeightFor(variant: LiveBodyVariant): number {
  switch (variant) {
    case 'voice':
      return 15;
    case 'text':
      return 40;
    case 'video':
    default:
      return 42;
  }
}

/** The review body tab — an informational "Visit summary" strip (ecb-01). */
function buildReviewBodyTab(ctx: TelemedVideoContext): PaneDefinition {
  const session = ctx.appointment.consultation_session ?? null;
  const sessionModality: 'text' | 'voice' | 'video' | null =
    session?.modality ?? null;
  return {
    id: 'body',
    title: 'Visit summary',
    icon: BODY_VARIANT_ICONS.review,
    render: () => (
      <EndedConsultBody
        state={ctx.state}
        appointmentStatus={ctx.appointment.status}
        modality={sessionModality}
        startedAt={session?.actual_started_at ?? null}
        endedAt={session?.actual_ended_at ?? null}
        durationSeconds={ctx.appointment.consultation_duration_seconds ?? null}
        appointmentId={ctx.appointment.id}
      />
    ),
    naturalSizePct: 12,
    minSizePx: 64,
  };
}

/**
 * Build the eight uniform leaf tabs for the Cockpit v3 canvas.
 *
 * @param ctx        the cockpit context the page builds (`templateContext`).
 * @param templateId the dispatched template id (`selectedTemplateId`). Omit to
 *                   derive it from `ctx` (no doctor override) — handy for tests.
 */
export function buildCockpitTabs(
  ctx: TelemedVideoContext,
  templateId: CockpitTemplate = mapStateToTemplate(
    ctx.state,
    ctx.appointment.consultation_type ?? null,
    null,
  ),
): PaneDefinition[] {
  const appointment = ctx.appointment as PaneAppointment;
  const appointmentId = ctx.appointment.id;
  const patientId = appointment.patient_id ?? null;
  const launcherRef = (ctx.launcherRef ??
    FALLBACK_LAUNCHER_REF) as PaneLauncherRef;

  const bodyVariant = bodyVariantFor(templateId);

  const snapshot: PaneDefinition = {
    id: 'snapshot',
    title: 'Snapshot',
    icon: PANE_ICONS.snapshot,
    hideShellHeader: true,
    render: () => (
      <ChartRailWithEmptyState
        appointmentId={appointmentId}
        patientId={patientId}
        token={ctx.token}
      >
        <SnapshotPane appointment={appointment} token={ctx.token} />
      </ChartRailWithEmptyState>
    ),
    naturalSizePct: 40,
    minSizePx: 200,
  };

  const history: PaneDefinition = {
    id: 'history',
    title: 'History',
    icon: PANE_ICONS.history,
    hideShellHeader: true,
    render: () => <HistoryPane appointment={appointment} token={ctx.token} />,
    naturalSizePct: 60,
    minSizePx: 240,
  };

  const body: PaneDefinition =
    bodyVariant === 'review'
      ? buildReviewBodyTab(ctx)
      : {
          id: 'body',
          title: 'Consult',
          icon: BODY_VARIANT_ICONS[bodyVariant],
          render: () => (
            <BodyZone
              variant={bodyVariant}
              state={ctx.state}
              appointment={appointment}
              token={ctx.token}
              launcherRef={launcherRef}
              onRxSent={ctx.onRxSent}
              onMarkNoShow={ctx.onMarkNoShow}
              hideHeader
            />
          ),
          naturalSizePct: liveBodyHeightFor(bodyVariant),
          minSizePx: bodyVariant === 'voice' ? 60 : 280,
        };

  const assessment: PaneDefinition = {
    id: 'assessment',
    title: 'Assessment',
    icon: PANE_ICONS.assessment,
    render: () => (
      <AssessmentStrip state={ctx.state} appointmentId={appointmentId} />
    ),
    naturalSizePct: 8,
    minSizePx: 60,
  };

  // P5-DL-4: standalone Investigations — no `@[720px]/middle-bottom` gating div.
  const investigations: PaneDefinition = {
    id: 'investigations-orders',
    title: 'Investigations',
    icon: PANE_ICONS['investigations-orders'],
    render: () => (
      <InvestigationsPane
        state={ctx.state}
        appointmentId={appointmentId}
        hideHeader
      />
    ),
    naturalSizePct: 40,
    minSizePx: 200,
  };

  // P5-DL-4: standalone Plan — `RxPane` alone, no `InvestigationsAutoMerge`,
  // no bundling <div>. The lifted-prop set is a fixed clinical-safety contract
  // and is transplanted verbatim from the template (dropping any one
  // double-renders safety / Dx / the "Send Rx & finish" action).
  const plan: PaneDefinition = {
    id: 'plan',
    title: 'Plan',
    icon: PANE_ICONS.plan,
    render: () => (
      <RxPane
        appointment={appointment}
        token={ctx.token}
        state={ctx.state}
        onRxSent={ctx.onRxSent}
        onFinishVisit={ctx.onFinishVisit}
        onMedicineCountChange={ctx.onMedicineCountChange}
        hideHeader
        actionsInFooter
        dxLifted
        safetyLifted
        subjectiveLifted
        objectiveLifted
        entryModeLifted
        photoLifted
        cockpitMode
      />
    ),
    naturalSizePct: 60,
    minSizePx: 280,
  };

  const subjective: PaneDefinition = {
    id: 'subjective',
    title: 'Subjective',
    icon: PANE_ICONS.subjective,
    render: () => (
      <SubjectivePane
        hideHeader
        patientId={patientId}
        token={ctx.token}
        cockpitState={ctx.state}
      />
    ),
    naturalSizePct: 50,
    minSizePx: 220,
  };

  const objective: PaneDefinition = {
    id: 'objective',
    title: 'Objective',
    icon: PANE_ICONS.objective,
    render: () => <ObjectivePane appointmentId={appointmentId} hideHeader />,
    naturalSizePct: 50,
    minSizePx: 220,
  };

  return [
    snapshot,
    history,
    body,
    assessment,
    investigations,
    plan,
    subjective,
    objective,
  ];
}

/**
 * Walk-in 2-tab subset (no chart, DL-5): the consult body + the Rx plan, in
 * `WALK_IN_TAB_IDS` order. Built from the same registry so the bodies/props
 * stay identical to the full canvas.
 */
export function buildWalkInCockpitTabs(
  ctx: TelemedVideoContext,
  templateId?: CockpitTemplate,
): PaneDefinition[] {
  const byId = new Map(
    buildCockpitTabs(ctx, templateId).map((tab) => [tab.id, tab]),
  );
  return WALK_IN_TAB_IDS.map((id) => byId.get(id)).filter(
    (tab): tab is PaneDefinition => Boolean(tab),
  );
}
