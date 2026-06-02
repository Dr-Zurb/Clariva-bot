"use client";

import { useCallback, useState } from "react";
import { AlertTriangle } from "lucide-react";
import MergePatientsModal from "@/components/patients-v2/shared/MergePatientsModal";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { trackPatientsV2DuplicatesPopoverOpened } from "@/lib/patients-v2/telemetry";
import type { DuplicateGroupPatient } from "@/types/patient";

export interface DuplicatesCollapsedChipProps {
  duplicateGroups: DuplicateGroupPatient[][];
  onMerged: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Same copy as v1 `PatientsListWithFilters` duplicates banner. */
function matchTypeLabel(): string {
  return "matched on phone";
}

function DuplicatesPopoverContent({
  groups,
  onMergeClick,
}: {
  groups: DuplicateGroupPatient[][];
  onMergeClick: (group: DuplicateGroupPatient[]) => void;
}) {
  return (
    <div className="max-h-80 space-y-3 overflow-y-auto">
      {groups.map((group, idx) => (
        <div
          key={group.map((p) => p.id).join("-") || String(idx)}
          className="border-b border-border pb-2 last:border-0"
        >
          <p className="text-sm font-medium">
            {group.map((p) => p.name).join(" • ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {group.length} entries — {matchTypeLabel()}
          </p>
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto px-0"
            onClick={() => onMergeClick(group)}
          >
            Merge
          </Button>
        </div>
      ))}
    </div>
  );
}

export function DuplicatesCollapsedChip({
  duplicateGroups,
  onMerged,
  open: controlledOpen,
  onOpenChange,
}: DuplicatesCollapsedChipProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroupPatient[] | null>(
    null,
  );

  const popoverOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setPopoverOpen = onOpenChange ?? setInternalOpen;

  const count = duplicateGroups.length;
  const showChip = count > 0;

  const handleMergeSuccess = useCallback(() => {
    setMergeGroup(null);
    onMerged();
    if (count <= 1) {
      setPopoverOpen(false);
    }
  }, [count, onMerged, setPopoverOpen]);

  if (!showChip && !popoverOpen) {
    return null;
  }

  const handleOpenChange = (next: boolean) => {
    if (next) {
      trackPatientsV2DuplicatesPopoverOpened();
    }
    setPopoverOpen(next);
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
        {showChip ? (
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-amber-700 border-amber-200"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {count} possible duplicate{count === 1 ? "" : "s"}
            </Button>
          </PopoverTrigger>
        ) : (
          <PopoverAnchor asChild>
            <span className="sr-only">Possible duplicates</span>
          </PopoverAnchor>
        )}
        <PopoverContent align="end" className="w-80">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground">
              No possible duplicates right now.
            </p>
          ) : (
            <DuplicatesPopoverContent
              groups={duplicateGroups}
              onMergeClick={setMergeGroup}
            />
          )}
        </PopoverContent>
      </Popover>

      {mergeGroup ? (
        <MergePatientsModal
          group={mergeGroup}
          onClose={() => setMergeGroup(null)}
          onSuccess={handleMergeSuccess}
        />
      ) : null}
    </>
  );
}
