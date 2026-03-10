import { redirect } from "next/navigation";

/**
 * Settings index: redirect to Practice Setup (default sub-tab).
 */
export default function SettingsPage() {
  redirect("/dashboard/settings/practice-setup");
}
