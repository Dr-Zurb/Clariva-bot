"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listPrescriptionsByPatient, getPrescriptionDownloadUrl } from "@/lib/api";
import type { PrescriptionWithRelations } from "@/types/prescription";

interface PreviousPrescriptionsProps {
  patientId: string;
  appointmentId: string;
  token: string;
  limit?: number;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * Previous prescriptions for a patient. Shown on appointment detail.
 * @see e-task-6
 */
export default function PreviousPrescriptions({
  patientId,
  appointmentId,
  token,
  limit = 3,
}: PreviousPrescriptionsProps) {
  const [prescriptions, setPrescriptions] = useState<PrescriptionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await listPrescriptionsByPatient(token, patientId);
        const list = res.data.prescriptions ?? [];
        setPrescriptions(list.slice(0, limit));
      } catch {
        setPrescriptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [patientId, token, limit]);

  const handleView = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const fetchAttachmentUrl = async (prescriptionId: string, attachmentId: string) => {
    const key = `${prescriptionId}-${attachmentId}`;
    if (attachmentUrls[key]) return attachmentUrls[key];
    try {
      const res = await getPrescriptionDownloadUrl(token, prescriptionId, attachmentId);
      setAttachmentUrls((prev) => ({ ...prev, [key]: res.data.downloadUrl }));
      return res.data.downloadUrl;
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Previous prescriptions for this patient
        </h2>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (prescriptions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Previous prescriptions for this patient
        </h2>
        <p className="text-sm text-gray-500">No previous prescriptions.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Previous prescriptions for this patient
        </h2>
        <Link
          href={`/dashboard/patients/${patientId}#prescriptions`}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
        >
          View all
        </Link>
      </div>
      <ul className="space-y-2" aria-label="Previous prescriptions">
        {prescriptions.map((rx) => {
          const isExpanded = expandedId === rx.id;
          const diagnosis = rx.provisional_diagnosis
            ? rx.provisional_diagnosis.slice(0, 60) + (rx.provisional_diagnosis.length > 60 ? "…" : "")
            : null;
          return (
            <li
              key={rx.id}
              className="rounded border border-gray-200 bg-white p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-gray-700">{formatDate(rx.created_at)}</span>
                  <span
                    className="ml-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium text-gray-600"
                    style={{
                      backgroundColor: "rgba(0,0,0,0.06)",
                    }}
                  >
                    {rx.type}
                  </span>
                  {diagnosis && (
                    <p className="mt-0.5 text-gray-600">{diagnosis}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleView(rx.id)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                >
                  {isExpanded ? "Hide" : "View"}
                </button>
              </div>
              {isExpanded && (
                <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                  {rx.cc && (
                    <div>
                      <span className="font-medium text-gray-600">CC: </span>
                      <span className="text-gray-800">{rx.cc}</span>
                    </div>
                  )}
                  {rx.provisional_diagnosis && (
                    <div>
                      <span className="font-medium text-gray-600">Diagnosis: </span>
                      <span className="text-gray-800">{rx.provisional_diagnosis}</span>
                    </div>
                  )}
                  {(rx.prescription_medicines?.length ?? 0) > 0 && (
                    <div>
                      <span className="font-medium text-gray-600">Medications: </span>
                      <ul className="mt-1 list-inside list-disc text-gray-800">
                        {rx.prescription_medicines!.map((m, i) => (
                          <li key={i}>
                            {m.medicine_name}
                            {m.dosage && ` ${m.dosage}`}
                            {m.frequency && ` ${m.frequency}`}
                            {m.duration && ` × ${m.duration}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {rx.follow_up && (
                    <div>
                      <span className="font-medium text-gray-600">Follow-up: </span>
                      <span className="text-gray-800">{rx.follow_up}</span>
                    </div>
                  )}
                  {(rx.prescription_attachments?.length ?? 0) > 0 && (
                    <div>
                      <span className="font-medium text-gray-600">Attachments: </span>
                      <PrescriptionAttachmentList
                        prescriptionId={rx.id}
                        attachments={rx.prescription_attachments!}
                        token={token}
                        onFetchUrl={fetchAttachmentUrl}
                        attachmentUrls={attachmentUrls}
                      />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PrescriptionAttachmentList({
  prescriptionId,
  attachments,
  token,
  onFetchUrl,
  attachmentUrls,
}: {
  prescriptionId: string;
  attachments: Array<{ id: string; file_type: string | null }>;
  token: string;
  onFetchUrl: (prescriptionId: string, attachmentId: string) => Promise<string | null>;
  attachmentUrls: Record<string, string>;
}) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const handleClick = async (attachmentId: string) => {
    const key = `${prescriptionId}-${attachmentId}`;
    if (attachmentUrls[key]) {
      window.open(attachmentUrls[key], "_blank");
      return;
    }
    setLoadingIds((prev) => new Set(prev).add(attachmentId));
    const url = await onFetchUrl(prescriptionId, attachmentId);
    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.delete(attachmentId);
      return next;
    });
    if (url) window.open(url, "_blank");
  };

  return (
    <ul className="mt-1 space-y-1">
      {attachments.map((att) => (
        <li key={att.id}>
          <button
            type="button"
            onClick={() => handleClick(att.id)}
            disabled={loadingIds.has(att.id)}
            className="text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
          >
            {loadingIds.has(att.id)
              ? "Loading…"
              : `View ${att.file_type?.startsWith("image/") ? "image" : "file"}`}
          </button>
        </li>
      ))}
    </ul>
  );
}
