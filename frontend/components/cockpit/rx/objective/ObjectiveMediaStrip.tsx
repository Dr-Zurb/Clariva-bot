"use client";

import { useCallback } from "react";
import { PrescriptionMediaStrip } from "@/components/cockpit/rx/media/PrescriptionMediaStrip";
import {
  OBJECTIVE_ATTACHMENT_CATEGORY,
  OBJECTIVE_MEDIA_ALLOWED_MIME,
  OBJECTIVE_MEDIA_MAX_FILES,
  OBJECTIVE_MEDIA_MAX_FILE_SIZE_MB,
  filterObjectiveAttachments,
} from "@/lib/cockpit/objective-media";
import type { PrescriptionAttachment } from "@/types/prescription";

export interface ObjectiveMediaStripProps {
  disabled?: boolean;
}

/**
 * Objective-tab media strip (obj-22 / P5-D4).
 *
 * Wound/rash photos, ECG images, and report scans uploaded through the SHIPPED
 * `prescription_attachments` storage, tagged with the `objective` category (a storage path
 * segment — no new bucket/column/RLS). Telemed (patient-captured) media flows through the
 * same path + tag, so there is no separate flow. Read-only (`disabled`) shows thumbnails with
 * no add/remove. PHI-safe: never logs file paths / signed URLs / patient context.
 */
export function ObjectiveMediaStrip({ disabled = false }: ObjectiveMediaStripProps) {
  const filterAttachments = useCallback(
    (attachments: readonly PrescriptionAttachment[]) => filterObjectiveAttachments(attachments),
    [],
  );

  return (
    <PrescriptionMediaStrip
      disabled={disabled}
      category={OBJECTIVE_ATTACHMENT_CATEGORY}
      filterAttachments={filterAttachments}
      allowedMime={OBJECTIVE_MEDIA_ALLOWED_MIME}
      maxFiles={OBJECTIVE_MEDIA_MAX_FILES}
      maxFileSizeMb={OBJECTIVE_MEDIA_MAX_FILE_SIZE_MB}
      variant="full"
      testIdBase="objective-media"
      sectionLabel="Media & scans"
      addLabel="Add media"
      addAriaLabel="Add objective media"
      listAriaLabel="Objective media attachments"
      emptyMessage="No media yet — add a photo or scan."
      emptyMessageDisabled="No media attached."
      helpText={`Wound/rash photos, ECG, report scans. JPEG, PNG, WebP, PDF. Max ${OBJECTIVE_MEDIA_MAX_FILE_SIZE_MB}MB each, up to ${OBJECTIVE_MEDIA_MAX_FILES} files.`}
      noShellMessage="Media attachments are available in the consultation cockpit."
    />
  );
}
