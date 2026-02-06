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

  return <DashboardShell userEmail={userEmail}>{children}</DashboardShell>;
}
