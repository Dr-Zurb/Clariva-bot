"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import {
  deletePublicClinicPhoto,
  getPublicClinicHistory,
  getPublicClinicPhotos,
  getPublicMedicineCatalog,
  postPublicClinicHistory,
  postPublicClinicPhoto,
  type PublicHistoryList,
  type PublicHistoryRead,
} from "@/lib/api";
import { arrivalLine } from "@/lib/arrival-line";
import { downscalePatientFile } from "@/lib/downscale-patient-file";
import { publicDrugToMasterRow } from "@/lib/patient-medicine-catalog";
import type { DrugMasterRow } from "@/types/drug-master";
import { PrepNameSection, type PrepTimedItem } from "@/components/book/PrepNameSection";
import { SharePrepLink } from "@/components/book/SharePrepLink";
import { VISIT_DOCUMENT_TYPE_LABEL } from "@/types/visit-documents";

const NOTICE = "⟨fill — counsel⟩";

const PATIENT_PHOTO_KINDS = [
  { value: "old_prescription", label: "Prescription or strips" },
  { value: "lab_report", label: "Lab report" },
  { value: "imaging", label: "Scan" },
  { value: "other", label: "Other papers" },
] as const;

type PatientPhotoKind = (typeof PATIENT_PHOTO_KINDS)[number]["value"];

function photoKindLabel(documentType: string): string {
  const known = PATIENT_PHOTO_KINDS.find((kind) => kind.value === documentType);
  if (known) return known.label;
  if (documentType in VISIT_DOCUMENT_TYPE_LABEL) {
    return VISIT_DOCUMENT_TYPE_LABEL[documentType as keyof typeof VISIT_DOCUMENT_TYPE_LABEL];
  }
  return "File";
}

function itemsFrom(value: PublicHistoryList | undefined): { none: boolean; items: PrepTimedItem[] } {
  if (value?.none === true) return { none: true, items: [] };
  return {
    none: false,
    items: (value?.items ?? [])
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name,
        durationValue: item.durationValue ?? null,
        durationUnit: item.durationUnit ?? null,
      })),
  };
}

function toList(none: boolean, items: PrepTimedItem[], timed: boolean): PublicHistoryList {
  if (none) return { none: true, items: [] };
  return {
    none: false,
    items: items.map((item) => {
      if (!timed || item.durationValue == null || item.durationUnit == null) return { name: item.name };
      return {
        name: item.name,
        durationValue: item.durationValue,
        durationUnit: item.durationUnit,
      };
    }),
  };
}

