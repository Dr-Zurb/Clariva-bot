'use client';

/**
 * templates.tsx — modality-aware layout factories.
 * csf-02 converted the cv2-03 literal to a factory.
 * csf-03 wired Snapshot / Body / Plan / Subjective / Objective leaves to real content.
 * cce-04 (R-CHART) wired the History leaf to <HistoryPane> and re-pointed the Snapshot
 * leaf at <SnapshotPane>.
 * tmr-01 (R-MOD) adds Telemed-Voice / Telemed-Text / Review template factories.
 *
 * cmr-06 (R-MIDDLE rest, 2026-05-21) wired:
 *   - <AssessmentStrip> as third child of middle-column (id="assessment").
 *   - cpfg-01 lifted <SafetyStickyStrip> + <PlanActionFooter> to shell docks.
 *   - <BodyZone> wrapper around <ConsultationBodyPane> (per modality).
 *   - <InvestigationsAutoMerge> + container-query for narrow-monitor merge.
 *
 * Active Phase 2 module — `getTelemedVideoTemplate` is mounted by
 * `PatientProfilePage` post-csf-04. tmr-04 wires `mapStateToTemplate` dispatch.
 *
 * Pane id → Phase 2/3 owner:
 *   snapshot              — R-CHART (real)
 *   history               — R-CHART (real)
 *   body                  — R-MIDDLE (top)
 *   investigations-orders — R-MIDDLE (bottom-left) — REAL (cmi-01/02, 2026-05-21)
 *   plan                  — R-MIDDLE (bottom-right) + R-RX-FORM
 *   subjective            — R-MIDDLE (right-top)
 *   objective             — R-MIDDLE (right-bottom)
 *   assessment            — R-MIDDLE (sticky strip; cmr-06)
 *
 * ppd-04 (2026-05-26): `<RxPane>` now also receives `subjectiveLifted`,
 * `objectiveLifted`, `entryModeLifted`, `photoLifted` — see
 * `plan-cockpit-plan-pane-deduplication-batch.md` for rationale.
 */

import { createRef, type RefObject } from 'react';
import type React from 'react';
import type { PaneDefinition } from './types';
import type {
  CockpitAppointmentStatus,
  CockpitConsultationModality,
  CockpitSessionSummary,
  CockpitState,
} from './state';
import { canEditPrescriptionDraft } from './state';
import SnapshotPane from '@/components/patient-profile/panes/SnapshotPane';
import { ChartRailWithEmptyState } from '@/components/patient-profile/panes/ChartRailWithEmptyState';
import InvestigationsPane from '@/components/patient-profile/panes/InvestigationsPane';
import HistoryPane from '@/components/patient-profile/panes/HistoryPane';
import ConsultationBodyPane from '@/components/patient-profile/panes/ConsultationBodyPane';
import RxPane from '@/components/patient-profile/panes/RxPane';
import SubjectivePane from '@/components/patient-profile/panes/SubjectivePane';
import ObjectivePane from '@/components/patient-profile/panes/ObjectivePane';
import { AssessmentStrip } from '@/components/cockpit/middle/AssessmentStrip';
import { BodyZone } from '@/components/cockpit/middle/BodyZone';
import { EndedConsultBody } from '@/components/cockpit/middle/EndedConsultBody';
import { InvestigationsAutoMerge } from '@/components/cockpit/middle/InvestigationsAutoMerge';
import { PANE_ICONS, BODY_VARIANT_ICONS, COLUMN_ICONS } from './pane-icons';

type PaneAppointment = React.ComponentProps<typeof SnapshotPane>['appointment'];
type PaneLauncherRef = React.ComponentProps<
  typeof ConsultationBodyPane
>['launcherRef'];

// ---------------------------------------------------------------------------
// Cockpit template ids — consumed by mapStateToTemplate (tmr-02).
// ---------------------------------------------------------------------------

export type CockpitTemplate =
  | 'telemed-video'
  | 'telemed-voice'
  | 'telemed-text'
  | 'review';

type BodyVariant = 'video' | 'voice' | 'text' | 'review';

// ---------------------------------------------------------------------------
// Telemed-Video cockpit context — consumed by leaf renderers in csf-03+.
// ---------------------------------------------------------------------------

