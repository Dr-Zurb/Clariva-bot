"use client";

/**
 * Cockpit-level Rx commit controller (cv3l-05 follow-up).
 *
 * Owns send + preview + pre-send modals at the shell root so footer actions
 * survive Plan-tab removal. Reads shared draft state from RxFormProvider.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  fetchPrescriptionPdf,
  reissuePrescription,
} from "@/lib/api";
import {
  needsReissue,
  sourceWasPrinted,
  sourceWasSent,
  type RxReviseLeaveAction,
} from "@/components/cockpit/rx/rxRevise";
import type { RevisionReason } from "@/types/prescription";
import { doctorSettingsQueryOptions } from "@/lib/query/options";
import type { PatientRxViewModel } from "@/components/ehr/PatientRxView";
import { sanitizeCustomSubsectionsForOutput } from "@/lib/cockpit/custom-subsections";
import { resolveFollowUpForOutput } from "@/lib/cockpit/follow-up-format";
import {
  formatAllergiesForOutput,
  formatVitalsForOutput,
} from "@/lib/cockpit/rx-output-format";
import { usePatientAllergiesQuery } from "@/hooks/queries/usePatientAllergiesQuery";
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
import {
  beginPrintAdvanceHold,
  endPrintAdvanceHold,
} from "@/lib/cockpit/rx-print-advance";

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

function pdfBlobForObjectUrl(blob: Blob): Blob {
  return blob.type === "application/pdf"
    ? blob
    : new Blob([blob], { type: "application/pdf" });
}

async function downloadPdfBlob(
  blob: Blob,
  filename = "prescription.pdf"
): Promise<void> {
  const objectUrl = URL.createObjectURL(pdfBlobForObjectUrl(blob));
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadSignedPdf(
  signedUrl: string,
  filename = "prescription.pdf"
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

const PRINT_IFRAME_KEEPALIVE_MS = 120_000;
/** Safari often never fires onload for a PDF iframe — print blind after this. */
const PRINT_BLIND_FALLBACK_MS = 1_200;
const PRINT_POLL_MS = 200;
const PRINT_DEADLINE_MS = 8_000;

function isSafariPrintHost(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|chromium|android/i.test(ua);
}

/** Chrome fires afterprint when the preview opens — ignore that first beat. */
const PRINT_CLOSE_GRACE_MS = 800;

function watchPrintDialogClosed(win: Window, onClosed: () => void): void {
  let closed = false;
  const openedAt = Date.now();
  const stoppers: Array<() => void> = [];

  const done = () => {
    if (closed) return;
    closed = true;
    stoppers.forEach((stop) => stop());
    onClosed();
  };

  // print() returns only after the dialog closes on Safari.
  if (isSafariPrintHost()) {
    done();
    return;
  }

  const afterGrace = (): boolean => Date.now() - openedAt >= PRINT_CLOSE_GRACE_MS;

  try {
    const media = win.matchMedia("print");
    let sawPrint = media.matches;
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        sawPrint = true;
        return;
      }
      if (sawPrint) done();
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      stoppers.push(() => media.removeEventListener("change", onChange));
    } else if (typeof media.addListener === "function") {
      media.addListener(onChange);
      stoppers.push(() => media.removeListener(onChange));
    }
  } catch {
    // afterprint / focus still cover Chrome.
  }

  const onAfterPrint = () => {
    if (afterGrace()) done();
  };
  try {
    win.addEventListener("afterprint", onAfterPrint);
    stoppers.push(() => win.removeEventListener("afterprint", onAfterPrint));
  } catch {
    // iframe window may reject listeners
  }
  window.addEventListener("afterprint", onAfterPrint);
  stoppers.push(() => window.removeEventListener("afterprint", onAfterPrint));

  const onFocus = () => {
    if (afterGrace()) done();
  };
  window.addEventListener("focus", onFocus);
  stoppers.push(() => window.removeEventListener("focus", onFocus));
}

