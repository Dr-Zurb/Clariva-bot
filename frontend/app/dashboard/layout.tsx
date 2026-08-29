import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getServerSession, getServerUser } from "@/lib/auth/server-user";

/**
 * Dashboard layout: require auth; redirect to login if no session.
 * Renders shell (header, sidebar, main) with user email for display.
 * @see FRONTEND_RECIPES F3; e-task-3
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role === "receptionist") redirect("/desk");

  const userEmail = user.email ?? null;
  // admin-console-v2 · acon2-01: visibility-only flag for the profile-menu
  // "Admin console" link. Real access still gated by requireAdminAuth.
  const isAdmin = user.app_metadata?.role === "admin";

  // Plan 07 · Task 30: pass the access token through so the header bell
  // (`<DashboardEventsBell>`) can poll `/dashboard/events` for unread
  // counts. Session is read once per request via the memoized util (np-06).
  const {
    data: { session },
  } = await getServerSession();
  const token = session?.access_token ?? "";

  return (
    <DashboardShell userEmail={userEmail} token={token} isAdmin={isAdmin}>
      {children}
    </DashboardShell>
  );
}
