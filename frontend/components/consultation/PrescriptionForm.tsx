"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  RxFormProvider,
  useRxForm,
  useOptionalRxForm,
  medicinesFromPrescription,
  investigationsFromPrescription,
  EMPTY_RX_MEDICINE,
  type RxFormFields,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { useRxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import {
  createPrescription,
  getPrescriptionUploadUrl,
  registerPrescriptionAttachment,
  sendPrescriptionToPatient,
  createRxTemplate,
  getLastPrescriptionInEpisode,
  getDoctorSettings,
} from "@/lib/api";
import type {
  PrescriptionWithRelations,
  PrescriptionType,
  PrescriptionAttachment,
} from "@/types/prescription";
import type {
  DoctorRxTemplate,
  RxTemplateMedicine,
} from "@/types/rx-template";
import { type MedicineRowValue } from "./MedicineRow";
import { PrescriptionFormCompositionRoot } from "@/components/cockpit/rx/PrescriptionFormCompositionRoot";
import { SendRxFinishButton } from "@/components/cockpit/rx/SendRxFinishButton";
import { useRegisterRxFormActions } from "@/components/cockpit/rx/RxFormActionsContext";
import SaveStatus from "./SaveStatus";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import PrescriptionPatientPreview from "./PrescriptionPatientPreview";
import PrescriptionPreSendCheck from "./PrescriptionPreSendCheck";
import type { PatientRxViewModel } from "@/components/ehr/PatientRxView";
import { RxSafetyProvider } from "@/components/cockpit/rx/RxSafetyContext";
import { useRxSafety } from "@/components/cockpit/rx/RxSafetyContext";
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
import type { DrugMasterRow } from "@/types/drug-master";
import { formatDate } from "@/lib/format-date";
import {
  canSendPrescription,
  type CockpitState,
} from "@/lib/patient-profile/state";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_MB = 10;

type MedicineEntry = RxMedicine;

interface PrescriptionFormProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  onSuccess?: () => void;
  existingPrescription?: PrescriptionWithRelations | null;
  /**
   * Sub-batch C Â· task-video-C6 â€” additive callback that fires AFTER
   * a successful Save-and-Send (NOT after a draft save). Surfaces the
   * prescription id so the in-call surface
   * (`<VideoRoom>` quick-action panel) can post a `'rx_sent'` system
   * banner into the consultation chat with the real id.
   *
   * Optional and additive â€” every existing caller (the dashboard
   * appointment-detail surface, the patient-row drawer) ignores it.
   * Only the in-call mount supplies it.
   */
  onSent?: (prescriptionId: string) => void | Promise<void>;
  /**
   * When supplied (cockpit context only), enables two extra footer actions:
   *   - "Send Rx & finish â–¸" â€” sends the Rx then finishes the visit.
   *   - "Finish visit"       â€” finishes the visit immediately without sending.
   * The callback (`handleFinishVisit` in ConsultationCockpit) directly POSTs
   * `/v1/appointments/:id/wrap-up` to flip status â†’ completed; the cockpit
   * then re-derives to the `ended` state and EndedCard's
   * <NextPatientCountdown> auto-advances to the next patient (subject to
   * the doctor's `patient_flow_advance` setting). Undefined when the form
   * is embedded outside the cockpit.
   */
  onFinish?: () => void;
  /**
   * cs-11: fired whenever the count of filled medicine rows changes. Used by
   * <RxWorkspace> to update the "Medicines (N)" chip in the section nav strip
   * without prop-drilling through PrescriptionForm's internal state.
   */
  onMedicineCountChange?: (count: number) => void;
  /**
   * When true, suppresses the inline SaveStatus pill (header) and commit
   * action row — `<PlanActionFooter>` owns those affordances (cmr-03).
   */
  actionsInFooter?: boolean;
  /**
   * When true, AssessmentSection hides its Dx + DDx — the AssessmentStrip
   * owns them (cmr-01 / cmr-06).
   */
  dxLifted?: boolean;
  /**
   * When true, PlanSection hides inline safety banners — the
   * SafetyStickyStrip overlay owns them (cmr-02 / cmr-06).
   */
  safetyLifted?: boolean;
  /**
   * Cockpit dedup (ppd-03): when true, hides the "Prescription type"
   * fieldset AND forces `entryMode = "structured"` for the lifetime of
   * the form. Default `false` — non-cockpit mounts keep the radio.
   */
  entryModeLifted?: boolean;
  /**
   * Cockpit dedup (ppd-03): when true, hides the Photo / attachments
   * block AND no-ops any pending photo upload. Default `false`.
   */
  photoLifted?: boolean;
  /**
   * Cockpit dedup (ppd-02): forwarded to `<PrescriptionFormCompositionRoot>`.
   */
  subjectiveLifted?: boolean;
  /**
   * Cockpit dedup (ppd-02): forwarded to `<PrescriptionFormCompositionRoot>`.
   */
  objectiveLifted?: boolean;
  /** Cockpit state — drives Plan-pane send shortcut eligibility (rxs-03). */
  cockpitState?: CockpitState;
}

