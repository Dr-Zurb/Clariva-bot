"use client";

import { BookingRulesClient } from "@/components/settings/BookingRulesClient";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";

export default function BookingRulesPage() {
  const { token, isLoading } = useSessionAccessToken();

  if (isLoading || !token) {
    return (
      <SettingsPageShell
        title="Booking rules"
        description="Slot length, advance booking limits, cancellation policy, and booking buffers."
        isLoading
      />
    );
  }

  return <BookingRulesClient token={token} />;
}
