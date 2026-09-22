"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import {
  LabExtractVerifyDialog,
  type LabExtractConfirmRow,
  type LabExtractVerifyGroup,
} from "@/components/cockpit/rx/objective/LabExtractVerifyDialog";
import { todayIsoDate } from "@/components/cockpit/rx/objective/TestResultsList";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import {
  createPrescription,
  getAppointmentVisitDocuments,
  getPrescriptionDownloadUrl,
  getVisitDocumentPageDownloadUrl,
  promoteVisitDocumentPageToPrescription,
} from "@/lib/api";
import { extractLabPdfFromAttachment } from "@/lib/api/lab-extract";
import {
  buildExtractedLabApply,
  matchExtractedLabRows,
} from "@/lib/cockpit/lab-extract-match";
import {
  attachmentFilename,
  isImageAttachment,
} from "@/lib/cockpit/objective-media";
import {
  visitExtractedPanelToForm,
  visitExtractedPanelsToHydrate,
  visitPageExtracted,
} from "@/lib/cockpit/visit-extracted-labs";
import { POLL_INTERVAL } from "@/lib/query/polling";
import { queryKeys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/stale";
import type { PrescriptionAttachment } from "@/types/prescription";
import {
  VISIT_DOCUMENT_TYPE_LABEL,
  isExtractableVisitPage,
  type VisitDocument,
  type VisitDocumentPage,
} from "@/types/visit-documents";

function documentHeading(doc: VisitDocument): string {
  const type = VISIT_DOCUMENT_TYPE_LABEL[doc.document_type];
  const date = doc.report_date ?? "no date";
  const ordered = doc.ordered_by === "us" ? "Us" : "Outside";
  return `${type} · ${date} · ${ordered}`;
}

function isExtractablePage(
  page: Pick<VisitDocumentPage, "file_type">
): boolean {
  return isExtractableVisitPage(page);
}

type ExtractOutcome =
  | { ok: true; group: LabExtractVerifyGroup }
  | { ok: false; message: string | null };

export interface DeskVisitDocumentsStripProps {
  disabled?: boolean;
}

export function DeskVisitDocumentsStrip({
  disabled = false,
}: DeskVisitDocumentsStripProps) {
  const rxForm = useOptionalRxForm();
  const token = rxForm?.token ?? "";
  const appointmentId = rxForm?.appointmentId ?? "";
  const patientId = rxForm?.patientId ?? null;
  const dispatch = rxForm?.dispatch;
  const seedFields = rxForm?.seedFields;
  const shell = usePrescriptionFormShell();

  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractingPageId, setExtractingPageId] = useState<string | null>(null);
  const [extractingDocId, setExtractingDocId] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [reportDate, setReportDate] = useState(todayIsoDate);
  const [groups, setGroups] = useState<LabExtractVerifyGroup[]>([]);
  const [promotedByPageId, setPromotedByPageId] = useState<
    Record<string, string>
  >({});

  const query = useQuery({
    queryKey: queryKeys.consult(appointmentId).deskDocuments(),
    queryFn: async () => {
      const res = await getAppointmentVisitDocuments(token, appointmentId);
      return res.data.documents;
    },
    enabled: Boolean(token && appointmentId),
    staleTime: STALE.LIVE,
    refetchOnWindowFocus: true,
    refetchInterval: POLL_INTERVAL.DESK_VITALS,
    refetchIntervalInBackground: false,
  });

  const documents = useMemo(() => query.data ?? [], [query.data]);
  const hydratedPageIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!seedFields || !rxForm) return;
    const labReports = rxForm.state.fields.labReports;
    const testResultsStructured = rxForm.state.fields.testResultsStructured;
    const panels = visitExtractedPanelsToHydrate(documents, labReports).filter(
      (panel) => !hydratedPageIdsRef.current.has(panel.pageId)
    );
    if (panels.length === 0) return;
    for (const panel of panels) hydratedPageIdsRef.current.add(panel.pageId);
    const applied = panels.map(visitExtractedPanelToForm);
    seedFields({
      labReports: [...applied.map((panel) => panel.report), ...labReports],
      testResultsStructured: [
        ...applied.flatMap((panel) => panel.rows),
        ...testResultsStructured,
      ],
    });
  }, [documents, rxForm, seedFields]);

  const extractedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const report of rxForm?.state.fields.labReports ?? []) {
      for (const id of report.attachmentIds) ids.add(id);
    }
    return ids;
  }, [rxForm?.state.fields.labReports]);

  const busy = extractingPageId !== null || extractingDocId !== null;

  async function openPage(documentId: string, pageId: string) {
    if (!token || !appointmentId) return;
    const res = await getVisitDocumentPageDownloadUrl(
      token,
      appointmentId,
      documentId,
      pageId
    );
    if (res.data.downloadUrl) {
      window.open(res.data.downloadUrl, "_blank", "noopener,noreferrer");
    }
  }

  const ensurePrescription = useCallback(async (): Promise<string> => {
    if (!rxForm || !shell) throw new Error("RxForm unavailable");
    const existingId = shell.prescriptionIdRef.current;
    if (existingId) return existingId;
    const res = await createPrescription(token, {
      appointmentId,
      patientId: patientId ?? undefined,
      type: shell.entryMode ?? "structured",
    });
    const id = res.data.prescription.id;
    shell.prescriptionIdRef.current = id;
    shell.setPrescription(res.data.prescription);
    return id;
  }, [appointmentId, patientId, rxForm, shell, token]);

  const promotePage = useCallback(
    async (
      doc: VisitDocument,
      page: VisitDocumentPage
    ): Promise<PrescriptionAttachment> => {
      const prescriptionId = await ensurePrescription();
      const alreadyId = promotedByPageId[page.id];
      const existing = shell?.attachments.find((att) => att.id === alreadyId);
      if (existing) return existing;

      const res = await promoteVisitDocumentPageToPrescription(
        token,
        prescriptionId,
        {
          appointmentId,
          documentId: doc.id,
          pageId: page.id,
        }
      );
      const attachment = res.data.attachment;
      shell?.setAttachments((prev) =>
        prev.some((att) => att.id === attachment.id)
          ? prev
          : [...prev, attachment]
      );
      setPromotedByPageId((prev) => ({ ...prev, [page.id]: attachment.id }));
      return attachment;
    },
    [appointmentId, ensurePrescription, promotedByPageId, shell, token]
  );

  const extractGroup = useCallback(
    async (att: PrescriptionAttachment): Promise<ExtractOutcome> => {
      const prescriptionId = shell?.prescriptionIdRef.current;
      if (!prescriptionId || !token) return { ok: false, message: null };
      try {
        const res = await extractLabPdfFromAttachment(
          token,
          prescriptionId,
          att.id
        );
        let fileUrl: string | null = null;
        try {
          const url = await getPrescriptionDownloadUrl(
            token,
            prescriptionId,
            att.id
          );
          fileUrl = url.data.downloadUrl;
        } catch {
          fileUrl = null;
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
            previewUrl: isImageAttachment(att) ? fileUrl : null,
            fileUrl,
            fileType: att.file_type,
          },
        };
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : null;
        return { ok: false, message };
      }
    },
    [shell?.prescriptionIdRef, token]
  );

  const openGroups = useCallback(
    (next: LabExtractVerifyGroup[], date: string) => {
      setGroups(next);
      setReportDate(date);
      setVerifyOpen(true);
    },
    []
  );

  const startExtractPages = useCallback(
    async (doc: VisitDocument, pages: VisitDocumentPage[]) => {
      if (disabled || busy || verifyOpen || !shell || pages.length === 0)
        return;
      setExtractError(null);
      if (pages.length === 1) {
        setExtractingPageId(pages[0]!.id);
      } else {
        setExtractingDocId(doc.id);
      }
      const next: LabExtractVerifyGroup[] = [];
      let firstFailure: string | null = null;
      let failed = 0;
      for (const page of pages) {
        setExtractingPageId(page.id);
        try {
          const attachment = await promotePage(doc, page);
          const outcome = await extractGroup(attachment);
          if (outcome.ok) {
            next.push(outcome.group);
          } else {
            failed += 1;
            firstFailure = firstFailure ?? outcome.message;
          }
        } catch (err) {
          failed += 1;
          firstFailure =
            firstFailure ??
            (err instanceof Error && err.message ? err.message : null);
        }
      }
      setExtractingPageId(null);
      setExtractingDocId(null);
      if (next.length === 0) {
        setExtractError(
          firstFailure ??
            "Could not extract this report. Enter the results manually."
        );
        return;
      }
      if (failed > 0) {
        setExtractError(
          "Could not extract every page. Review the ones that succeeded."
        );
      }
      openGroups(next, doc.report_date ?? todayIsoDate());
    },
    [busy, disabled, extractGroup, openGroups, promotePage, shell, verifyOpen]
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
    [dispatch, reportDate]
  );

  if (documents.length === 0) return null;

  const canExtract = Boolean(!disabled && shell && rxForm);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        From staff
      </p>
      <ul className="space-y-2">
        {documents.map((doc) => {
          const extractable = doc.pages.filter(isExtractablePage);
          const extractingThisDoc = extractingDocId === doc.id;
          return (
            <li
              key={doc.id}
              className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {documentHeading(doc)}
                </p>
                {canExtract && extractable.length > 1 ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:border-primary/60 hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => void startExtractPages(doc, extractable)}
                    disabled={busy || verifyOpen}
                    data-testid="desk-lab-extract-all"
                  >
                    {extractingThisDoc ? "Extracting…" : "Extract all"}
                  </button>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {doc.pages.map((page) => {
                  const isImage = page.file_type.startsWith("image/");
                  const attachmentId = promotedByPageId[page.id];
                  const extracted =
                    visitPageExtracted(doc, page.id) ||
                    Boolean(attachmentId && extractedIds.has(attachmentId));
                  const active = extractingPageId === page.id;
                  return (
                    <div key={page.id} className="flex flex-col items-stretch">
                      <button
                        type="button"
                        className="flex h-12 w-12 items-center justify-center rounded-md border bg-background text-xs text-muted-foreground"
                        onClick={() => void openPage(doc.id, page.id)}
                      >
                        {isImage ? (
                          `p${page.page_index + 1}`
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </button>
                      {canExtract && isExtractablePage(page) ? (
                        <button
                          type="button"
                          className="mt-0.5 w-12 border-t border-border px-0 py-0.5 text-[10px] font-medium hover:bg-muted/60 disabled:opacity-50"
                          onClick={() => void startExtractPages(doc, [page])}
                          disabled={busy || extracted || verifyOpen}
                          data-testid={
                            extracted
                              ? "desk-lab-extract-done"
                              : "desk-lab-extract"
                          }
                        >
                          {active ? "…" : extracted ? "Done" : "Extract"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

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
