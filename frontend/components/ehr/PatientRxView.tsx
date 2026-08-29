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
 *     The PDF composer also omits clinical notes (plan-p1).
 *   - Medicines render via the same projection helper as the form +
 *     the backend PDF, so structured codes always print as their
 *     long-form label ("Twice daily" not "BID").
 */

import * as React from "react";
import { PatientRxIdentityBlock } from "@/components/ehr/PatientRxIdentityBlock";
import {
  letterheadHeading,
  letterheadImageFitClass,
  letterheadTypeScreenPx,
  logoSizePx,
  type LetterheadImageFit,
  type LetterheadLogoSize,
  type LetterheadTextSize,
  type PatientIdentityPreset,
} from "@/lib/letterhead-heading";
import {
  formatDoseLabel,
  formatDurationLegacyLabel,
  getFoodTimingLabel,
  getFrequencyLegacyLabel,
  getRouteLegacyLabel,
} from "@/lib/medicineCodes";
import { RX_INSTRUCTION_MARKER } from "@/lib/cockpit/rx-instruction-marker";
import type {
  DoseUnit,
  DurationUnit,
  FoodTiming,
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
  // Migration 133 — dose details. Optional so legacy VM builders compile.
  doseQty?: number | null;
  doseUnit?: DoseUnit | null;
  foodTiming?: FoodTiming | null;
}

export interface PatientRxViewModel {
  /** Prefixed display name; e.g. "Dr. Jane Doe" */
  doctorName: string;
  doctorSpecialty?: string | null;
  qualifications?: string | null;
  registrationNumber?: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  logoUrl?: string | null;
  headerUrl?: string | null;
  footerUrl?: string | null;
  headerHeightMm?: number;
  footerHeightMm?: number;
  letterheadPreset?: "classic" | "centred" | "preprinted" | "banner" | null;
  accentColor?: string | null;
  chromeColor?: string | null;
  patientColor?: string | null;
  logoSize?: LetterheadLogoSize;
  patientIdentityPreset?: PatientIdentityPreset;
  showPatientPhone?: boolean;
  showPatientGuardian?: boolean;
  showPatientMrn?: boolean;
  showPatientAddress?: boolean;
  footerLine?: string | null;
  hideHaloCredit?: boolean;
  backgroundUrl?: string | null;
  backgroundPreset?: "none" | "paper" | "cross" | "upload" | null;
  backgroundOpacity?: number | null;
  headerFit?: LetterheadImageFit | null;
  footerFit?: LetterheadImageFit | null;
  backgroundFit?: LetterheadImageFit | null;
  headerTextSize?: LetterheadTextSize | null;
  patientTextSize?: LetterheadTextSize | null;
  bodyTextSize?: LetterheadTextSize | null;
  pageSize?: "a4" | "a5" | null;
  preprintMarginTopMm?: number;
  preprintMarginBottomMm?: number;
  pageMarginTopMm?: number;
  pageMarginRightMm?: number;
  pageMarginBottomMm?: number;
  pageMarginLeftMm?: number;

  patientName: string;
  /** Pre-formatted "25 Aug 2026". May be empty. */
  visitDateLabel?: string | null;
  patientAge?: string | null;
  patientGender?: string | null;
  patientPhone?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  address?: string | null;
  medicalRecordNumber?: string | null;

  cc: string | null;
  hopi: string | null;
  socialHistory?: string | null;
  customSubsections?: Array<{
    title: string;
    body: string | null;
    children: Array<{ title: string; body: string | null }>;
  }>;
  assessmentCustomSections?: Array<{
    title: string;
    body: string | null;
    children: Array<{ title: string; body: string | null }>;
  }>;
  planCustomSections?: Array<{
    title: string;
    body: string | null;
    children: Array<{ title: string; body: string | null }>;
  }>;
  provisionalDiagnosis: string | null;
  investigations: string | null;
  /** plan-p1 — patient-facing lifestyle / advice (education folded in). */
  advice: string | null;
  followUp: string | null;
  /**
   * @deprecated Folded into `advice`. Kept optional for preview callers.
   */
  patientEducation?: string | null;
  /** plan-p1 — patient-facing referral. */
  referral: string | null;
  /** Patient-shareable advice handouts (images/PDFs). */
  adviceHandouts?: Array<{
    id: string;
    fileType: string;
    label: string;
    downloadUrl: string;
  }>;

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

