import { DoctorPushNotificationsPanel } from "@/components/settings/DoctorPushNotificationsPanel";
import { PasswordPanel } from "@/components/settings/PasswordPanel";

/**
 * Settings → Account (auth-password · ap-03).
 * Call notifications live here (not global DashboardShell) — 2026-08-06.
 */
export default function AccountSettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Account</h1>
      <p className="mt-1 text-muted-foreground">
        Manage your password, sign-in, and device notifications.
      </p>
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <PasswordPanel />
        </div>
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium text-foreground">Call notifications</h2>
          <div className="mt-4">
            <DoctorPushNotificationsPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