/**
 * Prescription form: structured SOAP + medications and/or photo upload.
 *
 * T2.13 â€” Auto-save replaces the explicit "Save draft" button. The form
 * persists every 1.5s after the last edit (via useAutoSave) and surfaces
 * status through the SaveStatus pill in the form header. The only
 * explicit action is "Send to patient", which forces a final flush
 * before triggering the send pipeline.
 *
 * @see e-task-4
 */
/**
 * Provider lifted to `PatientProfilePage` by csf-01 (2026-05-19) — this
 * component now subscribes to a parent provider when mounted under the cockpit
 * shell, and self-mounts a provider when used standalone (in-call mini-panel,
 * post-call summary). Three mount surfaces preserved per cv2 DL-30.
 */

function PrescriptionFormLoading(): JSX.Element {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm text-gray-500">Loading prescription…</p>
    </div>
  );
}

export default function PrescriptionForm(props: PrescriptionFormProps) {
  const {
    appointmentId,
    patientId,
    token,
    existingPrescription: initialPrescription,
  } = props;

  const parentShell = usePrescriptionFormShell();
  const existingProvider = useOptionalRxForm();
  const standaloneSetup = useRxFormProviderSetup({
    appointmentId,
    patientId,
    token,
    existingPrescription: initialPrescription,
    disabled: parentShell != null,
  });
  const setup = parentShell ?? standaloneSetup;

  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVM, setPreviewVM] = useState<PatientRxViewModel | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const doctorMetaRef = useRef<{
    doctorName: string;
    doctorSpecialty: string | null;
    clinicName: string | null;
    clinicAddress: string | null;
    timezone: string;
  } | null>(null);
  const [lastEpisodeRx, setLastEpisodeRx] =
    useState<PrescriptionWithRelations | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preSendWarnings, setPreSendWarnings] = useState<
    ReadonlyArray<PreSendWarning> | null
  >(null);
  const finishAfterSendRef = useRef(false);

  const {
    loading,
    initialFields,
    entryMode,
    setEntryMode,
    prescription,
    setPrescription,
    prescriptionIdRef,
    attachments,
    setAttachments,
    setInitialFields,
    generateInstanceIds,
    instanceIdSeqRef,
    medicineInstanceIds,
    setMedicineInstanceIds,
    providerProps,
  } = setup;

  if (loading || !initialFields) {
    return <PrescriptionFormLoading />;
  }

  const formBody = (
    <PrescriptionFormBody
      {...props}
      entryMode={entryMode}
      setEntryMode={setEntryMode}
      prescription={prescription}
      setPrescription={setPrescription}
      prescriptionIdRef={prescriptionIdRef}
      attachments={attachments}
      setAttachments={setAttachments}
      setInitialFields={setInitialFields}
      generateInstanceIds={generateInstanceIds}
      instanceIdSeqRef={instanceIdSeqRef}
      medicineInstanceIds={medicineInstanceIds}
      setMedicineInstanceIds={setMedicineInstanceIds}
      templatePickerOpen={templatePickerOpen}
      setTemplatePickerOpen={setTemplatePickerOpen}
      previewOpen={previewOpen}
      setPreviewOpen={setPreviewOpen}
      previewVM={previewVM}
      setPreviewVM={setPreviewVM}
      previewLoading={previewLoading}
      setPreviewLoading={setPreviewLoading}
      doctorMetaRef={doctorMetaRef}
      lastEpisodeRx={lastEpisodeRx}
      setLastEpisodeRx={setLastEpisodeRx}
      fileInputRef={fileInputRef}
      preSendWarnings={preSendWarnings}
      setPreSendWarnings={setPreSendWarnings}
      finishAfterSendRef={finishAfterSendRef}
    />
  );

  if (existingProvider) {
    return formBody;
  }

  if (!providerProps) {
    return <PrescriptionFormLoading />;
  }

  const { key: providerKey, ...rxProviderProps } = providerProps;
  return (
    <RxFormProvider key={providerKey} {...rxProviderProps}>
      <RxSafetyProvider token={token} patientId={patientId}>
        {formBody}
      </RxSafetyProvider>
    </RxFormProvider>
  );
}

type PrescriptionFormBodyProps = PrescriptionFormProps & {
  entryMode: PrescriptionType;
  setEntryMode: (mode: PrescriptionType) => void;
  prescription: PrescriptionWithRelations | null;
  setPrescription: React.Dispatch<
    React.SetStateAction<PrescriptionWithRelations | null>
  >;
  prescriptionIdRef: React.MutableRefObject<string | null>;
  attachments: PrescriptionAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<PrescriptionAttachment[]>>;
  setInitialFields: React.Dispatch<React.SetStateAction<RxFormFields | null>>;
  generateInstanceIds: (count: number) => string[];
  instanceIdSeqRef: React.MutableRefObject<number>;
  medicineInstanceIds: string[];
  setMedicineInstanceIds: React.Dispatch<React.SetStateAction<string[]>>;
  templatePickerOpen: boolean;
  setTemplatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  previewOpen: boolean;
  setPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  previewVM: PatientRxViewModel | null;
  setPreviewVM: React.Dispatch<React.SetStateAction<PatientRxViewModel | null>>;
  previewLoading: boolean;
  setPreviewLoading: React.Dispatch<React.SetStateAction<boolean>>;
  doctorMetaRef: React.MutableRefObject<{
    doctorName: string;
    doctorSpecialty: string | null;
    clinicName: string | null;
    clinicAddress: string | null;
    timezone: string;
  } | null>;
  lastEpisodeRx: PrescriptionWithRelations | null;
  setLastEpisodeRx: React.Dispatch<
    React.SetStateAction<PrescriptionWithRelations | null>
  >;
  fileInputRef: React.RefObject<HTMLInputElement>;
  preSendWarnings: ReadonlyArray<PreSendWarning> | null;
  setPreSendWarnings: React.Dispatch<
    React.SetStateAction<ReadonlyArray<PreSendWarning> | null>
  >;
  finishAfterSendRef: React.MutableRefObject<boolean>;
  /** @internal Unit tests only (ppd-03) — exposes `ensurePrescriptionForPhoto` after mount. */
  __testExposeEnsurePhoto?: (fn: () => Promise<string>) => void;
};