  // Migration 133 — "2 tabs (5 mg)" when both dose + strength are present.
  const doseLabel = formatDoseLabel(med.doseQty, med.doseUnit);
  const strength = med.dosage?.trim() ?? "";
  const dosage = doseLabel
    ? strength
      ? `${doseLabel} (${strength})`
      : doseLabel
    : strength;

  const foodLabel = getFoodTimingLabel(med.foodTiming);
  const instructionsText = (med.instructions ?? "").trim();
  const instructions = foodLabel
    ? instructionsText
      ? `${foodLabel} — ${instructionsText}`
      : foodLabel
    : instructionsText;

  return {
    name: med.medicineName ?? "",
    dosage,
    route,
    frequency,
    duration,
    instructions,
  };
}

// ============================================================================
// Sub-components
// ============================================================================

const DEFAULT_RX_ACCENT = "#000000";

function Section({
  label,
  body,
  accentColor,
  textSize,
}: {
  label: string;
  body: string | null | undefined;
  accentColor: string;
  textSize?: LetterheadTextSize | null;
}) {
  if (!body || !body.trim()) return null;
  return (
    <section className="mb-4">
      <h3
        className="font-semibold uppercase tracking-wide"
        style={{
          color: accentColor,
          fontSize: letterheadTypeScreenPx("bodyLabel", textSize),
        }}
      >
        {label}
      </h3>
      <p
        className="mt-1 whitespace-pre-wrap break-words text-gray-800"
        style={{ fontSize: letterheadTypeScreenPx("bodyText", textSize) }}
      >
        {body.trim()}
      </p>
    </section>
  );
}

