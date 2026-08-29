"use client";

/**
 * Doctor-side review modal wrapping the same A4 letterhead preview
 * as Letterhead & branding.
 *
 * Used two ways:
 *   - Peek-only (legacy PrescriptionForm) — Close, no commit actions.
 *   - Review-and-commit (cockpit) — send / finish / print combinations.
 *
 * Backdrop click + ESC close the modal unless a send/print is in flight.
 */

import * as React from "react";
import { MoreHorizontal, X } from "lucide-react";
import type { PatientRxViewModel } from "@/components/ehr/PatientRxView";
import {
  type LetterheadPagePreviewModel,
  type LetterheadPreviewMedicine,
} from "@/components/settings/LetterheadPagePreview";
import { LetterheadPreviewPane } from "@/components/settings/LetterheadPreviewPane";
import { Button } from "@/components/ui/button";
import {
  formatDoseLabel,
  formatDurationLegacyLabel,
  getFoodTimingLabel,
  getFrequencyLegacyLabel,
  getRouteLegacyLabel,
} from "@/lib/medicineCodes";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatPreviewMedicine(
  med: PatientRxViewModel["medicines"][number]
): LetterheadPreviewMedicine {
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
  const doseLabel = formatDoseLabel(med.doseQty, med.doseUnit);
  const strength = med.dosage?.trim() ?? "";
  const dose = doseLabel
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
    dose,
    route,
    frequency,
    duration,
    instructions,
  };
}

export function letterheadPreviewModelFromRx(
  vm: PatientRxViewModel
): LetterheadPagePreviewModel {
  const preset =
    vm.letterheadPreset === "centred" ||
    vm.letterheadPreset === "preprinted" ||
    vm.letterheadPreset === "banner"
      ? vm.letterheadPreset
      : "classic";
  return {
    doctorName: vm.doctorName,
    qualifications: vm.qualifications ?? "",
    specialty: vm.doctorSpecialty,
    clinicName: vm.clinicName?.trim() || "",
    clinicAddress: vm.clinicAddress?.trim() || "",
    logoUrl: preset === "preprinted" ? null : (vm.logoUrl ?? null),
    headerUrl: preset === "banner" ? (vm.headerUrl ?? null) : null,
    footerUrl: preset === "banner" ? (vm.footerUrl ?? null) : null,
    headerHeightMm: vm.headerHeightMm ?? 35,
    footerHeightMm: vm.footerHeightMm ?? 20,
    preset,
    pageSize: vm.pageSize === "a5" ? "a5" : "a4",
    accentColor: vm.accentColor ?? "#000000",
    chromeColor: vm.chromeColor ?? undefined,
    patientColor: vm.patientColor ?? undefined,
    preprintMarginTopMm: vm.preprintMarginTopMm ?? 40,
    preprintMarginBottomMm: vm.preprintMarginBottomMm ?? 30,
    pageMarginTopMm: vm.pageMarginTopMm ?? 12,
    pageMarginRightMm: vm.pageMarginRightMm ?? 12,
    pageMarginBottomMm: vm.pageMarginBottomMm ?? 12,
    pageMarginLeftMm: vm.pageMarginLeftMm ?? 12,
    logoSize: vm.logoSize,
    patientIdentityPreset: vm.patientIdentityPreset,
    showPatientPhone: vm.showPatientPhone,
    showPatientGuardian: vm.showPatientGuardian,
    showPatientMrn: vm.showPatientMrn,
    showPatientAddress: vm.showPatientAddress,
    footerLine: vm.footerLine,
    hideHaloCredit: vm.hideHaloCredit,
    backgroundUrl: preset === "preprinted" ? null : (vm.backgroundUrl ?? null),
    backgroundPreset: vm.backgroundPreset ?? "none",
    backgroundOpacity: vm.backgroundOpacity ?? 15,
    headerFit: vm.headerFit ?? undefined,
    footerFit: vm.footerFit ?? undefined,
    backgroundFit: vm.backgroundFit ?? undefined,
    headerTextSize: vm.headerTextSize ?? undefined,
    patientTextSize: vm.patientTextSize ?? undefined,
    bodyTextSize: vm.bodyTextSize ?? undefined,
    registrationNumber: vm.registrationNumber,
    rx: {
      patientName: vm.patientName,
      patientAge: vm.patientAge,
      patientGender: vm.patientGender,
      visitDateLabel: vm.visitDateLabel,
      patientPhone: vm.patientPhone,
      guardianName: vm.guardianName,
      guardianRelation: vm.guardianRelation,
      address: vm.address,
      medicalRecordNumber: vm.medicalRecordNumber,
      cc: vm.cc,
      hopi: vm.hopi,
      socialHistory: vm.socialHistory,
      diagnosis: vm.provisionalDiagnosis,
      investigations: vm.investigations,
      advice: vm.advice,
      followUp: vm.followUp,
      referral: vm.referral,
      customSubsections: vm.customSubsections,
      assessmentCustomSections: vm.assessmentCustomSections,
      planCustomSections: vm.planCustomSections,
      medicines: (vm.medicines ?? []).map(formatPreviewMedicine),
    },
  };
}

