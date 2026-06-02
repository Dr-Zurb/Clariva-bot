"use client";

import { useEffect, useState } from "react";
import {
  Columns3,
  Rows2,
  Rows3,
  Search,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaveViewDialog } from "@/components/patients-v2/list/SaveViewDialog";
import { ManageViewsDialog } from "@/components/patients-v2/list/ManageViewsDialog";
import {
  PATIENT_LIST_COLUMN_DEFS,
  type PatientListColumnId,
  type PatientsListDensity,
} from "@/lib/patients-v2/list-preferences";
import { cn } from "@/lib/utils";
import type { PatientSavedView, PatientSegmentId } from "@/types/patient";

const SAVE_CURRENT_VALUE = "__save_current__";
const MANAGE_VIEWS_VALUE = "__manage_views__";
const NO_VIEW_VALUE = "__no_view__";

const SEGMENT_CHIPS: ReadonlyArray<{ id: PatientSegmentId; label: string }> = [
  { id: "active-90d", label: "Active (90d)" },
  { id: "new-30d", label: "New this month" },
  { id: "at-risk-followup", label: "Follow-up overdue" },
  { id: "no-show-prone", label: "No-show prone" },
  { id: "has-allergies", label: "Has allergies" },
  { id: "has-open-episodes", label: "Open episodes" },
  { id: "untagged", label: "Untagged" },
];

export interface PatientsToolbarProps {
  q: string;
  onQChange: (next: string) => void;
  activeSegment: PatientSegmentId | null;
  onSegmentToggle: (segment: PatientSegmentId) => void;
  savedViews: PatientSavedView[];
  activeViewId: string | null;
  onViewSelect: (view: PatientSavedView) => void;
  onSaveView: (name: string, setAsDefault: boolean) => Promise<void>;
  onRenameView: (id: string, newName: string) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
  onSetDefaultView: (id: string) => Promise<void>;
  nextEvictionTarget: PatientSavedView | null;
  density: PatientsListDensity;
  onDensityChange: (density: PatientsListDensity) => void;
  columns: PatientListColumnId[];
  onColumnsChange: (columns: PatientListColumnId[]) => void;
  /** When ≥ 1, replaces the right-side controls (pr-07 bulk bar). */
  selectedCount?: number;
  bulkActionsSlot?: React.ReactNode;
  /** Duplicates chip (pr-08); rendered between saved views and density. */
  duplicatesSlot?: React.ReactNode;
}

export function PatientsToolbar({
  q,
  onQChange,
  activeSegment,
  onSegmentToggle,
  savedViews,
  activeViewId,
  onViewSelect,
  onSaveView,
  onRenameView,
  onDeleteView,
  onSetDefaultView,
  nextEvictionTarget,
  density,
  onDensityChange,
  columns,
  onColumnsChange,
  selectedCount = 0,
  bulkActionsSlot,
  duplicatesSlot,
}: PatientsToolbarProps) {
  const [draftQ, setDraftQ] = useState(q);
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  useEffect(() => {
    setDraftQ(q);
  }, [q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (draftQ !== q) onQChange(draftQ);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [draftQ, q, onQChange]);

  const showBulkBar = selectedCount >= 1 && bulkActionsSlot != null;

  const handleViewSelect = (value: string) => {
    if (value === SAVE_CURRENT_VALUE) {
      setSaveOpen(true);
      return;
    }
    if (value === MANAGE_VIEWS_VALUE) {
      setManageOpen(true);
      return;
    }
    if (value === NO_VIEW_VALUE) return;
    const view = savedViews.find((v) => v.id === value);
    if (view) onViewSelect(view);
  };

  const toggleColumn = (columnId: PatientListColumnId, checked: boolean) => {
    if (checked) {
      if (!columns.includes(columnId)) {
        onColumnsChange([...columns, columnId]);
      }
      return;
    }
    if (columns.length <= 1) return;
    onColumnsChange(columns.filter((c) => c !== columnId));
  };

  const selectValue = activeViewId ?? NO_VIEW_VALUE;
  const activeViewName = savedViews.find((v) => v.id === activeViewId)?.name;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Search by name, MRN, phone, or IG handle…"
            className="pl-8"
            aria-label="Search patients"
          />
        </div>

        {showBulkBar ? (
          <div className="flex flex-wrap items-center justify-end gap-2">{bulkActionsSlot}</div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select value={selectValue} onValueChange={handleViewSelect}>
              <SelectTrigger className="w-[min(100%,14rem)]" aria-label="Saved views">
                <SelectValue placeholder="Saved views">
                  {activeViewName ?? "Saved views"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {savedViews.map((view) => (
                  <SelectItem key={view.id} value={view.id}>
                    <span className="flex items-center gap-1.5">
                      {view.is_default ? (
                        <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden />
                      ) : null}
                      {view.name}
                    </span>
                  </SelectItem>
                ))}
                {savedViews.length > 0 ? <SelectSeparator /> : null}
                <SelectItem value={SAVE_CURRENT_VALUE}>Save current view…</SelectItem>
                <SelectItem value={MANAGE_VIEWS_VALUE}>Manage views…</SelectItem>
              </SelectContent>
            </Select>

            {duplicatesSlot}

            <div
              className="inline-flex rounded-md border border-input p-0.5"
              role="group"
              aria-label="Table density"
            >
              <Button
                type="button"
                variant={density === "compact" ? "default" : "ghost"}
                size="sm"
                className="h-8 px-2"
                onClick={() => onDensityChange("compact")}
                aria-pressed={density === "compact"}
                aria-label="Compact density"
              >
                <Rows3 className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant={density === "comfortable" ? "default" : "ghost"}
                size="sm"
                className="h-8 px-2"
                onClick={() => onDensityChange("comfortable")}
                aria-pressed={density === "comfortable"}
                aria-label="Comfortable density"
              >
                <Rows2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" aria-label="Choose columns">
                  <Columns3 className="h-4 w-4" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-3">
                <p className="mb-2 text-sm font-medium">Columns</p>
                <ul className="space-y-2">
                  {PATIENT_LIST_COLUMN_DEFS.map((col) => {
                    const checked = columns.includes(col.id);
                    return (
                      <li key={col.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={checked && columns.length <= 1}
                            onChange={(e) => toggleColumn(col.id, e.target.checked)}
                            className="h-4 w-4 rounded border border-input"
                          />
                          {col.label}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Patient segments"
        className="flex gap-1 overflow-x-auto pb-0.5"
      >
        {SEGMENT_CHIPS.map((chip) => {
          const isActive = activeSegment === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-pressed={isActive}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
              onClick={() => onSegmentToggle(chip.id)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <SaveViewDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSave={onSaveView}
        nextEvictionTarget={nextEvictionTarget}
      />
      <ManageViewsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        views={savedViews}
        onRename={onRenameView}
        onDelete={onDeleteView}
        onSetDefault={onSetDefaultView}
      />
    </div>
  );
}