/**
 * DL-2 duplicate of `@/types/appointment` `Appointment`. `PatientProfilePage`
 * passes the real appointment; structural typing keeps the bridge assignable.
 */
export interface TelemedVideoAppointment {
  id: string;
  doctor_id: string;
  patient_id?: string | null;
  patient_name: string;
  patient_phone: string | null;
  patient_age: number | null;
  patient_sex: 'male' | 'female' | 'other' | null;
  appointment_date: string;
  status: CockpitAppointmentStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  consultation_type?: CockpitConsultationModality | null;
  doctor_joined_at?: string | null;
  patient_joined_at?: string | null;
  consultation_duration_seconds?: number | null;
  verified_at?: string | null;
  clinical_notes?: string | null;
  consultation_session?: CockpitSessionSummary | null;
  opd_queue_event_type?: 'group' | 'token' | null;
  opd_token_number?: number | null;
}

/**
 * DL-2 duplicate of `ConsultationLauncherHandle` from
 * `@/components/consultation/ConsultationLauncher`.
 */
export interface TelemedVideoLauncherHandle {
  start: (modality: 'text' | 'voice' | 'video') => void;
  isLive: boolean;
}

export interface TelemedVideoContext {
  /** The appointment driving this cockpit page. */
  appointment: TelemedVideoAppointment;
  /** Auth token for downstream API calls. */
  token: string;
  /** Derived cockpit state (waiting | live | wrap_up | …) from deriveCockpitState. */
  state: CockpitState;
  /** Imperative ref into the consult launcher; null when no consult is active. */
  launcherRef?: React.RefObject<TelemedVideoLauncherHandle>;
  /** When true, leaf renderers omit per-pane H2 headers (the shell renders them). */
  hideHeader?: boolean;
  /** Stub callback used by the body / rx panes after a Send-Rx flow completes. */
  onRxSent?: () => void;
  /** Mark-no-show callback wired into the body pane. */
  onMarkNoShow?: () => void;
  /** Finish-visit callback wired into the rx pane (Send Rx & finish ▸). */
  onFinishVisit?: () => void;
  /** Live medicine count surfaced to the rx pane for the collapsed-rail strip. */
  onMedicineCountChange?: (n: number) => void;
  /** True while the finish-visit RPC is in flight. */
  finishBusy?: boolean;
}

/** Fallback when ctx.launcherRef is omitted (tests / smoke fixtures). */
const FALLBACK_LAUNCHER_REF: RefObject<TelemedVideoLauncherHandle> =
  createRef<TelemedVideoLauncherHandle>();

// ---------------------------------------------------------------------------
// Shared column helpers (tmr-01) — single source of truth for all templates.
// ---------------------------------------------------------------------------

function variantTitle(variant: BodyVariant): string {
  switch (variant) {
    case 'video':
      return 'Body (Video)';
    case 'voice':
      return 'Body (Voice)';
    case 'text':
      return 'Body (Text)';
    case 'review':
      // ecb-01 (2026-05-27): the review body leaf is now an informational
      // strip ("Visit summary") rather than a placeholder, so the toggle-bar
      // and shell-context-menu label is renamed to match.
      return 'Visit summary';
  }
}

function makeLeftColumn(ctx: TelemedVideoContext): PaneDefinition {
  const appointment = ctx.appointment as PaneAppointment;
  const patientId = appointment.patient_id ?? null;
  const appointmentId = ctx.appointment.id;
  return {
    id: 'left-column',
    title: 'Patient',
    icon: COLUMN_ICONS['left-column'],
    hideShellHeader: true,
    render: () => null,
    children: [
      {
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
            <SnapshotPane
              appointment={appointment}
              token={ctx.token}
            />
          </ChartRailWithEmptyState>
        ),
        naturalSizePct: 40,
        minSizePx: 200,
      },
      {
        id: 'history',
        title: 'History',
        icon: PANE_ICONS.history,
        render: () => (
          <HistoryPane
            appointment={appointment}
            token={ctx.token}
          />
        ),
        hideShellHeader: true,
        naturalSizePct: 60,
        minSizePx: 240,
      },
    ],
    naturalSizePct: 22,
    minSizePx: 240,
  };
}

