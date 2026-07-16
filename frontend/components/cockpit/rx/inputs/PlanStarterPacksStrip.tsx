"use client";

/**
 * Plan starter-pack chip strip (plan-p3).
 * Presentational — parent applies pack via onApply.
 */

import { PLAN_STARTER_PACKS, type PlanStarterPack } from "@/lib/cockpit/plan-starter-packs";
import { CHART_QUICK_CHIP_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import { cn } from "@/lib/utils";

export interface PlanStarterPacksStripProps {
  disabled?: boolean;
  onApply: (pack: PlanStarterPack) => void;
}

export function PlanStarterPacksStrip({
  disabled = false,
  onApply,
}: PlanStarterPacksStripProps) {
  return (
    <div className="space-y-1" data-testid="plan-starter-packs">
      <p className="text-xs text-muted-foreground">
        Starter packs — one tap for common OPD plans
      </p>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Plan starter packs"
      >
        {PLAN_STARTER_PACKS.map((pack) => (
          <button
            key={pack.id}
            type="button"
            disabled={disabled}
            title={pack.description}
            onClick={() => onApply(pack)}
            className={cn(CHART_QUICK_CHIP_CLASS, "max-w-full")}
          >
            <span className="truncate">+ {pack.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
