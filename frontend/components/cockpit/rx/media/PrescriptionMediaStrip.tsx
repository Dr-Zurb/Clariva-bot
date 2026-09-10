"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FileText, ImagePlus, Loader2, X } from "lucide-react";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { createClient } from "@/lib/supabase/client";
import {
  createPrescription,
  deletePrescriptionAttachment,
  getPrescriptionDownloadUrl,
  getPrescriptionUploadUrl,
  registerPrescriptionAttachment,
} from "@/lib/api";
import type { PrescriptionAttachment } from "@/types/prescription";
import { attachmentFilename, isImageAttachment } from "@/lib/cockpit/objective-media";

const BUCKET = "prescription-attachments";

export type PrescriptionMediaCategory = "objective" | "subjective" | "advice";

interface PendingUpload {
  id: string;
  file: File;
  name: string;
  previewUrl: string | null;
  progress: number;
  status: "queued" | "uploading" | "failed";
}

export interface PrescriptionMediaStripProps {
  disabled?: boolean;
  /** Upload category — routes the storage object into an objective/ or subjective/{complaintId}/ segment. */
  category?: PrescriptionMediaCategory;
  /** Opaque complaint pin for subjective uploads (sdp-02). */
  complaintId?: string;
  /** Filter attachments from the shell store for this strip instance. */
  filterAttachments: (attachments: readonly PrescriptionAttachment[]) => PrescriptionAttachment[];
  allowedMime: readonly string[];
  maxFiles: number;
  maxFileSizeMb: number;
  /** Full = Objective tab surface; compact = per-complaint card affordance. */
  variant?: "full" | "compact";
  /** Base for data-testid hooks — e.g. `objective-media` → `objective-media-strip`, `objective-media-add`. */
  testIdBase: string;
  sectionLabel: string;
  addLabel: string;
  addAriaLabel: string;
  listAriaLabel: string;
  emptyMessage: string;
  emptyMessageDisabled: string;
  helpText?: string;
  noShellMessage?: string;
  /** When false, hide the add control (e.g. "Other photos" orphan fallback is view + remove only). */
  allowAdd?: boolean;
  /** Extra controls next to the add button (e.g. Extract all). */
  headerActions?: ReactNode;
  /** Optional footer under each thumbnail (e.g. per-file Extract). */
  renderItemFooter?: (att: PrescriptionAttachment) => ReactNode;
}

