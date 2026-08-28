import { SettingsLayoutClient } from "@/components/settings/SettingsLayoutClient";

/**
 * Settings layout — thin Server Component wrapping client breadcrumb chrome.
 * Leaf pages use useSessionAccessToken (not requireDashboardAuth) because of
 * the Client layout tree under DashboardShell.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLayoutClient>{children}</SettingsLayoutClient>;
}
