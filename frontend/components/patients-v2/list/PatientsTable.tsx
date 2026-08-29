"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  MoreHorizontal,
} from "lucide-react";
import {
  PATIENTS_TABLE_COLUMNS,
  type CellContext,
} from "@/components/patients-v2/list/PatientsTableColumns";
import { prefetchVisiblePatientQuickPeeks } from "@/components/patients-v2/list/patientQuickPeekCache";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePatientsListQuery } from "@/hooks/queries/usePatientsListQuery";
import type { PatientListColumnId } from "@/lib/patients-v2/list-preferences";
import { copyToClipboard } from "@/lib/patients-v2/list-utils";
import { cn } from "@/lib/utils";
import type {
  PatientListFilters,
  PatientListSortId,
  PatientSummary,
} from "@/types/patient";

const PAGE_SIZE = 50;
const SKELETON_ROWS = 10;

export interface PatientsTableProps {
  filters: PatientListFilters;
  visibleColumns: PatientListColumnId[];
  selectedPatientIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSortChange: (sort: PatientListSortId | undefined) => void;
  onPageChange: (page: number) => void;
  onClearFilters?: () => void;
  token: string;
  refreshKey?: number;
  onDataLoaded?: (rows: PatientSummary[]) => void;
  /** Full roster rows when available — used to discover known tags. */
  onRosterLoaded?: (rows: PatientSummary[]) => void;
  onFilterByTag?: (tag: string) => void;
  onRemoveTag?: (patientId: string, tag: string) => void;
}

function nextSortForColumn(
  columnId: string,
  currentSort: PatientListSortId | undefined,
): PatientListSortId | undefined {
  if (columnId === "name") {
    return currentSort === "name-asc" ? undefined : "name-asc";
  }
  if (columnId === "last-visit") {
    if (!currentSort || currentSort === "name-asc" || currentSort.startsWith("created-at")) {
      return "last-visit-desc";
    }
    if (currentSort === "last-visit-desc") return "last-visit-asc";
    if (currentSort === "last-visit-asc") return undefined;
    return "last-visit-desc";
  }
  return undefined;
}

function sortIndicator(
  columnId: string,
  sort: PatientListSortId | undefined,
): React.ReactNode {
  if (columnId === "name") {
    if (sort === "name-asc") return <ChevronUp className="h-3.5 w-3.5" aria-hidden />;
    return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />;
  }
  if (columnId === "last-visit") {
    if (sort === "last-visit-desc")
      return <ChevronDown className="h-3.5 w-3.5" aria-hidden />;
    if (sort === "last-visit-asc")
      return <ChevronUp className="h-3.5 w-3.5" aria-hidden />;
    return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />;
  }
  return null;
}

