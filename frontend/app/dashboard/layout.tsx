import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const userEmail = user.email ?? null;

  // Plan 07 · Task 30: pass the access token through so the header bell
  // (`<DashboardEventsBell>`) can poll `/dashboard/events` for unread
  // counts. The shell is a client boundary, so we read the session
  // here in the server layout (one extra round-trip; getSession is
  // cheap because the cookie store is already loaded).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  return (
    <DashboardShell userEmail={userEmail} token={token}>
      {children}
    </DashboardShell>
  );
}
