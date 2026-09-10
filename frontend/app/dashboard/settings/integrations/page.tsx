"use client";

import InstagramConnect from "@/components/settings/InstagramConnect";
import FacebookConnect from "@/components/settings/FacebookConnect";
import { InstagramPausePanel } from "@/components/settings/InstagramPausePanel";
import { VerificationBanner } from "@/components/dashboard/verification/VerificationBanner";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";

/**
 * Integrations — Instagram + Facebook Page connect + receptionist pause.
 */
export default function IntegrationsPage() {
  const { token, isLoading } = useSessionAccessToken();

  if (isLoading || !token) {
    return (
      <SettingsPageShell
        title="Integrations"
        description="Connect Instagram or Facebook Messenger and control automated receptionist replies."
        isLoading
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Integrations</h1>
        <p className="mt-1 text-muted-foreground">
          Connect Instagram or Facebook Messenger and control automated receptionist replies.
        </p>
      </div>
      <VerificationBanner token={token} />
      <section aria-labelledby="channels-heading" className="space-y-4">
        <h2 id="channels-heading" className="sr-only">
          Channel connections
        </h2>
        <InstagramConnect token={token} />
        <FacebookConnect token={token} />
        <InstagramPausePanel token={token} />
      </section>
    </div>
  );
}
