import { Suspense } from "react";
import PatientsV2Page from "@/components/patients-v2/PatientsV2Page";
import { requireDashboardAuth } from "@/lib/auth/server-user";

/**
 * Patients v2 list route (Strangler Fig — DL-1).
 * Auth + token on the server; list UI ships in Wave 3 (pr-05/pr-07).
 */
export default async function PatientsV2RoutePage() {
  const { token, user } = await requireDashboardAuth();

  return (
    <Suspense
      fallback={
        <div className="p-6 text-muted-foreground">Loading patients…</div>
      }
    >
      <PatientsV2Page token={token} userId={user.id} />
    </Suspense>
  );
}
