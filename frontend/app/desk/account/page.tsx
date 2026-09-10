import { DeskPageHeader } from "@/components/desk/DeskPageHeader";
import { PasswordPanel } from "@/components/settings/PasswordPanel";
import { requireDeskAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Account · Front desk" };

export default async function DeskAccountPage() {
  await requireDeskAuth();

  return (
    <div className="max-w-md">
      <DeskPageHeader
        title="Account"
        description="Change your password. The login email stays the one the doctor set."
      />
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <PasswordPanel />
      </div>
    </div>
  );
}
