/**
 * Objective-tab media helpers (obj-22 / P5-D4).
 *
 * Objective media (wound/rash photos, ECG images, report scans, telemed-captured media) is the
 * SAME `prescription_attachments` storage as photo-Rx — it is only *tagged* by an `objective/`
 * segment in the storage path (`{doctor_id}/{prescription_id}/objective/{uuid}-{file}`). No new
 * bucket, column, or RLS policy: the prescription-scoped policy (migration 026) already covers it.
 *
 * These pure helpers tag-and-filter that media for the Objective media strip without touching the
 * legacy photo-Rx attachments (which have no `objective/` segment).
 */

import type { PrescriptionAttachment } from "@/types/prescription";

/** Upload category passed to the upload-URL request; mirrors the backend path segment. */
export const OBJECTIVE_ATTACHMENT_CATEGORY = "objective" as const;

/** Reuse the shipped uploader guards verbatim (prescription-attachment-service ALLOWED_MIME). */
export const OBJECTIVE_MEDIA_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const OBJECTIVE_MEDIA_MAX_FILES = 8;
export const OBJECTIVE_MEDIA_MAX_FILE_SIZE_MB = 10;

/**
 * True when an attachment was uploaded as Objective-tab media (path carries the `objective/`
 * segment). Robust to the `{doctor}/{prescription}/objective/{uuid}-{file}` shape; legacy
 * `{doctor}/{prescription}/{uuid}-{file}` attachments return false.
 */
export function isObjectiveAttachment(
  att: Pick<PrescriptionAttachment, "file_path">,
): boolean {
  return att.file_path
    .split("/")
    .includes(OBJECTIVE_ATTACHMENT_CATEGORY);
}

/** Objective-tagged attachments only (preserves input order). */
export function filterObjectiveAttachments<T extends Pick<PrescriptionAttachment, "file_path">>(
  attachments: readonly T[],
): T[] {
  return attachments.filter((att) => isObjectiveAttachment(att));
}

/** True for image attachments (thumbnail-able); PDFs render as a file chip. */
export function isImageAttachment(
  att: Pick<PrescriptionAttachment, "file_type">,
): boolean {
  return att.file_type?.startsWith("image/") ?? false;
}

/** Best-effort display name from the storage path (never the patient/doctor segment). */
export function attachmentFilename(
  att: Pick<PrescriptionAttachment, "file_path">,
): string {
  const last = att.file_path.split("/").pop() ?? "";
  // Strip the `{uuid}-` prefix the uploader prepends, if present.
  const stripped = last.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    "",
  );
  return stripped || last || "File";
}
