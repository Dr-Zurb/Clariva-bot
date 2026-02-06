import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppointmentById } from "@/lib/api";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Appointment detail page. Fetches by ID; 404/403 handling; no PHI in logs.
 * @see e-task-4; FRONTEND_RECIPES F4
 */
export default async function AppointmentDetailPage({ params }: PageProps) {
  const { id } = await params;
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
  let appointment:
    | Awaited<ReturnType<typeof getAppointmentById>>["data"]["appointment"]
    | null = null;
  let errorMessage: string | null = null;
  let isNotFound = false;

  try {
    const res = await getAppointmentById(id, token);
    appointment = res.data.appointment;
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err ? err.status : 500;
    if (status === 401) {
      redirect("/login");
    }
    if (status === 404) {
      isNotFound = true;
      errorMessage = "Appointment not found.";
    } else if (status === 403) {
      errorMessage = "You don’t have access to this appointment.";
    } else {
      errorMessage = "Unable to load appointment. Please try again.";
    }
  }

  if (errorMessage) {
    return (
      <div>
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800"
          aria-live="polite"
        >
          <p className="font-medium">{isNotFound ? "Not found" : "Error"}</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
        </div>
        <Link
          href="/dashboard/appointments"
          className={cn(
            "mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
          )}
        >
          Back to appointments
        </Link>
      </div>
    );
  }

  if (!appointment) return null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/dashboard/appointments"
          className={cn(
            "text-sm font-medium text-blue-600 hover:text-blue-800",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
          )}
        >
          ← Back to appointments
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900">Appointment</h1>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-gray-500">Patient</dt>
          <dd className="mt-0.5 text-gray-900">
            {appointment.patient_id ? (
              <Link
                href={`/dashboard/patients/${appointment.patient_id}`}
                className={cn(
                  "text-blue-600 hover:text-blue-800",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                )}
              >
                {appointment.patient_name}
              </Link>
            ) : (
              appointment.patient_name
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Phone</dt>
          <dd className="mt-0.5 text-gray-900">{appointment.patient_phone}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Date & time</dt>
          <dd className="mt-0.5 text-gray-900">
            {formatAppointmentDate(appointment.appointment_date)}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Status</dt>
          <dd>
            <span
              className={cn(
                "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                appointment.status === "confirmed" &&
                  "bg-green-100 text-green-800",
                appointment.status === "pending" &&
                  "bg-amber-100 text-amber-800",
                appointment.status === "cancelled" &&
                  "bg-gray-100 text-gray-700",
                appointment.status === "completed" &&
                  "bg-blue-100 text-blue-800"
              )}
            >
              {appointment.status}
            </span>
          </dd>
        </div>
        {appointment.notes && (
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Notes</dt>
            <dd className="mt-0.5 text-gray-900">{appointment.notes}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function formatAppointmentDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