export interface PrescriptionPatientPreviewProps {
  open: boolean;
  onClose: () => void;
  viewModel: PatientRxViewModel | null;
  canSend?: boolean;
  canFinish?: boolean;
  canPrint?: boolean;
  sending?: boolean;
  printBusy?: boolean;
  finishBusy?: boolean;
  commitError?: string | null;
  commitSuccess?: string | null;
  onSendRx?: () => void;
  onSendAndFinish?: () => void;
  onSendFinishAndPrint?: () => void;
  onFinish?: () => void;
  onPrint?: () => void;
  onDownload?: () => void;
  /** Back / leave path only — omitted on intentional Done. */
  onStay?: () => void;
  onResumeLater?: () => void;
}

const PrescriptionPatientPreview: React.FC<PrescriptionPatientPreviewProps> = ({
  open,
  onClose,
  viewModel,
  canSend = false,
  canFinish = false,
  canPrint = false,
  sending = false,
  printBusy = false,
  finishBusy = false,
  commitError,
  commitSuccess,
  onSendRx,
  onSendAndFinish,
  onSendFinishAndPrint,
  onFinish,
  onPrint,
  onDownload,
  onStay,
  onResumeLater,
}) => {
  const busy = sending || printBusy || finishBusy;
  const showLeaveExit = Boolean(onStay && onResumeLater);
  const hasCommitActions = Boolean(
    onSendRx || onSendAndFinish || onSendFinishAndPrint || onFinish || onPrint
  );
  const showFooter = hasCommitActions || showLeaveExit;
  const [alsoPrint, setAlsoPrint] = React.useState(false);

  const canPrimarySend = canSend && Boolean(onSendAndFinish);
  const canPrimaryFinish = !canPrimarySend && canFinish && Boolean(onFinish);
  const showAlsoPrint =
    canPrimarySend && canPrint && Boolean(onSendFinishAndPrint);
  const showSendOnly = canSend && Boolean(onSendRx);
  const showFinishOnly = canPrimarySend && canFinish && Boolean(onFinish);
  const showMore = showSendOnly || showFinishOnly;
  const showPreviewPrint = canPrint && Boolean(onPrint);

  React.useEffect(() => {
    if (open) setAlsoPrint(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, busy]);

  if (!open || !viewModel) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review prescription"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:h-[88vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Prescription
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {showLeaveExit
                ? "Leave now and OPD will show Incomplete consult — or send & finish."
                : hasCommitActions
                  ? "Check it, then send & finish."
                  : "What the patient will see."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <LetterheadPreviewPane
            model={letterheadPreviewModelFromRx(viewModel)}
            defaultZoom={1.5}
            onPrint={showPreviewPrint ? onPrint : undefined}
            onDownload={showPreviewPrint && onDownload ? onDownload : undefined}
            printBusy={busy}
          />
        </div>

        {showFooter ? (
          <footer
            className="relative z-10 shrink-0 space-y-3 border-t border-border bg-muted/40 px-5 py-3.5"
            data-testid="rx-review-actions"
          >
            {commitError ? (
              <p role="alert" className="text-sm text-destructive">
                {commitError}
              </p>
            ) : commitSuccess ? (
              <p role="status" className="text-sm text-green-700">
                {commitSuccess}
              </p>
            ) : null}

            {showLeaveExit ? (
              <div
                className="flex flex-wrap items-center gap-2"
                data-testid="rx-leave-exit"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={onStay}
                >
                  Stay
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={onResumeLater}
                >
                  Leave — resume later
                </Button>
              </div>
            ) : null}

            {hasCommitActions ? (
              <div className="flex items-center justify-between gap-3">
                {showAlsoPrint ? (
                  <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={alsoPrint}
                      disabled={busy}
                      onCheckedChange={(value) => setAlsoPrint(value === true)}
                      aria-label="Also print"
                    />
                    Also print
                  </label>
                ) : (
                  <span />
                )}

                <div className="flex shrink-0 items-center gap-2">
                  {showMore ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          aria-label="More actions"
                        >
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {showSendOnly && onSendRx ? (
                          <DropdownMenuItem
                            disabled={busy}
                            onSelect={() => onSendRx()}
                          >
                            Send Rx only
                          </DropdownMenuItem>
                        ) : null}
                        {showFinishOnly && onFinish ? (
                          <DropdownMenuItem
                            disabled={busy}
                            onSelect={() => onFinish()}
                          >
                            Finish without sending
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}

                  {canPrimarySend && onSendAndFinish ? (
                    <Button
                      type="button"
                      className="h-10 min-w-[9.5rem]"
                      disabled={busy}
                      onClick={() => {
                        if (alsoPrint && onSendFinishAndPrint) {
                          onSendFinishAndPrint();
                          return;
                        }
                        onSendAndFinish();
                      }}
                    >
                      {sending && !printBusy ? "Sending…" : "Send & finish"}
                    </Button>
                  ) : canPrimaryFinish && onFinish ? (
                    <Button
                      type="button"
                      className="h-10 min-w-[9.5rem]"
                      disabled={busy}
                      onClick={onFinish}
                    >
                      {finishBusy ? "Finishing…" : "Finish visit"}
                    </Button>
                  ) : canPrint && onPrint ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 min-w-[9.5rem]"
                      disabled={busy}
                      onClick={onPrint}
                    >
                      {printBusy ? "Printing…" : "Print"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>
  );
};

export default PrescriptionPatientPreview;
