"use client";

import { useCallback, useRef } from "react";
import {
  AlertCircle,
  CalendarClock,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiTile } from "@/components/patients-v2/list/KpiTile";
import type { PatientSegmentId, PatientsKpis } from "@/types/patient";

export interface PatientsKpiStripProps {
  kpis: PatientsKpis | null;
  error: string | null;
  activeSegment: PatientSegmentId | null;
  onSegmentSelect: (segment: PatientSegmentId) => void;
  /** Prefetch list for a segment on hover/focus (cache warm-up). */
  onSegmentPrefetch?: (segment: PatientSegmentId | null) => void;
  onRetry?: () => void;
}

type TileSeverity = "default" | "attention";

interface SegmentTileDef {
  id: PatientSegmentId;
  label: string;
  icon: React.ReactNode;
  severity: TileSeverity;
  extract: (k: PatientsKpis) => { count: number; delta7d: number };
}

/** Doctor worklist KPIs (PKD-D1) — order locked. */
const TILES: ReadonlyArray<SegmentTileDef> = [
  {
    id: "incomplete-consult",
    label: "Incomplete consults",
    icon: <CalendarClock aria-hidden />,
    severity: "attention",
    extract: (k) => ({
      count: k.incomplete_consults.count,
      delta7d: k.incomplete_consults.delta_7d,
    }),
  },
  {
    id: "at-risk-followup",
    label: "Follow-up overdue",
    icon: <AlertCircle aria-hidden />,
    severity: "attention",
    extract: (k) => ({
      count: k.followup_overdue.count,
      delta7d: k.followup_overdue.delta_7d,
    }),
  },
  {
    id: "new-30d",
    label: "New (30d)",
    icon: <UserPlus aria-hidden />,
    severity: "default",
    extract: (k) => ({ count: k.new_30d.count, delta7d: k.new_30d.delta_7d }),
  },
  {
    id: "revisit-30d",
    label: "Revisits (30d)",
    icon: <RotateCcw aria-hidden />,
    severity: "default",
    extract: (k) => ({
      count: k.revisits_30d.count,
      delta7d: k.revisits_30d.delta_7d,
    }),
  },
];

export function PatientsKpiStrip({
  kpis,
  error,
  activeSegment,
  onSegmentSelect,
  onSegmentPrefetch,
  onRetry,
}: PatientsKpiStripProps) {
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isLoading = kpis === null && error === null;
  const isMuted = error !== null;

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const buttons = tileRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    if (buttons.length === 0) return;
    const idx = buttons.findIndex((b) => b === document.activeElement);
    const next =
      e.key === "ArrowRight"
        ? (idx + 1) % buttons.length
        : (idx - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }, []);

  return (
    <div className="space-y-2">
      <nav
        role="tablist"
        aria-label="Patient list KPI filters"
        className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3"
        onKeyDown={handleKeyDown}
      >
        {TILES.map((tile, index) => {
          const extracted = kpis !== null ? tile.extract(kpis) : null;
          const tileCount = isLoading ? null : isMuted ? 0 : (extracted?.count ?? 0);
          const tileDelta = isLoading ? null : isMuted ? 0 : (extracted?.delta7d ?? 0);
          const isActive = activeSegment === tile.id;
          const severity =
            tile.severity === "attention" && (tileCount ?? 0) > 0
              ? "attention"
              : "default";

          return (
            <KpiTile
              key={tile.id}
              ref={(el) => {
                tileRefs.current[index] = el;
              }}
              label={tile.label}
              count={tileCount}
              delta7d={tileDelta}
              icon={tile.icon}
              severity={severity}
              isActive={isActive}
              muted={isMuted}
              onClick={() => onSegmentSelect(tile.id)}
              onPrefetch={() => onSegmentPrefetch?.(tile.id)}
            />
          );
        })}
      </nav>

      {error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{error}</span>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
