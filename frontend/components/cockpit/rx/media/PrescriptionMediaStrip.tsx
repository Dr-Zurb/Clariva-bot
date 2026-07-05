"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export type PrescriptionMediaCategory = "objective" | "subjective";

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
}: PrescriptionMediaStripProps) {
  const rxForm = useOptionalRxForm();
  const shell = usePrescriptionFormShell();

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [urlById, setUrlById] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isCompact = variant === "compact";
  const token = rxForm?.token ?? "";
  const appointmentId = rxForm?.appointmentId ?? "";
  const patientId = rxForm?.patientId;

  const mediaItems = useMemo(
    () => filterAttachments(shell?.attachments ?? []),
    [filterAttachments, shell?.attachments],
  );

  const atCapacity = mediaItems.length >= maxFiles;
  const thumbClass = isCompact ? "h-14 w-14" : "h-24 w-24";
  const stripTestId = isCompact ? testIdBase : `${testIdBase}-strip`;

  useEffect(() => {
    if (!rxForm || !token) return;
    const prescriptionId = shell?.prescriptionIdRef.current;
    if (!prescriptionId) return;
    let cancelled = false;
    const missing = mediaItems.filter((att) => !urlById[att.id]);
    if (missing.length === 0) return;
    void (async () => {
      for (const att of missing) {
        try {
          const res = await getPrescriptionDownloadUrl(token, prescriptionId, att.id);
          if (cancelled) return;
          setUrlById((prev) => ({ ...prev, [att.id]: res.data.downloadUrl }));
        } catch {
          // Non-fatal — a missing thumbnail falls back to a file chip.
        }
      }
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

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length || disabled || !shell) return;
      setError(null);
      setUploading(true);
      const supabase = createClient();
      try {
        const prescriptionId = await ensurePrescription();
        const remainingSlots = maxFiles - mediaItems.length;
        for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
          const file = files[i]!;
          const contentType = file.type;
          if (!allowedMime.includes(contentType)) {
            setError(`Invalid file type: ${contentType}. Allowed: JPEG, PNG, WebP, PDF.`);
            break;
          }
          if (file.size > maxFileSizeMb * 1024 * 1024) {
            setError(`File too large. Max ${maxFileSizeMb}MB each.`);
            break;
          }
          const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "file";
          const uploadRes = await getPrescriptionUploadUrl(token, prescriptionId, {
            filename,
            contentType,
            ...(category ? { category } : {}),
            ...(category === "subjective" && complaintId ? { complaintId } : {}),
          });
          const { path, token: uploadToken } = uploadRes.data;
          const { error: uploadErr } = await supabase.storage
            .from(BUCKET)
            .uploadToSignedUrl(path, uploadToken, file);
          if (uploadErr) {
            setError("Upload failed. Please try again.");
            break;
          }
          const regRes = await registerPrescriptionAttachment(token, prescriptionId, {
            filePath: path,
            fileType: contentType,
          });
          shell.setAttachments((prev) => [...prev, regRes.data.attachment]);
        }
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [
      allowedMime,
      category,
      complaintId,
      disabled,
      ensurePrescription,
      maxFileSizeMb,
      maxFiles,
      mediaItems.length,
      shell,
      token,
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
      setRemovingId(att.id);
      try {
        await deletePrescriptionAttachment(token, prescriptionId, att.id);
        shell.setAttachments((prev) => prev.filter((a) => a.id !== att.id));
        setUrlById((prev) => {
          const next = { ...prev };
          delete next[att.id];
          return next;
        });
      } catch {
        setError("Could not remove file. Please try again.");
      } finally {
        setRemovingId(null);
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

  const showEmpty = mediaItems.length === 0 && !isCompact;

  return (
    <div className={isCompact ? "space-y-1" : "space-y-2"} data-testid={stripTestId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={isCompact ? "text-xs font-medium text-foreground/80" : RX_FIELD_LABEL_CLASS}>
          {sectionLabel}
        </span>
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
      ) : mediaItems.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={listAriaLabel}>
          {mediaItems.map((att, itemIndex) => {
            const url = urlById[att.id];
            const isImage = isImageAttachment(att);
            const name = attachmentFilename(att);
            const itemLabel = `Attachment ${itemIndex + 1}`;
            return (
              <li
                key={att.id}
                className={`group relative flex ${thumbClass} flex-col items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30`}
                data-testid={`${testIdBase}-item`}
              >
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
                    disabled={removingId === att.id}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive focus:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-50"
                    aria-label={`Remove ${itemLabel}`}
                    data-testid={`${testIdBase}-remove`}
                  >
                    {removingId === att.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <X className="h-3 w-3" aria-hidden />
                    )}
                  </button>
                ) : null}
              </li>
            );
          })}
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
