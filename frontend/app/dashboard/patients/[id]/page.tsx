import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPatientById } from "@/lib/api";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types/patient";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Patient detail page. Fetches by ID; 404/403 handling; no PHI in logs.
 * @see e-task-5; FRONTEND_RECIPES F4
 */
export default async function PatientDetailPage({ params }: PageProps) {
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
  let patient: Patient | null = null;
  let errorMessage: string | null = null;
  let isNotFound = false;

  try {
    const res = await getPatientById(id, token);
    patient = res.data.patient;
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err ? err.status : 500;
    if (status === 401) {
      redirect("/login");
    }
    if (status === 404) {
      isNotFound = true;
      errorMessage = "Patient not found.";
    } else if (status === 403) {
      errorMessage = "You don't have access to this patient.";
    } else {
      errorMessage = "Unable to load patient. Please try again.";
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
          href="/dashboard/patients"
          className={cn(
            "mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
          )}
        >
          Back to patients
        </Link>
      </div>
    );
  }

  if (!patient) return null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/dashboard/patients"
          className={cn(
            "text-sm font-medium text-blue-600 hover:text-blue-800",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
          )}
        >
          ← Back to patients
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900">Patient</h1>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-gray-500">Name</dt>
          <dd className="mt-0.5 text-gray-900">{patient.name}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Phone</dt>
          <dd className="mt-0.5 text-gray-900">{patient.phone}</dd>
        </div>
        {patient.date_of_birth && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Date of birth</dt>
            <dd className="mt-0.5 text-gray-900">
              {formatDate(patient.date_of_birth)}
            </dd>
          </div>
        )}
        {patient.gender && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Gender</dt>
            <dd className="mt-0.5 text-gray-900">{patient.gender}</dd>
          </div>
        )}
        {patient.platform && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Platform</dt>
            <dd className="mt-0.5 text-gray-900">{patient.platform}</dd>
          </div>
        )}
        <div>
          <dt className="text-sm font-medium text-gray-500">Consent status</dt>
          <dd>
            <span
              className={cn(
                "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                patient.consent_status === "granted" && "bg-green-100 text-green-800",
                patient.consent_status === "pending" && "bg-amber-100 text-amber-800",
                patient.consent_status === "revoked" && "bg-gray-100 text-gray-700"
              )}
            >
              {patient.consent_status ?? "—"}
            </span>
          </dd>
        </div>
        {patient.consent_granted_at && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Consent granted</dt>
            <dd className="mt-0.5 text-gray-900">
              {formatDateTime(patient.consent_granted_at)}
            </dd>
          </div>
        )}
        {patient.consent_method && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Consent method</dt>
            <dd className="mt-0.5 text-gray-900">{patient.consent_method}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
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
