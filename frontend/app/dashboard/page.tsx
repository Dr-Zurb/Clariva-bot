// Cockpit V1: workflow-first command center.
//
// EXPLICITLY NO vanity charts (bar charts, sparklines, "patients seen this week" graphs)
// per U3.7 in plan-ui-system-redesign.md. Clinicians don't visit a dashboard to admire graphs.
// If we want analytics later, that's a separate /dashboard/insights page.
//
// Adding a chart here? Move it. Or open a fresh batch and justify with a doctor-pilot result.

import { Suspense } from "react";
import { InboxColumn } from "@/components/dashboard/cockpit/InboxColumn";
import { CockpitKpiStripSection } from "@/components/dashboard/cockpit/streaming/CockpitKpiStripSection";
import { CockpitNowNextSection } from "@/components/dashboard/cockpit/streaming/CockpitNowNextSection";
import { CockpitOpdQueueSection } from "@/components/dashboard/cockpit/streaming/CockpitOpdQueueSection";
import { CockpitTodaysScheduleSection } from "@/components/dashboard/cockpit/streaming/CockpitTodaysScheduleSection";
import {
  CockpitNowNextSkeleton,
  CockpitOpdQueueSkeleton,
  CockpitTodaysScheduleSkeleton,
} from "@/components/skeletons/dashboard-cockpit";
import { KpiCardsSkeleton } from "@/components/skeletons/primitives";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Today" };

/**
 * Dashboard home — Today cockpit (C1 scaffold).
 *
 * np-08: server-prefetch + HydrationBoundary per zone; Suspense streams
 * sections while route-level loading.tsx (np-07) paints the outer shell.
 */
export default async function DashboardPage() {
  const { token } = await requireDashboardAuth();

  return (
    <div className="space-y-6">
      <Suspense fallback={<KpiCardsSkeleton />}>
        <CockpitKpiStripSection token={token} />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Suspense fallback={<CockpitNowNextSkeleton />}>
            <CockpitNowNextSection token={token} />
          </Suspense>
          <Suspense fallback={<CockpitOpdQueueSkeleton />}>
            <CockpitOpdQueueSection token={token} />
          </Suspense>
          <Suspense fallback={<CockpitTodaysScheduleSkeleton />}>
            <CockpitTodaysScheduleSection token={token} />
          </Suspense>
        </div>

        <aside className="lg:col-span-4">
          <InboxColumn token={token} />
        </aside>
      </div>
    </div>
  );
}
