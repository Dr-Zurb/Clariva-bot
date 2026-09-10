"use client";

import { useCallback, useMemo, useState } from "react";
import {
  LabExtractVerifyDialog,
  type LabExtractConfirmRow,
  type LabExtractVerifyGroup,
} from "@/components/cockpit/rx/objective/LabExtractVerifyDialog";
import { todayIsoDate } from "@/components/cockpit/rx/objective/TestResultsList";
import { PrescriptionMediaStrip } from "@/components/cockpit/rx/media/PrescriptionMediaStrip";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { getPrescriptionDownloadUrl } from "@/lib/api";
import { extractLabPdfFromAttachment } from "@/lib/api/lab-extract";
import { buildExtractedLabApply, matchExtractedLabRows } from "@/lib/cockpit/lab-extract-match";
import {
  OBJECTIVE_ATTACHMENT_CATEGORY,
  OBJECTIVE_MEDIA_ALLOWED_MIME,
  OBJECTIVE_MEDIA_MAX_FILE_SIZE_MB,
  REPORT_SCAN_MAX_FILES,
  attachmentFilename,
  filterObjectiveAttachments,
  isImageAttachment,
} from "@/lib/cockpit/objective-media";
import type { PrescriptionAttachment } from "@/types/prescription";

export interface ObjectiveMediaStripProps {
  disabled?: boolean;
}

function isPdfAttachment(att: Pick<PrescriptionAttachment, "file_type">): boolean {
  const mime = (att.file_type ?? "").toLowerCase();
  return mime === "application/pdf" || mime === "application/x-pdf";
}

/** Both readers are behind one endpoint, so PDFs and photos are both offerable. */
function isExtractableAttachment(att: Pick<PrescriptionAttachment, "file_type">): boolean {
  return isPdfAttachment(att) || isImageAttachment(att);
}

type ExtractOutcome =
  | { ok: true; group: LabExtractVerifyGroup }
  | { ok: false; message: string | null };

/**
 * Reports scan strip (obj-22 / P5-D4) plus report extract (rpt-05.4 / rpt-05.6).
 *
 * Patient-brought report photos and PDFs in shipped `prescription_attachments`,
 * tagged with the `objective` category (storage path segment — no new
 * bucket/column/RLS). Read-only (`disabled`) shows thumbnails with no add/remove.
 * PHI-safe: never logs file paths / signed URLs / patient context.
 */
