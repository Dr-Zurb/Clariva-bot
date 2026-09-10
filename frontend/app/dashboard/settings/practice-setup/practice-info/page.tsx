"use client";

import { PracticeInfoClient } from "@/components/settings/PracticeInfoClient";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";

/**
 * Settings → Practice info (settings-refresh · sr-02).
 * Token from session — Settings sits under a Client layout tree (no server-only).
 */
export default function PracticeInfoPage() {
  const { token, isLoading } = useSessionAccessToken();

  if (isLoading || !token) {
    return (
      <SettingsPageShell
        title="Practice info"
        description="Practice name, timezone, specialty, qualifications, and address. Prices and currency are under Pricing."
        isLoading
      />
    );
  }

  return <PracticeInfoClient token={token} />;
}
