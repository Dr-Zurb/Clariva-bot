import { PasswordPanel } from "@/components/settings/PasswordPanel";

/**
 * Settings → Account (auth-password · ap-03).
 */
export default function AccountSettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Account</h1>
      <p className="mt-1 text-muted-foreground">
        Manage your password and sign-in options.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-card p-5 shadow-sm">
        <PasswordPanel />
      </div>
    </div>
  );
}
