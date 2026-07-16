/**
 * Plan Advice handouts helpers.
 *
 * Patient-shareable images/PDFs on the Rx, tagged via an `advice/` storage
 * path segment on the SAME `prescription_attachments` bucket (no new column /
 * bucket / RLS — same pattern as objective/subjective media).
 */

import type { PrescriptionAttachment } from "@/types/prescription";

export const ADVICE_ATTACHMENT_CATEGORY = "advice" as const;

export const ADVICE_HANDOUT_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const ADVICE_HANDOUT_MAX_FILES = 8;
export const ADVICE_HANDOUT_MAX_FILE_SIZE_MB = 10;

export function isAdviceAttachment(
  att: Pick<PrescriptionAttachment, "file_path">,
): boolean {
  return att.file_path.split("/").includes(ADVICE_ATTACHMENT_CATEGORY);
}

export function filterAdviceAttachments<
  T extends Pick<PrescriptionAttachment, "file_path">,
>(attachments: readonly T[]): T[] {
  return attachments.filter((att) => isAdviceAttachment(att));
}
