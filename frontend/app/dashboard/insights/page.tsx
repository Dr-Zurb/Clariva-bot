/**
 * Insights — practice health + post conversion (ins-02 / pca-02).
 */

import { InsightsClient } from "@/components/dashboard/insights/InsightsClient";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const { token } = await requireDashboardAuth();

  return <InsightsClient token={token} />;
}
