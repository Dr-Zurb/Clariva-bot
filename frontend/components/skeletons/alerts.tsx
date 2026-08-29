import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level skeleton for /dashboard/alerts — mirrors sticky band + list shell.
 */
export function AlertsSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Loading alerts"
    >
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="overflow-hidden rounded-lg border border-border/50 shadow-sm">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-16 w-full border-t border-border first:border-t-0"
          />
        ))}
      </div>
    </div>
  );
}
