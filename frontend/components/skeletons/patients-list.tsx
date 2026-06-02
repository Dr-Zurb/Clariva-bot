import { Skeleton } from "@/components/ui/skeleton";
import { TableRowsSkeleton } from "./primitives";

/**
 * Route-level skeleton for /dashboard/patients-v2 — mirrors list page layout.
 */
export function PatientsListSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading patients">
      <Skeleton className="h-8 w-32" />

      <nav
        className="grid grid-cols-2 gap-3 md:grid-cols-5"
        aria-label="Loading patient KPIs"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={i === 4 ? "col-span-2 md:col-span-1" : undefined}
          >
            <Skeleton className="h-[4.5rem] w-full rounded-lg" />
          </div>
        ))}
      </nav>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-full max-w-sm rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </div>

      <TableRowsSkeleton rows={10} columns={6} />
    </div>
  );
}