function PrepForm() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("t") ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<PublicHistoryRead | null>(null);
  const [medicineCatalog, setMedicineCatalog] = useState<DrugMasterRow[]>([]);
  const [medicineNone, setMedicineNone] = useState(false);
  const [medicines, setMedicines] = useState<PrepTimedItem[]>([]);
  const [allergyNone, setAllergyNone] = useState(false);
  const [allergies, setAllergies] = useState<PrepTimedItem[]>([]);
  const [conditionNone, setConditionNone] = useState(false);
  const [conditions, setConditions] = useState<PrepTimedItem[]>([]);
  const [since, setSince] = useState("");
  const [course, setCourse] = useState<"" | "better" | "same" | "worse">("");
  const [tried, setTried] = useState("");
  const [aim, setAim] = useState<"" | "new_problem" | "follow_up" | "reports" | "refill">("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photos, setPhotos] = useState<Array<{ id: string; documentType: string; downloadUrl: string }>>([]);
  const [canRemovePhotos, setCanRemovePhotos] = useState(true);
  const [photoType, setPhotoType] = useState<PatientPhotoKind>("old_prescription");
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This prep link is no longer available");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void getPublicMedicineCatalog(token)
      .then((res) => {
        if (!cancelled) setMedicineCatalog(res.data.drugs.map(publicDrugToMasterRow));
      })
      .catch(() => undefined);
    getPublicClinicHistory(token)
      .then(async (res) => {
        if (cancelled) return;
        const data = res.data;
        setRead(data);
        const meds = itemsFrom(data.medicines);
        const allergyRows = itemsFrom(data.allergies);
        const conditionRows = itemsFrom(data.conditions);
        setMedicineNone(meds.none);
        setMedicines(meds.items);
        setAllergyNone(allergyRows.none);
        setAllergies(allergyRows.items);
        setConditionNone(conditionRows.none);
        setConditions(conditionRows.items);
        setSince(data.chips?.since ?? "");
        setCourse(data.chips?.course ?? "");
        setTried(data.chips?.tried ?? "");
        setAim(data.chips?.aim ?? "");
        try {
          const photoRes = await getPublicClinicPhotos(token);
          if (!cancelled) {
            setPhotos(photoRes.data.photos);
            setCanRemovePhotos(photoRes.data.canRemove);
          }
        } catch {
          if (!cancelled) setPhotoError("Could not load files.");
        }
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("This prep link is no longer available");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !read || read.alreadySent) return;
    setSaving(true);
    setError(null);
    const hidden = read.listsHidden;
    try {
      await postPublicClinicHistory({
        token,
        noticeVersion: "pending-counsel",
        allergies: hidden ? { none: true, items: [] } : toList(allergyNone, allergies, false),
        medicines: hidden ? { none: true, items: [] } : toList(medicineNone, medicines, true),
        conditions: hidden ? { none: true, items: [] } : toList(conditionNone, conditions, true),
        ...((since.trim() || course || tried.trim() || aim)
          ? {
              chips: {
                ...(since.trim() ? { since: since.trim() } : {}),
                ...(course ? { course } : {}),
                ...(tried.trim() ? { tried: tried.trim() } : {}),
                ...(aim ? { aim } : {}),
              },
            }
          : {}),
      });
      setSaved(true);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 409 ? "This visit’s history was already sent." : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-center text-gray-600">Loading…</p>;
  }
  if (error && !read) {
    return <p className="text-center font-medium text-amber-800">{error}</p>;
  }
  if (!read) return null;

  const locked = read.alreadySent || saved;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Before your visit</h1>
      <p className="text-sm text-gray-600">{NOTICE}</p>
      {arrivalLine(read.consultationType) ? (
        <p className="text-sm font-medium text-gray-900">{arrivalLine(read.consultationType)}</p>
      ) : null}
      <SharePrepLink resolveUrl={async () => window.location.href} />
      {read.listsHidden ? (
        <p className="text-sm text-gray-700">The clinic already has your medicines, allergies, and conditions.</p>
      ) : (
        <>
          <PrepNameSection
            kind="medicines"
            legend="Medicines"
            noneLabel="No medicines"
            placeholder="Search or enter a medicine…"
            medicineCatalog={medicineCatalog}
            items={medicines}
            none={medicineNone}
            locked={locked}
            onItems={setMedicines}
            onNone={setMedicineNone}
          />
          <PrepNameSection
            kind="allergies"
            legend="Allergies"
            noneLabel="No known allergies"
            placeholder="Search or enter an allergen…"
            items={allergies}
            none={allergyNone}
            locked={locked}
            onItems={setAllergies}
            onNone={setAllergyNone}
          />
          <PrepNameSection
            kind="conditions"
            legend="Conditions"
            noneLabel="No conditions"
            placeholder="Search or enter a condition…"
            items={conditions}
            none={conditionNone}
            locked={locked}
            onItems={setConditions}
            onNone={setConditionNone}
          />
        </>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-800">
          Add a photo of the prescription, strips, or reports
        </legend>
        <label className="block text-sm text-gray-700">
          Kind
          <select
            aria-label="Photo kind"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={photoType}
            onChange={(event) => setPhotoType(event.target.value as PatientPhotoKind)}
          >
            {PATIENT_PHOTO_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="Add a photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || !token) return;
            void (async () => {
              setPhotoError(null);
              try {
                const scaled = await downscalePatientFile(file);
                await postPublicClinicPhoto(token, photoType, scaled.body, scaled.contentType);
                const next = await getPublicClinicPhotos(token);
                setPhotos(next.data.photos);
                setCanRemovePhotos(next.data.canRemove);
              } catch {
                setPhotoError("Could not add that file.");
              }
            })();
          }}
        />
        <ul className="space-y-2">
          {photos.map((photo) => (
            <li key={photo.id} className="flex items-center justify-between gap-2 text-sm">
              <a href={photo.downloadUrl} className="text-gray-800 underline">
                {photoKindLabel(photo.documentType)}
              </a>
              {canRemovePhotos ? (
                <button
                  type="button"
                  className="rounded-lg border border-gray-900 bg-white px-3 py-2 text-sm font-medium"
                  onClick={() => {
                    if (!token) return;
                    void deletePublicClinicPhoto(token, photo.id)
                      .then(() => {
                        setPhotos((current) => current.filter((item) => item.id !== photo.id));
                      })
                      .catch((err: { status?: number }) => {
                        if (err.status === 409) setCanRemovePhotos(false);
                        else setPhotoError("Could not remove that file.");
                      });
                  }}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {photoError ? <p className="text-sm text-red-700">{photoError}</p> : null}
      </fieldset>
      <label className="block text-sm font-medium text-gray-800">
        Since when
        <input
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          value={since}
          disabled={locked}
          onChange={(event) => setSince(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-gray-800">
        Course
        <select
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          value={course}
          disabled={locked}
          onChange={(event) => setCourse(event.target.value as typeof course)}
        >
          <option value="">Skip</option>
          <option value="better">Better</option>
          <option value="same">Same</option>
          <option value="worse">Worse</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-gray-800">
        Already tried
        <input
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          value={tried}
          disabled={locked}
          onChange={(event) => setTried(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-gray-800">
        Aim
        <select
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          value={aim}
          disabled={locked}
          onChange={(event) => setAim(event.target.value as typeof aim)}
        >
          <option value="">Skip</option>
          <option value="new_problem">New problem</option>
          <option value="follow_up">Follow up</option>
          <option value="reports">Reports</option>
          <option value="refill">Refill</option>
        </select>
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {locked ? (
        <p className="text-sm font-medium text-green-800">Already sent.</p>
      ) : (
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg border border-gray-900 bg-white px-4 py-3 text-sm font-medium text-gray-900"
        >
          {saving ? "Saving…" : "Send"}
        </button>
      )}
    </form>
  );
}

export default function PrepPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-6">
        <Suspense fallback={<p className="text-center text-gray-600">Loading…</p>}>
          <PrepForm />
        </Suspense>
      </div>
    </main>
  );
}
