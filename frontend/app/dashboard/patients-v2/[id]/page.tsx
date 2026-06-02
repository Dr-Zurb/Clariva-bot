import Link from "next/link";
import { Suspense } from "react";
import { getPatientById } from "@/lib/api";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types/patient";
import { PatientDetailHydrated } from "@/components/patients-v2/streaming/PatientDetailHydrated";
import { PatientDetailSkeleton } from "@/components/skeletons/patient-detail";
import { requireDashboardAuth } from "@/lib/auth/server-user";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Patient v2 detail route (Strangler Fig — DL-1).
 * np-08: parallel server prefetch + HydrationBoundary for first-paint overview.
 */
export default async function PatientV2DetailPage({ params }: PageProps) {
  const { id } = await params;
  const { user, token } = await requireDashboardAuth();

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
          className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive"
          aria-live="polite"
        >
          <p className="font-medium">{isNotFound ? "Not found" : "Error"}</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
        </div>
        <Link
          href="/dashboard/patients-v2"
          className={cn(
            "mt-4 inline-block text-sm font-medium text-primary hover:text-primary/80",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded",
          )}
        >
          ← Back to patients
        </Link>
      </div>
    );
  }

  if (!patient) return null;

  return (
    <Suspense fallback={<PatientDetailSkeleton />}>
      <PatientDetailHydrated
        patient={patient}
        token={token}
        userId={user.id}
      />
    </Suspense>
  );
}
