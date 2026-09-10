"use client";

import type { Ref } from "react";
import { User } from "lucide-react";
import ConsultationLauncher, {
  type ConsultationLauncherHandle,
} from "@/components/consultation/ConsultationLauncher";
import EndedCard from "@/components/consultation/cockpit/EndedCard";
import ReadyCard from "@/components/consultation/cockpit/ReadyCard";
import TerminalCard from "@/components/consultation/cockpit/TerminalCard";
import { type CockpitState } from "@/lib/patient-profile/state";
import type { Appointment } from "@/types/appointment";

interface CenterPaneProps {
  state: CockpitState;
  appointment: Appointment;
  token: string;
  /** Forwarded to `ConsultationLauncher` for imperative `start(modality)` access. */
  launcherRef?: Ref<ConsultationLauncherHandle>;
  /** Fired after a successful Send Rx — used by ConsultationCockpit for auto wrap-up trigger. */
  onRxSent?: () => void;
  /** Forwarded to `ConsultationLauncher` (live state) for in-call "Mark no-show". */
  onMarkNoShow?: () => void | Promise<void>;
}

/**
 * Whether `ConsultationLauncher` should be mounted. Keeps the launcher in
 * the tree (preserving its in-memory `liveSession` / `textSession`) for
 * the pre-call and live states; unmounts it (GC-ing those records) once
 * the consult is over or the appointment is terminal.
 */
function shouldMountLauncher(state: CockpitState): boolean {
  return state === "ready" || state === "lobby" || state === "live";
}

/**
 * State-driven center pane. Renders exactly one of five surfaces based on
 * the derived `CockpitState`:
 *
 *   - `ready`    → `<ReadyCard>` — modality launcher + scheduling summary.
 *   - `lobby`    → `<ReadyCard showLobbyBanner>` — same card with "Waiting
 *                  for patient / Resend link" banner.
 *   - `live`     → `<ConsultationLauncher>` directly — the launcher renders
 *                  its own `<LiveConsultPanel>` + room once `liveSession` /
 *                  `textSession` is set in its in-memory state. On refresh
 *                  the `existingProviderSessionId` / `existingTextSessionId`
 *                  rehydrate effects fire and restore the room without a
 *                  user click.
 *   - `ended`    → `<EndedCard>` — post-call summary, artifacts, chat link.
 *   - `terminal` → `<TerminalCard>` — cancelled / no-show empty state.
 *
 * `ConsultationLauncher` is always mounted via `ReadyCard` for `ready` /
 * `lobby`, and directly for `live`. Do NOT add a `key` prop keyed on state
 * — that would defeat the launcher's rehydrate effects.
 *
 * cs-07 layout note: this component returns the raw state pane without
 * any layout chrome. On lg+ the parent column is `overflow-y-auto` with
 * fixed height, so live consult rooms (Video/Voice/Text) get a proper
 * `h-full` parent to size against. State panes that should fill the
 * column (live, ended, terminal) use `h-full`; `ready` / `lobby`
 * naturally take their content height and scroll within the column.
 *
 * Extracted from `ConsultationCockpit.tsx` in ppr-04 as an internal
 * helper of `ConsultationBodyPane`. Lives in `panes/internal/` to limit
 * its blast radius — only `ConsultationBodyPane` imports it.
 */
export default function CenterPane({
  state,
  appointment,
  token,
  launcherRef,
  onRxSent,
  onMarkNoShow,
}: CenterPaneProps) {
  // Launcher is NOT mounted once the consult ends — `ended` / `terminal`
  // show read-only surfaces and there is nothing for the launcher to do.
  if (!shouldMountLauncher(state)) {
    if (state === "ended" || state === "wrap_up") {
      return <EndedCard appointment={appointment} token={token} />;
    }
    // terminal
    return <TerminalCard />;
  }

  const isInClinicPhysical =
    appointment.consultation_type === "in_clinic" &&
    !appointment.consultation_session;

  // Launcher-mounted states (ready / lobby / live).
  if (state === "live" && isInClinicPhysical) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center px-4 py-6">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col items-center gap-3 bg-gradient-to-b from-muted/40 to-card px-6 pb-5 pt-6">
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
              In clinic
            </span>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted text-foreground shadow-sm">
              <User className="h-7 w-7" aria-hidden />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Visit in progress
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Write notes and send the Rx, then tap Done.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === "live") {
    // The launcher owns its own session state. It renders <LiveConsultPanel>
    // + the appropriate room once liveSession / textSession is set. Mounting
    // it directly (not inside ReadyCard) means a page-refresh-while-live
    // lands here and the rehydrate effects restore the room automatically.
    //
    // Cockpit Rx-redesign: forward `onMarkNoShow` through the launcher so
    // <VideoRoom>/<VoiceConsultRoom> can mount the destructive Mark
    // no-show button next to "Leave call". CP-D5: TextConsultRoom now also
    // mounts the button above its composer bar for text-consult parity.
    // h-full chain is required so VideoRoom's stage can flex-fill; without
    // it absolute/flex children collapse and controls stack on the header.
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ConsultationLauncher
          ref={launcherRef}
          appointment={appointment}
          token={token}
          onRxSent={onRxSent}
          onMarkNoShow={onMarkNoShow}
          // Never flash the legacy 3-button grid while rehydrating a live
          // session — ReadyCard owns Start; here we only wait for the room.
          hidePrecallUI
          showConnectingWhileHidden
        />
      </div>
    );
  }

  // ready or lobby — ReadyCard wraps the launcher + scheduling summary.
  // The lobby banner is toggled by the `showLobbyBanner` prop.
  // cs-10: onMarkNoShow is no longer forwarded to ReadyCard — it was
  // removed from ReadyCard's public surface. The action is available
  // via the kebab menu (cs-02) and the `m` hotkey.
  return (
    <ReadyCard
      appointment={appointment}
      token={token}
      showLobbyBanner={state === "lobby"}
      launcherRef={launcherRef}
    />
  );
}
