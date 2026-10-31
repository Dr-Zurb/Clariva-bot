/**
 * Social — content board, schedule, and analytics.
 */

import { SocialClient } from "@/components/dashboard/social/SocialClient";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Social" };

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string }>;
}) {
  const { token } = await requireDashboardAuth();
  const params = await Promise.resolve(searchParams);
  const openCardId = typeof params.card === "string" && params.card.length > 0 ? params.card : null;

  return <SocialClient token={token} openCardId={openCardId} />;
}
