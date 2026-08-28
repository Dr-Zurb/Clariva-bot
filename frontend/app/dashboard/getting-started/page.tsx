/**
 * Getting started — go-live checklist (doctor-onboarding-v1 · onb-02 +
 * getting-started-verify-step). Guidance only (ONB-D4): skippable to /dashboard.
 * Verify is checklist step 1 (GS-D*); deep-links to /dashboard/get-verified.
 */

import { GettingStartedClient } from "@/components/dashboard/onboarding/GettingStartedClient";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Getting started" };

export default async function GettingStartedPage() {
  const { token } = await requireDashboardAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Getting started</h1>
        <p className="mt-1 text-muted-foreground">
          Five steps to go live — verify your license, connect Instagram, then
          practice basics so patients can book.
        </p>
      </div>
      <GettingStartedClient token={token} />
    </div>
  );
}
