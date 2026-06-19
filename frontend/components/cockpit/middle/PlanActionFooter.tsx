"use client";

/**
 * PlanActionFooter — cockpit shell footer for whole-Rx commit actions.
 *
 * Hosts SaveStatus (left) and cockpit-level actions (right): Preview as patient
 * and Send Rx & finish. Actions are owned by `CockpitRxActionDock` /
 * `useRxCommitActions` at the page root — not the Plan pane lifecycle.
 *
 * @see frontend/components/cockpit/rx/CockpitRxActionDock.tsx
 * @see frontend/components/cockpit/rx/useRxCommitActions.ts
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
  appointmentId?: string;
  onSendAndFinish?: () => void;
  onPreview?: () => void;
  previewLoading?: boolean;
  finishBusy?: boolean;
  finishSending?: boolean;
  sending?: boolean;
  commitError?: string | null;
  commitSuccess?: string | null;
}

export function PlanActionFooter({
  state,
  appointmentId,
  onSendAndFinish,
  onPreview,
  previewLoading = false,
  finishBusy = false,
  finishSending,
  sending,
  commitError,
  commitSuccess,
}: PlanActionFooterProps) {
  const registeredActions = useRxFormActions();
  const canSend = canSendPrescription(state);

  const handleSendAndFinish =
    onSendAndFinish ?? registeredActions?.sendAndFinish;
  const handlePreview =
    onPreview ?? registeredActions?.openPreview;
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

  const statusMessage = commitError ?? commitSuccess;

  const footerBtnClass =
    "inline-flex h-9 items-center justify-center rounded-md px-3.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1";

  return (
    <div
      role="region"
      aria-label="Prescription actions"
      className="sticky bottom-0 z-10 flex w-full shrink-0 items-center justify-between gap-3 border-t bg-card px-4 py-2"
      data-testid="plan-action-footer"
    >
      <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2">
        <SaveStatusPill className="shrink-0" />
        {statusMessage ? (
          <p
            role={commitError ? "alert" : "status"}
            aria-live="polite"
            className={`min-w-0 truncate text-xs leading-tight ${
              commitError ? "text-destructive" : "text-green-700"
            }`}
          >
            {statusMessage}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {handlePreview ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={isSending || previewLoading}
                  className={`${footerBtnClass} border border-primary bg-card text-primary hover:bg-primary/5 disabled:opacity-50`}
                  title="See how this prescription will look to the patient"
                >
                  {previewLoading ? "Loading…" : "Preview as patient"}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Preview as patient{" "}
                <kbd className="ml-2 rounded border bg-background/20 px-1.5 py-0.5 text-xs">
                  {modShortcutHint("P", { shift: true })}
                </kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {canSend && handleSendAndFinish ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <SendRxFinishButton
                  onClick={handleSendAndFinish}
                  disabled={finishBusy || isSending}
                  sending={isFinishSending}
                  compact
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
        ) : null}
      </div>
    </div>
  );
}
