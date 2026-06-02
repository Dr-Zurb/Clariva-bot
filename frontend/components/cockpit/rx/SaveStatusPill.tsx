"use client";

/**
 * SaveStatus pill wired to `useRxForm()` autosave — shared by PlanActionFooter
 * and legacy PrescriptionForm header mounts.
 *
 * cpv-02: four-state copy + icons (DL-2); no legacy "—" placeholder.
 */
import type { ReactElement } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import type { AutoSaveState } from "@/hooks/useAutoSave";

export type SaveStatusPillUiState = "idle" | "saving" | "saved" | "error";

/** @deprecated Alias for tests referencing task spec name. */
export type SaveStatusUiState = SaveStatusPillUiState;

export interface SaveStatusPillProps {
  className?: string;
  /** Test / story override — skips autosave subscription when set. */
  state?: SaveStatusPillUiState;
  onRetry?: () => void;
}

function mapAutoSaveToUiState(
  state: AutoSaveState,
  isPending: boolean,
): SaveStatusPillUiState {
  if (state === "error") return "error";
  if (state === "saving" || isPending) return "saving";
  if (state === "saved") return "saved";
  return "idle";
}

function getPillContent(state: SaveStatusPillUiState): {
  label: string;
  icon: ReactElement;
  tone: "muted" | "neutral" | "destructive";
} {
  switch (state) {
    case "idle":
      return {
        label: "Autosaving",
        icon: (
          <CheckCircle2
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
        ),
        tone: "muted",
      };
    case "saving":
      return {
        label: "Saving…",
        icon: (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ),
        tone: "neutral",
      };
    case "saved":
      return {
        label: "Saved",
        icon: (
          <CheckCircle2
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
        ),
        tone: "neutral",
      };
    case "error":
      return {
        label: "Save failed — retry",
        icon: (
          <AlertCircle
            className="h-3.5 w-3.5 text-destructive"
            aria-hidden
          />
        ),
        tone: "destructive",
      };
  }
}

export function SaveStatusPill({
  className,
  state: stateOverride,
  onRetry: onRetryOverride,
}: SaveStatusPillProps) {
  const rxForm = useOptionalRxForm();

  let uiState: SaveStatusPillUiState;
  let onRetry: () => void;

  if (stateOverride !== undefined) {
    uiState = stateOverride;
    onRetry = onRetryOverride ?? (() => {});
  } else {
    if (!rxForm) {
      throw new Error(
        "SaveStatusPill must be used inside <RxFormProvider> or with a `state` override.",
      );
    }
    const { state, isPending, retry } = rxForm.autoSave;
    uiState = mapAutoSaveToUiState(state, isPending);
    onRetry = () => {
      void retry();
    };
  }

  const { label, icon, tone } = getPillContent(uiState);
  const toneClass = {
    muted: "text-muted-foreground",
    neutral: "text-foreground",
    destructive: "text-destructive",
  }[tone];

  const baseClassName = `inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs ${toneClass} ${className ?? ""}`;
  const ariaLabel = `Save status: ${label}`;

  if (uiState === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
        className={baseClassName}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={baseClassName}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
