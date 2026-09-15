"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CHART_COMPACT_INPUT_CLASS, chartOptionChipClass } from "@/components/ehr/chart/chart-chip-styles";
import type { LabExtractSource } from "@/lib/api/lab-extract";
import {
  type LabExtractCandidate,
  type LabExtractFlag,
} from "@/lib/cockpit/lab-extract-match";
import { cn } from "@/lib/utils";

const FLAG_LABEL: Record<LabExtractFlag, string> = {
  unmatched_name: "Unmatched",
  unit_mismatch: "Unit",
  range_mismatch: "Range",
  non_numeric_value: "Value",
  malformed_value: "Format",
};

export interface LabExtractVerifyGroup {
  attachmentId: string;
  sourceLabel: string;
  pageCount: number;
  skippedPageCount: number;
  candidates: LabExtractCandidate[];
  /** Which reader produced these rows (rpt-05.6). */
  source: LabExtractSource;
  /** Signed URL for the source photo; only set for `vision` groups. */
  previewUrl: string | null;
}

export interface LabExtractConfirmRow extends LabExtractCandidate {
  attachmentId: string;
  sourceLabel: string;
  reportDate: string;
}

interface DraftRow {
  key: string;
  attachmentId: string;
  sourceLabel: string;
  checked: boolean;
  name: string;
  value: string;
  unit: string;
  candidate: LabExtractCandidate;
}

function toDrafts(groups: readonly LabExtractVerifyGroup[]): DraftRow[] {
  return groups.flatMap((group) =>
    group.candidates.map((candidate, index) => ({
      key: `${group.attachmentId}-${candidate.raw.pageIndex}-${index}-${candidate.raw.rawName}`,
      attachmentId: group.attachmentId,
      sourceLabel: group.sourceLabel,
      checked: true,
      name: candidate.name,
      value: candidate.value ?? "",
      unit: candidate.unit ?? "",
      candidate,
    })),
  );
}

function seedDates(
  groups: readonly LabExtractVerifyGroup[],
  defaultDate: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const group of groups) next[group.attachmentId] = defaultDate;
  return next;
}

/** Short chip label from a scan filename. `02_LFT_Test_Report.pdf` → `LFT`. */
export function shortReportLabel(filename: string): string {
  let label = filename.replace(/\.[^.]+$/, "");
  label = label.replace(/^\d+[_\-\s]+/, "");
  label = label.replace(/[_\-\s]*test[_\-\s]*report$/i, "");
  label = label.replace(/[_\-\s]*report$/i, "");
  label = label.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return label || filename;
}

export interface LabExtractVerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly LabExtractVerifyGroup[];
  reportDate: string;
  busy?: boolean;
  onConfirm: (selected: LabExtractConfirmRow[]) => void;
}