function PrescriptionFormBody({
  appointmentId,
  patientId,
  token,
  onSuccess,
  onSent,
  onFinish,
  onMedicineCountChange,
  actionsInFooter = false,
  dxLifted = false,
  safetyLifted = false,
  entryModeLifted = false,
  photoLifted = false,
  subjectiveLifted = false,
  objectiveLifted = false,
  cockpitState,
  entryMode,
  setEntryMode,
  prescription,
  setPrescription,
  prescriptionIdRef,
  attachments,
  setAttachments,
  setInitialFields,
  generateInstanceIds,
  medicineInstanceIds,
  setMedicineInstanceIds,
  templatePickerOpen,
  setTemplatePickerOpen,
  previewOpen,
  setPreviewOpen,
  previewVM,
  setPreviewVM,
  previewLoading,
  setPreviewLoading,
  doctorMetaRef,
  lastEpisodeRx,
  setLastEpisodeRx,
  fileInputRef,
  preSendWarnings,
  setPreSendWarnings,
  finishAfterSendRef,
  __testExposeEnsurePhoto,
}: PrescriptionFormBodyProps) {
  const { state, setField, dispatch, buildPayload, autoSave } = useRxForm();
  const {
    drugMasterIndex,
    setDrugMasterIndex,
    allergies,
    ddiInteractions,
    formAllergyMatches,
    isAcked,
    onAcknowledge,
    onAckDdi,
  } = useRxSafety();
  const {
    state: autoSaveState,
    savedAt: autoSavedAt,
    isPending: autoSavePending,
    flush: autoSaveFlush,
    retry: autoSaveRetry,
  } = autoSave;
  const { fields } = state;
  const medicines = fields.medicines;

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ==========================================================================
  // EHR Sub-batch B1 / T2.12 â€” Templates: apply + save-as
  // ==========================================================================

  /**
   * Convert a stored RxTemplateMedicine into the form's MedicineEntry
   * shape. Defaults all missing fields so the picker output is always
   * a valid `MedicineRowValue` for <MedicineRow>.
   */
  const templateMedicineToEntry = (m: RxTemplateMedicine): MedicineEntry => ({
    // sortOrder isn't part of MedicineEntry â€” the form re-derives it
    // from array index in buildPayload(). We honour the template's
    // explicit order via pre-sort in handleApplyTemplate below.
    medicineName: m.medicineName ?? "",
    dosage: m.dosage ?? "",
    route: m.route ?? "",
    frequency: m.frequency ?? "",
    duration: m.duration ?? "",
    instructions: m.instructions ?? "",
    drugMasterId: m.drugMasterId ?? null,
    frequencyCode: m.frequencyCode ?? null,
    durationValue: m.durationValue ?? null,
    durationUnit: m.durationUnit ?? null,
    routeCode: m.routeCode ?? null,
  });

  /**
   * Apply a template to the form. Merges the template's text fields
   * over the current form state (only when the template field is
   * non-null) and REPLACES the medicines array with the template's.
   *
   * Decision: text fields are merged (template wins when present); the
   * medicines list is wholesale-replaced because partial-merge of
   * medicines has no obvious safe semantics ("which row is the same?").
   * The autosave snapshot will pick up the change and PATCH it through.
   */
  const handleApplyTemplate = (template: DoctorRxTemplate) => {
    if (template.cc !== null) setField("cc", template.cc);
    if (template.hopi !== null) setField("hopi", template.hopi);
    if (template.provisional_diagnosis !== null)
      setField("provisionalDiagnosis", template.provisional_diagnosis);
    if (template.investigations !== null)
      setField("investigationsOrders", template.investigations);
    if (template.follow_up !== null) setField("followUp", template.follow_up);
    if (template.patient_education !== null)
      setField("patientEducation", template.patient_education);
    if (template.clinical_notes !== null)
      setField("clinicalNotes", template.clinical_notes);

    const meds = (template.medicines_json ?? [])
      .slice()
      .sort(
        (a, b) =>
          (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
      )
      .map(templateMedicineToEntry);

    if (meds.length > 0) {
      dispatch({ type: "SET_MEDICINES", medicines: meds });
      setMedicineInstanceIds(generateInstanceIds(meds.length));
    } else {
      dispatch({ type: "SET_MEDICINES", medicines: [{ ...EMPTY_RX_MEDICINE }] });
      setMedicineInstanceIds(generateInstanceIds(1));
    }

    setSuccessMessage(`Applied template "${template.name}".`);
  };

  /**
   * Save the current form state as a new template. Prompts for a name
   * (vanilla `prompt()` for v1; a dedicated dialog can replace it
   * later). Only saved if at least one medicine is present â€” empty
   * templates are useless.
   */
  const handleSaveAsTemplate = async () => {
    const name = window.prompt(
      "Save current Rx as template â€” enter a short name:",
      fields.provisionalDiagnosis.trim() || "",
    );
    if (!name || !name.trim()) return;

    const payload = buildPayload();
    if (!payload.medicines || payload.medicines.length === 0) {
      setError("Add at least one medicine before saving as template.");
      return;
    }

    setError(null);
    try {
      await createRxTemplate(token, {
        name: name.trim(),
        cc: payload.cc,
        hopi: payload.hopi,
        provisionalDiagnosis: payload.provisionalDiagnosis,
        investigations: payload.investigations,
        followUp: payload.followUp,
        patientEducation: payload.patientEducation,
        clinicalNotes: payload.clinicalNotes,
        medicines: payload.medicines.map((m) => ({
          drugMasterId: m.drugMasterId,
          medicineName: m.medicineName,
          dosage: m.dosage,
          route: m.route,
          frequency: m.frequency,
          duration: m.duration,
          instructions: m.instructions,
          sortOrder: m.sortOrder,
          frequencyCode: m.frequencyCode,
          durationValue: m.durationValue,
          durationUnit: m.durationUnit,
          routeCode: m.routeCode,
        })),
      });
      setSuccessMessage(`Saved template "${name.trim()}".`);
      // Close the picker if the doctor saved from the empty-state CTA.
      setTemplatePickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    }
  };

  // ==========================================================================
  // EHR Sub-batch B2 / T3.18 â€” "Preview as patient" modal
  // ==========================================================================

  /**
   * Build the <PatientRxView> view-model from current form state + the
   * cached doctor metadata. We do NOT round-trip through the API: the
   * preview is intentionally a "what is on the canvas right now"
   * surface, even before autosave flushes. Mirrors the form fields
   * 1:1 â€” the patient sees exactly the structured-or-legacy values
   * the doctor has typed.
   */
  const buildPreviewViewModel = (): PatientRxViewModel => {
    const meta = doctorMetaRef.current;
    return {
      doctorName: meta?.doctorName ?? "Doctor",
      doctorSpecialty: meta?.doctorSpecialty ?? null,
      clinicName: meta?.clinicName ?? null,
      clinicAddress: meta?.clinicAddress ?? null,
      patientName: "Patient",
      // Preview deliberately omits a visit-date label â€” the form
      // doesn't carry the appointment timestamp in client state and
      // we'd rather show nothing than a wrong/stale value. The real
      // share page (T3.16) will render the actual appointment date.
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
        })),
    };
  };

  /**
   * Open the preview. Lazily fetches doctor display name + clinic
   * metadata on first open and caches them. Subsequent opens reuse
   * the cache so the modal is instant. Soft-fail: if either fetch
   * fails we still open the preview with whatever we have (and
   * literal "Doctor" as a fallback name).
   */
  const handleOpenPreview = async () => {
    setError(null);
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
        // Soft-fail. The preview opens with the literal "Doctor"
        // fallback baked into buildPreviewViewModel.
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
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    // Don't clear previewVM immediately â€” the modal unmount handles
    // cleanup, and keeping it around lets a quick re-open show the
    // exact same snapshot if the form hasn't changed in between.
  };

  // ==========================================================================
  // EHR Sub-batch B1 / T2.14 â€” "Copy from last visit"
  // ==========================================================================

  // ppd-03 (DL-4 / DL-5): cockpit-lifted entry-mode forces structured for
  // the lifetime of the form. The radio is hidden by the parent branch
  // above; this ensures the underlying state agrees.
  useEffect(() => {
    if (entryModeLifted && entryMode !== "structured") {
      setEntryMode("structured");
    }
  }, [entryModeLifted, entryMode, setEntryMode]);

  // cs-11: notify the parent (RxWorkspace) when the filled medicine count changes
  // so the section nav chip can show "Medicines (N)" without accessing internal state.
  useEffect(() => {
    onMedicineCountChange?.(medicines.filter((m) => m.medicineName.trim()).length);
  }, [medicines, onMedicineCountChange]);

  // Fetch the prior Rx in the same care episode (if any) on mount /
  // appointment change. The endpoint returns `prescription: null` when
  // there's no prior visit â€” the CTA hides itself in that case.
  useEffect(() => {
    let cancelled = false;
    getLastPrescriptionInEpisode(token, appointmentId)
      .then((res) => {
        if (cancelled) return;
        setLastEpisodeRx(res.data.prescription);
      })
      .catch(() => {
        // Soft-fail. The CTA simply won't render â€” doctors can still
        // hand-author the Rx. We don't surface this as a top-level
        // error to keep the form quiet on episode lookup quirks.
        if (!cancelled) setLastEpisodeRx(null);
      });
    return () => {
      cancelled = true;
    };
  }, [appointmentId, token]);

  /**
   * Apply a prior prescription to the form. Same merge semantics as
   * <TemplatePicker>'s Apply (template fields win when present;
   * medicines are wholesale-replaced) â€” keeps the doctor's mental
   * model consistent across the two surfaces.
   *
   * Confirmation prompt is intentionally simple in v1; the spec
   * mentions a "Pick fieldsâ€¦" chooser as a future enhancement.
   */
  const handleCopyFromLastVisit = () => {
    if (!lastEpisodeRx) return;

    const dateStr = lastEpisodeRx.created_at
      ? formatDate(lastEpisodeRx.created_at)
      : "your previous visit";
    const ok = window.confirm(
      `Copy diagnosis, plan, and medicines from your last visit on ${dateStr}?`,
    );
    if (!ok) return;

    if (lastEpisodeRx.cc !== null) setField("cc", lastEpisodeRx.cc ?? "");
    if (lastEpisodeRx.hopi !== null) setField("hopi", lastEpisodeRx.hopi ?? "");
    if (lastEpisodeRx.provisional_diagnosis !== null)
      setField("provisionalDiagnosis", lastEpisodeRx.provisional_diagnosis ?? "");
    const inv = investigationsFromPrescription(lastEpisodeRx);
    if (inv) setField("investigationsOrders", inv);
    if (lastEpisodeRx.follow_up !== null) setField("followUp", lastEpisodeRx.follow_up ?? "");
    if (lastEpisodeRx.patient_education !== null)
      setField("patientEducation", lastEpisodeRx.patient_education ?? "");
    if (lastEpisodeRx.clinical_notes !== null)
      setField("clinicalNotes", lastEpisodeRx.clinical_notes ?? "");

    const meds = medicinesFromPrescription(lastEpisodeRx);
    if ((lastEpisodeRx.prescription_medicines ?? []).length > 0) {
      dispatch({ type: "SET_MEDICINES", medicines: meds });
      setMedicineInstanceIds(generateInstanceIds(meds.length));
    } else {
      dispatch({ type: "SET_MEDICINES", medicines: [{ ...EMPTY_RX_MEDICINE }] });
      setMedicineInstanceIds(generateInstanceIds(1));
    }

    setSuccessMessage(`Copied from your last visit (${dateStr}).`);
  };

  /**
   * Internal: actually save + send. Extracted so both the
   * "no-warnings â†’ fast path" and the "Send anyway" modal path can
   * share the same state machine.
   */
  const performSaveAndSend = async () => {
    setError(null);
    setSuccessMessage(null);
    setSaving(true);
    try {
      // Force a final save before send so the server-side state matches
      // what the doctor last typed (no race against the debounced
      // pending save). flush() resolves after the save round-trip OR
      // throws â€” in the throw case we surface the error and bail out
      // BEFORE attempting to send.
      try {
        await autoSaveFlush();
      } catch (saveErr) {
        setError(
          saveErr instanceof Error
            ? `Save failed before send: ${saveErr.message}`
            : "Save failed before send"
        );
        return;
      }
      // After flush(), the prescription may have been freshly created
      // by the autosave path. The closure-captured `prescription` is
      // stale â€” read from the ref which persistSnapshot updated.
      const rxId = prescriptionIdRef.current;
      if (!rxId) {
        setError("Prescription was not saved. Please try again.");
        return;
      }
      const sendRes = await sendPrescriptionToPatient(token, rxId);
      const { sent, channels } = sendRes.data;
      if (sent) {
        setSuccessMessage(
          channels?.instagram && channels?.email
            ? "Prescription saved and sent to patient (DM + email)."
            : channels?.instagram
              ? "Prescription saved and sent to patient (DM)."
              : channels?.email
                ? "Prescription saved and sent to patient (email)."
                : "Prescription saved and sent."
        );
      } else {
        setSuccessMessage(
          sendRes.data.reason === "no_patient_link"
            ? "Prescription saved. Could not send (no Instagram link or email for patient)."
            : "Prescription saved. Send to patient failed."
        );
      }
      onSuccess?.();
      // Sub-batch C Â· task-video-C6 â€” surface the prescription id to
      // the in-call quick-action panel so it can post the
      // `'rx_sent'` system banner with the real id (not a stub).
      // Only fired on the Send path; pure-draft saves still call
      // onSuccess but skip onSent (no message has been delivered yet,
      // so the in-channel banner would be misleading).
      if (sent) {
        try {
          await onSent?.(rxId);
        } catch {
          // Soft failure â€” the Rx is already saved + sent. The
          // banner-callback failing must not surface as a save error.
        }
      }
      // "Send Rx & finish â–¸" path: invoke `onFinish` (= ConsultationCockpit's
      // direct POST /wrap-up) after any successful send. Reset before
      // calling so a stale re-render never double-fires.
      if (finishAfterSendRef.current) {
        finishAfterSendRef.current = false;
        onFinish?.();
      }
    } catch (err) {
      // Clear the flag so a retry doesn't accidentally trigger finish.
      finishAfterSendRef.current = false;
      setError(err instanceof Error ? err.message : "Failed to save and send");
    } finally {
      setSaving(false);
    }
  };

  // EHR Sub-batch C / T4.21 (C.4) â€” Build the PHI-free telemetry
  // payload from a warning list + outcome. Centralised here so the
  // three outcome paths (Cancel / Edit / Send anyway) emit the same
  // shape. NEVER include allergen text, drug names, or diagnosis text.
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
        rxId: prescriptionIdRef.current,
        appointmentId,
        warningKinds: warningKindsForTelemetry(warnings),
        warningCounts: counts,
        ...(ddiSeverity ? { highestDdiSeverity: ddiSeverity } : {}),
        outcome,
        occurredAt: new Date().toISOString(),
      });
    },
    [appointmentId],
  );

  // EHR Sub-batch C / T4.21 (C.4) â€” focus / scroll target for "Edit Rx".
  // Pure DOM work; bails quietly if the target id isn't mounted (e.g.
  // the doctor switched modes before clicking Edit).
  const focusEditTarget = useCallback((target: PreSendFocusTarget) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Try to focus the actual input/textarea so the doctor can start
    // typing. Diagnosis is an `<input id="diagnosis">` so it focuses
    // directly; the medicines section is a wrapper div, so we look for
    // the first focusable input inside.
    if (typeof (el as HTMLElement).focus === "function" &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      (el as HTMLInputElement | HTMLTextAreaElement).focus();
      return;
    }
    const inner = el.querySelector<HTMLElement>(
      "input, textarea, button, [tabindex]:not([tabindex='-1'])",
    );
    inner?.focus();
  }, []);

  /**
   * When true, `performSaveAndSend` will call `onFinish?.()` after a
   * successful send. Set by `handleSendAndFinish`; cleared inside
   * `performSaveAndSend` before invoking the callback so a re-render
   * never double-fires it.
   */
  /**
   * "Send Rx & finish â–¸" entry point â€” sets the finish flag then runs
   * the normal send pipeline. `onFinish` fires after the send completes
   * successfully, which (in cockpit context) POSTs the wrap-up endpoint
   * to flip the appointment to completed and trigger auto-advance.
   */
  const handleSendAndFinish = async () => {
    finishAfterSendRef.current = true;
    await handleSaveAndSend();
  };

  const registerRxFormActions = useRegisterRxFormActions();
  const sendAndFinishRef = useRef(handleSendAndFinish);
  sendAndFinishRef.current = handleSendAndFinish;
  const openTemplatesRef = useRef(() => setTemplatePickerOpen(true));
  openTemplatesRef.current = () => setTemplatePickerOpen(true);
  const openPreviewRef = useRef(handleOpenPreview);
  openPreviewRef.current = handleOpenPreview;
  const canSendRx = cockpitState != null && canSendPrescription(cockpitState);

  useEffect(() => {
    if (!actionsInFooter) return;
    registerRxFormActions({
      sendAndFinish: () => {
        void sendAndFinishRef.current();
      },
      sending: saving || uploading,
      finishSending: saving && finishAfterSendRef.current,
      openTemplates: () => openTemplatesRef.current(),
      openPreview: () => {
        void openPreviewRef.current();
      },
      canSend: canSendRx,
    });
    return () => {
      registerRxFormActions(null);
    };
  }, [
    actionsInFooter,
    registerRxFormActions,
    saving,
    uploading,
    canSendRx,
  ]);

  /**
   * EHR Sub-batch C / T4.21 (C.4) â€” entry point wired to the
   * "Send Rx" button. Computes warnings synchronously from
   * in-memory state; if any exist, opens the pre-send modal. Otherwise
   * falls through to the existing send pipeline immediately.
   *
   * Decision T4-D1 LOCKED: the warnings NEVER cause this handler to
   * refuse to send. They only decide whether the modal opens first.
   *
   * Entry-mode awareness (photo-only mode fix):
   *   - `entryMode === "photo"`     â€” diagnosis input + structured
   *      medicines section are not rendered. Warnings whose `targetId`
   *      points at those anchors would silently no-op on "Edit Rx", so
   *      we treat their preconditions as satisfied (no-diagnosis is
   *      not applicable; no-medicines is moot when the photo carries
   *      the prescription). The empty-rx check falls back to
   *      `hasAttachments`, so a photo Rx with â‰¥1 attachment is NOT
   *      empty.
   *   - `entryMode === "both"`      â€” both surfaces are visible; an
   *      attachment OR any structured field satisfies empty-rx. The
   *      diagnosis warning still applies because the input is mounted.
   *   - `entryMode === "structured"` â€” original behaviour preserved.
   */
  const handleSaveAndSend = async () => {
    const isStructured = entryMode === "structured" || entryMode === "both";
    const filledMedicineCount = isStructured
      ? medicines.filter((m) => m.medicineName.trim()).length
      : 0;

    const warnings = computePreSendWarnings({
      filledMedicineCount,
      hasInvestigations: isStructured && fields.investigationsOrders.trim().length > 0,
      hasPatientEducation: isStructured && fields.patientEducation.trim().length > 0,
      // Photo-only mode: no diagnosis input rendered â†’ not applicable.
      hasDiagnosis: isStructured ? fields.provisionalDiagnosis.trim().length > 0 : true,
      hasAttachments: attachments.length > 0,
      allergyMatches: formAllergyMatches,
      medicineInstanceIds,
      ddiInteractions: ddiInteractions,
      isAcked,
    });
    if (warnings.length === 0) {
      await performSaveAndSend();
      return;
    }
    setPreSendWarnings(warnings);
  };

  const handlePreSendCancel = () => {
    if (preSendWarnings) {
      emitPreSendTelemetryFor(preSendWarnings, "cancelled");
    }
    setPreSendWarnings(null);
  };

  const handlePreSendEdit = () => {
    if (preSendWarnings) {
      emitPreSendTelemetryFor(preSendWarnings, "edited");
      const target = focusTargetFor(preSendWarnings);
      // Defer focus until after the modal unmounts so the body-scroll
      // lock has been released and scrollIntoView doesn't fight the
      // overlay. A microtask is enough.
      setPreSendWarnings(null);
      setTimeout(() => focusEditTarget(target), 0);
      return;
    }
    setPreSendWarnings(null);
  };

  const handlePreSendSendAnyway = async () => {
    if (preSendWarnings) {
      emitPreSendTelemetryFor(preSendWarnings, "sent-anyway");
    }
    // Keep the modal open while the send is in flight (so the
    // "Sendingâ€¦" label has somewhere to live and the doctor can't
    // click Send twice). It auto-closes on resolve regardless of
    // success/failure â€” the form-level success / error toast is the
    // canonical post-send surface.
    try {
      await performSaveAndSend();
    } finally {
      setPreSendWarnings(null);
    }
  };

  const ensurePrescriptionForPhoto = async (): Promise<string> => {
    if (photoLifted) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.warn(
          "[ppd-03] ensurePrescriptionForPhoto called while photoLifted=true; no-op.",
        );
      }
      throw new Error("Photo upload is disabled in the cockpit Plan pane.");
    }
    // Read from ref so a fresh autosave-create is visible even before
    // the corresponding setState has flushed.
    const existingId = prescriptionIdRef.current;
    if (existingId) return existingId;
    const res = await createPrescription(token, {
      appointmentId,
      patientId: patientId ?? undefined,
      type: entryMode,
    });
    prescriptionIdRef.current = res.data.prescription.id;
    setPrescription(res.data.prescription);
    return res.data.prescription.id;
  };

  useEffect(() => {
    __testExposeEnsurePhoto?.(ensurePrescriptionForPhoto);
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    const supabase = createClient();
    try {
      const prescriptionId = await ensurePrescriptionForPhoto();
      const currentCount = attachments.length;
      for (let i = 0; i < Math.min(files.length, MAX_ATTACHMENTS - currentCount); i++) {
        const file = files[i];
        const contentType = file.type;
        if (!ALLOWED_MIME.includes(contentType)) {
          setError(`Invalid file type: ${contentType}. Allowed: JPEG, PNG, WebP, PDF.`);
          break;
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          setError(`File too large: ${file.name}. Max ${MAX_FILE_SIZE_MB}MB.`);
          break;
        }
        const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "file";
        const uploadRes = await getPrescriptionUploadUrl(token, prescriptionId, {
          filename,
          contentType,
        });
        const { path, token: uploadToken } = uploadRes.data;
        const { error: uploadErr } = await supabase.storage
          .from("prescription-attachments")
          .uploadToSignedUrl(path, uploadToken, file);
        if (uploadErr) {
          setError(uploadErr.message || "Upload failed");
          break;
        }
        const regRes = await registerPrescriptionAttachment(token, prescriptionId, {
          filePath: path,
          fileType: contentType,
        });
        setAttachments((prev) => [...prev, regRes.data.attachment]);
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header: T2.13 SaveStatus pill replaces the explicit Save draft
          button. The pill carries the autosave state surface and acts
          as the retry affordance on failure. */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Prescription</h3>
        <div className="flex items-center gap-2">
          {/* EHR Sub-batch B1 / T2.14 â€” "Copy from last visit". Only
              renders when the appointment is part of a care episode
              AND a prior Rx exists (the lookup endpoint returns null
              in either no-episode / no-prior-Rx case). */}
          {lastEpisodeRx && (
            <button
              type="button"
              onClick={handleCopyFromLastVisit}
              disabled={saving}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              title="Copy diagnosis, plan, and medicines from the previous visit in this care episode"
            >
              Copy from last visit
            </button>
          )}
          {/* EHR Sub-batch B1 / T2.12 â€” Templates entry point. Disabled
              while a save flow is in flight to keep state changes
              serialised. */}
          <button
            type="button"
            onClick={() => setTemplatePickerOpen(true)}
            disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            Templates
          </button>
          {!actionsInFooter && (
            <SaveStatus
              state={autoSaveState}
              savedAt={autoSavedAt}
              isPending={autoSavePending}
              onRetry={() => {
                void autoSaveRetry();
              }}
            />
          )}
        </div>
      </div>

      {/* T2.12 â€” Templates picker. Mounts conditionally; no portal
          required for the v1 surface. */}
      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        token={token}
        onApply={handleApplyTemplate}
        onSaveCurrentAsTemplate={handleSaveAsTemplate}
      />

      {/* Entry mode */}
      {!entryModeLifted && (
        <div>
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Prescription type</legend>
            <div className="mt-2 flex gap-4">
              {(["structured", "photo", "both"] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="entryMode"
                    value={mode}
                    checked={entryMode === mode}
                    onChange={() => setEntryMode(mode)}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    disabled={saving}
                  />
                  <span className="text-sm">
                    {mode === "structured" && "Structured only"}
                    {mode === "photo" && "Photo only"}
                    {mode === "both" && "Both"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {(entryMode === "structured" || entryMode === "both") && (
        <PrescriptionFormCompositionRoot
          variant="flat"
          disabled={saving}
          dxLifted={dxLifted}
          safetyLifted={safetyLifted}
          subjectiveLifted={subjectiveLifted}
          objectiveLifted={objectiveLifted}
          token={token}
          medicineInstanceIds={medicineInstanceIds}
          setMedicineInstanceIds={setMedicineInstanceIds}
          generateInstanceIds={generateInstanceIds}
          drugMasterIndex={drugMasterIndex}
          setDrugMasterIndex={setDrugMasterIndex}
          allergies={allergies}
          ddiInteractions={ddiInteractions}
          isAcked={isAcked}
          onAcknowledge={onAcknowledge}
          onAckDdi={onAckDdi}
          onSendAndFinish={
            onFinish ? () => void handleSendAndFinish() : undefined
          }
          onOpenTemplates={() => setTemplatePickerOpen(true)}
          onOpenPreview={() => void handleOpenPreview()}
          canSend={canSendRx}
          showPreviousRxTrigger={cockpitState != null}
        />
      )}


      {/* Photo section */}
      {!photoLifted && (entryMode === "photo" || entryMode === "both") && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Attachments</label>
          <p className="mt-0.5 text-xs text-gray-500">
            JPEG, PNG, WebP, PDF. Max {MAX_FILE_SIZE_MB}MB each. Up to {MAX_ATTACHMENTS} files.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            onChange={handleFileSelect}
            disabled={uploading || saving}
            className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
          />
          {attachments.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Uploaded attachments">
              {attachments.map((att) => (
                <li
                  key={att.id}
                  className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1 text-sm"
                >
                  <span className="truncate max-w-[120px]">
                    {att.file_path.split("/").pop() ?? "File"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {successMessage && (
        <p role="status" aria-live="polite" className="text-sm text-green-700">
          {successMessage}
        </p>
      )}

      {/*
       * Action area â€” two-row layout (cockpit Rx-redesign).
       *
       *   Row 1 (utility, low-frequency):
       *     [ Preview as patient ]                   [ Save as template ]
       *
       *   Row 2 (commit, every visit):
       *     [ Send Rx ]   [ Send Rx & finish â–¸ ]   [ Finish visit ]
       *
       * Visual hierarchy:
       *   - "Send Rx & finish â–¸" is the only PRIMARY CTA (solid blue).
       *   - All other buttons share the same OUTLINED-PRIMARY look
       *     (blue border + blue text on white) so they read as equally
       *     reachable secondary actions â€” none of them feel like an
       *     afterthought greyed-out chip.
       *
       * Bracketed buttons in Row 2 are cockpit-only â€” they're hidden
       * outside the cockpit (`onFinish` not supplied), so the form
       * still works on legacy mounts (just shows Row 1 + "Send Rx").
       */}
      <div className="flex flex-col gap-2">
        {/* Row 1 â€” utility */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleOpenPreview}
            disabled={saving || uploading || previewLoading}
            className="rounded-md border border-blue-600 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            title="See how this prescription will look to the patient"
          >
            {previewLoading ? "Loadingâ€¦" : "Preview as patient"}
          </button>

          <button
            type="button"
            onClick={() => void handleSaveAsTemplate()}
            disabled={saving || uploading}
            className="rounded-md border border-blue-600 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            title="Save the current prescription as a reusable template"
          >
            Save as template
          </button>
        </div>

        {!actionsInFooter && (
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveAndSend}
            disabled={saving || uploading}
            data-rx-send-btn
            className="rounded-md border border-blue-600 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {saving && !finishAfterSendRef.current ? "Sendingâ€¦" : "Send Rx"}
          </button>

          {onFinish && (
            <SendRxFinishButton
              onClick={() => void handleSendAndFinish()}
              disabled={saving || uploading}
              sending={saving && finishAfterSendRef.current}
            />
          )}

          {onFinish && (
            <button
              type="button"
              onClick={onFinish}
              disabled={saving || uploading}
              className="rounded-md border border-blue-600 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              title="Close this visit without sending a prescription"
            >
              Finish visit
            </button>
          )}
          </div>
        )}
      </div>

      {/* T3.18 â€” Patient preview modal. Mounted at the form's root so
          ESC + backdrop close are wired up via the modal's own effect. */}
      <PrescriptionPatientPreview
        open={previewOpen}
        onClose={handleClosePreview}
        viewModel={previewVM}
      />

      {/* EHR Sub-batch C / T4.21 (C.4) â€” Pre-send soft guards modal.
          Opens only when "Send to patient" is pressed AND warnings
          exist; otherwise the send pipeline fires directly. The
          "Send anyway" button is ALWAYS enabled (Decision T4-D1
          LOCKED) â€” its `sending` prop is purely for in-flight click
          debounce, never a warning-based gate. */}
      <PrescriptionPreSendCheck
        open={preSendWarnings !== null}
        warnings={preSendWarnings ?? []}
        sending={saving}
        onCancel={handlePreSendCancel}
        onEdit={handlePreSendEdit}
        onSendAnyway={handlePreSendSendAnyway}
      />
    </div>
  );
}

/** @internal Exported for unit tests (ppd-03). */
export { PrescriptionFormBody };
