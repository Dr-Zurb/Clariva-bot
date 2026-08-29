"use client";

/**
 * Cockpit-level Rx commit controller (cv3l-05 follow-up).
 *
 * Owns send + preview + pre-send modals at the shell root so footer actions
 * survive Plan-tab removal. Reads shared draft state from RxFormProvider.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildRxPayload,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import { useRxSafety } from "@/components/cockpit/rx/RxSafetyContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { useRegisterRxFormActions } from "@/components/cockpit/rx/RxFormActionsContext";
import {
  sendPrescriptionToPatient,
  getDoctorSettings,
  getPrescriptionPdfUrl,
} from "@/lib/api";
import type { PatientRxViewModel } from "@/components/ehr/PatientRxView";
import { sanitizeCustomSubsectionsForOutput } from "@/lib/cockpit/custom-subsections";
import { resolveFollowUpForOutput } from "@/lib/cockpit/follow-up-format";
import {
  computePreSendWarnings,
  focusTargetFor,
  warningKindsForTelemetry,
  type PreSendWarning,
  type PreSendWarningKind,
  type PreSendFocusTarget,
} from "@/lib/ehr/pre-send-warnings";
import { emitPreSendOutcome } from "@/lib/ehr/telemetry";
import type { InteractionRow } from "@/lib/api/drug-interactions";
import {
  canSendPrescription,
  type CockpitState,
} from "@/lib/patient-profile/state";
import { formatDate } from "@/lib/format-date";
import type { PatientSex } from "@/types/appointment";

/** Identity already on the appointment — preview must not invent sample PHI. */
export interface RxPreviewPatientIdentity {
  phone?: string | null;
  ageYears?: number | null;
  sex?: PatientSex | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  mrn?: string | null;
  visitDate?: string | null;
}

function formatPreviewAgeYears(age: number | null | undefined): string | null {
  if (age == null || !Number.isFinite(age)) return null;
  if (age < 1) return "< 1 y";
  return `${age} y`;
}

export async function downloadSignedPdf(
  signedUrl: string,
  filename = "prescription.pdf",
): Promise<void> {
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error("Could not download prescription PDF");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    const a = document.createElement("a");
    a.href = signedUrl;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/** Fetch the signed PDF and open the system print dialog — no extra tab. */
export async function printSignedPdf(signedUrl: string): Promise<void> {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error("Could not load prescription PDF");
  const raw = await res.blob();
  const blob =
    raw.type === "application/pdf"
      ? raw
      : new Blob([raw], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.title = "Print prescription";
    iframe.src = objectUrl;
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    let settled = false;
    let printed = false;

    const cleanup = () => {
      iframe.remove();
      URL.revokeObjectURL(objectUrl);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const scheduleCleanup = (win: Window) => {
      let cleaned = false;
      const finish = () => {
        if (cleaned) return;
        cleaned = true;
        win.removeEventListener("afterprint", finish);
        cleanup();
      };
      win.addEventListener("afterprint", finish);
      window.setTimeout(finish, 60_000);
    };

    const triggerPrint = () => {
      if (printed) return;
      const win = iframe.contentWindow;
      if (!win) return;
      printed = true;
      try {
        win.focus();
        win.print();
        scheduleCleanup(win);
        succeed();
      } catch {
        fail("Could not open the print dialog");
      }
    };

    iframe.onload = () => triggerPrint();
    iframe.onerror = () => fail("Could not load prescription PDF");
    document.body.appendChild(iframe);
    // Safari often skips onload for a PDF iframe.
    window.setTimeout(triggerPrint, 250);
    window.setTimeout(() => {
      if (!printed) fail("Could not open the print dialog");
    }, 2000);
  });
}

function formatPreviewVisitDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDate(d);
}

export interface UseRxCommitActionsArgs {
  appointmentId: string;
  patientId: string | null;
  patientName?: string | null;
  patientIdentity?: RxPreviewPatientIdentity | null;
  token: string;
  cockpitState: CockpitState;
  onFinish?: () => void;
  onSent?: (prescriptionId: string) => void | Promise<void>;
  onSuccess?: () => void;
  /** When false, skip context registration (standalone tests). */
  registerActions?: boolean;
}

