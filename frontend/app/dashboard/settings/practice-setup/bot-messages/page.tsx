"use client";

import { MessagingClient } from "@/components/settings/MessagingClient";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";

export default function MessagingPage() {
  const { token, isLoading } = useSessionAccessToken();

  if (isLoading || !token) {
    return (
      <SettingsPageShell
        title="Messaging"
        description="Welcome message and default appointment notes for the receptionist bot."
        isLoading
      />
    );
  }

  return <MessagingClient token={token} />;
}
