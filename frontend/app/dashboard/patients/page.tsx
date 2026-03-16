import { createClient } from "@/lib/supabase/server";
import { getPatients, getPossibleDuplicates } from "@/lib/api";
import { redirect } from "next/navigation";
import type { PatientSummary, DuplicateGroupPatient } from "@/types/patient";
import PatientsListWithFilters from "@/components/patients/PatientsListWithFilters";

/**
 * Patients list page. Fetches from backend API with auth; loading/error per F4.
 * Filtering (search by name) is client-side. Shows possible duplicates (e-task-6).
 * @see e-task-3, e-task-4, e-task-6; FRONTEND_RECIPES F4
 */
export default async function PatientsPage() {
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
  let patients: PatientSummary[] = [];
  let duplicateGroups: DuplicateGroupPatient[][] = [];
  let errorMessage: string | null = null;

  try {
    const [patientsRes, duplicatesRes] = await Promise.all([
      getPatients(token),
      getPossibleDuplicates(token),
    ]);
    patients = patientsRes.data.patients;
    duplicateGroups = duplicatesRes.data.groups;
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err ? err.status : 500;
    if (status === 401) {
      redirect("/login");
    }
    errorMessage =
      status === 403
        ? "You don't have access to these patients."
        : "Unable to load patients. Please try again.";
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

  return (
    <PatientsListWithFilters
      patients={patients}
      duplicateGroups={duplicateGroups}
    />
  );
}
