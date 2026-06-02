"use client";

/**
 * PatientRxView (EHR Sub-batch B2 / T3.18 + T3.16).
 *
 * The patient-facing rendering of a prescription. Mounted in two
 * places that share THIS exact component (single source of truth for
 * the patient experience):
 *
 *   1. <PrescriptionPatientPreview>  — modal in the doctor's
 *      <PrescriptionForm>. Hands in the in-progress form state via
 *      `viewModel`. The "Download PDF" button is disabled with a
 *      tooltip "Available after Send" because the PDF doesn't exist
 *      yet (Decision: do NOT fake a download with a sample PDF —
 *      simpler + truthful).
 *
 *   2. /r/[id]/page.tsx               — the patient share-link
 *      surface. Hands in fresh data fetched from the public endpoint
 *      and the freshly-minted `signedPdfUrl`. The "Download PDF"
 *      button is enabled.
 *
 * Mobile-first; uses a centred max-width container so it looks like
 * a "letter" on tablet/desktop and a clean stacked card on phone.
 *
 * Pinned conventions:
 *   - Empty/null section bodies render NOTHING (matches backend
 *     PDF's SectionBlock convention — same skip rule both surfaces).
 *   - `clinicalNotes` is NOT rendered. It's the doctor's private
 *     workspace; the patient view is "what the patient should know".
 *     The PDF treats it as a final section — we deliberately diverge
 *     to keep the patient page clean and trust-friendly. (If product
 *     wants it shown, flip a flag here in v2.)
 *   - Medicines render via the same projection helper as the form +
 *     the backend PDF, so structured codes always print as their
 *     long-form label ("Twice daily" not "BID").
 */

import * as React from "react";
import {
  formatDurationLegacyLabel,
  getFrequencyLegacyLabel,
  getRouteLegacyLabel,
} from "@/lib/medicineCodes";
import type {
  DurationUnit,
  FrequencyCode,
  RouteCode,
} from "@/types/prescription";

// ============================================================================
// View-model type (shared between preview + public-route surfaces)
// ============================================================================

export interface PatientRxMedicineVM {
  medicineName: string;
  dosage: string | null;
  /** Free-text route (legacy column). May be empty. */
  route: string | null;
  routeCode: RouteCode | null;
  /** Free-text frequency (legacy column). May be empty. */
  frequency: string | null;
  frequencyCode: FrequencyCode | null;
  /** Free-text duration (legacy column). May be empty. */
  duration: string | null;
  durationValue: number | null;
  durationUnit: DurationUnit | null;
  instructions: string | null;
}

export interface PatientRxViewModel {
  /** Prefixed display name; e.g. "Dr. Jane Doe" */
  doctorName: string;
  doctorSpecialty?: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;

  patientName: string;
  /** Pre-formatted "5 May 2026" or "5 May 2026, 4:30 PM". May be empty. */
  visitDateLabel?: string | null;

  cc: string | null;
  hopi: string | null;
  provisionalDiagnosis: string | null;
  investigations: string | null;
  followUp: string | null;
  patientEducation: string | null;

  medicines: PatientRxMedicineVM[];
}

// ============================================================================
// Internal helpers
// ============================================================================

