import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppointmentById } from "@/lib/api";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import AppointmentConsultationActions from "@/components/consultation/AppointmentConsultationActions";
import ConsultArtifactsPanel from "@/components/consultation/ConsultArtifactsPanel";
import DoctorOpdSlotActions from "@/components/opd/DoctorOpdSlotActions";

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

      <DoctorOpdSlotActions
        token={token}
        appointmentId={appointment.id}
        appointmentStatus={appointment.status}
      />

      <AppointmentConsultationActions
        appointment={appointment}
        token={token}
      />

      {/*
       * Plan 07 · Task 29 — once the consult ends, surface the artifact
       * panel so the doctor can replay the audio and (later) read the
       * transcript / chat export. Voice is the v1 modality with audio;
       * we render for any ended session that has a session row, and
       * the panel itself handles the "no recording / patient declined
       * consent" empty state via `getReplayStatus`.
       */}
      {appointment.consultation_session?.status === "ended" &&
        appointment.consultation_session.id && (
          <div className="mt-6">
            <ConsultArtifactsPanel
              sessionId={appointment.consultation_session.id}
              token={token}
              callerRole="doctor"
              callerLabel="Doctor view"
            />
          </div>
        )}

      {/*
       * Plan 07 · Task 31 — "View conversation" link.
       *
       * Renders only when a `consultation_sessions` row exists for the
       * appointment (per task spec Notes #10: the session row is the
       * authoritative "there was a chat to view" check post-Plan-06).
       * In-clinic appointments never have a session row so the link is
       * hidden naturally — no extra modality gate needed.
       *
       * No status filter beyond "row exists" — Decision 1 sub-decision
       * LOCKED gives indefinite read access; even a `cancelled` /
       * `no_show` session has at least the system banners worth
       * surfacing if any chat happened before the status flip.
       *
       * Visual neighbor of `<ConsultArtifactsPanel>` — both surfaces
       * are post-consult artifacts; clustering them at the bottom of
       * the page mirrors the doctor's mental "what happened during
       * this consult?" workflow.
       */}
      {appointment.consultation_session?.id && (
        <div className="mt-4">
          <Link
            href={`/dashboard/appointments/${appointment.id}/chat-history`}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            View conversation
          </Link>
        </div>
      )}
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
