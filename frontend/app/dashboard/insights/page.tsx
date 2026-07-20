/**
 * Insights — retrospective practice dashboard (insights-v1 · ins-02).
 *
 * Server component owns the auth shell; the client overview mounts the
 * shared 7/30/90 range control + Tier-1 tiles. Later tiers (`ins-03`…`05`)
 * plug into the same range provider inside `PracticeHealthOverview`.
 *
 * @see docs/Work/Daily-plans/July 2026/21-07-2026/insights-v1/Tasks/task-ins-02-overview-ui.md
 */

import { PracticeHealthOverview } from "@/components/dashboard/insights/PracticeHealthOverview";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const { token } = await requireDashboardAuth();

  return <PracticeHealthOverview token={token} />;
}