function projectMedicineDisplay(med: PatientRxMedicineVM): {
  name: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
} {
  let frequency = "";
  if (med.frequencyCode && med.frequencyCode !== "CUSTOM") {
    frequency = getFrequencyLegacyLabel(med.frequencyCode);
  } else if (med.frequency) {
    frequency = med.frequency;
  }

  let duration = "";
  if (med.durationUnit) {
    duration = formatDurationLegacyLabel(med.durationValue, med.durationUnit);
  }
  if (!duration && med.duration) duration = med.duration;

  let route = "";
  if (med.routeCode && med.routeCode !== "other") {
    route = getRouteLegacyLabel(med.routeCode);
  } else if (med.route) {
    route = med.route;
  }

  return {
    name: med.medicineName ?? "",
    dosage: med.dosage ?? "",
    route,
    frequency,
    duration,
    instructions: med.instructions ?? "",
  };
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({
  label,
  body,
}: {
  label: string;
  body: string | null | undefined;
}) {
  if (!body || !body.trim()) return null;
  return (
    <section className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        {label}
      </h3>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">
        {body.trim()}
      </p>
    </section>
  );
}

function MedicineTable({ meds }: { meds: PatientRxMedicineVM[] }) {
  if (!meds || meds.length === 0) {
    return (
      <section className="mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Rx
        </h3>
        <p className="mt-1 text-sm italic text-gray-500">
          No medicines prescribed.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        Rx
      </h3>

      {/* Desktop: table layout. Mobile: stacked cards (sm:hidden table-row pair) */}
      <div className="mt-2 hidden sm:block">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="border-b border-gray-200 px-2 py-2 font-semibold">
                #
              </th>
              <th className="border-b border-gray-200 px-2 py-2 font-semibold">
                Medicine
              </th>
              <th className="border-b border-gray-200 px-2 py-2 font-semibold">
                Dose
              </th>
              <th className="border-b border-gray-200 px-2 py-2 font-semibold">
                Route
              </th>
              <th className="border-b border-gray-200 px-2 py-2 font-semibold">
                Frequency
              </th>
              <th className="border-b border-gray-200 px-2 py-2 font-semibold">
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            {meds.map((m, i) => {
              const d = projectMedicineDisplay(m);
              return (
                <React.Fragment key={`${i}-${d.name}`}>
                  <tr className="align-top">
                    <td className="border-b border-gray-100 px-2 py-2 text-xs text-gray-500">
                      {i + 1}
                    </td>
                    <td className="border-b border-gray-100 px-2 py-2 font-medium text-gray-900">
                      {d.name || "—"}
                    </td>
                    <td className="border-b border-gray-100 px-2 py-2 text-gray-800">
                      {d.dosage || "—"}
                    </td>
                    <td className="border-b border-gray-100 px-2 py-2 text-gray-800">
                      {d.route || "—"}
                    </td>
                    <td className="border-b border-gray-100 px-2 py-2 text-gray-800">
                      {d.frequency || "—"}
                    </td>
                    <td className="border-b border-gray-100 px-2 py-2 text-gray-800">
                      {d.duration || "—"}
                    </td>
                  </tr>
                  {d.instructions ? (
                    <tr>
                      <td />
                      <td
                        colSpan={5}
                        className="border-b border-gray-100 px-2 pb-2 text-xs italic text-gray-500"
                      >
                        ↳ {d.instructions}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked card per medicine */}
      <ol className="mt-2 space-y-3 sm:hidden">
        {meds.map((m, i) => {
          const d = projectMedicineDisplay(m);
          return (
            <li
              key={`m-${i}-${d.name}`}
              className="rounded-md border border-gray-200 bg-white p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-gray-500">{i + 1}.</span>
                <span className="ml-auto text-sm font-semibold text-gray-900">
                  {d.name || "—"}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-700">
                {d.dosage ? (
                  <div className="contents">
                    <dt className="text-gray-500">Dose</dt>
                    <dd>{d.dosage}</dd>
                  </div>
                ) : null}
                {d.route ? (
                  <div className="contents">
                    <dt className="text-gray-500">Route</dt>
                    <dd>{d.route}</dd>
                  </div>
                ) : null}
                {d.frequency ? (
                  <div className="contents">
                    <dt className="text-gray-500">Frequency</dt>
                    <dd>{d.frequency}</dd>
                  </div>
                ) : null}
                {d.duration ? (
                  <div className="contents">
                    <dt className="text-gray-500">Duration</dt>
                    <dd>{d.duration}</dd>
                  </div>
                ) : null}
              </dl>
              {d.instructions ? (
                <p className="mt-2 text-xs italic text-gray-600">
                  ↳ {d.instructions}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ============================================================================
// Public component
// ============================================================================

export interface PatientRxViewProps {
  viewModel: PatientRxViewModel;
  /**
   * When provided, the "Download PDF" button is enabled and points
   * directly at this URL. When null/undefined the button renders
   * disabled with a tooltip explaining why (preview mode in
   * <PrescriptionPatientPreview>; share-link route always supplies
   * a fresh URL).
   */
  signedPdfUrl?: string | null;
  /**
   * Lazy refresh path used by /r/[id]: when the original signed URL
   * is older than ~24h on patient revisit, the page can re-fetch a
   * fresh URL via this callback before opening. Optional; preview
   * surface omits it.
   */
  onRefreshSignedPdfUrl?: () => Promise<string | null>;
  /**
   * Hides the download button entirely (for tests / surfaces that
   * compose the view in a non-share context).
   */
  hideDownloadButton?: boolean;
}

const PatientRxView: React.FC<PatientRxViewProps> = ({
  viewModel,
  signedPdfUrl,
  onRefreshSignedPdfUrl,
  hideDownloadButton,
}) => {
  const [downloading, setDownloading] = React.useState(false);

  const handleDownload = React.useCallback(async () => {
    if (signedPdfUrl) {
      window.open(signedPdfUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!onRefreshSignedPdfUrl) return;
    setDownloading(true);
    try {
      const fresh = await onRefreshSignedPdfUrl();
      if (fresh) {
        window.open(fresh, "_blank", "noopener,noreferrer");
      }
    } finally {
      setDownloading(false);
    }
  }, [signedPdfUrl, onRefreshSignedPdfUrl]);

  const downloadDisabled =
    !signedPdfUrl && !onRefreshSignedPdfUrl;

  return (
    <article className="mx-auto w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
      {/* Letterhead */}
      <header className="border-b border-gray-200 pb-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 sm:text-xl">
              {viewModel.doctorName}
            </h1>
            {viewModel.doctorSpecialty ? (
              <p className="text-sm text-gray-500">
                {viewModel.doctorSpecialty}
              </p>
            ) : null}
          </div>
          {(viewModel.clinicName || viewModel.clinicAddress) && (
            <div className="text-sm sm:text-right">
              {viewModel.clinicName ? (
                <div className="font-semibold text-gray-900">
                  {viewModel.clinicName}
                </div>
              ) : null}
              {viewModel.clinicAddress ? (
                <div className="whitespace-pre-wrap text-gray-500">
                  {viewModel.clinicAddress}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </header>

      {/* Patient strip */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-gray-50 px-3 py-2 text-sm">
        <div>
          <span className="text-gray-500">Patient: </span>
          <span className="font-semibold text-gray-900">
            {viewModel.patientName}
          </span>
        </div>
        {viewModel.visitDateLabel ? (
          <div>
            <span className="text-gray-500">Visit: </span>
            <span className="font-semibold text-gray-900">
              {viewModel.visitDateLabel}
            </span>
          </div>
        ) : null}
      </div>

      {/* Sections */}
      <div className="mt-5">
        <Section label="Chief complaint" body={viewModel.cc} />
        <Section label="History of present illness" body={viewModel.hopi} />
        <Section
          label="Provisional diagnosis"
          body={viewModel.provisionalDiagnosis}
        />
        <Section label="Investigations" body={viewModel.investigations} />

        <MedicineTable meds={viewModel.medicines} />

        <Section
          label="Patient education"
          body={viewModel.patientEducation}
        />
        <Section label="Follow-up" body={viewModel.followUp} />
      </div>

      {/* Footer + Download */}
      {!hideDownloadButton && (
        <footer className="mt-6 flex flex-col items-stretch gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">
            Generated by Clariva. For questions about this prescription,
            contact your doctor&apos;s clinic.
          </p>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadDisabled || downloading}
            title={
              downloadDisabled
                ? "Available after Send"
                : "Open PDF in a new tab"
            }
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {downloading ? "Opening…" : "Download PDF"}
          </button>
        </footer>
      )}
    </article>
  );
};

export default PatientRxView;
