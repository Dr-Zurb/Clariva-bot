"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createPrescription,
  updatePrescription,
  listPrescriptionsByAppointment,
  getPrescriptionUploadUrl,
  registerPrescriptionAttachment,
  sendPrescriptionToPatient,
} from "@/lib/api";
import type {
  PrescriptionWithRelations,
  PrescriptionType,
  PrescriptionAttachment,
} from "@/types/prescription";
import MedicineRow from "./MedicineRow";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_MB = 10;

interface MedicineEntry {
  medicineName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

interface PrescriptionFormProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  onSuccess?: () => void;
  existingPrescription?: PrescriptionWithRelations | null;
}

/**
 * Prescription form: structured SOAP + medications and/or photo upload.
 * Save draft or Save & send to patient.
 * @see e-task-4
 */
export default function PrescriptionForm({
  appointmentId,
  patientId,
  token,
  onSuccess,
  existingPrescription: initialPrescription,
}: PrescriptionFormProps) {
  const [entryMode, setEntryMode] = useState<PrescriptionType>("structured");
  const [prescription, setPrescription] =
    useState<PrescriptionWithRelations | null>(initialPrescription ?? null);
  const [cc, setCc] = useState("");
  const [hopi, setHopi] = useState("");
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState("");
  const [investigations, setInvestigations] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [patientEducation, setPatientEducation] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [medicines, setMedicines] = useState<MedicineEntry[]>([
    { medicineName: "", dosage: "", route: "", frequency: "", duration: "", instructions: "" },
  ]);
  const [attachments, setAttachments] = useState<PrescriptionAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialPrescription);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing prescription if not passed
  useEffect(() => {
    if (initialPrescription) {
      setPrescription(initialPrescription);
      setEntryMode(initialPrescription.type);
      setCc(initialPrescription.cc ?? "");
      setHopi(initialPrescription.hopi ?? "");
      setProvisionalDiagnosis(initialPrescription.provisional_diagnosis ?? "");
      setInvestigations(initialPrescription.investigations ?? "");
      setFollowUp(initialPrescription.follow_up ?? "");
      setPatientEducation(initialPrescription.patient_education ?? "");
      setClinicalNotes(initialPrescription.clinical_notes ?? "");
      const meds = initialPrescription.prescription_medicines ?? [];
      if (meds.length > 0) {
        setMedicines(
          meds.map((m) => ({
            medicineName: m.medicine_name,
            dosage: m.dosage ?? "",
            route: m.route ?? "",
            frequency: m.frequency ?? "",
            duration: m.duration ?? "",
            instructions: m.instructions ?? "",
          }))
        );
      }
      setAttachments(initialPrescription.prescription_attachments ?? []);
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const res = await listPrescriptionsByAppointment(token, appointmentId);
        const list = res.data.prescriptions ?? [];
        if (list.length > 0) {
          const latest = list[0];
          setPrescription(latest);
          setEntryMode(latest.type);
          setCc(latest.cc ?? "");
          setHopi(latest.hopi ?? "");
          setProvisionalDiagnosis(latest.provisional_diagnosis ?? "");
          setInvestigations(latest.investigations ?? "");
          setFollowUp(latest.follow_up ?? "");
          setPatientEducation(latest.patient_education ?? "");
          setClinicalNotes(latest.clinical_notes ?? "");
          const meds = latest.prescription_medicines ?? [];
          if (meds.length > 0) {
            setMedicines(
              meds.map((m) => ({
                medicineName: m.medicine_name,
                dosage: m.dosage ?? "",
                route: m.route ?? "",
                frequency: m.frequency ?? "",
                duration: m.duration ?? "",
                instructions: m.instructions ?? "",
              }))
            );
          }
          setAttachments(latest.prescription_attachments ?? []);
        }
      } catch {
        // No prescription yet
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [appointmentId, token, initialPrescription]);

  const handleMedicineChange = (index: number, field: string, value: string) => {
    setMedicines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddMedicine = () => {
    setMedicines((prev) => [
      ...prev,
      { medicineName: "", dosage: "", route: "", frequency: "", duration: "", instructions: "" },
    ]);
  };

  const handleRemoveMedicine = (index: number) => {
    setMedicines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const buildPayload = () => ({
    cc: cc.trim() || null,
    hopi: hopi.trim() || null,
    provisionalDiagnosis: provisionalDiagnosis.trim() || null,
    investigations: investigations.trim() || null,
    followUp: followUp.trim() || null,
    patientEducation: patientEducation.trim() || null,
    clinicalNotes: clinicalNotes.trim() || null,
    medicines: medicines
      .filter((m) => m.medicineName.trim())
      .map((m, i) => ({
        medicineName: m.medicineName.trim(),
        dosage: m.dosage.trim() || null,
        route: m.route.trim() || null,
        frequency: m.frequency.trim() || null,
        duration: m.duration.trim() || null,
        instructions: m.instructions.trim() || null,
        sortOrder: i,
      })),
  });

  const saveDraft = async () => {
    setError(null);
    setSuccessMessage(null);
    setSaving(true);
    try {
      const payload = buildPayload();
      if (prescription) {
        await updatePrescription(token, prescription.id, payload);
      } else {
        const res = await createPrescription(token, {
          appointmentId,
          patientId: patientId ?? undefined,
          type: entryMode,
          ...payload,
        });
        setPrescription(res.data.prescription);
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndSend = async () => {
    setError(null);
    setSuccessMessage(null);
    setSaving(true);
    try {
      const payload = buildPayload();
      let rx = prescription;
      if (rx) {
        await updatePrescription(token, rx.id, payload);
      } else {
        const res = await createPrescription(token, {
          appointmentId,
          patientId: patientId ?? undefined,
          type: entryMode,
          ...payload,
        });
        rx = res.data.prescription;
        setPrescription(rx);
      }
      const sendRes = await sendPrescriptionToPatient(token, rx.id);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save and send");
    } finally {
      setSaving(false);
    }
  };

  const ensurePrescriptionForPhoto = async (): Promise<string> => {
    if (prescription) return prescription.id;
    const res = await createPrescription(token, {
      appointmentId,
      patientId: patientId ?? undefined,
      type: entryMode,
    });
    setPrescription(res.data.prescription);
    return res.data.prescription.id;
  };

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

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">Loading prescription…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Entry mode */}
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

      {/* Structured section */}
      {(entryMode === "structured" || entryMode === "both") && (
        <div className="space-y-3">
          <div>
            <label htmlFor="cc" className="block text-sm font-medium text-gray-700">
              Chief complaint (CC)
            </label>
            <input
              id="cc"
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="Chief complaint"
              maxLength={500}
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="hopi" className="block text-sm font-medium text-gray-700">
              History of present illness (HOPI)
            </label>
            <textarea
              id="hopi"
              rows={3}
              value={hopi}
              onChange={(e) => setHopi(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="History of present illness"
              maxLength={2000}
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="diagnosis" className="block text-sm font-medium text-gray-700">
              Provisional diagnosis
            </label>
            <input
              id="diagnosis"
              type="text"
              value={provisionalDiagnosis}
              onChange={(e) => setProvisionalDiagnosis(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="Provisional diagnosis"
              maxLength={500}
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="investigations" className="block text-sm font-medium text-gray-700">
              Investigations
            </label>
            <input
              id="investigations"
              type="text"
              value={investigations}
              onChange={(e) => setInvestigations(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="Investigations"
              maxLength={1000}
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="followUp" className="block text-sm font-medium text-gray-700">
              Follow-up
            </label>
            <input
              id="followUp"
              type="text"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="Follow-up"
              maxLength={1000}
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="patientEducation" className="block text-sm font-medium text-gray-700">
              Patient education
            </label>
            <input
              id="patientEducation"
              type="text"
              value={patientEducation}
              onChange={(e) => setPatientEducation(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="Patient education"
              maxLength={1000}
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="clinicalNotes" className="block text-sm font-medium text-gray-700">
              Clinical notes
            </label>
            <textarea
              id="clinicalNotes"
              rows={2}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="Clinical notes"
              maxLength={5000}
              disabled={saving}
            />
          </div>

          {/* Medicines */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Medications</label>
              <button
                type="button"
                onClick={handleAddMedicine}
                disabled={saving}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                + Add medicine
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {medicines.map((med, i) => (
                <MedicineRow
                  key={i}
                  index={i}
                  value={med}
                  onChange={handleMedicineChange}
                  onRemove={handleRemoveMedicine}
                  disabled={saving}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Photo section */}
      {(entryMode === "photo" || entryMode === "both") && (
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

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveDraft}
          disabled={saving || uploading}
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={handleSaveAndSend}
          disabled={saving || uploading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {saving ? "Saving…" : "Save & send to patient"}
        </button>
      </div>
    </div>
  );
}