function UploadProgressRing({ value }: { value: number }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg
      className="absolute inset-0 m-auto h-10 w-10 -rotate-90 text-primary"
      viewBox="0 0 36 36"
      aria-hidden
    >
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Shared prescription media strip (obj-22 / sdp-03 / P2-D4).
 *
 * Upload / signed-thumbnail / remove for the SHIPPED `prescription_attachments` storage.
 * Objective and per-complaint subjective strips differ only by category + filter predicate.
 * PHI-safe: never logs file paths / signed URLs / patient context.
 */
export function PrescriptionMediaStrip({
  disabled = false,
  category,
  complaintId,
  filterAttachments,
  allowedMime,
  maxFiles,
  maxFileSizeMb,
  variant = "full",
  testIdBase,
  sectionLabel,
  addLabel,
  addAriaLabel,
  listAriaLabel,
  emptyMessage,
  emptyMessageDisabled,
  helpText,
  noShellMessage,
  allowAdd = true,
  headerActions,
  renderItemFooter,
}: PrescriptionMediaStripProps) {
  const rxForm = useOptionalRxForm();
  const shell = usePrescriptionFormShell();

  const [error, setError] = useState<string | null>(null);
  const [pendings, setPendings] = useState<PendingUpload[]>([]);
  const [urlById, setUrlById] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingsRef = useRef<PendingUpload[]>([]);

  const isCompact = variant === "compact";
  const token = rxForm?.token ?? "";
  const appointmentId = rxForm?.appointmentId ?? "";
  const patientId = rxForm?.patientId;
  const uploading = pendings.some((item) => item.status !== "failed");

  const mediaItems = useMemo(
    () => filterAttachments(shell?.attachments ?? []),
    [filterAttachments, shell?.attachments],
  );

  const atCapacity = mediaItems.length + pendings.length >= maxFiles;
  const thumbClass = isCompact ? "h-14 w-14" : "h-24 w-24";
  const stripTestId = isCompact ? testIdBase : `${testIdBase}-strip`;

  useEffect(() => {
    pendingsRef.current = pendings;
  }, [pendings]);

  useEffect(() => {
    return () => {
      for (const item of pendingsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!rxForm || !token) return;
    const prescriptionId = shell?.prescriptionIdRef.current;
    if (!prescriptionId) return;
    let cancelled = false;
    const missing = mediaItems.filter((att) => !urlById[att.id]);
    if (missing.length === 0) return;
    void (async () => {
      const results = await Promise.all(
        missing.map(async (att) => {
          try {
            const res = await getPrescriptionDownloadUrl(token, prescriptionId, att.id);
            return { id: att.id, url: res.data.downloadUrl };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setUrlById((prev) => {
        const next = { ...prev };
        for (const item of results) {
          if (item) next[item.id] = item.url;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaItems, rxForm, shell?.prescriptionIdRef, token, urlById]);

  const ensurePrescription = useCallback(async (): Promise<string> => {
    if (!rxForm) throw new Error("RxForm unavailable");
    const existingId = shell?.prescriptionIdRef.current;
    if (existingId) return existingId;
    const res = await createPrescription(token, {
      appointmentId,
      patientId: patientId ?? undefined,
      type: shell?.entryMode ?? "structured",
    });
    const id = res.data.prescription.id;
    if (shell) {
      shell.prescriptionIdRef.current = id;
      shell.setPrescription(res.data.prescription);
    }
    return id;
  }, [appointmentId, patientId, rxForm, shell, token]);

  const patchPending = useCallback((id: string, patch: Partial<PendingUpload>) => {
    setPendings((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const dropPending = useCallback((id: string) => {
    setPendings((prev) => {
      const item = prev.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((entry) => entry.id !== id);
    });
  }, []);

  const uploadOne = useCallback(
    async (pending: PendingUpload, prescriptionId: string) => {
      const supabase = createClient();
      patchPending(pending.id, { status: "uploading", progress: 12 });
      const tick = window.setInterval(() => {
        setPendings((prev) =>
          prev.map((item) =>
            item.id === pending.id && item.progress < 85
              ? { ...item, progress: item.progress + 6 }
              : item,
          ),
        );
      }, 180);
      try {
        const contentType = pending.file.type;
        const filename =
          pending.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "file";
        const uploadRes = await getPrescriptionUploadUrl(token, prescriptionId, {
          filename,
          contentType,
          ...(category ? { category } : {}),
          ...(category === "subjective" && complaintId ? { complaintId } : {}),
        });
        patchPending(pending.id, { progress: Math.max(pending.progress, 28) });
        const { path, token: uploadToken } = uploadRes.data;
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(path, uploadToken, pending.file);
        if (uploadErr) throw new Error("upload");
        patchPending(pending.id, { progress: 92 });
        const regRes = await registerPrescriptionAttachment(token, prescriptionId, {
          filePath: path,
          fileType: contentType,
        });
        shell?.setAttachments((prev) => [...prev, regRes.data.attachment]);
        dropPending(pending.id);
      } catch {
        window.clearInterval(tick);
        patchPending(pending.id, { status: "failed", progress: 0 });
        throw new Error("upload");
      } finally {
        window.clearInterval(tick);
      }
    },
    [category, complaintId, dropPending, patchPending, shell, token],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length || disabled || !shell) return;
      setError(null);
      const remainingSlots = maxFiles - mediaItems.length - pendings.length;
      const accepted: PendingUpload[] = [];
      for (let i = 0; i < files.length && accepted.length < remainingSlots; i++) {
        const file = files[i]!;
        if (!allowedMime.includes(file.type)) {
          setError(`Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, PDF.`);
          continue;
        }
        if (file.size > maxFileSizeMb * 1024 * 1024) {
          setError(`File too large. Max ${maxFileSizeMb}MB each.`);
          continue;
        }
        const isImage = file.type.startsWith("image/");
        accepted.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          previewUrl: isImage ? URL.createObjectURL(file) : null,
          progress: 8,
          status: "queued",
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (accepted.length === 0) return;
      setPendings((prev) => [...prev, ...accepted]);
      try {
        const prescriptionId = await ensurePrescription();
        const results = await Promise.allSettled(
          accepted.map((item) => uploadOne(item, prescriptionId)),
        );
        if (results.some((result) => result.status === "rejected")) {
          setError("Upload failed. Please try again.");
        }
      } catch {
        setError("Upload failed. Please try again.");
        for (const item of accepted) {
          patchPending(item.id, { status: "failed", progress: 0 });
        }
      }
    },
    [
      allowedMime,
      disabled,
      ensurePrescription,
      maxFileSizeMb,
      maxFiles,
      mediaItems.length,
      patchPending,
      pendings.length,
      shell,
      uploadOne,
    ],
  );

  const handleOpen = useCallback(
    async (att: PrescriptionAttachment) => {
      const prescriptionId = shell?.prescriptionIdRef.current;
      if (!prescriptionId) return;
      try {
        const res = await getPrescriptionDownloadUrl(token, prescriptionId, att.id);
        window.open(res.data.downloadUrl, "_blank", "noopener,noreferrer");
      } catch {
        setError("Could not open file. Please try again.");
      }
    },
    [shell?.prescriptionIdRef, token],
  );

  const handleRemove = useCallback(
    async (att: PrescriptionAttachment) => {
      const prescriptionId = shell?.prescriptionIdRef.current;
      if (!prescriptionId || !shell || disabled) return;
      setError(null);
      let restoreAt = 0;
      shell.setAttachments((prev) => {
        restoreAt = prev.findIndex((item) => item.id === att.id);
        return prev.filter((item) => item.id !== att.id);
      });
      setUrlById((prev) => {
        const next = { ...prev };
        delete next[att.id];
        return next;
      });
      try {
        await deletePrescriptionAttachment(token, prescriptionId, att.id);
      } catch {
        shell.setAttachments((prev) => {
          if (prev.some((item) => item.id === att.id)) return prev;
          const next = [...prev];
          const index = restoreAt < 0 ? next.length : Math.min(restoreAt, next.length);
          next.splice(index, 0, att);
          return next;
        });
        setError("Could not remove file. Please try again.");
      }
    },
    [disabled, shell, token],
  );

  if (!rxForm) {
    return isCompact ? null : (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        {noShellMessage ?? "Media attachments are available in the consultation cockpit."}
      </p>
    );
  }

  if (!shell) {
    if (isCompact) return null;
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        {noShellMessage ?? "Media attachments are available in the consultation cockpit."}
      </p>
    );
  }

  const showList = mediaItems.length > 0 || pendings.length > 0;
  const showEmpty = !showList && !isCompact;

  return (
    <div className={isCompact ? "space-y-1" : "space-y-2"} data-testid={stripTestId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={isCompact ? "text-xs font-medium text-foreground/80" : RX_FIELD_LABEL_CLASS}>
          {sectionLabel}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {headerActions}
          {!disabled && allowAdd ? (
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:border-primary/60 hover:bg-muted/40 ${
                uploading || atCapacity ? "pointer-events-none opacity-50" : ""
              }`}
              data-testid={`${testIdBase}-add`}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              )}
              {uploading ? "Uploading…" : addLabel}
              <input
                ref={fileInputRef}
                type="file"
                accept={allowedMime.join(",")}
                multiple={!isCompact}
                className="sr-only"
                disabled={uploading || atCapacity}
                onChange={(e) => void handleFileSelect(e)}
                aria-label={addAriaLabel}
              />
            </label>
          ) : null}
        </div>
      </div>

      {!disabled && helpText && !isCompact ? (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      ) : null}

      {showEmpty ? (
        <p
          className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
          data-testid={`${testIdBase}-empty`}
        >
          {disabled ? emptyMessageDisabled : emptyMessage}
        </p>
      ) : showList ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={listAriaLabel}>
          {mediaItems.map((att, itemIndex) => {
            const url = urlById[att.id];
            const isImage = isImageAttachment(att);
            const name = attachmentFilename(att);
            const itemLabel = `Attachment ${itemIndex + 1}`;
            const footer = renderItemFooter?.(att);
            return (
              <li
                key={att.id}
                className={`group relative flex flex-col overflow-hidden rounded-md border border-border bg-muted/30 ${
                  footer ? "w-24" : thumbClass
                }`}
                data-testid={`${testIdBase}-item`}
              >
                <div className={`relative flex ${thumbClass} flex-col items-center justify-center`}>
                  <button
                    type="button"
                    onClick={() => void handleOpen(att)}
                    className="flex h-full w-full flex-col items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={name}
                    aria-label={`Open ${itemLabel}`}
                  >
                    {isImage && url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
                      <img src={url} alt={itemLabel} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex flex-col items-center gap-0.5 px-0.5 text-center">
                        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                        <span className="line-clamp-2 break-all text-[9px] text-muted-foreground">
                          {name}
                        </span>
                      </span>
                    )}
                  </button>
                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => void handleRemove(att)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive focus:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      aria-label={`Remove ${itemLabel}`}
                      data-testid={`${testIdBase}-remove`}
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  ) : null}
                </div>
                {footer}
              </li>
            );
          })}
          {pendings.map((item) => (
            <li
              key={item.id}
              className={`relative flex flex-col overflow-hidden rounded-md border border-border bg-muted/30 ${
                isCompact ? thumbClass : "w-24"
              }`}
              data-testid={`${testIdBase}-pending`}
              data-status={item.status}
            >
              <div className={`relative flex ${thumbClass} flex-col items-center justify-center`}>
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL for in-flight upload
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-full w-full object-cover opacity-50"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-0.5 px-0.5 text-center opacity-50">
                    <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="line-clamp-2 break-all text-[9px] text-muted-foreground">
                      {item.name}
                    </span>
                  </span>
                )}
                {item.status !== "failed" ? <UploadProgressRing value={item.progress} /> : null}
                <span className="sr-only">
                  {item.status === "failed"
                    ? "Upload failed"
                    : `Uploading ${Math.round(item.progress)} percent`}
                </span>
                {item.status === "failed" ? (
                  <button
                    type="button"
                    onClick={() => dropPending(item.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-destructive"
                    aria-label="Dismiss failed upload"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" aria-live="polite" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
