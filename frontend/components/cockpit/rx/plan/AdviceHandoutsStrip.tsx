"use client";

import { useCallback } from "react";
import { PrescriptionMediaStrip } from "@/components/cockpit/rx/media/PrescriptionMediaStrip";
import {
  ADVICE_ATTACHMENT_CATEGORY,
  ADVICE_HANDOUT_ALLOWED_MIME,
  ADVICE_HANDOUT_MAX_FILES,
  ADVICE_HANDOUT_MAX_FILE_SIZE_MB,
  filterAdviceAttachments,
} from "@/lib/cockpit/advice-media";
import type { PrescriptionAttachment } from "@/types/prescription";

export interface AdviceHandoutsStripProps {
  disabled?: boolean;
}

/**
 * Plan Advice handouts — images/PDFs shared with the patient on the Rx.
 * Reuses `prescription_attachments` with an `advice/` path segment.
 */
export function AdviceHandoutsStrip({ disabled = false }: AdviceHandoutsStripProps) {
  const filterAttachments = useCallback(
    (attachments: readonly PrescriptionAttachment[]) =>
      filterAdviceAttachments(attachments),
    [],
  );

  return (
    <PrescriptionMediaStrip
      disabled={disabled}
      category={ADVICE_ATTACHMENT_CATEGORY}
      filterAttachments={filterAttachments}
      allowedMime={ADVICE_HANDOUT_ALLOWED_MIME}
      maxFiles={ADVICE_HANDOUT_MAX_FILES}
      maxFileSizeMb={ADVICE_HANDOUT_MAX_FILE_SIZE_MB}
      variant="full"
      testIdBase="advice-handouts"
      sectionLabel="Handouts"
      addLabel="Add handout"
      addAriaLabel="Add advice handout"
      listAriaLabel="Advice handouts for patient"
      emptyMessage="No handouts yet — add a picture or PDF to share with the patient."
      emptyMessageDisabled="No handouts attached."
      helpText={`Condition diagrams, exercise sheets, etc. JPEG, PNG, WebP, PDF. Max ${ADVICE_HANDOUT_MAX_FILE_SIZE_MB}MB each, up to ${ADVICE_HANDOUT_MAX_FILES} files. Paste video links in Advice text for now.`}
      noShellMessage="Handouts are available in the consultation cockpit."
    />
  );
}
