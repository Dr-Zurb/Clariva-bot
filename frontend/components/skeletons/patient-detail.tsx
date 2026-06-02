import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function OverviewTabSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="shadow-sm">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Route-level skeleton for /dashboard/patients-v2/[id] — mirrors PatientV2Shell layout.
 */
export function PatientDetailSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      aria-busy="true"
      aria-label="Loading patient"
    >
      <header className="border-b border-border bg-background px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-48 max-w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </div>
        </div>
      </header>

      <div className="flex gap-1 border-b px-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="mx-1 h-9 w-24 rounded-none" />
        ))}
      </div>

      <div className="min-h-0 flex-1">
        <OverviewTabSkeleton />
      </div>
    </div>
  );
}