function makeRightColumn(ctx: TelemedVideoContext): PaneDefinition {
  const appointmentId = ctx.appointment.id;
  const patientId = ctx.appointment.patient_id ?? null;
  return {
    id: 'right-column',
    title: 'Chart Notes',
    icon: COLUMN_ICONS['right-column'],
    hideShellHeader: true,
    render: () => null,
    children: [
      {
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
        // R-FUTURE-PROOFING tab-contract slot — reserved for future Photo / AI-summary
        // tabs per cv2-09 / R-HISTORY acceptance. v1 leaves undefined; a future plan
        // implements PaneTabDefinition[] here. See aux-surfaces.ts.
        tabs: undefined,
      },
      {
        id: 'objective',
        title: 'Objective',
        icon: PANE_ICONS.objective,
        render: () => (
          <ObjectivePane appointmentId={appointmentId} hideHeader />
        ),
        naturalSizePct: 50,
        minSizePx: 220,
        // R-FUTURE-PROOFING tab-contract slot — reserved for future Labs tab per
        // cv2-09 / R-HISTORY acceptance. v1 leaves undefined; a future plan
        // implements PaneTabDefinition[] here. See aux-surfaces.ts.
        tabs: undefined,
      },
    ],
    naturalSizePct: 22,
    minSizePx: 240,
  };
}

