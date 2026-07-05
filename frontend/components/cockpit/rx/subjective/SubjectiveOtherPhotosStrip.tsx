"use client";

import { useCallback, useMemo } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { PrescriptionMediaStrip } from "@/components/cockpit/rx/media/PrescriptionMediaStrip";
import {
  SUBJECTIVE_MEDIA_ALLOWED_MIME,
  SUBJECTIVE_MEDIA_MAX_FILES,
  SUBJECTIVE_MEDIA_MAX_FILE_SIZE_MB,
  collectKnownComplaintIdSegments,
  filterOrphanSubjectiveAttachments,
} from "@/lib/cockpit/subjective-media";
import type { PrescriptionAttachment } from "@/types/prescription";

export interface SubjectiveOtherPhotosStripProps {
  disabled?: boolean;
}

/**
 * sdp-04 / P2-D3 — non-destructive orphan fallback for subjective symptom photos.
 *
 * When a complaint card is removed (or its id no longer matches the storage folder),
 * pinned photos surface here under "Other photos" for view + explicit remove — never
 * auto-deleted by complaint reducers. PHI-safe labels (no complaint text / filenames).
 */
export function SubjectiveOtherPhotosStrip({ disabled = false }: SubjectiveOtherPhotosStripProps) {
  const { state } = useRxForm();
  const shell = usePrescriptionFormShell();

  const knownComplaintIds = useMemo(
    () => collectKnownComplaintIdSegments(state.fields.complaints),
    [state.fields.complaints],
  );

  const orphans = useMemo(
    () => filterOrphanSubjectiveAttachments(shell?.attachments ?? [], knownComplaintIds),
    [knownComplaintIds, shell?.attachments],
  );

  const filterAttachments = useCallback(
    (attachments: readonly PrescriptionAttachment[]) =>
      filterOrphanSubjectiveAttachments(attachments, knownComplaintIds),
    [knownComplaintIds],
  );

  if (orphans.length === 0) return null;

  return (
    <PrescriptionMediaStrip
      disabled={disabled}
      filterAttachments={filterAttachments}
      allowedMime={SUBJECTIVE_MEDIA_ALLOWED_MIME}
      maxFiles={SUBJECTIVE_MEDIA_MAX_FILES}
      maxFileSizeMb={SUBJECTIVE_MEDIA_MAX_FILE_SIZE_MB}
      variant="compact"
      allowAdd={false}
      testIdBase="subjective-other-photos"
      sectionLabel="Other photos"
      addLabel="Add photo"
      addAriaLabel="Add photo"
      listAriaLabel="Other symptom photos"
      emptyMessage=""
      emptyMessageDisabled="No other photos."
    />
  );
}
