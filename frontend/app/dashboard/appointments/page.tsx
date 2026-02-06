import { createClient } from "@/lib/supabase/server";
import { getAppointments } from "@/lib/api";
import { redirect } from "next/navigation";
import type { Appointment } from "@/types/appointment";
import AppointmentsListWithFilters from "@/components/appointments/AppointmentsListWithFilters";

/**
 * Appointments list page. Fetches from backend API with auth; loading/error per F4.
 * Filtering (status, date range, patient name) is client-side per e-task-5.
 * @see e-task-4, e-task-5; FRONTEND_RECIPES F4
 */
export default async function AppointmentsPage() {
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
  let appointments: Appointment[] = [];
  let errorMessage: string | null = null;

  try {
    const res = await getAppointments(token);
    appointments = res.data.appointments;
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err ? err.status : 500;
    if (status === 401) {
      redirect("/login");
    }
    errorMessage =
      status === 403
        ? "You don’t have access to these appointments."
        : "Unable to load appointments. Please try again.";
  }

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800"
        aria-live="polite"
      >
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{errorMessage}</p>
      </div>
    );
  }

  return <AppointmentsListWithFilters appointments={appointments} />;
}
