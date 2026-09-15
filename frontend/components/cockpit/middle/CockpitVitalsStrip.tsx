"use client";

/**
 * Visit vitals glance. Always mounted — empty visit still shows the Vitals label.
 * Inline variant sits in the context row and jumps to the Objective vitals group.
 */

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  useDeskVisitVitals,
  useDeskVisitVitalsNote,
} from "@/components/cockpit/rx/inputs/useLastVisitVitals";
import {
  formatCockpitVitalsStrip,
  formatCockpitVitalsStripFromDesk,
} from "@/lib/cockpit/vitals-strip";
import { cn } from "@/lib/utils";

function focusVitalsGroup(): void {
  const el =
    document.querySelector<HTMLElement>("[data-testid='vitals-group-core']") ??
    document.querySelector<HTMLElement>("[data-testid='vitals-cluster-row']");
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus();
}

export function CockpitVitalsStrip({
  variant = "band",
}: {
  variant?: "band" | "inline";
}) {
  const { state } = useRxForm();
  const deskGhost = useDeskVisitVitals();
  const deskNote = useDeskVisitVitalsNote();
  const formLine = formatCockpitVitalsStrip(state.fields);
  const deskLine =
    formLine ??
    formatCockpitVitalsStripFromDesk({ ghost: deskGhost, note: deskNote });
  const line = formLine ?? deskLine;
  const inline = variant === "inline";

  return (
    <button
      type="button"
      role="status"
      aria-label="Visit vitals. Click to jump to the vitals fields."
      data-testid="cockpit-vitals-strip"
      title={line ?? "No vitals recorded"}
      onClick={focusVitalsGroup}
      className={cn(
        "flex shrink-0 items-center gap-2 text-xs text-left",
        "transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        inline
          ? "max-w-[min(40%,22rem)] rounded-md px-2 py-1"
          : "h-8 w-full border-b border-border bg-muted/30 px-4 lg:px-6",
      )}
    >
      <span className="shrink-0 font-medium text-muted-foreground">Vitals</span>
      <span
        className={cn(
          "min-w-0 truncate tabular-nums",
          line ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {line ?? "—"}
      </span>
    </button>
  );
}
