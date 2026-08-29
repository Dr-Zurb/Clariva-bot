/**
 * Get verified — licensed-doctor gate (doctor-verification-v1 · ver-03).
 *
 * Doctors submit registration details + upload their certificate; status
 * moves unverified → pending_review → verified/rejected. Data from
 * GET /verification/status; submit via POST /verification/submit.
 */

import { GetVerifiedClient } from "@/components/dashboard/verification/GetVerifiedClient";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Get verified" };

export default async function GetVerifiedPage() {
  const { token } = await requireDashboardAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Get verified</h1>
        <p className="mt-1 text-muted-foreground">
          Halo Aid is for licensed doctors only. Confirm your medical
          registration to go patient-facing — connect socials and take
          bookings.
        </p>
      </div>
      <GetVerifiedClient token={token} />
    </div>
  );
}
