"use client";

import { MessagingClient } from "@/components/settings/MessagingClient";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";

export default function MessagingPage() {
  const { token, isLoading } = useSessionAccessToken();

  if (isLoading || !token) {
    return (
      <SettingsPageShell
        title="Appointment notes"
        description="Default notes added to new appointments."
        isLoading
      />
    );
  }

  return <MessagingClient token={token} />;
}
