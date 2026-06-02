import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCardsSkeleton } from "./primitives";

export function CockpitNowNextSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-5 w-20 rounded-md" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </CardContent>
    </Card>
  );
}

export function CockpitOpdQueueSkeleton() {
  return <Skeleton className="h-10 w-full rounded-lg" />;
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-3">
      {[2, 1, 3].map((rowCount, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
          {Array.from({ length: rowCount }).map((_, j) => (
            <Skeleton key={j} className="h-7 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CockpitTodaysScheduleSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent>
        <ScheduleSkeleton />
      </CardContent>
    </Card>
  );
}

function InboxColumnSkeleton() {
  return (
    <Card className="scroll-mt-4">
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-16" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-48 w-full" />
      </CardContent>
    </Card>
  );
}

/**
 * Route-level skeleton for /dashboard — mirrors the Today cockpit layout.
 */
export function DashboardCockpitSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <KpiCardsSkeleton />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <CockpitNowNextSkeleton />
          <CockpitOpdQueueSkeleton />
          <CockpitTodaysScheduleSkeleton />
        </div>

        <aside className="lg:col-span-4">
          <InboxColumnSkeleton />
        </aside>
      </div>
    </div>
  );
}
