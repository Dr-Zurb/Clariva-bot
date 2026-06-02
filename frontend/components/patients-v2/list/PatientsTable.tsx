"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  MoreHorizontal,
} from "lucide-react";
import { PatientQuickPeek } from "@/components/patients-v2/list/PatientQuickPeek";
import {
  PATIENTS_TABLE_COLUMNS,
  type CellContext,
} from "@/components/patients-v2/list/PatientsTableColumns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
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
  density: "compact" | "comfortable";
  selectedPatientIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSortChange: (sort: PatientListSortId | undefined) => void;
  onPageChange: (page: number) => void;
  onClearFilters?: () => void;
  token: string;
  refreshKey?: number;
  onDataLoaded?: (rows: PatientSummary[]) => void;
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
  density,
  selectedPatientIds,
  onSelectionChange,
  onSortChange,
  onPageChange,
  onClearFilters,
  token,
  refreshKey = 0,
  onDataLoaded,
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
    isLoading: loading,
    error: queryError,
    refetch,
  } = usePatientsListQuery(token, listFilters, refreshKey);

  const rows = data?.patients ?? [];
  const total = data?.total ?? 0;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load patients"
    : null;

  useEffect(() => {
    if (data?.patients) onDataLoaded?.(data.patients);
  }, [data?.patients, onDataLoaded]);

  useEffect(() => {
    if (!copyToast) return;
    const t = window.setTimeout(() => setCopyToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [copyToast]);

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
      onCopyMrn: (msg) => setCopyToast(msg),
    }),
    [showRiskPills],
  );

  const rowPy = density === "compact" ? "py-1" : "py-3";
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
  const hasActiveFilter = Boolean(filters.q || filters.segment);

  const handleHeaderSort = (columnId: string, sortKey?: PatientListSortId) => {
    if (!sortKey) return;
    onSortChange(nextSortForColumn(columnId, filters.sort));
  };

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">Couldn&apos;t load patients. {error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            void refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {copyToast ? (
        <p
          className="text-center text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {copyToast}
        </p>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all on this page"
                />
              </TableHead>
              {activeColumns.map((col) => (
                <TableHead key={col.id} className={col.headerClass}>
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
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
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

            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={activeColumns.length + 2}
                  className="h-24 text-center text-muted-foreground"
                >
                  {hasActiveFilter ? (
                    <>
                      No patients match the current filter.{" "}
                      {onClearFilters ? (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={onClearFilters}
                        >
                          Clear filter
                        </button>
                      ) : (
                        "Clear filter to see all."
                      )}
                    </>
                  ) : (
                    "No patients yet. Add one to get started."
                  )}
                </TableCell>
              </TableRow>
            ) : null}

            {!loading &&
              rows.map((patient) => (
                <HoverCard key={patient.id} openDelay={400} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <TableRow
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
                        <RowActionsMenu patient={patient} onCopyMrn={() => setCopyToast("Copied MRN")} />
                      </TableCell>
                    </TableRow>
                  </HoverCardTrigger>
                  <HoverCardContent
                    side="right"
                    align="start"
                    className="w-96 max-w-[24rem]"
                  >
                    <PatientQuickPeek patientId={patient.id} token={token} />
                  </HoverCardContent>
                </HoverCard>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
        <p>
          Showing {start}-{end} of {total}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
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
            disabled={page >= lastPage || loading || page * PAGE_SIZE >= total}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function RowActionsMenu({
  patient,
  onCopyMrn,
}: {
  patient: PatientSummary;
  onCopyMrn: () => void;
}) {
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
        {patient.medical_record_number ? (
          <DropdownMenuItem
            onClick={async (e) => {
              e.preventDefault();
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
