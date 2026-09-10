"use client";

import { BrandingClient } from "@/components/settings/BrandingClient";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";

export default function BrandingPage() {
  const { token, isLoading } = useSessionAccessToken();

  if (isLoading || !token) {
    return (
      <SettingsPageShell
        title="Letterhead & branding"
        description="Logo and prescription layout."
        isLoading
      />
    );
  }

  return <BrandingClient token={token} />;
}
