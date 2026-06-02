"use client";

/**
 * PlanActionFooter — sticky-bottom overlay inside the bottom-row of the
 * cockpit-v2 middle column. Hosts the SaveStatus pill (left) and the
 * primary `[Send Rx & finish ▸]` button (right). Source plan DL-1 + DL-20:
 * spans both Investigations + Plan sub-columns; pinned during scroll so
 * the Send button is always reachable.
 *
 * Save mechanism unchanged from cv2-05's RxFormContext autosave (1.5s
 * debounce). No `[Save]` button — DL-4 reaffirmed (source plan §4 ASCII
 * `[Save]` slot is the SaveStatus pill, not a manual flush control).
 *
 * Visibility gated by `canSendPrescription(state)`:
 *   - terminal → entire footer hides (no Send to issue).
 *   - ready / lobby → Send hidden (consult not in flight); pill visible.
 *   - live / wrap_up / ended → Send enabled when bridge wired.
 *
 * Send click delegates to PrescriptionForm via `RxFormActionsContext`
 * (registered when RxPane passes `actionsInFooter`). Tests may pass
 * `onSendAndFinish` directly.
 *
 * @see frontend/components/cockpit/rx/RxFormContext.tsx — autosave source.
 * @see frontend/components/cockpit/rx/SendRxFinishButton.tsx
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/
 *      Tasks/task-cmr-03-plan-action-footer.md
 */

import { useEffect } from "react";
import { SaveStatusPill } from "@/components/cockpit/rx/SaveStatusPill";
import { SendRxFinishButton } from "@/components/cockpit/rx/SendRxFinishButton";
import { useRxFormActions } from "@/components/cockpit/rx/RxFormActionsContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { modShortcutHint } from "@/lib/patient-profile/keyboard-shortcuts";
import { canSendPrescription, type CockpitState } from "@/lib/patient-profile/state";
import { trackCockpitV2RMiddleFooterLanded } from "@/lib/patient-profile/telemetry";

export interface PlanActionFooterProps {
  state: CockpitState;
  /** Production mount only — omitted in unit tests so telemetry does not fire. */
  appointmentId?: string;
  /** Test override when the actions bridge is not mounted. */
  onSendAndFinish?: () => void;
  /** True while finish-visit RPC is in flight (from TelemedVideoContext). */
  finishBusy?: boolean;
  /** Test override for in-flight send+finish state. */
  finishSending?: boolean;
  /** Test override for any save/send in flight. */
  sending?: boolean;
}

export function PlanActionFooter({
  state,
  appointmentId,
  onSendAndFinish,
  finishBusy = false,
  finishSending,
  sending,
}: PlanActionFooterProps) {
  const registeredActions = useRxFormActions();
  const canSend = canSendPrescription(state);

  const handleSendAndFinish =
    onSendAndFinish ?? registeredActions?.sendAndFinish;
  const isFinishSending =
    finishSending ?? registeredActions?.finishSending ?? false;
  const isSending = sending ?? registeredActions?.sending ?? false;

  useEffect(() => {
    if (!appointmentId) return;
    trackCockpitV2RMiddleFooterLanded({
      appointmentId,
      canSend,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "terminal") return null;

  return (
    <div
      role="region"
      aria-label="Prescription actions"
      className="sticky bottom-0 z-10 flex h-[56px] w-full shrink-0 items-center justify-between gap-3 border-t bg-card px-4 py-2"
      data-testid="plan-action-footer"
    >
      <SaveStatusPill />
      {canSend && handleSendAndFinish && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SendRxFinishButton
                onClick={handleSendAndFinish}
                disabled={finishBusy || isSending}
                sending={isFinishSending}
              />
            </TooltipTrigger>
            <TooltipContent>
              Send Rx &amp; finish{" "}
              <kbd className="ml-2 rounded border bg-background/20 px-1.5 py-0.5 text-xs">
                {modShortcutHint("Enter")}
              </kbd>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
