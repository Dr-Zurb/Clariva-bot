"use client";

/**
 * Cockpit-level Rx commit controller (cv3l-05 follow-up).
 *
 * Owns send + preview + pre-send modals at the shell root so footer actions
 * survive Plan-tab removal. Reads shared draft state from RxFormProvider.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { useRxSafety } from "@/components/cockpit/rx/RxSafetyContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { useRegisterRxFormActions } from "@/components/cockpit/rx/RxFormActionsContext";
import {
  sendPrescriptionToPatient,
  getDoctorSettings,
} from "@/lib/api";
import type { PatientRxViewModel } from "@/components/ehr/PatientRxView";
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

export interface UseRxCommitActionsArgs {
  appointmentId: string;
  patientId: string | null;
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
  sendAndFinish: () => void;
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

  const finishAfterSendRef = useRef(false);
  const doctorMetaRef = useRef<{
    doctorName: string;
    doctorSpecialty: string | null;
    clinicName: string | null;
    clinicAddress: string | null;
    timezone: string;
  } | null>(null);

  const canSend = canSendPrescription(cockpitState);

  const buildPreviewViewModel = useCallback((): PatientRxViewModel => {
    const meta = doctorMetaRef.current;
    return {
      doctorName: meta?.doctorName ?? "Doctor",
      doctorSpecialty: meta?.doctorSpecialty ?? null,
      clinicName: meta?.clinicName ?? null,
      clinicAddress: meta?.clinicAddress ?? null,
      patientName: "Patient",
      visitDateLabel: null,
      cc: fields.cc.trim() || null,
      hopi: fields.hopi.trim() || null,
      provisionalDiagnosis: fields.provisionalDiagnosis.trim() || null,
      investigations: fields.investigationsOrders.trim() || null,
      followUp: fields.followUp.trim() || null,
      patientEducation: fields.patientEducation.trim() || null,
      medicines: medicines
        .filter((m) => m.medicineName.trim())
        .map((m) => ({
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
  }, [fields, medicines]);

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
          };
        } catch {
          doctorMetaRef.current = {
            doctorName: "Doctor",
            doctorSpecialty: null,
            clinicName: null,
            clinicAddress: null,
            timezone: "Asia/Kolkata",
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

  const performSaveAndSend = useCallback(async () => {
    setCommitError(null);
    setCommitSuccess(null);
    setSaving(true);
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
      if (finishAfterSendRef.current) {
        finishAfterSendRef.current = false;
        onFinish?.();
      }
    } catch (err) {
      finishAfterSendRef.current = false;
      setCommitError(err instanceof Error ? err.message : "Failed to save and send");
    } finally {
      setSaving(false);
    }
  }, [
    autoSaveFlush,
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
        isStructured && fields.patientEducation.trim().length > 0,
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

  const sendAndFinish = useCallback(() => {
    finishAfterSendRef.current = true;
    void handleSaveAndSend();
  }, [handleSaveAndSend]);

  const onPreSendCancel = useCallback(() => {
    if (preSendWarnings) {
      emitPreSendTelemetryFor(preSendWarnings, "cancelled");
    }
    setPreSendWarnings(null);
  }, [preSendWarnings, emitPreSendTelemetryFor]);

  const onPreSendEdit = useCallback(() => {
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

  const sendAndFinishRef = useRef(sendAndFinish);
  sendAndFinishRef.current = sendAndFinish;
  const openPreviewRef = useRef(openPreview);
  openPreviewRef.current = openPreview;

  useEffect(() => {
    if (!registerActions) return;
    register({
      sendAndFinish: () => {
        sendAndFinishRef.current();
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
    sendAndFinish,
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
