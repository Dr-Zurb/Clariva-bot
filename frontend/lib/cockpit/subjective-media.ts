/**
 * Subjective-tab per-complaint media helpers (sdp-03 / P2-D4).
 *
 * Symptom photos (rash, wound, swelling) are the SAME `prescription_attachments` storage as
 * photo-Rx and objective media — pinned to a complaint via a `subjective/{complaintId}/` path
 * segment (`{doctor_id}/{prescription_id}/subjective/{complaintId}/{uuid}-{file}`). No new
 * bucket, column, or RLS policy.
 *
 * These pure helpers tag-and-filter that media for the per-complaint photo strip without
 * touching objective or legacy attachments.
 */

import type { PrescriptionAttachment } from "@/types/prescription";
import {
  OBJECTIVE_MEDIA_ALLOWED_MIME,
  OBJECTIVE_MEDIA_MAX_FILES,
  OBJECTIVE_MEDIA_MAX_FILE_SIZE_MB,
  attachmentFilename,
  isImageAttachment,
} from "@/lib/cockpit/objective-media";

/** Upload category passed to the upload-URL request; mirrors the backend path segment. */
export const SUBJECTIVE_ATTACHMENT_CATEGORY = "subjective" as const;

/** Reuse the shipped uploader guards verbatim (prescription-attachment-service ALLOWED_MIME). */
export const SUBJECTIVE_MEDIA_ALLOWED_MIME = OBJECTIVE_MEDIA_ALLOWED_MIME;
export const SUBJECTIVE_MEDIA_MAX_FILES = OBJECTIVE_MEDIA_MAX_FILES;
export const SUBJECTIVE_MEDIA_MAX_FILE_SIZE_MB = OBJECTIVE_MEDIA_MAX_FILE_SIZE_MB;

export { attachmentFilename, isImageAttachment };

const COMPLAINT_ID_SEGMENT_MAX = 64;

/**
 * Mirror backend `sanitizeComplaintIdSegment` (sdp-02 / P2-D2) so client-side filters match
 * the folder the uploader writes. Opaque — no existence check against complaints JSONB.
 */
export function sanitizeComplaintIdSegment(complaintId: string): string {
  const base = complaintId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, COMPLAINT_ID_SEGMENT_MAX);
  return base || "unpinned";
}

/**
 * True when an attachment was uploaded as per-complaint subjective media (path carries the
 * `subjective/` segment). Legacy and objective paths return false.
 */
export function isSubjectiveAttachment(
  att: Pick<PrescriptionAttachment, "file_path">,
): boolean {
  return att.file_path.split("/").includes(SUBJECTIVE_ATTACHMENT_CATEGORY);
}

/** Subjective-tagged attachments only (preserves input order). */
export function filterSubjectiveAttachments<T extends Pick<PrescriptionAttachment, "file_path">>(
  attachments: readonly T[],
): T[] {
  return attachments.filter((att) => isSubjectiveAttachment(att));
}

/**
 * Subjective media pinned to one complaint (`subjective/{complaintId}/…`), preserving order.
 * Uses the same opaque sanitized segment the backend writes (P2-D2).
 */
export function filterSubjectiveAttachmentsForComplaint<
  T extends Pick<PrescriptionAttachment, "file_path">,
>(attachments: readonly T[], complaintId: string): T[] {
  const segment = sanitizeComplaintIdSegment(complaintId);
  return attachments.filter((att) => {
    if (!isSubjectiveAttachment(att)) return false;
    const parts = att.file_path.split("/");
    const idx = parts.indexOf(SUBJECTIVE_ATTACHMENT_CATEGORY);
    return idx >= 0 && parts[idx + 1] === segment;
  });
}

/**
 * Extract the opaque complaint folder segment from a subjective attachment path.
 * Returns null when the path is not subjective-tagged or the segment is missing.
 */
export function complaintIdSegmentFromSubjectivePath(
  att: Pick<PrescriptionAttachment, "file_path">,
): string | null {
  if (!isSubjectiveAttachment(att)) return null;
  const parts = att.file_path.split("/");
  const idx = parts.indexOf(SUBJECTIVE_ATTACHMENT_CATEGORY);
  const segment = idx >= 0 ? parts[idx + 1] : undefined;
  return segment ?? null;
}

/** Collect sanitized complaint-id segments from the main + nested associated complaint tree. */
export function collectKnownComplaintIdSegments(
  complaints: readonly { id: string; associatedComplaints?: readonly { id: string }[] }[],
): string[] {
  const segments = new Set<string>();
  const walk = (list: readonly { id: string; associatedComplaints?: readonly { id: string }[] }[]) => {
    for (const complaint of list) {
      segments.add(sanitizeComplaintIdSegment(complaint.id));
      if (complaint.associatedComplaints?.length) {
        walk(complaint.associatedComplaints);
      }
    }
  };
  walk(complaints);
  return Array.from(segments);
}

/**
 * Subjective media whose complaint folder no longer matches a current complaint id (P2-D3).
 * Includes backend `unpinned` uploads and photos left behind when a complaint card is removed.
 * Non-destructive — never auto-deleted by reducers.
 */
export function filterOrphanSubjectiveAttachments<
  T extends Pick<PrescriptionAttachment, "file_path">,
>(attachments: readonly T[], knownComplaintIds: readonly string[]): T[] {
  const known = new Set(knownComplaintIds.map(sanitizeComplaintIdSegment));
  return filterSubjectiveAttachments(attachments).filter((att) => {
    const segment = complaintIdSegmentFromSubjectivePath(att);
    return segment !== null && !known.has(segment);
  });
}
