import Link from "next/link";
import { getAppointmentById } from "@/lib/api";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import PatientProfilePage from "@/components/patient-profile/PatientProfilePage";
import { requireDashboardAuth } from "@/lib/auth/server-user";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * The canonical appointment detail route (`plan-patient-profile-shell-rebuild`).
 *
 * Mounts `<PatientProfilePage>` with the modality-dispatched 8-pane template (csf-04+).
 * Kill-switch removed cvd-02 (2026-05-24).
 *
 * Fetches by ID; 404/403 handling; no PHI in logs.
 * @see e-task-4; FRONTEND_RECIPES F4
 */

export default async function AppointmentDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  const { token } = await requireDashboardAuth();

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
      errorMessage = "You don't have access to this appointment.";
    } else {
      errorMessage = "Unable to load appointment. Please try again.";
    }
  }

  // Error states reskinned with A1 tokens (architectural lock #10)
  if (errorMessage) {
    return (
      <div>
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive"
          aria-live="polite"
        >
          <p className="font-medium">{isNotFound ? "Not found" : "Error"}</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
        </div>
        <Link
          href="/dashboard/opd-today"
          className={cn(
            "mt-4 inline-block text-sm font-medium text-primary hover:text-primary/80",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded",
          )}
        >
          Back to OPD
        </Link>
      </div>
    );
  }

  if (!appointment) return null;

  return (
    <PatientProfilePage appointment={appointment} token={token} />
  );
}
