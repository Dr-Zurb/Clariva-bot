"use client";

/**
 * Patient-facing prescription share-link route (EHR Sub-batch B2 / T3.16).
 *
 * URL shape: `/r/[id]?t=<HMAC-rx-token>`
 *
 * **Threat model + auth.** No Supabase session; the URL token IS the
 * auth surface. The backend public endpoint
 * (`GET /api/v1/public/prescriptions/:id?t=...`) verifies the
 * HMAC-bound token + matches it against the URL `:id` before
 * returning anything. We never POST PHI back from this page.
 *
 * **Lifecycle states the page handles:**
 *   1. Missing/empty `?t=` → friendly "Invalid link" CTA.
 *   2. 410 (token expired) → "Link expired — request a new one" CTA
 *      pointing the patient back to their email/IG-DM thread.
 *   3. 401 / 404 / other → generic "Couldn't load this prescription".
 *   4. 200 → mount <PatientRxView> with the fresh signed PDF URL.
 *
 * The page mounts <PatientRxView> from
 * `frontend/components/ehr/PatientRxView.tsx` — the SAME component
 * the doctor's `<PrescriptionPatientPreview>` uses (Decision T3-D5
 * style: single source of truth for the patient surface). Snake →
 * camel projection happens here at the boundary.
 *
 * SSR note: this route is `"use client"` because (a) we need
 * `useSearchParams`, (b) the API call is browser-side anyway given
 * `NEXT_PUBLIC_API_URL` is the canonical base, and (c) the page is
 * mobile-first / first-paint-on-shell — the patient sees a loading
 * skeleton in <50ms, then the content lands once the fetch returns.
 */

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  getPublicPrescription,
  type PublicPrescriptionData,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import PatientRxView, {
  type PatientRxMedicineVM,
  type PatientRxViewModel,
} from "@/components/ehr/PatientRxView";

type Phase = "loading" | "expired" | "invalid" | "ready" | "error";

interface PageState {
  phase: Phase;
  data?: PublicPrescriptionData;
  errorMessage?: string;
}

function formatVisitDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateTime(d, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildViewModel(data: PublicPrescriptionData): PatientRxViewModel {
  const meds: PatientRxMedicineVM[] = data.prescription.prescription_medicines
    .map((m) => ({
      medicineName: m.medicine_name,
      dosage: m.dosage,
      route: m.route,
      routeCode: m.route_code,
      frequency: m.frequency,
      frequencyCode: m.frequency_code,
      duration: m.duration,
      durationValue: m.duration_value,
      durationUnit: m.duration_unit,
      instructions: m.instructions,
    }))
    // Defensive sort — backend already orders by sort_order ASC, but
    // a stale cache or partial fetch could surface unsorted rows.
    .sort((a, b) => {
      const ai =
        data.prescription.prescription_medicines.findIndex(
          (x) => x.medicine_name === a.medicineName,
        );
      const bi =
        data.prescription.prescription_medicines.findIndex(
          (x) => x.medicine_name === b.medicineName,
        );
      return ai - bi;
    });

  return {
    doctorName: data.doctor.display_name,
    doctorSpecialty: data.doctor.specialty,
    clinicName: data.doctor.clinic_name,
    clinicAddress: data.doctor.clinic_address,
    patientName: data.patient.display_name,
    visitDateLabel: formatVisitDate(data.appointment.appointment_date),
    cc: data.prescription.cc,
    hopi: data.prescription.hopi,
    provisionalDiagnosis: data.prescription.provisional_diagnosis,
    investigations: data.prescription.investigations,
    followUp: data.prescription.follow_up,
    patientEducation: data.prescription.patient_education,
    medicines: meds,
  };
}

export default function PatientRxSharePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id ?? "";
  const token = searchParams?.get("t") ?? "";

  const [state, setState] = useState<PageState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!id || !token) {
      setState({ phase: "invalid" });
      return;
    }

    (async () => {
      try {
        const res = await getPublicPrescription(id, token);
        if (!cancelled) setState({ phase: "ready", data: res.data });
      } catch (err) {
        if (cancelled) return;
        const status = (err as { status?: number }).status;
        if (status === 410) {
          setState({ phase: "expired" });
        } else if (status === 401 || status === 404) {
          setState({ phase: "invalid" });
        } else {
          setState({
            phase: "error",
            errorMessage:
              err instanceof Error
                ? err.message
                : "Couldn't load this prescription right now.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, token]);

  // ---- Render branches -----------------------------------------------------

  if (state.phase === "loading") {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-2xl animate-pulse rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="h-5 w-1/3 rounded bg-gray-200" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
          <div className="mt-6 h-3 w-full rounded bg-gray-100" />
          <div className="mt-2 h-3 w-5/6 rounded bg-gray-100" />
          <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
        </div>
      </main>
    );
  }

  if (state.phase === "expired") {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">
            Link expired
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            This prescription link is no longer active. To request a
            fresh link, reply to your email or Instagram DM thread with
            your doctor — they can resend it from their dashboard in
            one tap.
          </p>
        </div>
      </main>
    );
  }

  if (state.phase === "invalid") {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">
            Invalid link
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            We couldn&apos;t open this prescription. The link may be
            mistyped or no longer valid. Please check the link in your
            email or DM and try again.
          </p>
        </div>
      </main>
    );
  }

  if (state.phase === "error" || !state.data) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {state.errorMessage ??
              "Please try again in a moment, or contact your doctor's clinic for help."}
          </p>
        </div>
      </main>
    );
  }

  const vm = buildViewModel(state.data);

  return (
    <main className="min-h-screen bg-gray-50 px-2 py-6 sm:py-10">
      <PatientRxView
        viewModel={vm}
        signedPdfUrl={state.data.signed_pdf_url}
        onRefreshSignedPdfUrl={async () => {
          // Re-fetch the public endpoint to mint a fresh signed URL.
          // The signed_pdf_url returned at first paint may be hours
          // old by the time the patient revisits and clicks Download.
          try {
            const res = await getPublicPrescription(id, token);
            return res.data.signed_pdf_url;
          } catch {
            return null;
          }
        }}
      />
    </main>
  );
}