export function ObjectiveMediaStrip({ disabled = false }: ObjectiveMediaStripProps) {
  const rxForm = useOptionalRxForm();
  const token = rxForm?.token ?? "";
  const dispatch = rxForm?.dispatch;
  const shell = usePrescriptionFormShell();
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractingAll, setExtractingAll] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [reportDate, setReportDate] = useState(todayIsoDate);
  const [groups, setGroups] = useState<LabExtractVerifyGroup[]>([]);

  const filterAttachments = useCallback(
    (attachments: readonly PrescriptionAttachment[]) => filterObjectiveAttachments(attachments),
    [],
  );

  const extractables = useMemo(
    () => filterObjectiveAttachments(shell?.attachments ?? []).filter(isExtractableAttachment),
    [shell?.attachments],
  );

  const extractedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const report of rxForm?.state.fields.labReports ?? []) {
      for (const id of report.attachmentIds) ids.add(id);
    }
    return ids;
  }, [rxForm?.state.fields.labReports]);

  const pending = useMemo(
    () => extractables.filter((att) => !extractedIds.has(att.id)),
    [extractedIds, extractables],
  );

  const busy = extractingId !== null || extractingAll;

  const extractGroup = useCallback(
    async (att: PrescriptionAttachment): Promise<ExtractOutcome> => {
      const prescriptionId = shell?.prescriptionIdRef.current;
      if (!prescriptionId || !token) return { ok: false, message: null };
      try {
        const res = await extractLabPdfFromAttachment(token, prescriptionId, att.id);
        // Model-read rows have no verbatim line to check against, so the doctor
        // needs the photo itself in the dialog. Best-effort: a missing preview
        // must not block verification.
        let previewUrl: string | null = null;
        if (res.data.source === "vision" && isImageAttachment(att)) {
          try {
            const url = await getPrescriptionDownloadUrl(token, prescriptionId, att.id);
            previewUrl = url.data.downloadUrl;
          } catch {
            previewUrl = null;
          }
        }
        return {
          ok: true,
          group: {
            attachmentId: att.id,
            sourceLabel: attachmentFilename(att),
            pageCount: res.data.pageCount,
            skippedPageCount: res.data.skippedPageIndexes.length,
            candidates: matchExtractedLabRows(res.data.rows),
            source: res.data.source,
            previewUrl,
          },
        };
      } catch (err) {
        // Surface the server's reason when there is one — "photo extraction is
        // not enabled" is otherwise indistinguishable from an unreadable file.
        const message = err instanceof Error && err.message ? err.message : null;
        return { ok: false, message };
      }
    },
    [shell?.prescriptionIdRef, token],
  );

  const openGroups = useCallback((next: LabExtractVerifyGroup[]) => {
    setGroups(next);
    setReportDate(todayIsoDate());
    setVerifyOpen(true);
  }, []);

  const startExtractOne = useCallback(
    async (att: PrescriptionAttachment) => {
      if (disabled || busy || verifyOpen) return;
      setExtractError(null);
      setExtractingId(att.id);
      const outcome = await extractGroup(att);
      setExtractingId(null);
      if (!outcome.ok) {
        setExtractError(
          outcome.message ?? "Could not extract this report. Enter the results manually.",
        );
        return;
      }
      openGroups([outcome.group]);
    },
    [busy, disabled, extractGroup, openGroups, verifyOpen],
  );

  const startExtractAll = useCallback(
    async (atts: PrescriptionAttachment[]) => {
      if (disabled || busy || verifyOpen || atts.length === 0) return;
      setExtractError(null);
      setExtractingAll(true);
      const next: LabExtractVerifyGroup[] = [];
      let firstFailure: string | null = null;
      let failed = 0;
      for (const att of atts) {
        setExtractingId(att.id);
        const outcome = await extractGroup(att);
        if (outcome.ok) {
          next.push(outcome.group);
        } else {
          failed += 1;
          firstFailure = firstFailure ?? outcome.message;
        }
      }
      setExtractingId(null);
      setExtractingAll(false);
      if (next.length === 0) {
        setExtractError(
          firstFailure ?? "Could not extract these reports. Enter the results manually.",
        );
        return;
      }
      if (failed > 0) {
        setExtractError("Could not extract every report. Review the ones that succeeded.");
      }
      openGroups(next);
    },
    [busy, disabled, extractGroup, openGroups, verifyOpen],
  );

  const handleConfirm = useCallback(
    (selected: LabExtractConfirmRow[]) => {
      if (dispatch) {
        const byAttachment = new Map<string, LabExtractConfirmRow[]>();
        for (const row of selected) {
          const list = byAttachment.get(row.attachmentId) ?? [];
          list.push(row);
          byAttachment.set(row.attachmentId, list);
        }
        for (const [attachmentId, rows] of Array.from(byAttachment.entries())) {
          if (rows.length === 0) continue;
          const { report, rows: applyRows } = buildExtractedLabApply(rows, {
            attachmentId,
            reportDate: rows[0]?.reportDate ?? reportDate,
            title: rows[0]?.sourceLabel,
          });
          dispatch({ type: "ADD_LAB_PANEL", report, rows: applyRows });
        }
      }
      setVerifyOpen(false);
      setGroups([]);
    },
    [dispatch, reportDate],
  );

  const renderItemFooter = useCallback(
    (att: PrescriptionAttachment) => {
      if (disabled || !isExtractableAttachment(att)) return null;
      const extracted = extractedIds.has(att.id);
      const active = extractingId === att.id && !extractingAll;
      return (
        <button
          type="button"
          className="w-full border-t border-border px-1 py-0.5 text-[10px] font-medium hover:bg-muted/60 disabled:opacity-50"
          onClick={() => void startExtractOne(att)}
          disabled={busy || extracted}
          data-testid={extracted ? "lab-extract-done" : "lab-extract-from-pdf"}
        >
          {active ? "Extracting…" : extracted ? "Extracted" : "Extract"}
        </button>
      );
    },
    [busy, disabled, extractedIds, extractingAll, extractingId, startExtractOne],
  );

  return (
    <div className="space-y-2">
      <PrescriptionMediaStrip
        disabled={disabled}
        category={OBJECTIVE_ATTACHMENT_CATEGORY}
        filterAttachments={filterAttachments}
        allowedMime={OBJECTIVE_MEDIA_ALLOWED_MIME}
        maxFiles={REPORT_SCAN_MAX_FILES}
        maxFileSizeMb={OBJECTIVE_MEDIA_MAX_FILE_SIZE_MB}
        variant="full"
        testIdBase="objective-media"
        sectionLabel="Report scans"
        addLabel="Upload pages"
        addAriaLabel="Upload report pages"
        listAriaLabel="Report scan attachments"
        emptyMessage="Add photos or a PDF of the report."
        emptyMessageDisabled="No report scans attached."
        noShellMessage="Report scans are available in the consultation cockpit."
        headerActions={
          !disabled && pending.length > 1 ? (
            <button
              type="button"
              className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:border-primary/60 hover:bg-muted/40 disabled:opacity-50"
              onClick={() => void startExtractAll(pending)}
              disabled={busy || verifyOpen}
              data-testid="lab-extract-all"
            >
              {extractingAll ? "Extracting all…" : "Extract all"}
            </button>
          ) : null
        }
        renderItemFooter={renderItemFooter}
      />

      {extractError ? (
        <p role="alert" aria-live="polite" className="text-xs text-destructive">
          {extractError}
        </p>
      ) : null}

      <LabExtractVerifyDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        groups={groups}
        reportDate={reportDate}
        busy={busy}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