/** Download the signed PDF into a blob URL the iframe can print same-origin. */
async function fetchPdfObjectUrl(signedUrl: string): Promise<string> {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error("Could not load prescription PDF");
  const raw = await res.blob();
  const blob =
    raw.type === "application/pdf"
      ? raw
      : new Blob([raw], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

function printPdfObjectUrl(
  objectUrl: string,
  opts?: { onDialogClosed?: () => void }
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("data-rx-print", "1");
    iframe.title = "Print prescription";
    iframe.src = objectUrl;
    // Off-screen but non-zero: a 0×0 PDF iframe makes Chrome dismiss the
    // system print dialog as soon as it opens.
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "800px";
    iframe.style.height = "600px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    let settled = false;
    let printed = false;
    let loaded = false;
    let cleaned = false;
    let waited = 0;
    let poll: number | null = null;
    let closedNotified = false;

    const notifyDialogClosed = () => {
      if (closedNotified) return;
      closedNotified = true;
      opts?.onDialogClosed?.();
    };

    const stopPolling = () => {
      if (poll !== null) window.clearInterval(poll);
      poll = null;
    };

    const cleanup = (notifyClosed: boolean) => {
      if (cleaned) return;
      cleaned = true;
      stopPolling();
      iframe.remove();
      URL.revokeObjectURL(objectUrl);
      if (notifyClosed) notifyDialogClosed();
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      stopPolling();
      resolve();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup(false);
      reject(new Error(message));
    };

    const triggerPrint = () => {
      if (printed) return;
      const win = iframe.contentWindow;
      if (!win) return;
      printed = true;
      try {
        win.focus();
        win.print();
        // Keep the iframe on <body> so the dialog stays owned by this
        // document. Do not remove it on afterprint — Chrome fires that
        // when the dialog opens.
        window.setTimeout(() => cleanup(true), PRINT_IFRAME_KEEPALIVE_MS);
        watchPrintDialogClosed(win, notifyDialogClosed);
        succeed();
      } catch {
        fail("Could not open the print dialog");
      }
    };

    iframe.onload = () => {
      loaded = true;
      // Give the PDF viewer one frame to attach. Printing a blank frame
      // opens a preview that Chrome then dismisses when the PDF commits.
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => triggerPrint());
        return;
      }
      triggerPrint();
    };
    iframe.onerror = () => fail("Could not load prescription PDF");
    document.body.appendChild(iframe);
    poll = window.setInterval(() => {
      if (printed || settled) {
        stopPolling();
        return;
      }
      waited += PRINT_POLL_MS;
      if (loaded) triggerPrint();
      else if (isSafariPrintHost() && waited >= PRINT_BLIND_FALLBACK_MS) {
        triggerPrint();
      }
      if (!printed && waited >= PRINT_DEADLINE_MS) {
        fail("Could not open the print dialog");
      }
    }, PRINT_POLL_MS);
  });
}

