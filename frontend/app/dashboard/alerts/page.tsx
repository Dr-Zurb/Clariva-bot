/**
 * Alerts — doctor notification center over `doctor_dashboard_events`
 * (alerts-v1 · alr-01).
 *
 * Server component owns the auth shell; the existing feed client mounts
 * with the access token. Theme tokens live on the feed component.
 *
 * @see docs/Work/Daily-plans/July 2026/21-07-2026/alerts-v1/Tasks/task-alr-01-page-and-feed-wire.md
 */

import { DoctorDashboardEventFeed } from "@/components/dashboard/DoctorDashboardEventFeed";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const { token } = await requireDashboardAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Alerts</h1>
      <DoctorDashboardEventFeed token={token} />
    </div>
  );
}
