"use client";

import { useCallback, useRef } from "react";
import {
  Activity,
  AlertCircle,
  CopyCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiTile } from "@/components/patients-v2/list/KpiTile";
import type { PatientSegmentId, PatientsKpis } from "@/types/patient";
import { cn } from "@/lib/utils";

export interface PatientsKpiStripProps {
  kpis: PatientsKpis | null;
  error: string | null;
  activeSegment: PatientSegmentId | null;
  onSegmentSelect: (segment: PatientSegmentId) => void;
  onDuplicatesOpen?: () => void;
  /** When set, overrides KPI `possible_duplicates.count` (pr-08 chip source of truth). */
  possibleDuplicatesCount?: number;
  onRetry?: () => void;
}

type TileSeverity = "default" | "attention";

interface SegmentTileDef {
  kind: "segment";
  id: PatientSegmentId;
  label: string;
  icon: React.ReactNode;
  severity: TileSeverity;
  extract: (k: PatientsKpis) => { count: number; delta7d: number };
}

interface DuplicatesTileDef {
  kind: "duplicates";
  label: string;
  icon: React.ReactNode;
  severity: TileSeverity;
  extract: (k: PatientsKpis) => { count: number; delta7d: number };
}

type TileDef = SegmentTileDef | DuplicatesTileDef;

const TILES: ReadonlyArray<TileDef> = [
  {
    kind: "segment",
    id: "active-90d",
    label: "Active (90d)",
    icon: <Users aria-hidden />,
    severity: "default",
    extract: (k) => ({ count: k.active_90d.count, delta7d: k.active_90d.delta_7d }),
  },
  {
    kind: "segment",
    id: "new-30d",
    label: "New this month",
    icon: <UserPlus aria-hidden />,
    severity: "default",
    extract: (k) => ({ count: k.new_30d.count, delta7d: k.new_30d.delta_7d }),
  },
  {
    kind: "segment",
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
    kind: "segment",
    id: "has-open-episodes",
    label: "Open episodes",
    icon: <Activity aria-hidden />,
    severity: "default",
    extract: (k) => ({
      count: k.open_episodes.count,
      delta7d: k.open_episodes.delta_7d,
    }),
  },
  {
    kind: "duplicates",
    label: "Possible duplicates",
    icon: <CopyCheck aria-hidden />,
    severity: "attention",
    extract: (k) => ({
      count: k.possible_duplicates.count,
      delta7d: k.possible_duplicates.delta_7d,
    }),
  },
];

export function PatientsKpiStrip({
  kpis,
  error,
  activeSegment,
  onSegmentSelect,
  onDuplicatesOpen,
  possibleDuplicatesCount,
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
        className="grid grid-cols-2 gap-3 md:grid-cols-5"
        onKeyDown={handleKeyDown}
      >
        {TILES.map((tile, index) => {
          const isDuplicates = tile.kind === "duplicates";
          const extracted = kpis !== null ? tile.extract(kpis) : null;
          const tileCount = isLoading
            ? null
            : isMuted
              ? 0
              : isDuplicates && possibleDuplicatesCount !== undefined
                ? possibleDuplicatesCount
                : (extracted?.count ?? 0);
          const tileDelta = isLoading ? null : isMuted ? 0 : (extracted?.delta7d ?? 0);
          const isActive = tile.kind === "segment" && activeSegment === tile.id;

          const handleClick = isDuplicates
            ? onDuplicatesOpen
            : tile.kind === "segment"
              ? () => onSegmentSelect(tile.id)
              : undefined;

          return (
            <div
              key={isDuplicates ? "duplicates" : tile.id}
              className={cn(index === 4 && "col-span-2 md:col-span-1")}
            >
              <KpiTile
                ref={(el) => {
                  tileRefs.current[index] = el;
                }}
                label={tile.label}
                count={tileCount}
                delta7d={tileDelta}
                icon={tile.icon}
                severity={tile.severity}
                isActive={isActive}
                muted={isMuted}
                onClick={handleClick}
              />
            </div>
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
