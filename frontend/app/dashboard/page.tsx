import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DoctorDashboardEventFeed } from "@/components/dashboard/DoctorDashboardEventFeed";

/**
 * Dashboard home. Layout provides header, nav, and main wrapper.
 *
 * Plan 07 · Task 30 mounts the doctor's mutual-replay notification feed
 * here. The feed lives at the top so a "your patient just replayed
 * your consult" event is visible the moment the doctor lands on the
 * dashboard. The `id="notifications"` anchor lets the header bell
 * scroll the feed into view via the `#notifications` URL hash.
 *
 * @see e-task-3
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-30-mutual-replay-notifications.md
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";
  if (!token) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome. Use the sidebar to go to Appointments or Patients.
        </p>
      </div>

      <div id="notifications" className="scroll-mt-4">
        <DoctorDashboardEventFeed token={token} />
      </div>
    </div>
  );
}