/** Fetch the signed PDF and open the system print dialog — no extra tab. */
export async function printSignedPdf(signedUrl: string): Promise<void> {
  await printPdfObjectUrl(await fetchPdfObjectUrl(signedUrl));
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
  /** Fired after send when finishing. Print does not wait for it. */
  onFinish?: () => void | Promise<void>;
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
  prewarmOnIntent: () => void;
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
  revisionReasonOpen: boolean;
  revisionReasonBusy: boolean;
  revisionReasonError: string | null;
  onRevisionReasonCancel: () => void;
  onRevisionReasonConfirm: (reason: RevisionReason) => void;
  deliveryPrompt: { resend: boolean; reprint: boolean } | null;
  onDeliveryPromptDismiss: () => void;
  onDeliveryPromptResend: () => void;
  onDeliveryPromptReprint: () => void;
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
  const { state: rxState, autoSave, isDirty } = useRxForm();
  const {
    formAllergyMatches,
    unacceptedDeskAllergies,
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
  const allergyQuery = usePatientAllergiesQuery(token, patientId ?? "");
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVM, setPreviewVM] = useState<PatientRxViewModel | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preSendWarnings, setPreSendWarnings] =
    useState<ReadonlyArray<PreSendWarning> | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [revisionReasonOpen, setRevisionReasonOpen] = useState(false);
  const [revisionReasonBusy, setRevisionReasonBusy] = useState(false);
  const [revisionReasonError, setRevisionReasonError] = useState<string | null>(
    null,
  );
  const [deliveryPrompt, setDeliveryPrompt] = useState<{
    resend: boolean;
    reprint: boolean;
  } | null>(null);
  const pendingLeaveRef = useRef<RxReviseLeaveAction | null>(null);
  const justCreatedRevisionIdRef = useRef<string | null>(null);
  const deliverySourceRef = useRef<{ sent: boolean; printed: boolean } | null>(
    null,
  );

  const finishAfterSendRef = useRef(false);
  const printAfterSendRef = useRef(false);
  const pdfWarmRef = useRef<{
    rxId: string;
    objectUrl: Promise<string>;
  } | null>(null);
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
  const doctorMetaLoadRef = useRef<Promise<void> | null>(null);

  const canSend = canSendPrescription(cockpitState);
  const hasRxId = Boolean(
    shell?.prescription?.id ?? prescriptionIdRef?.current
  );
  const canPrint = hasRxId || canSend;
  const issuedPendingReissue = needsReissue(shell?.prescription, {
    isDirty,
    skipId: justCreatedRevisionIdRef.current,
  });
  const canFinish =
    cockpitState !== "terminal" &&
    ((Boolean(onFinish) && cockpitState !== "ended") || issuedPendingReissue);

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
      allergies:
        !patientId || allergyQuery.isFetched
          ? formatAllergiesForOutput(allergyQuery.data?.allergies, {
              noKnownAllergies: allergyQuery.data?.noKnownAllergies,
            })
          : undefined,
      cc: payload.cc,
      hopi: payload.hopi,
      vitals: formatVitalsForOutput({
        vitalsBpSystolic: payload.vitalsBpSystolic,
        vitalsBpDiastolic: payload.vitalsBpDiastolic,
        vitalsHr: payload.vitalsHr,
        vitalsTempC: payload.vitalsTempC,
        vitalsSpo2: payload.vitalsSpo2,
        vitalsWtKg: payload.vitalsWtKg,
        vitalsHtCm: payload.vitalsHtCm,
        vitalsRr: payload.vitalsRr,
        vitalsPainScore: payload.vitalsPainScore,
        vitalsGlucoseMgDl: payload.vitalsGlucoseMgDl,
        vitalsGcsTotal: payload.vitalsGcsTotal,
        vitalsBpPosture: payload.vitalsBpPosture,
        vitalsBpLimb: payload.vitalsBpLimb,
        note: payload.vitalsJson?.sectionNote ?? null,
      }),
      examinationFindings: payload.examinationFindings?.trim() || null,
      socialHistory: payload.socialHistory,
      provisionalDiagnosis: payload.provisionalDiagnosis,
      investigations: payload.investigations,
      advice: payload.advice,
      followUp: resolveFollowUpForOutput(
        payload.followUp,
        payload.followUpValue,
        payload.followUpUnit
      ),
      patientEducation: null,
      referral: payload.referral,
      customSubsections: sanitizeCustomSubsectionsForOutput(
        payload.customSubsections
      ),
      assessmentCustomSections: sanitizeCustomSubsectionsForOutput(
        payload.assessmentCustomSections
      ),
      planCustomSections: sanitizeCustomSubsectionsForOutput(
        payload.planCustomSections
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
  }, [
    fields,
    patientName,
    patientIdentity,
    patientId,
    allergyQuery.data,
    allergyQuery.isFetched,
  ]);

  const ensureDoctorMeta = useCallback(async () => {
    if (doctorMetaRef.current) return;
    if (!doctorMetaLoadRef.current) {
      doctorMetaLoadRef.current = (async () => {
        try {
          const supabase = createClient();
          const [{ data: userResp }, settingsRes] = await Promise.all([
            supabase.auth.getUser(),
            queryClient
              .fetchQuery(doctorSettingsQueryOptions(token))
              .catch(() => null),
          ]);
          const meta =
            (userResp.user?.user_metadata as
              | { full_name?: string; name?: string }
              | null
              | undefined) ?? {};
          const rawName =
            (typeof meta.full_name === "string" && meta.full_name.trim()) ||
            (typeof meta.name === "string" && meta.name.trim()) ||
            (userResp.user?.email ? userResp.user.email.split("@")[0] : "") ||
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
            patientIdentityPreset:
              settings?.patient_identity_preset ?? "open_letter",
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
                    ? (settings?.background_preview_url ?? null)
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
          doctorMetaLoadRef.current = null;
        }
      })();
    }
    return doctorMetaLoadRef.current;
  }, [queryClient, token]);

  useEffect(() => {
    void ensureDoctorMeta();
  }, [ensureDoctorMeta]);

  const dropPdfWarm = useCallback((revoke: boolean) => {
    const existing = pdfWarmRef.current;
    pdfWarmRef.current = null;
    if (revoke && existing) {
      void existing.objectUrl
        .then((url) => URL.revokeObjectURL(url))
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    return () => dropPdfWarm(true);
  }, [dropPdfWarm]);

  useEffect(() => {
    return () => endPrintAdvanceHold();
  }, [appointmentId]);

  /** Write only when needed so a clean flush does not drop the warmed PDF. */
  const persistDraftForCommit = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!prescriptionIdRef?.current || opts?.force || isDirty) {
        await autoSaveFlush({ force: true });
        dropPdfWarm(true);
        return;
      }
    },
    [autoSaveFlush, dropPdfWarm, isDirty, prescriptionIdRef]
  );

  const requestRevisionIfNeeded = useCallback(
    (action: RxReviseLeaveAction): boolean => {
      const skipId = justCreatedRevisionIdRef.current;
      const currentId =
        prescriptionIdRef?.current ?? shell?.prescription?.id ?? null;
      if (skipId && currentId === skipId) return false;
      if (
        !needsReissue(shell?.prescription, {
          isDirty,
          skipId,
        })
      ) {
        return false;
      }
      pendingLeaveRef.current = action;
      setRevisionReasonError(null);
      setRevisionReasonOpen(true);
      return true;
    },
    [isDirty, prescriptionIdRef, shell?.prescription],
  );

  const adoptRevision = useCallback(
    async (reason: RevisionReason): Promise<string> => {
      await persistDraftForCommit();
      const sourceId =
        shell?.prescription?.id ?? prescriptionIdRef?.current ?? null;
      if (!sourceId) {
        throw new Error("No prescription to revise.");
      }
      const source = shell?.prescription;
      if (source) {
        deliverySourceRef.current = {
          sent: sourceWasSent(source),
          printed: sourceWasPrinted(source),
        };
      }
      const result = await reissuePrescription(token, sourceId, reason);
      const next = result.data.prescription;
      justCreatedRevisionIdRef.current = next.id;
      if (prescriptionIdRef) prescriptionIdRef.current = next.id;
      shell?.setPrescription(next);
      shell?.setAttachments(next.prescription_attachments ?? []);
      dropPdfWarm(true);
      return next.id;
    },
    [dropPdfWarm, persistDraftForCommit, prescriptionIdRef, shell, token],
  );

  const showDeliveryPromptFor = useCallback((action: RxReviseLeaveAction) => {
    const source = deliverySourceRef.current;
    if (!source) return;
    const resend = source.sent && action !== "send";
    const reprint = source.printed && action !== "print";
    if (resend || reprint) setDeliveryPrompt({ resend, reprint });
  }, []);

  const loadPdfObjectUrl = useCallback(
    (rxId: string): Promise<string> =>
      fetchPrescriptionPdf(token, rxId).then(({ blob }) =>
        URL.createObjectURL(pdfBlobForObjectUrl(blob))
      ),
    [token]
  );

  const prewarmPdf = useCallback(
    (rxId: string): Promise<string> => {
      const existing = pdfWarmRef.current;
      if (existing?.rxId === rxId) return existing.objectUrl;
      dropPdfWarm(true);
      const objectUrl = loadPdfObjectUrl(rxId).catch((err) => {
        if (pdfWarmRef.current?.rxId === rxId) pdfWarmRef.current = null;
        throw err;
      });
      pdfWarmRef.current = { rxId, objectUrl };
      return objectUrl;
    },
    [dropPdfWarm, loadPdfObjectUrl]
  );

  /**
   * Hand the PDF to a print job, which owns the object URL from here on. An
   * unwarmed take must NOT park its fetch in the warm ref: the next patient
   * unmounts this hook, the cleanup revokes the URL mid-flight, and the print
   * dialog then never opens.
   */
  const takeWarmedPdf = useCallback(
    (rxId: string): Promise<string> => {
      const existing = pdfWarmRef.current;
      if (existing?.rxId === rxId) {
        pdfWarmRef.current = null;
        return existing.objectUrl;
      }
      dropPdfWarm(true);
      return loadPdfObjectUrl(rxId);
    },
    [dropPdfWarm, loadPdfObjectUrl]
  );

  const openPreview = useCallback(() => {
    void (async () => {
      setCommitError(null);
      if (!doctorMetaRef.current) {
        setPreviewLoading(true);
        try {
          await ensureDoctorMeta();
        } finally {
          setPreviewLoading(false);
        }
      }
      setPreviewVM(buildPreviewViewModel());
      setPreviewOpen(true);
      void persistDraftForCommit()
        .then(() => {
          const rxId = prescriptionIdRef?.current;
          if (rxId) void prewarmPdf(rxId).catch(() => undefined);
        })
        .catch(() => undefined);
    })();
  }, [
    ensureDoctorMeta,
    buildPreviewViewModel,
    persistDraftForCommit,
    prewarmPdf,
    prescriptionIdRef,
  ]);

  const prewarmOnIntent = useCallback(() => {
    void persistDraftForCommit()
      .then(() => {
        const rxId = prescriptionIdRef?.current;
        if (rxId) void prewarmPdf(rxId).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [persistDraftForCommit, prewarmPdf, prescriptionIdRef]);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  useEffect(() => {
    if (!previewOpen || !allergyQuery.isFetched) return;
    setPreviewVM(buildPreviewViewModel());
    // Refresh once the chart allergies query lands — do not depend on
    // buildPreviewViewModel (it changes with form fields and would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen, allergyQuery.isFetched, allergyQuery.data]);

  const emitPreSendTelemetryFor = useCallback(
    (
      warnings: ReadonlyArray<PreSendWarning>,
      outcome: "cancelled" | "edited" | "sent-anyway"
    ): void => {
      const counts: Partial<Record<PreSendWarningKind, number>> = {};
      let ddiSeverity: InteractionRow["severity"] | undefined;
      for (const w of warnings) {
        switch (w.kind) {
          case "unacked-desk-allergy":
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
    [appointmentId, prescriptionIdRef]
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
      "input, textarea, button, [tabindex]:not([tabindex='-1'])"
    );
    inner?.focus();
  }, []);

  /**
   * pf-11 / v3 advance gate. Print parks on this visit so the next-patient
   * jump cannot unload the iframe (Chrome then hides the system dialog).
   */
  const setAdvanceCancelled = useCallback(
    (cancelled: boolean) => {
      try {
        const key = `pf11_cancelled_${appointmentId}`;
        if (cancelled) sessionStorage.setItem(key, "1");
        else sessionStorage.removeItem(key);
      } catch {
        // private mode / SSR
      }
    },
    [appointmentId]
  );

  const releasePrintAdvanceHold = useCallback(() => {
    endPrintAdvanceHold();
    setAdvanceCancelled(false);
  }, [setAdvanceCancelled]);

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
        await persistDraftForCommit({ force: shouldPrint });
      } catch (saveErr) {
        setCommitError(
          saveErr instanceof Error
            ? `Save failed before send: ${saveErr.message}`
            : "Save failed before send"
        );
        return;
      }
      const rxId = prescriptionIdRef?.current;
      if (!rxId) {
        setCommitError("Prescription was not saved. Please try again.");
        return;
      }
      // Print parks navigation until the dialog closes. Finish-only clears
      // a stale park so wrap-up can automove.
      if (shouldPrint) {
        beginPrintAdvanceHold();
        setAdvanceCancelled(true);
      } else if (shouldFinish) {
        setAdvanceCancelled(false);
      }

      // Always render from the just-saved draft. A preview-warmed PDF can
      // still be the empty slip from before the last flush.
      const printJob = shouldPrint ? loadPdfObjectUrl(rxId) : null;
      printJob?.catch(() => undefined);

      setCommitSuccess("Sending to patient…");
      void sendPrescriptionToPatient(token, rxId)
        .then(async (sendRes) => {
          const { sent, channels } = sendRes.data;
          if (sent) {
            setCommitSuccess(
              channels?.instagram && channels?.email
                ? "Prescription saved and sent to patient (DM + email)."
                : channels?.instagram
                  ? "Prescription saved and sent to patient (DM)."
                  : channels?.email
                    ? "Prescription saved and sent to patient (email)."
                    : "Prescription saved and sent."
            );
          } else {
            setCommitSuccess(
              sendRes.data.reason === "no_patient_link"
                ? "Prescription saved. Could not send (no Instagram link or email for patient)."
                : "Prescription saved. Send to patient failed."
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
        })
        .catch((err) => {
          setCommitError(
            err instanceof Error ? err.message : "Failed to save and send"
          );
        });

      // Open print on this visit, then wrap up. Do not wait for Chrome's
      // close signal — matchMedia often never fires and the modal hung.
      if (printJob) {
        try {
          const objectUrl = await printJob;
          await printPdfObjectUrl(objectUrl, {
            onDialogClosed: releasePrintAdvanceHold,
          });
        } catch (printErr) {
          releasePrintAdvanceHold();
          setAdvanceCancelled(true);
          setCommitError(
            printErr instanceof Error
              ? printErr.message
              : "Could not open the print dialog"
          );
          if (shouldFinish) {
            setPreviewOpen(false);
            void Promise.resolve(onFinish?.())
              .catch(() => {
                // handleFinishVisit already surfaces wrap-up errors.
              })
              .finally(() => {
                setAdvanceCancelled(true);
              });
          }
          return;
        }
      }

      if (shouldFinish) {
        setPreviewOpen(false);
        if (!shouldPrint) setAdvanceCancelled(false);
        void Promise.resolve(onFinish?.()).catch(() => {
          // handleFinishVisit already surfaces wrap-up errors.
        });
      }
    } catch (err) {
      setCommitError(
        err instanceof Error ? err.message : "Failed to save and send"
      );
    } finally {
      setSaving(false);
    }
  }, [
    persistDraftForCommit,
    setAdvanceCancelled,
    releasePrintAdvanceHold,
    prescriptionIdRef,
    loadPdfObjectUrl,
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
      unacceptedDeskAllergies,
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
    unacceptedDeskAllergies,
    medicineInstanceIds,
    ddiInteractions,
    isAcked,
    performSaveAndSend,
  ]);

  const sendRx = useCallback(() => {
    finishAfterSendRef.current = false;
    printAfterSendRef.current = false;
    if (requestRevisionIfNeeded("send")) return;
    void handleSaveAndSend();
  }, [handleSaveAndSend, requestRevisionIfNeeded]);

  const sendAndFinish = useCallback(() => {
    finishAfterSendRef.current = true;
    printAfterSendRef.current = false;
    if (requestRevisionIfNeeded("send")) return;
    void handleSaveAndSend();
  }, [handleSaveAndSend, requestRevisionIfNeeded]);

  const sendFinishAndPrint = useCallback(() => {
    finishAfterSendRef.current = true;
    printAfterSendRef.current = true;
    if (requestRevisionIfNeeded("send")) return;
    void handleSaveAndSend();
  }, [handleSaveAndSend, requestRevisionIfNeeded]);

  const finishVisit = useCallback(() => {
    if (requestRevisionIfNeeded("finish")) return;
    setPreviewOpen(false);
    setAdvanceCancelled(false);
    if (cockpitState !== "ended") onFinish?.();
  }, [cockpitState, onFinish, requestRevisionIfNeeded, setAdvanceCancelled]);

  const downloadPrescription = useCallback(async () => {
    setCommitError(null);
    setPrintBusy(true);
    try {
      try {
        await persistDraftForCommit();
      } catch (saveErr) {
        setCommitError(
          saveErr instanceof Error
            ? `Save failed before download: ${saveErr.message}`
            : "Save failed before download"
        );
        return;
      }
      const rxId = shell?.prescription?.id ?? prescriptionIdRef?.current;
      if (!rxId) {
        setCommitError("No prescription to download yet.");
        return;
      }
      const { blob, filename } = await fetchPrescriptionPdf(token, rxId);
      await downloadPdfBlob(blob, filename);
    } catch (err) {
      setCommitError(
        err instanceof Error
          ? err.message
          : "Could not download prescription PDF"
      );
    } finally {
      setPrintBusy(false);
    }
  }, [persistDraftForCommit, prescriptionIdRef, shell?.prescription?.id, token]);

  const printPrescription = useCallback(async () => {
    if (requestRevisionIfNeeded("print")) return;
    setCommitError(null);
    setPrintBusy(true);
    try {
      try {
        await persistDraftForCommit();
      } catch (saveErr) {
        setCommitError(
          saveErr instanceof Error
            ? `Save failed before print: ${saveErr.message}`
            : "Save failed before print"
        );
        return;
      }
      const rxId = shell?.prescription?.id ?? prescriptionIdRef?.current;
      if (!rxId) {
        setCommitError("No prescription to print yet.");
        return;
      }
      setAdvanceCancelled(true);
      await printPdfObjectUrl(await takeWarmedPdf(rxId));
    } catch (err) {
      setCommitError(
        err instanceof Error ? err.message : "Could not open the print dialog"
      );
    } finally {
      setPrintBusy(false);
    }
  }, [
    persistDraftForCommit,
    requestRevisionIfNeeded,
    setAdvanceCancelled,
    takeWarmedPdf,
    prescriptionIdRef,
    shell?.prescription?.id,
  ]);

  const onRevisionReasonCancel = useCallback(() => {
    pendingLeaveRef.current = null;
    setRevisionReasonOpen(false);
    setRevisionReasonError(null);
  }, []);

  const onRevisionReasonConfirm = useCallback(
    (reason: RevisionReason) => {
      void (async () => {
        setRevisionReasonBusy(true);
        setRevisionReasonError(null);
        const action = pendingLeaveRef.current ?? "finish";
        try {
          await adoptRevision(reason);
          setRevisionReasonOpen(false);
          pendingLeaveRef.current = null;
          if (action === "send") {
            await handleSaveAndSend();
          } else if (action === "print") {
            await printPrescription();
          } else {
            setPreviewOpen(false);
            setAdvanceCancelled(false);
            if (cockpitState !== "ended") onFinish?.();
          }
          if (!printAfterSendRef.current) {
            showDeliveryPromptFor(action);
          }
        } catch (err) {
          setRevisionReasonError(
            err instanceof Error ? err.message : "Could not create the next version",
          );
        } finally {
          setRevisionReasonBusy(false);
        }
      })();
    },
    [
      adoptRevision,
      cockpitState,
      handleSaveAndSend,
      onFinish,
      printPrescription,
      setAdvanceCancelled,
      showDeliveryPromptFor,
    ],
  );

  const onDeliveryPromptDismiss = useCallback(() => {
    setDeliveryPrompt(null);
  }, []);

  const onDeliveryPromptResend = useCallback(() => {
    setDeliveryPrompt(null);
    finishAfterSendRef.current = false;
    printAfterSendRef.current = false;
    void handleSaveAndSend();
  }, [handleSaveAndSend]);

  const onDeliveryPromptReprint = useCallback(() => {
    setDeliveryPrompt(null);
    void printPrescription();
  }, [printPrescription]);

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
  }, [preSendWarnings, emitPreSendTelemetryFor, focusEditTarget]);

  const onPreSendSendAnyway = useCallback(async () => {
    if (preSendWarnings) {
      emitPreSendTelemetryFor(preSendWarnings, "sent-anyway");
    }
    try {
      await performSaveAndSend();
    } finally {
      setPreSendWarnings(null);
    }
  }, [preSendWarnings, emitPreSendTelemetryFor, performSaveAndSend]);

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
      prewarmPreview: prewarmOnIntent,
      canSend,
    });
    return () => {
      register(null);
    };
  }, [registerActions, register, saving, canSend, prewarmOnIntent]);

  return {
    canSend,
    saving,
    previewLoading,
    finishSending: saving && finishAfterSendRef.current,
    openPreview,
    prewarmOnIntent,
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
    revisionReasonOpen,
    revisionReasonBusy,
    revisionReasonError,
    onRevisionReasonCancel,
    onRevisionReasonConfirm,
    deliveryPrompt,
    onDeliveryPromptDismiss,
    onDeliveryPromptResend,
    onDeliveryPromptReprint,
  };
}
