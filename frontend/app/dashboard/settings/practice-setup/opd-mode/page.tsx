"use client";

import { OpdModeClient } from "@/components/settings/OpdModeClient";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";

export default function OpdModePage() {
  const { token, isLoading } = useSessionAccessToken();

  if (isLoading || !token) {
    return (
      <SettingsPageShell
        title="OPD mode"
        description="Choose how patients join your outpatient flow."
        isLoading
      />
    );
  }

  return <OpdModeClient token={token} />;
}