export function LabExtractVerifyDialog({
  open,
  onOpenChange,
  groups,
  reportDate,
  busy = false,
  onConfirm,
}: LabExtractVerifyDialogProps) {
  const [drafts, setDrafts] = useState<DraftRow[]>(() => toDrafts(groups));
  const [dates, setDates] = useState<Record<string, string>>(() => seedDates(groups, reportDate));
  const [activeId, setActiveId] = useState(groups[0]?.attachmentId ?? "");

  useEffect(() => {
    if (!open) return;
    setDrafts(toDrafts(groups));
    setDates(seedDates(groups, reportDate));
    setActiveId(groups[0]?.attachmentId ?? "");
  }, [open, groups, reportDate]);

  const selectedCount = useMemo(() => drafts.filter((row) => row.checked).length, [drafts]);
  const activeGroup = groups.find((group) => group.attachmentId === activeId) ?? groups[0];
  const tabDrafts = useMemo(
    () => (activeGroup ? drafts.filter((row) => row.attachmentId === activeGroup.attachmentId) : []),
    [activeGroup, drafts],
  );
  const tabSelectedCount = tabDrafts.filter((row) => row.checked).length;
  const empty = drafts.length === 0;
  const showTabs = groups.length > 1;
  const pageCount = groups.reduce((sum, group) => sum + group.pageCount, 0);
  const skippedPageCount = groups.reduce((sum, group) => sum + group.skippedPageCount, 0);
  const groupsWithSelection = useMemo(() => {
    const ids = new Set(drafts.filter((row) => row.checked).map((row) => row.attachmentId));
    return ids.size;
  }, [drafts]);
  const title =
    groups.length === 1 && groups[0]?.sourceLabel.trim()
      ? `Verify · ${groups[0].sourceLabel.trim()}`
      : groups.length > 1
        ? `Verify · ${groups.length} reports`
        : "Verify extracted results";
  const activeDate = activeGroup ? (dates[activeGroup.attachmentId] ?? reportDate) : reportDate;

  const patchDraft = (key: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const setTabChecked = (checked: boolean) => {
    if (!activeGroup) return;
    const id = activeGroup.attachmentId;
    setDrafts((prev) =>
      prev.map((row) => (row.attachmentId === id ? { ...row, checked } : row)),
    );
  };

  const handleConfirm = () => {
    const selected = drafts
      .filter((row) => row.checked && row.name.trim())
      .map((row) => ({
        ...row.candidate,
        name: row.name.trim(),
        value: row.value.trim() || null,
        unit: row.unit.trim() || null,
        attachmentId: row.attachmentId,
        sourceLabel: row.sourceLabel,
        reportDate: dates[row.attachmentId] ?? reportDate,
      }));
    onConfirm(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-3xl flex-col gap-3 overflow-hidden sm:max-w-3xl"
        data-testid="lab-extract-verify-dialog"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            All extracted rows start selected. Flagged rows are highlighted.
            Nothing is saved until you confirm.
            {groups.length > 1 ? ` ${groups.length} reports.` : ""}
            {pageCount > 0
              ? ` ${pageCount} page${pageCount === 1 ? "" : "s"} read${
                  skippedPageCount > 0 ? `, ${skippedPageCount} skipped` : ""
                }.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {showTabs ? (
          <div
            role="tablist"
            aria-label="Extracted reports"
            className="flex flex-wrap gap-1.5"
            data-testid="lab-extract-report-tabs"
          >
            {groups.map((group) => {
              const groupDrafts = drafts.filter((row) => row.attachmentId === group.attachmentId);
              const flagged = groupDrafts.filter(
                (row) => row.candidate.confidence !== "green",
              ).length;
              const selected = group.attachmentId === activeGroup?.attachmentId;
              const label = shortReportLabel(group.sourceLabel);
              return (
                <button
                  key={group.attachmentId}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={chartOptionChipClass(selected)}
                  onClick={() => setActiveId(group.attachmentId)}
                  data-testid="lab-extract-report-tab"
                >
                  {label} {groupDrafts.length}
                  {flagged > 0 ? ` · ${flagged}` : ""}
                </button>
              );
            })}
          </div>
        ) : null}

        {activeGroup?.source === "vision" ? (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50/60 px-2 py-1.5 dark:border-amber-800/60 dark:bg-amber-950/20"
            data-testid="lab-extract-vision-notice"
          >
            {activeGroup.previewUrl ? (
              <a
                href={activeGroup.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded border border-border"
                aria-label="Open the source report photo full size"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                <img
                  src={activeGroup.previewUrl}
                  alt="Source report photo"
                  className="h-16 w-16 rounded object-cover"
                />
              </a>
            ) : null}
            <p className="text-[11px] leading-snug text-foreground">
              Read from a photo by AI, so these values are a transcription, not the
              report itself. Check each one against the image before confirming.
              {activeGroup.previewUrl ? (
                <>
                  {" "}
                  <a
                    href={activeGroup.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    Open full size
                  </a>
                </>
              ) : null}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-2">
          <label className="text-xs font-medium text-foreground">
            Report date
            <input
              type="date"
              value={activeDate}
              onChange={(event) => {
                if (!activeGroup) return;
                const value = event.target.value;
                setDates((prev) => ({ ...prev, [activeGroup.attachmentId]: value }));
              }}
              className={cn(CHART_COMPACT_INPUT_CLASS, "mt-1 block w-[10.5rem]")}
              data-testid="lab-extract-report-date"
            />
          </label>
          {!empty && tabDrafts.length > 0 ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                onClick={() => setTabChecked(true)}
                disabled={busy || tabSelectedCount === tabDrafts.length}
                data-testid="lab-extract-select-all"
              >
                Select all
              </button>
              <button
                type="button"
                className="text-xs font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                onClick={() => setTabChecked(false)}
                disabled={busy || tabSelectedCount === 0}
                data-testid="lab-extract-deselect-all"
              >
                Deselect all
              </button>
            </div>
          ) : null}
        </div>

        {empty ? (
          <p
            className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
            data-testid="lab-extract-empty"
          >
            No table could be read from this report. Enter the results manually.
          </p>
        ) : tabDrafts.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
            data-testid="lab-extract-tab-empty"
          >
            No table could be read from this report.
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/70">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border/60">
                  <th className="w-8 px-2 py-1.5 font-medium">Add</th>
                  <th className="px-2 py-1.5 font-medium">Test</th>
                  <th className="px-2 py-1.5 font-medium">Value</th>
                  <th className="px-2 py-1.5 font-medium">Unit</th>
                  <th className="px-2 py-1.5 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {tabDrafts.map((row) => (
                  <RowBlock key={row.key} row={row} busy={busy} onPatch={patchDraft} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <p className="text-[11px] text-muted-foreground" data-testid="lab-extract-selection-hint">
            {showTabs && selectedCount > 0
              ? `${selectedCount} selected across ${groupsWithSelection} report${
                  groupsWithSelection === 1 ? "" : "s"
                }`
              : null}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              onClick={handleConfirm}
              disabled={busy || empty || selectedCount === 0}
              data-testid="lab-extract-confirm"
            >
              {selectedCount === 0
                ? "Confirm selected"
                : `Add ${selectedCount} result${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowBlock({
  row,
  busy,
  onPatch,
}: {
  row: DraftRow;
  busy: boolean;
  onPatch: (key: string, patch: Partial<DraftRow>) => void;
}) {
  return (
    <tr
      className={cn(
        "border-b border-border/40 last:border-0",
        row.candidate.confidence !== "green" && "bg-amber-50/70 dark:bg-amber-950/20",
      )}
      data-testid="lab-extract-row"
      data-confidence={row.candidate.confidence}
    >
      <td className="px-2 py-1 align-middle">
        <input
          type="checkbox"
          checked={row.checked}
          onChange={(event) => onPatch(row.key, { checked: event.target.checked })}
          aria-label={`Include ${row.name || "row"}`}
          data-testid="lab-extract-row-check"
          disabled={busy}
        />
      </td>
      <td className="px-1 py-1">
        <input
          value={row.name}
          onChange={(event) => onPatch(row.key, { name: event.target.value })}
          className={cn(CHART_COMPACT_INPUT_CLASS, "w-full min-w-[8rem]")}
          aria-label="Test name"
        />
      </td>
      <td className="px-1 py-1">
        <input
          value={row.value}
          onChange={(event) => onPatch(row.key, { value: event.target.value })}
          className={cn(CHART_COMPACT_INPUT_CLASS, "w-full min-w-[4rem]")}
          aria-label="Result value"
        />
      </td>
      <td className="px-1 py-1">
        <input
          value={row.unit}
          onChange={(event) => onPatch(row.key, { unit: event.target.value })}
          className={cn(CHART_COMPACT_INPUT_CLASS, "w-full min-w-[4rem]")}
          aria-label="Unit"
        />
      </td>
      <td className="px-2 py-1 align-middle text-[10px] text-muted-foreground">
        {row.candidate.flags.length === 0
          ? "—"
          : row.candidate.flags.map((flag) => FLAG_LABEL[flag]).join(" · ")}
      </td>
    </tr>
  );
}
