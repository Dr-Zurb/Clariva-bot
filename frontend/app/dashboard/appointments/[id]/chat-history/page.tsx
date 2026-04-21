import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppointmentById } from "@/lib/api";
import { cn } from "@/lib/utils";
import TextConsultRoom from "@/components/consultation/TextConsultRoom";
import TranscriptDownloadButton from "@/components/consultation/TranscriptDownloadButton";

/**
 * Doctor-facing post-consult chat-history route (Plan 07 · Task 31).
 *
 * URL: `/dashboard/appointments/[id]/chat-history`
 *
 * **Decision 1 sub-decision LOCKED** — indefinite read access for both
 * parties. The doctor uses their evergreen dashboard Supabase session
 * (no per-session JWT minted) — Migration 052's RLS doctor branch
 * keys on `doctor_id = auth.uid()` so the dashboard JWT already
 * authenticates SELECTs against `consultation_messages` for any
 * session the doctor owns.
 *
 * **Asymmetry vs the patient route is intentional** (see Plan 07
 * Task 31 Notes #7):
 *   - Patient (`/c/history/[sessionId]`) → arrives from an IG-DM link,
 *     no Supabase auth session, must exchange an HMAC for a 90-day
 *     scoped JWT via `/chat-history-token`.
 *   - Doctor (this route) → already inside `/dashboard`, RLS doctor
 *     branch passes via `auth.uid()`. No HMAC exchange.
 *
 * Lifecycle:
 *   1. Unauthenticated → redirect to `/login` (mirrors other dashboard
 *      pages).
 *   2. Appointment not found / forbidden → render error CTA + back link.
 *   3. No `consultation_session` row (e.g. in-clinic appointment, or a
 *      consult that never started) → render "No conversation was
 *      recorded for this appointment." (Out of scope #8 in the task.)
 *   4. Otherwise mount `<TextConsultRoom mode='readonly'>` via the
 *      client component child (the room is a client-side surface).
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DoctorChatHistoryPage({ params }: PageProps) {
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
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded",
          )}
        >
          Back to appointments
        </Link>
      </div>
    );
  }

  if (!appointment) return null;

  const sessionRow = appointment.consultation_session ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Breadcrumb — Dashboard › Appointments › {patient} › Conversation. */}
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
        <Link
          href="/dashboard"
          className="hover:text-gray-700 hover:underline"
        >
          Dashboard
        </Link>
        <span aria-hidden>›</span>
        <Link
          href="/dashboard/appointments"
          className="hover:text-gray-700 hover:underline"
        >
          Appointments
        </Link>
        <span aria-hidden>›</span>
        <Link
          href={`/dashboard/appointments/${appointment.id}`}
          className="hover:text-gray-700 hover:underline"
        >
          {appointment.patient_name}
        </Link>
        <span aria-hidden>›</span>
        <span className="text-gray-900">Conversation</span>
      </nav>

      <h1 className="text-2xl font-semibold text-gray-900">
        Conversation with {appointment.patient_name}
      </h1>

      {sessionRow ? (
        <>
          {/* `<TextConsultRoom>` is a client component (Realtime client
              + local state) — Next.js hydrates it on the client even
              when we mount it from this server component. The
              doctor's dashboard Supabase access token is forwarded as
              `accessToken`; Migration 052's RLS doctor branch
              (`auth.uid() = doctor_id`) authenticates the SELECT-on-
              mount. */}
          <div className="mt-4 h-[70vh] min-h-[400px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <TextConsultRoom
              sessionId={sessionRow.id}
              currentUserId={user.id}
              currentUserRole="doctor"
              accessToken={token}
              sessionStatus={sessionRow.status}
              counterpartyName={appointment.patient_name}
              mode="readonly"
              consultEndedAt={sessionRow.actual_ended_at ?? undefined}
            />
          </div>
          {/* Task 32 — transcript PDF download. Patient gets a DM
              when this fires (see `notifyPatientOfDoctorReplay` with
              `actionKind:'downloaded'` + `artifactType:'transcript'`). */}
          <div className="mt-4">
            <TranscriptDownloadButton
              sessionId={sessionRow.id}
              token={token}
              callerRole="doctor"
              sessionLive={sessionRow.status !== "ended"}
            />
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
          No conversation was recorded for this appointment.
        </div>
      )}
    </div>
  );
}
