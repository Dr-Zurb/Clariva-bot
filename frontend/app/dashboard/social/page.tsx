/**
 * Social — content board, schedule, and analytics.
 */

import { SocialClient } from "@/components/dashboard/social/SocialClient";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Social" };

export default async function SocialPage() {
  const { token } = await requireDashboardAuth();

  return <SocialClient token={token} />;
}
