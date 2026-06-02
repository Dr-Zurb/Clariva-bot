"use client";

import { type Ref } from "react";
import PaneHeader from "@/components/patient-profile/PaneHeader";
import ConsultationLauncher, {
  type ConsultationLauncherHandle,
} from "@/components/consultation/ConsultationLauncher";
import { type CockpitState } from "@/lib/patient-profile/state";
import type { Appointment } from "@/types/appointment";
import CenterPane from "./internal/CenterPane";

export interface ConsultationBodyPaneProps {
  state: CockpitState;
  appointment: Appointment;
  token: string;
  launcherRef: Ref<ConsultationLauncherHandle>;
  onRxSent?: () => void;
  onMarkNoShow?: () => void;
  /**
   * Render the pane WITHOUT its own header. Set when the shell
   * (`PatientProfileShell`) already renders a column header on top of
   * the pane and the pane's responsibility is just the body content.
   * Defaults to `false`.
   */
  hideHeader?: boolean;
}

/**
 * The Consultation column body — state-driven center pane that hosts the
 * lobby card, the consultation launcher, the live room, the wrap-up card,
 * the ended card, or the terminal card depending on `state`.
 *
 * Extracted from `ConsultationCockpit.tsx`'s inline `BodyColumnContent`
 * function in ppr-04. v1 shell (`ConsultationCockpit`) removed by ppr-14;
 * v1 header-slot props (`onCollapse`, `isCollapsible`, `slotIndex`,
 * `dragHandle`, `headerLeadingExtra`, `headerTrailingExtra`) removed here.
 */
export default function ConsultationBodyPane({
  state,
  appointment,
  token,
  launcherRef,
  onRxSent,
  onMarkNoShow,
  hideHeader = false,
}: ConsultationBodyPaneProps): JSX.Element {
  if (hideHeader) {
    return (
      <CenterPane
        state={state}
        appointment={appointment}
        token={token}
        launcherRef={launcherRef}
        onRxSent={onRxSent}
        onMarkNoShow={onMarkNoShow}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PaneHeader title="Consultation" titleId="cockpit-body-title" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CenterPane
          state={state}
          appointment={appointment}
          token={token}
          launcherRef={launcherRef}
          onRxSent={onRxSent}
          onMarkNoShow={onMarkNoShow}
        />
      </div>
    </div>
  );
}