export function PatientsTable({
  filters,
  visibleColumns,
  selectedPatientIds,
  onSelectionChange,
  onSortChange,
  onPageChange,
  onClearFilters,
  token,
  refreshKey = 0,
  onDataLoaded,
  onRosterLoaded,
  onFilterByTag,
  onRemoveTag,
}: PatientsTableProps) {
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const page = filters.page ?? 1;
  const listFilters = useMemo(
    () => ({
      ...filters,
      page,
      pageSize: filters.pageSize ?? PAGE_SIZE,
    }),
    [filters, page],
  );

  const {
    data,
    isLoading,
    isFetching,
    isPlaceholderData,
    error: queryError,
    refetch,
    rosterPatients,
  } = usePatientsListQuery(token, listFilters, refreshKey);

  // Full skeleton only on cold load — keep rows while segment/page refetches.
  const showSkeleton = isLoading && !data;
  const showRefreshing = isFetching && Boolean(data);
  const rows = data?.patients ?? [];
  const total = data?.total ?? 0;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load patients"
    : null;

  const loadedIdsKey = (data?.patients ?? [])
    .map((p) => `${p.id}:${(p.patient_tags ?? []).join(",")}:${p.patient_tag ?? ""}`)
    .join("|");
  useEffect(() => {
    if (!data?.patients) return;
    onDataLoaded?.(data.patients);
    // Fingerprint by ids+tags — projected arrays are new references every recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [loadedIdsKey, onDataLoaded]);

  const rosterKey = (rosterPatients ?? [])
    .map((p) => `${p.id}:${(p.patient_tags ?? []).join(",")}:${p.patient_tag ?? ""}`)
    .join("|");
  useEffect(() => {
    if (!rosterPatients?.length) return;
    onRosterLoaded?.(rosterPatients);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [rosterKey, onRosterLoaded]);

  useEffect(() => {
    if (!copyToast) return;
    const t = window.setTimeout(() => setCopyToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [copyToast]);

  // Warm hover peeks for on-screen rows after the list settles (idle if available).
  const visiblePeekIdsKey = rows.map((p) => p.id).join("|");
  useEffect(() => {
    if (!token || rows.length === 0) return;
    const ids = rows.map((p) => p.id);
    const run = () => prefetchVisiblePatientQuickPeeks(token, ids);
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }
    const t = window.setTimeout(run, 200);
    return () => window.clearTimeout(t);
    // Fingerprint by ids — row array identity churns on refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [token, visiblePeekIdsKey]);

  const activeColumns = useMemo(() => {
    return PATIENTS_TABLE_COLUMNS.filter((col) => {
      if (col.id === "name") return true;
      return visibleColumns.includes(col.id as PatientListColumnId);
    });
  }, [visibleColumns]);

  const showRiskPills = visibleColumns.includes("risk-pills");
  const cellCtx: CellContext = useMemo(
    () => ({
      showRiskPills,
      token,
      onCopyMrn: (msg) => setCopyToast(msg),
      onCopyPhone: (msg) => setCopyToast(msg),
      onFilterByTag,
      onRemoveTag,
    }),
    [showRiskPills, token, onFilterByTag, onRemoveTag],
  );

  /** Single list density (compact) — no UI toggle. */
  const rowPy = "py-1";
  const allSelected = rows.length > 0 && rows.every((r) => selectedPatientIds.includes(r.id));
  const someSelected =
    rows.some((r) => selectedPatientIds.includes(r.id)) && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      const pageIds = new Set(rows.map((r) => r.id));
      onSelectionChange(selectedPatientIds.filter((id) => !pageIds.has(id)));
    } else {
      const merged = new Set([...selectedPatientIds, ...rows.map((r) => r.id)]);
      onSelectionChange(Array.from(merged));
    }
  }, [allSelected, onSelectionChange, rows, selectedPatientIds]);

  const toggleOne = useCallback(
    (id: string) => {
      if (selectedPatientIds.includes(id)) {
        onSelectionChange(selectedPatientIds.filter((x) => x !== id));
      } else {
        onSelectionChange([...selectedPatientIds, id]);
      }
    },
    [onSelectionChange, selectedPatientIds],
  );

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilter = Boolean(filters.q || filters.segment || filters.tag);

  const handleHeaderSort = (columnId: string, sortKey?: PatientListSortId) => {
    if (!sortKey) return;
    onSortChange(nextSortForColumn(columnId, filters.sort));
  };

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-medium text-destructive">
            Couldn&apos;t load patients
          </p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              void refetch();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {copyToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-4 py-2 text-sm text-background shadow-lg"
        >
          {copyToast}
        </div>
      ) : null}

      {showRefreshing ? (
        <p
          className="shrink-0 text-center text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {isPlaceholderData ? "Updating list…" : "Refreshing…"}
        </p>
      ) : null}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto rounded-lg border border-border/50 shadow-sm",
          showRefreshing && "opacity-80",
        )}
      >
        {!showSkeleton && rows.length === 0 ? (
          <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/10 p-12 text-center">
            <p className="text-sm font-medium text-foreground">
              {hasActiveFilter ? "No matching patients" : "No patients yet"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {hasActiveFilter
                ? "Try clearing search, worklist, or tag filters."
                : "Patients appear here after their first registered visit."}
            </p>
            {hasActiveFilter && onClearFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={onClearFilters}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="[&_tr]:border-b">
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 z-10 w-10 bg-muted/60 backdrop-blur">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all on this page"
                />
              </TableHead>
              {activeColumns.map((col) => (
                <TableHead
                  key={col.id}
                  className={cn(
                    "sticky top-0 z-10 bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur",
                    col.headerClass,
                  )}
                >
                  {col.sortKey ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleHeaderSort(col.id, col.sortKey)}
                    >
                      {col.label}
                      {sortIndicator(col.id, filters.sort)}
                    </button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
              <TableHead className="sticky top-0 z-10 w-10 bg-muted/60 backdrop-blur">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton
              ? Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                    {activeColumns.map((col) => (
                      <TableCell key={col.id}>
                        <Skeleton className="h-4 w-full max-w-[8rem]" />
                      </TableCell>
                    ))}
                    <TableCell>
                      <Skeleton className="h-4 w-6" />
                    </TableCell>
                  </TableRow>
                ))
              : null}


            {!showSkeleton &&
              rows.map((patient) => (
                <TableRow
                  key={patient.id}
                  data-state={
                    selectedPatientIds.includes(patient.id) ? "selected" : undefined
                  }
                  className={cn(rowPy)}
                  onKeyDown={(e) => {
                    if (e.key === " " && e.currentTarget === e.target) {
                      e.preventDefault();
                    }
                  }}
                >
                  <TableCell className={rowPy}>
                    <Checkbox
                      checked={selectedPatientIds.includes(patient.id)}
                      onCheckedChange={() => toggleOne(patient.id)}
                      aria-label={`Select ${patient.name}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                  {activeColumns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(rowPy, col.cellClass)}
                    >
                      {col.cell(patient, cellCtx)}
                    </TableCell>
                  ))}
                  <TableCell className={rowPy}>
                    <RowActionsMenu
                      patient={patient}
                      onCopyMrn={() => setCopyToast("Copied MRN")}
                      onCopyPhone={() => setCopyToast("Copied phone")}
                    />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </table>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 pt-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {lastPage <= 1
            ? `${total} patient${total === 1 ? "" : "s"}`
            : `Showing ${start}–${end} of ${total}`}
        </p>
        {lastPage > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || showSkeleton}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <span className="tabular-nums">
              Page {page} of {lastPage}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= lastPage || showSkeleton || page * PAGE_SIZE >= total}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RowActionsMenu({
  patient,
  onCopyMrn,
  onCopyPhone,
}: {
  patient: PatientSummary;
  onCopyMrn: () => void;
  onCopyPhone: () => void;
}) {
  const telHref = `tel:${patient.phone.replace(/\s/g, "")}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Actions for ${patient.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/patients-v2/${patient.id}`}>View profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={telHref} onClick={(e) => e.stopPropagation()}>
            Call
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const ok = await copyToClipboard(patient.phone);
            if (ok) onCopyPhone();
          }}
        >
          Copy phone
        </DropdownMenuItem>
        {patient.medical_record_number ? (
          <DropdownMenuItem
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const ok = await copyToClipboard(patient.medical_record_number!);
              if (ok) onCopyMrn();
            }}
          >
            Copy MRN
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
