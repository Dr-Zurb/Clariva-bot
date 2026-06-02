"use client";

/**
 * SafetyStickyStrip — sticky-top overlay inside the bottom-row of the
 * cockpit-v2 middle column. Pins allergy clash banner + DDI chips above
 * Investigations + Plan content so they never scroll off (source plan DL-9).
 *
 * Resolves TODO β-1 in `RxWorkspace.tsx`: banners previously lived inside
 * `<PlanSection>`'s form body scroll; this strip renders from the template
 * bottom-row overlay (cmr-06) with `position: sticky; top: 0`.
 *
 * Inventory:
 *   - AllergyClashBanner — `frontend/components/ehr/AllergyClashBanner.tsx`
 *   - InteractionChips — `frontend/components/ehr/InteractionChips.tsx`
 *   - RxSafetyContext — shared allergy/DDI/ack state with PlanSection
 *
 * Empty state (all acked or no matches) → returns null; no reserved height.
 *
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/
 *      Tasks/task-cmr-02-safety-sticky-strip.md
 */

import { useEffect } from "react";
import AllergyClashBanner from "@/components/ehr/AllergyClashBanner";
import InteractionChips from "@/components/ehr/InteractionChips";
import { useRxSafety } from "@/components/cockpit/rx/RxSafetyContext";
import { trackCockpitV2RMiddleSafetyLanded } from "@/lib/patient-profile/telemetry";

export interface SafetyStickyStripProps {
  /** Production mount only — omitted in unit tests so telemetry does not fire. */
  appointmentId?: string;
}

export function SafetyStickyStrip({ appointmentId }: SafetyStickyStripProps) {
  const safety = useRxSafety();
  const {
    visible,
    clashesCount,
    ddiCount,
    matchableMedicines,
    medicineInstanceIds,
    allergies,
    drugMasterIndex,
    ddiInteractions,
    isAcked,
    onAcknowledge,
    onAckDdi,
  } = safety;

  useEffect(() => {
    if (!appointmentId || !visible) return;
    trackCockpitV2RMiddleSafetyLanded({
      appointmentId,
      banner_visible: clashesCount > 0,
      ddi_chip_count: ddiCount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const hasClashes = clashesCount > 0;
  const hasInteractions = ddiCount > 0;

  return (
    <div
      role="region"
      aria-label="Drug safety warnings"
      className="sticky top-0 z-10 flex flex-col gap-2 border-b border-warning/40 bg-warning/15 px-3 py-2"
      data-testid="safety-sticky-strip"
    >
      {hasClashes && (
        <AllergyClashBanner
          medicines={matchableMedicines}
          medicineInstanceIds={medicineInstanceIds}
          allergies={allergies}
          drugMasterIndex={drugMasterIndex}
          isAcked={isAcked}
          onAcknowledge={(keys) => onAcknowledge([...keys])}
        />
      )}
      {hasInteractions && (
        <InteractionChips
          interactions={ddiInteractions}
          drugMasterIndex={drugMasterIndex}
          isAcked={isAcked}
          onAck={onAckDdi}
        />
      )}
    </div>
  );
}