function MedicineTable({
  meds,
  accentColor,
  textSize,
}: {
  meds: PatientRxMedicineVM[];
  accentColor: string;
  textSize?: LetterheadTextSize | null;
}) {
  const labelPx = letterheadTypeScreenPx("bodyLabel", textSize);
  const bodyPx = letterheadTypeScreenPx("bodyText", textSize);
  if (!meds || meds.length === 0) {
    return (
      <section className="mb-4">
        <h3
          className="font-semibold uppercase tracking-wide"
          style={{ color: accentColor, fontSize: labelPx }}
        >
          Rx
        </h3>
        <p className="mt-1 italic text-gray-500" style={{ fontSize: bodyPx }}>
          No medicines prescribed.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-4">
      <h3
        className="font-semibold uppercase tracking-wide"
        style={{ color: accentColor, fontSize: labelPx }}
      >
        Rx
      </h3>

      {/* Desktop: table layout. Mobile: stacked cards (sm:hidden table-row pair) */}
      <div className="mt-2 hidden sm:block">
        <table
          className="w-full table-auto border-collapse"
          style={{ fontSize: bodyPx }}
        >
          <thead>
            <tr
              className="bg-gray-50 text-left uppercase tracking-wide text-gray-500"
              style={{ fontSize: labelPx }}
            >
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
                    <td
                      className="border-b border-gray-100 px-2 py-2 text-gray-500"
                      style={{ fontSize: labelPx }}
                    >
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
                        className="border-b border-gray-100 px-2 pb-2 italic text-gray-500"
                        style={{ fontSize: labelPx }}
                      >
                        {RX_INSTRUCTION_MARKER} {d.instructions}
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
                <span className="text-gray-500" style={{ fontSize: labelPx }}>
                  {i + 1}.
                </span>
                <span
                  className="ml-auto font-semibold text-gray-900"
                  style={{ fontSize: bodyPx }}
                >
                  {d.name || "—"}
                </span>
              </div>
              <dl
                className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-gray-700"
                style={{ fontSize: labelPx }}
              >
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
                <p
                  className="mt-2 italic text-gray-600"
                  style={{ fontSize: labelPx }}
                >
                  {RX_INSTRUCTION_MARKER} {d.instructions}
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
  /**
   * Drop the letter card chrome so a parent modal can own the frame.
   */
  embedded?: boolean;
}

function LetterheadIdentity({
  viewModel,
  align,
  color,
}: {
  viewModel: PatientRxViewModel;
  align: "center" | "right";
  color: string;
}) {
  const title = letterheadHeading(viewModel.doctorName, viewModel.clinicName);
  const alignClass = align === "center" ? "text-center" : "text-right";
  const titlePx = letterheadTypeScreenPx("headerTitle", viewModel.headerTextSize);
  const metaPx = letterheadTypeScreenPx("headerMeta", viewModel.headerTextSize);
  return (
    <div className={alignClass} style={{ color }}>
      <h1 className="font-bold" style={{ fontSize: titlePx }}>
        {title}
      </h1>
      {viewModel.qualifications ? (
        <p style={{ fontSize: metaPx }}>{viewModel.qualifications}</p>
      ) : null}
      {viewModel.doctorSpecialty ? (
        <p style={{ fontSize: metaPx }}>{viewModel.doctorSpecialty}</p>
      ) : null}
      {viewModel.registrationNumber ? (
        <p style={{ fontSize: metaPx }}>
          Reg. No.: {viewModel.registrationNumber}
        </p>
      ) : null}
      {viewModel.clinicAddress ? (
        <div className="mt-1 whitespace-pre-wrap" style={{ fontSize: metaPx }}>
          {viewModel.clinicAddress}
        </div>
      ) : null}
    </div>
  );
}

const PatientRxView: React.FC<PatientRxViewProps> = ({
  viewModel,
  signedPdfUrl,
  onRefreshSignedPdfUrl,
  hideDownloadButton,
  embedded = false,
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

  const downloadDisabled = !signedPdfUrl && !onRefreshSignedPdfUrl;
  const showLogo =
    Boolean(viewModel.logoUrl) && viewModel.letterheadPreset !== "preprinted";
  const showBannerHeader =
    viewModel.letterheadPreset === "banner" && Boolean(viewModel.headerUrl);
  const showBannerFooter =
    viewModel.letterheadPreset === "banner" && Boolean(viewModel.footerUrl);
  const accentColor =
    viewModel.accentColor && /^#[0-9A-Fa-f]{6}$/.test(viewModel.accentColor)
      ? viewModel.accentColor
      : DEFAULT_RX_ACCENT;
  const chromeColor =
    viewModel.chromeColor && /^#[0-9A-Fa-f]{6}$/.test(viewModel.chromeColor)
      ? viewModel.chromeColor
      : accentColor;
  const patientColor =
    viewModel.patientColor && /^#[0-9A-Fa-f]{6}$/.test(viewModel.patientColor)
      ? viewModel.patientColor
      : accentColor;

  const showPageBackground =
    viewModel.letterheadPreset !== "preprinted" && Boolean(viewModel.backgroundUrl);
  const backgroundOpacity =
    Math.min(40, Math.max(0, viewModel.backgroundOpacity ?? 15)) / 100;

  return (
    <article
      className={
        embedded
          ? "relative w-full overflow-hidden bg-transparent"
          : "relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
      }
    >
      {showPageBackground ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={viewModel.backgroundUrl ?? undefined}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ opacity: backgroundOpacity }}
        />
      ) : null}
      <div className="relative">
      {/* Letterhead */}
      {showBannerHeader ? (
        <div className="-mx-5 -mt-5 mb-4 sm:-mx-7 sm:-mt-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewModel.headerUrl ?? undefined}
            alt=""
            className={`w-full ${letterheadImageFitClass(viewModel.headerFit ?? "stretch")}`}
            style={{ height: `${viewModel.headerHeightMm ?? 35}mm` }}
          />
        </div>
      ) : viewModel.letterheadPreset === "preprinted" ? null : (
      <header className="border-b border-black pb-4">
        {viewModel.letterheadPreset === "centred" ? (
          <div className="flex flex-col items-center gap-2 text-center">
            {showLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewModel.logoUrl ?? undefined}
                alt=""
                className="object-contain"
                style={{
                  width: logoSizePx(viewModel.logoSize),
                  height: logoSizePx(viewModel.logoSize),
                }}
              />
            ) : null}
            <LetterheadIdentity viewModel={viewModel} align="center" color={chromeColor} />
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {showLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewModel.logoUrl ?? undefined}
                alt=""
                className="shrink-0 object-contain"
                style={{
                  width: logoSizePx(viewModel.logoSize),
                  height: logoSizePx(viewModel.logoSize),
                }}
              />
            ) : (
              <span />
            )}
            <LetterheadIdentity viewModel={viewModel} align="right" color={chromeColor} />
          </div>
        )}
      </header>
      )}

      <PatientRxIdentityBlock
        preset={viewModel.patientIdentityPreset ?? "open_letter"}
        showPhone={viewModel.showPatientPhone !== false}
        showGuardian={viewModel.showPatientGuardian !== false}
        showMrn={viewModel.showPatientMrn !== false}
        showAddress={viewModel.showPatientAddress !== false}
        textColor={patientColor}
        textSize={viewModel.patientTextSize ?? undefined}
        fields={{
          patientName: viewModel.patientName,
          patientAge: viewModel.patientAge,
          patientGender: viewModel.patientGender,
          visitDateLabel: viewModel.visitDateLabel,
          patientPhone: viewModel.patientPhone,
          guardianName: viewModel.guardianName,
          guardianRelation: viewModel.guardianRelation,
          address: viewModel.address,
          medicalRecordNumber: viewModel.medicalRecordNumber,
        }}
      />

      {/* Sections */}
      <div className="mt-5">
        <Section
          label="Chief complaint"
          body={viewModel.cc}
          accentColor={accentColor}
          textSize={viewModel.bodyTextSize}
        />
        <Section
          label="History of present illness"
          body={viewModel.hopi}
          accentColor={accentColor}
          textSize={viewModel.bodyTextSize}
        />
        <Section
          label="Provisional diagnosis"
          body={viewModel.provisionalDiagnosis}
          accentColor={accentColor}
          textSize={viewModel.bodyTextSize}
        />
        <Section
          label="Investigations"
          body={viewModel.investigations}
          accentColor={accentColor}
          textSize={viewModel.bodyTextSize}
        />

        <MedicineTable
          meds={viewModel.medicines}
          accentColor={accentColor}
          textSize={viewModel.bodyTextSize}
        />

        <Section
          label="Advice"
          body={viewModel.advice}
          accentColor={accentColor}
          textSize={viewModel.bodyTextSize}
        />
        <Section
          label="Follow-up"
          body={viewModel.followUp}
          accentColor={accentColor}
          textSize={viewModel.bodyTextSize}
        />
        <Section
          label="Referral"
          body={viewModel.referral}
          accentColor={accentColor}
          textSize={viewModel.bodyTextSize}
        />
        {(viewModel.adviceHandouts?.length ?? 0) > 0 ? (
          <section className="mb-4" aria-label="Handouts">
            <h3
              className="mb-2 font-semibold uppercase tracking-wide text-gray-500"
              style={{
                fontSize: letterheadTypeScreenPx(
                  "bodyLabel",
                  viewModel.bodyTextSize,
                ),
              }}
            >
              Handouts
            </h3>
            <ul className="space-y-2">
              {viewModel.adviceHandouts!.map((h) => (
                <li key={h.id}>
                  <a
                    href={h.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                    style={{
                      fontSize: letterheadTypeScreenPx(
                        "bodyText",
                        viewModel.bodyTextSize,
                      ),
                    }}
                  >
                    {h.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* Footer + Download */}
      {showBannerFooter ? (
        <div className="-mx-5 mt-6 sm:-mx-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewModel.footerUrl ?? undefined}
            alt=""
            className={`w-full ${letterheadImageFitClass(viewModel.footerFit ?? "stretch")}`}
            style={{ height: `${viewModel.footerHeightMm ?? 20}mm` }}
          />
        </div>
      ) : null}
      {!hideDownloadButton && (
        <footer
          className="mt-6 flex flex-col items-stretch gap-3 border-t border-black pt-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="text-xs text-gray-500">
            {viewModel.footerLine?.trim() ? (
              <p className="mb-1" style={{ color: chromeColor }}>
                {viewModel.footerLine.trim()}
              </p>
            ) : null}
            <p>
              {viewModel.hideHaloCredit
                ? "For questions about this prescription, contact your doctor's clinic."
                : "Generated by Halo Aid. For questions about this prescription, contact your doctor's clinic."}
            </p>
          </div>
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
      </div>
    </article>
  );
};

export default PatientRxView;
