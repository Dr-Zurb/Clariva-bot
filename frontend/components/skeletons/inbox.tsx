import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level skeleton for /dashboard/inbox — mirrors rail + sticky toolbar + dual pane.
 */
export function InboxSkeleton() {
  return (
    <div
      className="flex h-[calc(100dvh-5.5rem)] min-h-[28rem] flex-col gap-3"
      aria-busy="true"
      aria-label="Loading inbox"
    >
      <div className="shrink-0 space-y-1">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)]">
        <div className="rounded-md border border-border bg-muted/20 p-2">
          <Skeleton className="mb-2 h-3 w-12" />
          <Skeleton className="mb-3 h-10 w-full rounded-md" />
          <Skeleton className="mb-2 h-3 w-14" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="mb-1 h-9 w-full rounded-md" />
          ))}
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.35fr)]">
            <div className="overflow-hidden rounded-lg border border-border/50 shadow-sm">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-14 w-full border-t border-border first:border-t-0"
                />
              ))}
            </div>
            <div className="overflow-hidden rounded-lg border border-border/50 shadow-sm p-4">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="mt-4 h-24 w-full" />
              <Skeleton className="mt-3 h-40 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
