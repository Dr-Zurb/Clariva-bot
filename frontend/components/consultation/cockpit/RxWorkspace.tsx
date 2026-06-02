"use client";

/**
 * RxWorkspace — Lane β / cockpit-5.
 *
 * The right-column Rx pane in the consultation cockpit. Wraps the
 * existing <PrescriptionForm> (no logic surgery) and adds cockpit-
 * specific affordances:
 *
 *   [RxSectionNav — sticky]
 *     Symptoms · Diagnosis · Investigations · Medicines · Notes
 *   [Form body — scrolls]
 *     <PrescriptionForm> (+ pointer-events:none overlay when ended)
 *
 * Action buttons ("Send Rx", "Send Rx & finish", "Finish visit") live
 * inside PrescriptionForm's own footer — no duplicate sticky bar here.
 *
 * Bugfix (cockpit-customization polish): the inner "Templates ▾ /
 *   Previous (N) / collapse chevron" header strip was removed so the
 *   Rx column's chrome height matches Chart and Body. The collapse
 *   chevron is now solely in the shared <CockpitColumnHeader> via
 *   `RxColumnContent`'s actions slot, and `<PreviousRxPopover>` was
 *   lifted into that same actions slot (rendered by RxColumnContent).
 *   The disabled "Templates ▾" stub was dropped — re-introduce when
 *   PrescriptionForm exposes an external template-apply surface.
 *
 * TODOs tracked here (for follow-up tasks):
 *   AllergyClashBanner + InteractionChips moved to `<SafetyStickyStrip>`
 *   (cmr-02) — pinned via bottom-row overlay in templates.tsx (cmr-06).
 *   TODO β-2: Re-introduce "Templates ▾" picker once PrescriptionForm
 *             exposes an external template-apply handler. Pre-removal it
 *             lived in the inner header strip; post-removal it should
 *             land either in the column header `actions` slot or as a
 *             section-nav peer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import PrescriptionForm from "@/components/consultation/PrescriptionForm";
import { RxSectionNav } from "./RxSectionNav";
import {
  PreviousRxSideSheetAnchor,
  type PreviousRxApplyConfirmPayload,
} from "@/components/cockpit/rx/previous/PreviousRxSideSheet";
import { FavoritesSideSheetAnchor } from "@/components/cockpit/rx/favorites/FavoritesSideSheet";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import { useSideSheet } from "@/components/patient-profile/SideSheetHost";
import {
  trackCockpitPolishNavClarityLanded,
  trackCockpitV2RRxPolishSideSheetApplied,
} from "@/lib/patient-profile/telemetry";
import {
  canEditPrescriptionDraft,
  type CockpitState,
} from "@/lib/patient-profile/state";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RxWorkspaceProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  /** Current cockpit state — drives read-only overlay. */
  state: CockpitState;
  /**
   * Forwarded to PrescriptionForm.onSent — fires after a successful
   * Save-and-Send so the cockpit can post a system banner or update state.
   */
  onSent?: (prescriptionId: string) => void | Promise<void>;
  /**
   * Forwarded to PrescriptionForm.onFinish — directly POSTs
   * /v1/appointments/:id/wrap-up via ConsultationCockpit's
   * `handleFinishVisit`. Enables the "Send Rx & finish ▸" and
   * "Finish visit" buttons inside the form footer.
   */
  onFinish?: () => void;
  /**
   * Reserved for parity with the chart-rail collapse hook. Kept on the
   * RxWorkspace surface so future surfaces (mobile sheet etc.) can
   * trigger a collapse from inside the workspace if needed; the cockpit
   * desktop shell drives collapse exclusively via the shared
   * <CockpitColumnHeader> actions slot now.
   */
  onCollapse?: () => void;
  /**
   * cc-14: Optional callback fired whenever the live medicine count
   * changes. The cockpit mirrors this into its own `rxMedicineCount`
   * state so <CollapsedRxRail> can display the count while the panel is
   * collapsed. Uses the simpler "fire both" pattern: RxWorkspace keeps
   * its own internal count (for <RxSectionNav>) and also notifies the
   * parent.
   */
  onMedicineCountChange?: (count: number) => void;
  /**
   * When true, PrescriptionForm suppresses inline SaveStatus + commit row;
   * `<PlanActionFooter>` owns those affordances (cmr-03).
   */
  actionsInFooter?: boolean;
  /**
   * When true, AssessmentSection hides its Dx + DDx — the AssessmentStrip
   * owns them (cmr-01 / cmr-06).
   */
  dxLifted?: boolean;
  /**
   * When true, PlanSection hides inline safety banners — the
   * SafetyStickyStrip overlay owns them (cmr-02 / cmr-06).
   */
  safetyLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  subjectiveLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  objectiveLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  entryModeLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  photoLifted?: boolean;
  /** cnc-01: see RxPaneProps.cockpitMode. */
  cockpitMode?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RxWorkspace({
  appointmentId,
  patientId,
  token,
  state,
  onSent,
  onFinish,
  onCollapse: _onCollapse,
  onMedicineCountChange,
  actionsInFooter = false,
  dxLifted = false,
  safetyLifted = false,
  subjectiveLifted = false,
  objectiveLifted = false,
  entryModeLifted = false,
  photoLifted = false,
  cockpitMode = false,
}: RxWorkspaceProps) {
  // `onCollapse` is currently unused — the cockpit's column header owns
  // the collapse chevron after the inner-header-strip removal. Kept on
  // the prop surface so future surfaces (mobile sheet etc.) can trigger
  // a collapse without re-shaping this component. Prefix with `_` to
  // silence unused-variable lints.
  void _onCollapse;
  const canEdit = canEditPrescriptionDraft(state);

  // cs-11: ref for the scroll container inside the Rx column. The
  // RxSectionNav observes sections relative to this scroll root (not the
  // page) so the active-chip detection works correctly in the cockpit's
  // per-column layout.
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // cs-11: live count of filled medicine rows surfaced by PrescriptionForm
  // via onMedicineCountChange. Drives the "Medicines (N)" chip label.
  // cc-14: also notifies the parent (cockpit) via props.onMedicineCountChange
  // so <CollapsedRxRail> can display the count while the panel is collapsed.
  const [medicineCount, setMedicineCount] = useState(0);
  const handleMedicineCountChange = useCallback(
    (n: number) => {
      setMedicineCount(n);
      onMedicineCountChange?.(n);
    },
    [onMedicineCountChange],
  );

  const rxForm = useOptionalRxForm();
  const sideSheet = useSideSheet();

  useEffect(() => {
    if (!cockpitMode) return;
    trackCockpitPolishNavClarityLanded({
      appointmentId,
      cockpitMode: true,
      rxSectionNavHidden: true,
      rightColumnTitle: "Chart Notes",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirmApplyPriorRx = useCallback(
    ({ priorRx, final, mode }: PreviousRxApplyConfirmPayload) => {
      if (!rxForm) return;
      rxForm.dispatch({ type: "SET_MEDICINES", medicines: final });
      rxForm.setField("fromPrescriptionId", priorRx.id);
      trackCockpitV2RRxPolishSideSheetApplied({
        priorRxId: priorRx.id,
        mode,
        medicineCount: final.length,
      });
      sideSheet.close();
    },
    [rxForm, sideSheet],
  );

  // ------------------------------------------------------------------
  // terminal state — no Rx pane
  // ------------------------------------------------------------------
  if (state === "terminal") {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Prescription pane is not available for cancelled or no-show
          appointments.
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------
  return (
      <div className="flex h-full flex-col overflow-hidden">
        {patientId ? (
          <PreviousRxSideSheetAnchor
            appointmentId={appointmentId}
            patientId={patientId}
            token={token}
            onConfirmApply={handleConfirmApplyPriorRx}
          />
        ) : null}
        <FavoritesSideSheetAnchor token={token} />
        {/* Allergy/DDI banners: `<SafetyStickyStrip>` in middle-bottom overlay
            (cmr-02 / cmr-06), not inside this scroll region. */}

        {/* ── Form body (scrolls) ───────────────────────────────────── */}
        <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
          {/* Read-only overlay when state === "ended" */}
          {!canEdit && state === "ended" && (
            <div
              aria-label="Prescription is read-only — the consultation has ended"
              className="pointer-events-none absolute inset-0 z-10"
            />
          )}

          {/* cs-11: sticky section-nav chip strip. Positioned as the first
              child inside the scroll div so `sticky top-0` keeps it
              pinned at the top of the column's own scroll context as the
              form content scrolls below. */}
          {!cockpitMode && (
            <RxSectionNav
              scrollContainerRef={scrollRef}
              sections={[
                { id: 'rx-symptoms', label: 'Symptoms' },
                { id: 'rx-diagnosis', label: 'Diagnosis' },
                { id: 'rx-investigations', label: 'Investigations' },
                { id: 'rx-medicines', label: 'Medicines', count: medicineCount },
                { id: 'rx-notes', label: 'Notes' },
              ]}
            />
          )}

          <PrescriptionForm
            appointmentId={appointmentId}
            patientId={patientId}
            token={token}
            onSent={onSent}
            onFinish={onFinish}
            onMedicineCountChange={handleMedicineCountChange}
            actionsInFooter={actionsInFooter}
            dxLifted={dxLifted}
            safetyLifted={safetyLifted}
            subjectiveLifted={subjectiveLifted}
            objectiveLifted={objectiveLifted}
            entryModeLifted={entryModeLifted}
            photoLifted={photoLifted}
            cockpitState={state}
          />
        </div>
      </div>
  );
}
