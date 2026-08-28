"use client";

import { PatientFlowClient } from "@/components/settings/PatientFlowClient";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";

export default function PatientFlowPage() {
  const { token, isLoading } = useSessionAccessToken();

  if (isLoading || !token) {
    return (
      <SettingsPageShell
        title="Patient flow"
        description="How the dashboard moves you between patients after you finish a consultation."
        isLoading
      />
    );
  }

  return <PatientFlowClient token={token} />;
}
