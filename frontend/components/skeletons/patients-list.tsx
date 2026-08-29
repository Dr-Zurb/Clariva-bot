import { Skeleton } from "@/components/ui/skeleton";
import { TableRowsSkeleton } from "./primitives";

/**
 * Route-level skeleton for /dashboard/patients-v2 — mirrors live layout
 * (KPI strip + sticky search/View + table).
 */
export function PatientsListSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      aria-busy="true"
      aria-label="Loading patients"
    >
      <Skeleton className="h-8 w-32" />

      <nav
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        aria-label="Loading patient KPIs"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.5rem] w-full rounded-lg" />
        ))}
      </nav>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full md:w-72 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md self-end sm:self-auto" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/50 shadow-sm">
        <TableRowsSkeleton rows={10} columns={6} />
      </div>
    </div>
  );
}