export interface UseRxCommitActionsResult {
  canSend: boolean;
  saving: boolean;
  previewLoading: boolean;
  finishSending: boolean;
  openPreview: () => void;
  sendRx: () => void;
  sendAndFinish: () => void;
  sendFinishAndPrint: () => void;
  finishVisit: () => void;
  printPrescription: () => void;
  downloadPrescription: () => void;
  canPrint: boolean;
  canFinish: boolean;
  printBusy: boolean;
  previewOpen: boolean;
  previewVM: PatientRxViewModel | null;
  closePreview: () => void;
  preSendWarnings: ReadonlyArray<PreSendWarning> | null;
  onPreSendCancel: () => void;
  onPreSendEdit: () => void;
  onPreSendSendAnyway: () => void;
  commitError: string | null;
  commitSuccess: string | null;
}

export function useRxCommitActions({
  appointmentId,
  patientId,
  patientName,
  patientIdentity,
  token,
  cockpitState,
  onFinish,
  onSent,
  onSuccess,
  registerActions = true,
}: UseRxCommitActionsArgs): UseRxCommitActionsResult {
  const shell = usePrescriptionFormShell();
  const { state: rxState, autoSave } = useRxForm();
  const {
    formAllergyMatches,
    isAcked,
    ddiInteractions,
    medicineInstanceIds: safetyMedicineInstanceIds,
  } = useRxSafety();

  const prescriptionIdRef = shell?.prescriptionIdRef;
  const attachments = shell?.attachments ?? [];
  const entryMode = shell?.entryMode ?? "structured";
  const medicineInstanceIds =
    shell?.medicineInstanceIds ?? safetyMedicineInstanceIds;

  const { fields } = rxState;
  const medicines = fields.medicines;
  const { flush: autoSaveFlush } = autoSave;

  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVM, setPreviewVM] = useState<PatientRxViewModel | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preSendWarnings, setPreSendWarnings] = useState<
    ReadonlyArray<PreSendWarning> | null
  >(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  const finishAfterSendRef = useRef(false);
  const printAfterSendRef = useRef(false);
  const doctorMetaRef = useRef<{
    doctorName: string;
    doctorSpecialty: string | null;
    clinicName: string | null;
    clinicAddress: string | null;
    timezone: string;
    qualifications: string | null;
    logoUrl: string | null;
    headerUrl: string | null;
    footerUrl: string | null;
    headerHeightMm: number;
    footerHeightMm: number;
    letterheadPreset: "classic" | "centred" | "preprinted" | "banner" | null;
    accentColor: string | null;
    chromeColor: string | null;
    patientColor: string | null;
    logoSize: "small" | "medium" | "large";
    patientIdentityPreset: "open_letter" | "compact" | "grid";
    showPatientPhone: boolean;
    showPatientGuardian: boolean;
    showPatientMrn: boolean;
    showPatientAddress: boolean;
    footerLine: string | null;
    hideHaloCredit: boolean;
    backgroundUrl: string | null;
    backgroundPreset: "none" | "paper" | "cross" | "upload";
    backgroundOpacity: number;
    headerFit: "fit" | "fill" | "stretch";
    footerFit: "fit" | "fill" | "stretch";
    backgroundFit: "fit" | "fill" | "stretch";
    headerTextSize: "small" | "medium" | "large";
    patientTextSize: "small" | "medium" | "large";
    bodyTextSize: "small" | "medium" | "large";
    pageSize: "a4" | "a5";
    preprintMarginTopMm: number;
    preprintMarginBottomMm: number;
    pageMarginTopMm: number;
    pageMarginRightMm: number;
    pageMarginBottomMm: number;
    pageMarginLeftMm: number;
  } | null>(null);

  const canSend = canSendPrescription(cockpitState);
  const hasRxId = Boolean(
    shell?.prescription?.id ?? prescriptionIdRef?.current,
  );
  const canPrint = hasRxId || canSend;
  const canFinish =
    Boolean(onFinish) &&
    cockpitState !== "ended" &&
    cockpitState !== "terminal";

  const buildPreviewViewModel = useCallback((): PatientRxViewModel => {
    const meta = doctorMetaRef.current;
    const payload = buildRxPayload(fields);
    return {
      doctorName: meta?.doctorName ?? "Doctor",
      doctorSpecialty: meta?.doctorSpecialty ?? null,
      qualifications: meta?.qualifications ?? null,
      clinicName: meta?.clinicName ?? null,
      clinicAddress: meta?.clinicAddress ?? null,
      logoUrl: meta?.logoUrl ?? null,
      headerUrl: meta?.headerUrl ?? null,
      footerUrl: meta?.footerUrl ?? null,
      headerHeightMm: meta?.headerHeightMm ?? 35,
      footerHeightMm: meta?.footerHeightMm ?? 20,
      letterheadPreset: meta?.letterheadPreset ?? null,
      accentColor: meta?.accentColor ?? null,
      chromeColor: meta?.chromeColor ?? null,
      patientColor: meta?.patientColor ?? null,
      logoSize: meta?.logoSize ?? "medium",
      patientIdentityPreset: meta?.patientIdentityPreset ?? "open_letter",
      showPatientPhone: meta?.showPatientPhone !== false,
      showPatientGuardian: meta?.showPatientGuardian !== false,
      showPatientMrn: meta?.showPatientMrn !== false,
      showPatientAddress: meta?.showPatientAddress !== false,
      footerLine: meta?.footerLine ?? null,
      hideHaloCredit: meta?.hideHaloCredit === true,
      backgroundUrl: meta?.backgroundUrl ?? null,
      backgroundPreset: meta?.backgroundPreset ?? "none",
      backgroundOpacity: meta?.backgroundOpacity ?? 15,
      headerFit: meta?.headerFit ?? "stretch",
      footerFit: meta?.footerFit ?? "stretch",
      backgroundFit: meta?.backgroundFit ?? "fill",
      headerTextSize: meta?.headerTextSize ?? "medium",
      patientTextSize: meta?.patientTextSize ?? "medium",
      bodyTextSize: meta?.bodyTextSize ?? "medium",
      pageSize: meta?.pageSize ?? "a4",
      preprintMarginTopMm: meta?.preprintMarginTopMm ?? 40,
      preprintMarginBottomMm: meta?.preprintMarginBottomMm ?? 30,
      pageMarginTopMm: meta?.pageMarginTopMm ?? 12,
      pageMarginRightMm: meta?.pageMarginRightMm ?? 12,
      pageMarginBottomMm: meta?.pageMarginBottomMm ?? 12,
      pageMarginLeftMm: meta?.pageMarginLeftMm ?? 12,
      patientName: patientName?.trim() || "Patient",
      visitDateLabel: formatPreviewVisitDate(patientIdentity?.visitDate),
      patientAge: formatPreviewAgeYears(patientIdentity?.ageYears),
      patientGender: patientIdentity?.sex ?? null,
      patientPhone: patientIdentity?.phone?.trim() || null,
      guardianName: patientIdentity?.guardianName?.trim() || null,
      guardianRelation: patientIdentity?.guardianRelation?.trim() || null,
      medicalRecordNumber: patientIdentity?.mrn?.trim() || null,
      cc: payload.cc,
      hopi: payload.hopi,
      socialHistory: payload.socialHistory,
      provisionalDiagnosis: payload.provisionalDiagnosis,
      investigations: payload.investigations,
      advice: payload.advice,
      followUp: resolveFollowUpForOutput(
        payload.followUp,
        payload.followUpValue,
        payload.followUpUnit,
      ),
      patientEducation: null,
      referral: payload.referral,
      customSubsections: sanitizeCustomSubsectionsForOutput(
        payload.customSubsections,
      ),
      assessmentCustomSections: sanitizeCustomSubsectionsForOutput(
        payload.assessmentCustomSections,
      ),
      planCustomSections: sanitizeCustomSubsectionsForOutput(
        payload.planCustomSections,
      ),
      medicines: payload.medicines.map((m) => ({
        medicineName: m.medicineName,
        dosage: m.dosage || null,
        route: m.route || null,
        routeCode: m.routeCode,
        frequency: m.frequency || null,
        frequencyCode: m.frequencyCode,
        duration: m.duration || null,
        durationValue: m.durationValue,
        durationUnit: m.durationUnit,
        instructions: m.instructions || null,
        doseQty: m.doseQty,
        doseUnit: m.doseUnit,
        foodTiming: m.foodTiming,
      })),
    };
  }, [fields, patientName, patientIdentity]);

  const openPreview = useCallback(() => {
    void (async () => {
      setCommitError(null);
      if (!doctorMetaRef.current) {
        setPreviewLoading(true);
        try {
          const supabase = createClient();
          const [{ data: userResp }, settingsRes] = await Promise.all([
            supabase.auth.getUser(),
            getDoctorSettings(token).catch(() => null),
          ]);
          const meta =
            (userResp.user?.user_metadata as
              | { full_name?: string; name?: string }
              | null
              | undefined) ?? {};
          const rawName =
            (typeof meta.full_name === "string" && meta.full_name.trim()) ||
            (typeof meta.name === "string" && meta.name.trim()) ||
            (userResp.user?.email
              ? userResp.user.email.split("@")[0]
              : "") ||
            "";
          const doctorName = rawName
            ? rawName.toLowerCase().startsWith("dr")
              ? rawName.replace(/^dr\.?\s*/i, "Dr. ")
              : `Dr. ${rawName}`
            : "Doctor";
          const settings = settingsRes?.data?.settings ?? null;
          doctorMetaRef.current = {
            doctorName,
            doctorSpecialty: settings?.specialty?.trim() || null,
            clinicName: settings?.practice_name?.trim() || null,
            clinicAddress: settings?.address_summary?.trim() || null,
            timezone: settings?.timezone || "Asia/Kolkata",
            qualifications: settings?.qualifications?.trim() || null,
            logoUrl: settings?.logo_preview_url ?? null,
            headerUrl: settings?.header_preview_url ?? null,
            footerUrl: settings?.footer_preview_url ?? null,
            headerHeightMm: settings?.header_height_mm ?? 35,
            footerHeightMm: settings?.footer_height_mm ?? 20,
            letterheadPreset: settings?.letterhead_preset ?? null,
            accentColor: settings?.letterhead_accent_color ?? null,
            chromeColor: settings?.letterhead_chrome_color ?? null,
            patientColor: settings?.letterhead_patient_color ?? null,
            logoSize: settings?.logo_size ?? "medium",
            patientIdentityPreset: settings?.patient_identity_preset ?? "open_letter",
            showPatientPhone: settings?.show_patient_phone !== false,
            showPatientGuardian: settings?.show_patient_guardian !== false,
            showPatientMrn: settings?.show_patient_mrn !== false,
            showPatientAddress: settings?.show_patient_address !== false,
            footerLine: settings?.letterhead_footer_line ?? null,
            hideHaloCredit: settings?.hide_halo_credit === true,
            backgroundPreset: settings?.letterhead_background_preset ?? "none",
            backgroundOpacity: settings?.letterhead_background_opacity ?? 15,
            headerFit: settings?.letterhead_header_fit ?? "stretch",
            footerFit: settings?.letterhead_footer_fit ?? "stretch",
            backgroundFit: settings?.letterhead_background_fit ?? "fill",
            headerTextSize: settings?.letterhead_header_text_size ?? "medium",
            patientTextSize: settings?.letterhead_patient_text_size ?? "medium",
            bodyTextSize: settings?.letterhead_body_text_size ?? "medium",
            pageSize: settings?.page_size === "a5" ? "a5" : "a4",
            preprintMarginTopMm: settings?.preprint_margin_top_mm ?? 40,
            preprintMarginBottomMm: settings?.preprint_margin_bottom_mm ?? 30,
            pageMarginTopMm: settings?.page_margin_top_mm ?? 12,
            pageMarginRightMm: settings?.page_margin_right_mm ?? 12,
            pageMarginBottomMm: settings?.page_margin_bottom_mm ?? 12,
            pageMarginLeftMm: settings?.page_margin_left_mm ?? 12,
            backgroundUrl:
              settings?.letterhead_background_preset === "paper"
                ? "/letterhead/bg-paper.png"
                : settings?.letterhead_background_preset === "cross"
                  ? "/letterhead/bg-cross.png"
                  : settings?.letterhead_background_preset === "upload"
                    ? settings?.background_preview_url ?? null
                    : null,
          };
        } catch {
          doctorMetaRef.current = {
            doctorName: "Doctor",
            doctorSpecialty: null,
            clinicName: null,
            clinicAddress: null,
            timezone: "Asia/Kolkata",
            qualifications: null,
            logoUrl: null,
            headerUrl: null,
            footerUrl: null,
            headerHeightMm: 35,
            footerHeightMm: 20,
            letterheadPreset: null,
            accentColor: null,
            chromeColor: null,
            patientColor: null,
            logoSize: "medium",
            patientIdentityPreset: "open_letter",
            showPatientPhone: true,
            showPatientGuardian: true,
            showPatientMrn: true,
            showPatientAddress: true,
            footerLine: null,
            hideHaloCredit: false,
            backgroundUrl: null,
            backgroundPreset: "none",
            backgroundOpacity: 15,
            headerFit: "stretch",
            footerFit: "stretch",
            backgroundFit: "fill",
            headerTextSize: "medium",
            patientTextSize: "medium",
            bodyTextSize: "medium",
            pageSize: "a4",
            preprintMarginTopMm: 40,
            preprintMarginBottomMm: 30,
            pageMarginTopMm: 12,
            pageMarginRightMm: 12,
            pageMarginBottomMm: 12,
            pageMarginLeftMm: 12,
          };
        } finally {
          setPreviewLoading(false);
        }
      }
      setPreviewVM(buildPreviewViewModel());
      setPreviewOpen(true);
    })();
  }, [token, buildPreviewViewModel]);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  const emitPreSendTelemetryFor = useCallback(
    (
      warnings: ReadonlyArray<PreSendWarning>,
      outcome: "cancelled" | "edited" | "sent-anyway",
    ): void => {
      const counts: Partial<Record<PreSendWarningKind, number>> = {};
      let ddiSeverity: InteractionRow["severity"] | undefined;
      for (const w of warnings) {
        switch (w.kind) {
          case "unacked-allergy":
          case "unacked-ddi":
            counts[w.kind] = (counts[w.kind] ?? 0) + w.count;
            if (w.kind === "unacked-ddi") {
              ddiSeverity = w.highestSeverity;
            }
            break;
          case "no-diagnosis":
          case "empty-rx":
            counts[w.kind] = (counts[w.kind] ?? 0) + 1;
            break;
        }
      }
      emitPreSendOutcome({
        rxId: prescriptionIdRef?.current ?? null,
        appointmentId,
        warningKinds: warningKindsForTelemetry(warnings),
        warningCounts: counts,
        ...(ddiSeverity ? { highestDdiSeverity: ddiSeverity } : {}),
        outcome,
        occurredAt: new Date().toISOString(),
      });
    },
    [appointmentId, prescriptionIdRef],
  );

  const focusEditTarget = useCallback((target: PreSendFocusTarget) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (
      typeof (el as HTMLElement).focus === "function" &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
    ) {
      (el as HTMLInputElement | HTMLTextAreaElement).focus();
      return;
    }
    const inner = el.querySelector<HTMLElement>(
      "input, textarea, button, [tabindex]:not([tabindex='-1'])",
    );
    inner?.focus();
  }, []);

  const printSavedPrescription = useCallback(
    async (rxId: string): Promise<void> => {
      try {
        sessionStorage.setItem(`pf11_cancelled_${appointmentId}`, "1");
      } catch {
        // private mode / SSR
      }
      const res = await getPrescriptionPdfUrl(token, rxId);
      await printSignedPdf(res.data.signedUrl);
    },
    [appointmentId, token],
  );

  const performSaveAndSend = useCallback(async () => {
    setCommitError(null);
    setCommitSuccess(null);
    setSaving(true);
    const shouldPrint = printAfterSendRef.current;
    const shouldFinish = finishAfterSendRef.current;
    printAfterSendRef.current = false;
    finishAfterSendRef.current = false;
    try {
      try {
        await autoSaveFlush();
      } catch (saveErr) {
        setCommitError(
          saveErr instanceof Error
            ? `Save failed before send: ${saveErr.message}`
            : "Save failed before send",
        );
        return;
      }
      const rxId = prescriptionIdRef?.current;
      if (!rxId) {
        setCommitError("Prescription was not saved. Please try again.");
        return;
      }
      const sendRes = await sendPrescriptionToPatient(token, rxId);
      const { sent, channels } = sendRes.data;
      if (sent) {
        setCommitSuccess(
          channels?.instagram && channels?.email
            ? "Prescription saved and sent to patient (DM + email)."
            : channels?.instagram
              ? "Prescription saved and sent to patient (DM)."
              : channels?.email
                ? "Prescription saved and sent to patient (email)."
                : "Prescription saved and sent.",
        );
      } else {
        setCommitSuccess(
          sendRes.data.reason === "no_patient_link"
            ? "Prescription saved. Could not send (no Instagram link or email for patient)."
            : "Prescription saved. Send to patient failed.",
        );
      }
      onSuccess?.();
      if (sent) {
        try {
          await onSent?.(rxId);
        } catch {
          // Soft failure — Rx already sent.
        }
      }
      if (shouldPrint) {
        try {
          await printSavedPrescription(rxId);
        } catch (printErr) {
          setCommitError(
            printErr instanceof Error
              ? printErr.message
              : "Could not open the print dialog",
          );
        }
      }
      if (shouldFinish) {
        setPreviewOpen(false);
        onFinish?.();
      }
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Failed to save and send");
    } finally {
      setSaving(false);
    }
  }, [
    autoSaveFlush,
    printSavedPrescription,
    prescriptionIdRef,
    token,
    onSuccess,
    onSent,
    onFinish,
  ]);

  const handleSaveAndSend = useCallback(async () => {
    const isStructured = entryMode === "structured" || entryMode === "both";
    const filledMedicineCount = isStructured
      ? medicines.filter((m) => m.medicineName.trim()).length
      : 0;

    const warnings = computePreSendWarnings({
      filledMedicineCount,
      hasInvestigations:
        isStructured && fields.investigationsOrders.trim().length > 0,
      hasPatientEducation:
        isStructured &&
        (fields.advice.trim().length > 0 ||
          fields.patientEducation.trim().length > 0),
      hasDiagnosis: isStructured
        ? fields.provisionalDiagnosis.trim().length > 0
        : true,
      hasAttachments: attachments.length > 0,
      allergyMatches: formAllergyMatches,
      medicineInstanceIds,
      ddiInteractions,
      isAcked,
    });
    if (warnings.length === 0) {
      await performSaveAndSend();
      return;
    }
    setPreSendWarnings(warnings);
  }, [
    entryMode,
    medicines,
    fields,
    attachments.length,
    formAllergyMatches,
    medicineInstanceIds,
    ddiInteractions,
    isAcked,
    performSaveAndSend,
  ]);

  const sendRx = useCallback(() => {
    finishAfterSendRef.current = false;
    printAfterSendRef.current = false;
    void handleSaveAndSend();
  }, [handleSaveAndSend]);

  const sendAndFinish = useCallback(() => {
    finishAfterSendRef.current = true;
    printAfterSendRef.current = false;
    void handleSaveAndSend();
  }, [handleSaveAndSend]);

  const sendFinishAndPrint = useCallback(() => {
    finishAfterSendRef.current = true;
    printAfterSendRef.current = true;
    void handleSaveAndSend();
  }, [handleSaveAndSend]);

  const finishVisit = useCallback(() => {
    setPreviewOpen(false);
    onFinish?.();
  }, [onFinish]);

  const downloadPrescription = useCallback(async () => {
    setCommitError(null);
    setPrintBusy(true);
    try {
      try {
        await autoSaveFlush();
      } catch (saveErr) {
        setCommitError(
          saveErr instanceof Error
            ? `Save failed before download: ${saveErr.message}`
            : "Save failed before download",
        );
        return;
      }
      const rxId = shell?.prescription?.id ?? prescriptionIdRef?.current;
      if (!rxId) {
        setCommitError("No prescription to download yet.");
        return;
      }
      const res = await getPrescriptionPdfUrl(token, rxId);
      await downloadSignedPdf(res.data.signedUrl);
    } catch (err) {
      setCommitError(
        err instanceof Error ? err.message : "Could not download prescription PDF",
      );
    } finally {
      setPrintBusy(false);
    }
  }, [autoSaveFlush, prescriptionIdRef, shell?.prescription?.id, token]);

  const printPrescription = useCallback(async () => {
    setCommitError(null);
    setPrintBusy(true);
    try {
      try {
        await autoSaveFlush();
      } catch (saveErr) {
        setCommitError(
          saveErr instanceof Error
            ? `Save failed before print: ${saveErr.message}`
            : "Save failed before print",
        );
        return;
      }
      const rxId = shell?.prescription?.id ?? prescriptionIdRef?.current;
      if (!rxId) {
        setCommitError("No prescription to print yet.");
        return;
      }
      await printSavedPrescription(rxId);
    } catch (err) {
      setCommitError(
        err instanceof Error ? err.message : "Could not open the print dialog",
      );
    } finally {
      setPrintBusy(false);
    }
  }, [
    autoSaveFlush,
    printSavedPrescription,
    prescriptionIdRef,
    shell?.prescription?.id,
  ]);

  const onPreSendCancel = useCallback(() => {
    if (preSendWarnings) {
      emitPreSendTelemetryFor(preSendWarnings, "cancelled");
    }
    setPreSendWarnings(null);
  }, [preSendWarnings, emitPreSendTelemetryFor]);

  const onPreSendEdit = useCallback(() => {
    finishAfterSendRef.current = false;
    printAfterSendRef.current = false;
    setPreviewOpen(false);
    if (preSendWarnings) {
      emitPreSendTelemetryFor(preSendWarnings, "edited");
      const target = focusTargetFor(preSendWarnings);
      setPreSendWarnings(null);
      setTimeout(() => focusEditTarget(target), 0);
      return;
    }
    setPreSendWarnings(null);
  }, [
    preSendWarnings,
    emitPreSendTelemetryFor,
    focusEditTarget,
  ]);

  const onPreSendSendAnyway = useCallback(async () => {
    if (preSendWarnings) {
      emitPreSendTelemetryFor(preSendWarnings, "sent-anyway");
    }
    try {
      await performSaveAndSend();
    } finally {
      setPreSendWarnings(null);
    }
  }, [
    preSendWarnings,
    emitPreSendTelemetryFor,
    performSaveAndSend,
  ]);

  const register = useRegisterRxFormActions();

  const openPreviewRef = useRef(openPreview);
  openPreviewRef.current = openPreview;

  useEffect(() => {
    if (!registerActions) return;
    register({
      sendAndFinish: () => {
        openPreviewRef.current();
      },
      sending: saving,
      finishSending: saving && finishAfterSendRef.current,
      openPreview: () => {
        openPreviewRef.current();
      },
      canSend,
    });
    return () => {
      register(null);
    };
  }, [registerActions, register, saving, canSend]);

  return {
    canSend,
    saving,
    previewLoading,
    finishSending: saving && finishAfterSendRef.current,
    openPreview,
    sendRx,
    sendAndFinish,
    sendFinishAndPrint,
    finishVisit,
    printPrescription,
    downloadPrescription,
    canPrint,
    canFinish,
    printBusy,
    previewOpen,
    previewVM,
    closePreview,
    preSendWarnings,
    onPreSendCancel,
    onPreSendEdit,
    onPreSendSendAnyway,
    commitError,
    commitSuccess,
  };
}
