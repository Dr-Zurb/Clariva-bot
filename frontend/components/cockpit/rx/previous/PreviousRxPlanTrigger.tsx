"use client";

import { useSideSheet } from "@/components/patient-profile/SideSheetHost";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePriorRxList } from "@/hooks/usePriorRxList";
import { cn } from "@/lib/utils";

export interface PreviousRxPlanTriggerProps {
  token: string;
}

/**
 * Plan-zone chip that opens the previous-Rx side sheet (rxss-03).
 * Cockpit mounts use this instead of `<PreviousRxPopover>` (DL-1).
 */
export function PreviousRxPlanTrigger({ token }: PreviousRxPlanTriggerProps) {
  const sideSheet = useSideSheet();
  const rxForm = useOptionalRxForm();
  const patientId = rxForm?.patientId ?? null;
  const currentDx = rxForm?.state.fields.provisionalDiagnosis ?? "";

  const { all, isLoading } = usePriorRxList({
    patientId,
    token,
    chip: "all",
    search: "",
    currentDx,
    activeConditions: [],
  });

  if (!patientId) return null;

  const count = all.length;

  return (
    <button
      type="button"
      onClick={() => sideSheet.open("previous-rx")}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border bg-background",
        "px-3 py-1 text-xs font-medium text-foreground hover:bg-muted",
      )}
      data-testid="previous-rx-plan-trigger"
      aria-label={`Open previous prescriptions, ${count} total`}
    >
      {isLoading ? "Previous Rx…" : `Previous Rx (${count})`}
    </button>
  );
}