function makeMiddleBottomRow(
  ctx: TelemedVideoContext,
  bottomRowSizePct: number,
): PaneDefinition {
  const appointment = ctx.appointment as PaneAppointment;
  return {
    id: 'middle-bottom',
    title: 'Plan & Investigations',
    render: () => null,
    groupWrapper: (children) => (
      <div
        className="@container/middle-bottom flex h-full flex-col"
        style={{ containerType: 'inline-size', containerName: 'middle-bottom' }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    ),
    direction: 'horizontal',
    children: [
      {
        id: 'investigations-orders',
        title: 'Investigations',
        icon: PANE_ICONS['investigations-orders'],
        render: () => (
          <div className="hidden h-full @[720px]/middle-bottom:block">
            <InvestigationsPane
              state={ctx.state}
              appointmentId={appointment.id}
              hideHeader
            />
          </div>
        ),
        naturalSizePct: 40,
        minSizePx: 200,
      },
      {
        id: 'plan',
        title: 'Plan (Rx)',
        icon: PANE_ICONS.plan,
        render: () => (
          <div className="flex h-full flex-col">
            <InvestigationsAutoMerge
              state={ctx.state}
              appointmentId={appointment.id}
            />
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
          </div>
        ),
        naturalSizePct: 60,
        minSizePx: 280,
      },
    ],
    naturalSizePct: bottomRowSizePct,
    minSizePx: 360,
  };
}

function makeMiddleColumn(
  ctx: TelemedVideoContext,
  opts: {
    bodyHeight: number;
    assessmentHeight: number;
    bottomRowHeight: number;
    bodyVariant: BodyVariant;
  },
): PaneDefinition {
  const appointment = ctx.appointment as PaneAppointment;
  const launcherRef = (ctx.launcherRef ??
    FALLBACK_LAUNCHER_REF) as PaneLauncherRef;

  const children: PaneDefinition[] = [];

  if (opts.bodyVariant === 'review') {
    // ecb-01 (2026-05-27): the review template used to skip the body
    // leaf entirely — that left the middle column reading as a confused
    // gap between Assessment and Plan-bottom for completed / cancelled
    // appointments. The new `<EndedConsultBody>` strip is a compact,
    // informational replacement (~64px) that summarises the visit.
    const session = ctx.appointment.consultation_session ?? null;
    const sessionModality: 'text' | 'voice' | 'video' | null =
      session?.modality ?? null;
    children.push({
      id: 'body',
      title: variantTitle(opts.bodyVariant),
      icon: BODY_VARIANT_ICONS[opts.bodyVariant],
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
      naturalSizePct: opts.bodyHeight,
      minSizePx: 64,
    });
  } else {
    children.push({
      id: 'body',
      title: variantTitle(opts.bodyVariant),
      icon: BODY_VARIANT_ICONS[opts.bodyVariant],
      render: () => (
        <BodyZone
          variant={opts.bodyVariant as 'video' | 'voice' | 'text'}
          state={ctx.state}
          appointment={appointment}
          token={ctx.token}
          launcherRef={launcherRef}
          onRxSent={ctx.onRxSent}
          onMarkNoShow={ctx.onMarkNoShow}
          hideHeader
        />
      ),
      naturalSizePct: opts.bodyHeight,
      minSizePx: opts.bodyVariant === 'voice' ? 60 : 280,
    });
  }

  children.push({
    id: 'assessment',
    title: 'Assessment',
    icon: PANE_ICONS.assessment,
    render: () => (
      <AssessmentStrip state={ctx.state} appointmentId={appointment.id} />
    ),
    naturalSizePct: opts.assessmentHeight,
    minSizePx: 60,
  });

  children.push(makeMiddleBottomRow(ctx, opts.bottomRowHeight));

  return {
    id: 'middle-column',
    title: 'Consult',
    icon: COLUMN_ICONS['middle-column'],
    hideShellHeader: true,
    render: () => null,
    children,
    naturalSizePct: 56,
    minSizePx: 480,
  };
}

// ---------------------------------------------------------------------------
// Telemed-Video default layout. See plan-cockpit-v2.md § "The 8-pane
// default layout" for the visual sketch.
// ---------------------------------------------------------------------------

/**
 * Telemed video consult cockpit layout.
 * Serves live / waiting video appointments (`consultation_type === 'video'`).
 * Body leaf 42% · Assessment strip 8% · Plan + Investigations bottom row 50%.
 * `mapStateToTemplate` returns `'telemed-video'` for video modality.
 */
export function getTelemedVideoTemplate(
  ctx: TelemedVideoContext,
): PaneDefinition[] {
  return [
    makeLeftColumn(ctx),
    makeMiddleColumn(ctx, {
      bodyHeight: 42,
      assessmentHeight: 8,
      bottomRowHeight: 50,
      bodyVariant: 'video',
    }),
    makeRightColumn(ctx),
  ];
}

/**
 * Telemed voice consult cockpit layout.
 * Serves live / waiting voice appointments (`consultation_type === 'voice'`).
 * Body leaf 15% · Assessment strip 8% · Plan + Investigations bottom row 77%.
 * `mapStateToTemplate` returns `'telemed-voice'` for voice modality.
 */
export function getTelemedVoiceTemplate(
  ctx: TelemedVideoContext,
): PaneDefinition[] {
  return [
    makeLeftColumn(ctx),
    makeMiddleColumn(ctx, {
      bodyHeight: 15,
      assessmentHeight: 8,
      bottomRowHeight: 77,
      bodyVariant: 'voice',
    }),
    makeRightColumn(ctx),
  ];
}

/**
 * Telemed text (chat) consult cockpit layout.
 * Serves live / waiting text appointments (`consultation_type === 'text'`).
 * Body leaf 40% · Assessment strip 8% · Plan + Investigations bottom row 52%.
 * `mapStateToTemplate` returns `'telemed-text'` for text modality.
 */
export function getTelemedTextTemplate(
  ctx: TelemedVideoContext,
): PaneDefinition[] {
  return [
    makeLeftColumn(ctx),
    makeMiddleColumn(ctx, {
      bodyHeight: 40,
      assessmentHeight: 8,
      bottomRowHeight: 52,
      bodyVariant: 'text',
    }),
    makeRightColumn(ctx),
  ];
}

/**
 * Post-visit review cockpit layout.
 * Serves completed (`ended`) and terminal (`cancelled` / `no_show`)
 * appointments when the doctor reviews the record.
 *
 * Body leaf 12% (`<EndedConsultBody>` strip) · Assessment strip 8% ·
 * Plan + Investigations bottom row 80%. `mapStateToTemplate` returns
 * `'review'` for `ended` and `terminal` states.
 *
 * ecb-01 (2026-05-27): body leaf re-introduced — was 0% / omitted prior.
 * The 12% allocation matches the height budget the voice template uses
 * for its body row (Voice = 15%), keeping the review strip slightly
 * smaller because it carries no live controls.
 */
export function getReviewTemplate(ctx: TelemedVideoContext): PaneDefinition[] {
  return [
    makeLeftColumn(ctx),
    makeMiddleColumn(ctx, {
      bodyHeight: 12,
      assessmentHeight: 8,
      bottomRowHeight: 80,
      bodyVariant: 'review',
    }),
    makeRightColumn(ctx),
  ];
}
