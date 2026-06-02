import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level skeleton for /dashboard/opd-today — mirrors OpdTodayClient loading state.
 */
export function OpdTodaySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading OPD Today">
      <Skeleton className="h-8 w-40" />

      <div className="mt-4 flex flex-col gap-3">
        <Skeleton className="h-10 w-full rounded-md" />
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-7 w-72 rounded-full" />
          <Skeleton className="h-8 w-64 rounded-md" />
        </div>
        <div className="flex flex-col overflow-hidden rounded-lg border border-border">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-10 w-full border-t border-border"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
