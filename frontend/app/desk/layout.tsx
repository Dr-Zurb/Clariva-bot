/**
 * Front-desk portal shell — gated by requireDeskAuth (receptionist-portal P3).
 * Visual language mirrors AdminShell. No clinical dashboard routes mount here.
 */

import { DeskShell } from "@/components/desk/DeskShell";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { requireDeskAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Front desk · Halo Aid" };

export default async function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, token } = await requireDeskAuth();
  const actorKind =
    user.app_metadata?.role === "receptionist" ? "receptionist" : "doctor";
  const meta = user.user_metadata ?? {};
  const named = [meta.display_name, meta.full_name, meta.name].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
  const profileName = named?.trim() || (actorKind === "doctor" ? "Doctor" : "Receptionist");

  return (
    <QueryProvider>
      <DeskShell
        actorKind={actorKind}
        profileName={profileName}
        profileEmail={user.email ?? null}
        token={token}
      >
        {children}
      </DeskShell>
    </QueryProvider>
  );
}
