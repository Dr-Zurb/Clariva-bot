"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { bulkTagPatients } from "@/lib/api/patients";
import { exportPatientsCsv } from "@/lib/patients-v2/list-utils";
import { trackPatientsV2BulkAction } from "@/lib/patients-v2/telemetry";
import type { PatientSummary } from "@/types/patient";

export interface BulkActionsBarProps {
  selectedCount: number;
  selectedPatients: PatientSummary[];
  token: string;
  onClear: () => void;
  onTagged?: () => void;
}

export function BulkActionsBar({
  selectedCount,
  selectedPatients,
  token,
  onClear,
  onTagged,
}: BulkActionsBarProps) {
  const [tagOpen, setTagOpen] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [tagging, setTagging] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  const handleExport = () => {
    exportPatientsCsv(selectedPatients);
    trackPatientsV2BulkAction("export_csv", selectedCount);
  };

  const handleApplyTag = async () => {
    setTagging(true);
    setTagError(null);
    try {
      await bulkTagPatients(
        token,
        selectedPatients.map((p) => p.id),
        tagValue.trim() || null,
      );
      trackPatientsV2BulkAction("tag", selectedCount);
      setTagOpen(false);
      setTagValue("");
      onTagged?.();
    } catch (e) {
      setTagError(e instanceof Error ? e.message : "Failed to apply tag");
    } finally {
      setTagging(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span className="text-muted-foreground">
        {selectedCount} selected ·{" "}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={onClear}
        >
          Clear
        </button>
      </span>
      <Button type="button" variant="outline" size="sm" onClick={handleExport}>
        Export CSV
      </Button>
      <Popover open={tagOpen} onOpenChange={setTagOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            Tag…
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 space-y-2">
          <Input
            placeholder="Tag (e.g. VIP)"
            value={tagValue}
            onChange={(e) => setTagValue(e.target.value)}
            maxLength={64}
          />
          {tagError ? (
            <p className="text-xs text-destructive">{tagError}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={tagging}
            onClick={() => void handleApplyTag()}
          >
            {tagging ? "Applying…" : "Apply"}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
