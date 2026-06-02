import OpdTodayClient from "@/components/opd/OpdTodayClient";
import { requireDashboardAuth } from "@/lib/auth/server-user";

/**
 * Doctor OPD operational hub (queue board or slot hints). e-task-opd-06.
 */
export default async function OpdTodayPage() {
  const { token } = await requireDashboardAuth();

  return <OpdTodayClient token={token} />;
}
