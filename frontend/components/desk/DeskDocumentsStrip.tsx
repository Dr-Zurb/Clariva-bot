"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, FileText, MoreHorizontal, Paperclip, X } from "lucide-react";
import {
  LabExtractVerifyDialog,
  type LabExtractConfirmRow,
  type LabExtractVerifyGroup,
} from "@/components/cockpit/rx/objective/LabExtractVerifyDialog";
import { DeskExtractedResultsTable } from "@/components/desk/DeskExtractedResultsTable";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  addDeskVisitDocumentPage,
  confirmDeskVisitDocumentExtractedResults,
  createDeskVisitDocument,
  deleteDeskVisitDocument,
  deskErrorMessage,
  extractDeskVisitDocumentPageLab,
  getDeskVisitDocumentDownloadUrl,
  getDeskVisitDocumentUploadUrl,
  listDeskLabOrders,
  listDeskVisitDocuments,
  updateDeskVisitDocument,
  upsertDeskLabOrders,
  type DeskLabOrder,
} from "@/lib/desk/api";
import {
  LAB_NOT_DONE_REASONS,
  deskLabLoopProgress,
  labNotDoneReasonLabel,
} from "@/lib/desk/lab-fulfillment";
import { isInternalLabDocument } from "@/lib/desk/capabilities";
import { queryKeys } from "@/lib/query/keys";
import {
  downscaleVisitDocumentFile,
  isAllowedVisitDocumentFile,
  visitDocumentFileTooLarge,
} from "@/lib/desk/documents";
import {
  buildExtractedLabApply,
  matchExtractedLabRows,
} from "@/lib/cockpit/lab-extract-match";
import { visitPageExtracted } from "@/lib/cockpit/visit-extracted-labs";
import { useDeskSectionOpen } from "@/lib/desk/use-section-open";
import {
  VISIT_DOCUMENT_MAX_PAGES,
  VISIT_DOCUMENT_TYPE_LABEL,
  VISIT_DOCUMENT_TYPES,
  isExtractableVisitPage,
  type VisitDocument,
  type VisitDocumentOrderedBy,
  type VisitDocumentPage,
  type VisitDocumentType,
} from "@/types/visit-documents";

const BUCKET = "prescription-attachments";

type LabCommitAction = "extract" | "upload";

type PendingPage = {
  id: string;
  file: File;
  name: string;
  previewUrl: string | null;
  progress: number;
  status: "queued" | "uploading" | "failed";
};

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

function PendingPageTile({
  item,
  onDismiss,
}: {
  item: PendingPage;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border bg-muted/40"
      data-testid="desk-lab-pending"
      data-status={item.status}
    >
      {item.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL for in-flight upload
        <img
          src={item.previewUrl}
          alt=""
          className="h-full w-full object-cover opacity-50"
        />
      ) : (
        <FileText
          className="h-5 w-5 text-muted-foreground opacity-50"
          aria-hidden
        />
      )}
      {item.status !== "failed" ? (
        <UploadProgressRing value={item.progress} />
      ) : null}
      <span className="sr-only">
        {item.status === "failed"
          ? "Upload failed"
          : `Uploading ${Math.round(item.progress)} percent`}
      </span>
      {item.status === "failed" ? (
        <button
          type="button"
          className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-destructive"
          aria-label="Dismiss failed upload"
          onClick={() => onDismiss(item.id)}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function newestPage(document: VisitDocument): VisitDocumentPage | null {
  return document.pages[document.pages.length - 1] ?? null;
}

function pageCount(documents: VisitDocument[]): number {
  return documents.reduce((n, doc) => n + doc.pages.length, 0);
}

function invalidateDeskLabResultLoop(
  queryClient: ReturnType<typeof useQueryClient>,
  appointmentId: string
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.consult(appointmentId).deskDocuments(),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.consult(appointmentId).labOrders(),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.desk.labPending(),
  });
}

export function DeskLabOrdersList({
  orders,
  loading = false,
  error = null,
  coverDocumentId = null,
  busy = false,
  onCover,
  onNotDone,
  onClear,
}: {
  orders: DeskLabOrder[];
  loading?: boolean;
  error?: string | null;
  coverDocumentId?: string | null;
  busy?: boolean;
  onCover?: (orderId: string) => void;
  onNotDone?: (
    orderId: string,
    reasonCode: string,
    reasonNote?: string
  ) => void;
  onClear?: (orderId: string) => void;
}) {
  const [reasonOrderId, setReasonOrderId] = useState<string | null>(null);
  const [otherNote, setOtherNote] = useState("");
  const interactive = Boolean(onCover && onNotDone && onClear);

  if (loading) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="desk-lab-orders-loading"
      >
        Loading tests…
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (orders.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="desk-lab-orders-empty"
      >
        No tests on this visit yet.
      </p>
    );
  }
  return (
    <ul className="space-y-2" data-testid="desk-lab-orders">
      {orders.map((order) => {
        const picking = reasonOrderId === order.orderId;
        return (
          <li
            key={order.orderId}
            className="rounded-md border border-border/70 px-3 py-2"
            data-testid={`desk-lab-order-${order.status}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  <span>{order.label}</span>
                  {order.kind ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {order.kind}
                    </span>
                  ) : null}
                </p>
                {order.status === "uploaded" ? (
                  <p className="text-xs text-muted-foreground">
                    On this report
                  </p>
                ) : null}
                {order.status === "not_done" ? (
                  <p className="text-xs text-muted-foreground">
                    {labNotDoneReasonLabel(order.reasonCode)}
                    {order.reasonNote ? ` · ${order.reasonNote}` : ""}
                  </p>
                ) : null}
              </div>
              {interactive ? (
                <div className="flex flex-wrap gap-1.5">
                  {order.status === "pending" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={busy || !coverDocumentId}
                        onClick={() => onCover?.(order.orderId)}
                      >
                        On this report
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        disabled={busy}
                        onClick={() => {
                          setReasonOrderId(order.orderId);
                          setOtherNote("");
                        }}
                      >
                        Not done
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={busy}
                      onClick={() => onClear?.(order.orderId)}
                    >
                      Undo
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
            {interactive && picking && order.status === "pending" ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {LAB_NOT_DONE_REASONS.map((reason) => (
                    <Button
                      key={reason.code}
                      type="button"
                      variant={
                        reason.code === "other" ? "outline" : "secondary"
                      }
                      size="sm"
                      className="h-7"
                      disabled={busy}
                      onClick={() => {
                        if (reason.code === "other") return;
                        onNotDone?.(order.orderId, reason.code);
                        setReasonOrderId(null);
                      }}
                    >
                      {reason.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={otherNote}
                    onChange={(event) => setOtherNote(event.target.value)}
                    placeholder="Other reason"
                    maxLength={200}
                    className="h-8 max-w-xs"
                    aria-label="Other reason"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    disabled={busy || otherNote.trim().length === 0}
                    onClick={() => {
                      onNotDone?.(order.orderId, "other", otherNote.trim());
                      setReasonOrderId(null);
                      setOtherNote("");
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    disabled={busy}
                    onClick={() => setReasonOrderId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function summaryLine(documents: VisitDocument[]): string {
  const pages = pageCount(documents);
  if (documents.length === 0) return "None uploaded";
  const types = documents
    .map((doc) => VISIT_DOCUMENT_TYPE_LABEL[doc.document_type])
    .join(" · ");
  return `${documents.length} document${documents.length === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"} · ${types}`;
}

export function DeskDocumentsStrip({
  token,
  appointmentId,
  mode,
  onFinished,
  finishLabel,
  open: openProp,
  onOpenChange,
}: {
  token: string;
  appointmentId: string;
  mode: "internal_labs" | "papers";
  /** After a fresh check-in: Done or Skip continues the intake sequence. */
  onFinished?: () => void;
  /** Sequence chrome: last/only slot is Done; earlier slots are Save and next. */
  finishLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeDocumentIdRef = useRef<string | null>(null);
  const { open, setOpen, controlled } = useDeskSectionOpen(
    openProp,
    onOpenChange,
    true
  );
  const controlledRef = useRef(controlled);
  const setOpenRef = useRef(setOpen);
  controlledRef.current = controlled;
  setOpenRef.current = setOpen;
  const [documents, setDocuments] = useState<VisitDocument[]>([]);
  const [pendings, setPendings] = useState<PendingPage[]>([]);
  const [pendingTargetDocId, setPendingTargetDocId] = useState<string | null>(
    null
  );
  const [commitAction, setCommitAction] = useState<LabCommitAction | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractingPageId, setExtractingPageId] = useState<string | null>(null);
  const [extractingDocId, setExtractingDocId] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyDocId, setVerifyDocId] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState("");
  const [groups, setGroups] = useState<LabExtractVerifyGroup[]>([]);
  const visible = documents.filter((doc) =>
    mode === "internal_labs"
      ? isInternalLabDocument(doc.document_type, doc.ordered_by)
      : !isInternalLabDocument(doc.document_type, doc.ordered_by)
  );
  const ordersQuery = useQuery({
    queryKey: queryKeys.consult(appointmentId).labOrders(),
    queryFn: async () => {
      const res = await listDeskLabOrders(token, appointmentId);
      return res.data.orders;
    },
    enabled:
      mode === "internal_labs" && Boolean(token) && Boolean(appointmentId),
  });
  const title = mode === "internal_labs" ? "Upload reports" : "Patient files";
  const hint =
    mode === "internal_labs"
      ? "Upload and extract the report, then mark each test this file covers. If a test was not run, say why."
      : "Photograph what the patient brought. Extract outside lab values so the doctor does not retype them.";
  const chooseSourceThenCommit = mode === "internal_labs";
  const coverDocumentId = visible[visible.length - 1]?.id ?? null;
  const loop = deskLabLoopProgress(ordersQuery.data ?? []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listDeskVisitDocuments(token, appointmentId)
      .then((res) => {
        if (cancelled) return;
        setDocuments(res.data.documents);
        const shown = res.data.documents.filter((doc) =>
          mode === "internal_labs"
            ? isInternalLabDocument(doc.document_type, doc.ordered_by)
            : !isInternalLabDocument(doc.document_type, doc.ordered_by)
        );
        if (!controlledRef.current) setOpenRef.current(shown.length === 0);
        if (shown.length > 0) {
          activeDocumentIdRef.current = shown[shown.length - 1]?.id ?? null;
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(deskErrorMessage(err, "Could not load reports"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpen via ref
  }, [token, appointmentId, mode]);

  const pendingsRef = useRef<PendingPage[]>([]);
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

  function resetPickers() {
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
  }

  function patchPending(id: string, patch: Partial<PendingPage>) {
    setPendings((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function dropPending(id: string) {
    setPendings((prev) => {
      const item = prev.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      const next = prev.filter((entry) => entry.id !== id);
      if (next.length === 0) setPendingTargetDocId(null);
      return next;
    });
  }

  function collectAccepted(fileList: FileList | null): File[] {
    if (!fileList?.length) return [];
    const remaining =
      VISIT_DOCUMENT_MAX_PAGES - pageCount(documents) - pendings.length;
    if (remaining <= 0) {
      setError(`At most ${VISIT_DOCUMENT_MAX_PAGES} pages per visit`);
      return [];
    }
    const accepted: File[] = [];
    for (let i = 0; i < fileList.length && accepted.length < remaining; i++) {
      const raw = fileList[i];
      if (!raw) continue;
      if (!isAllowedVisitDocumentFile(raw)) {
        setError("Use a JPEG, PNG, WebP, or PDF.");
        continue;
      }
      if (visitDocumentFileTooLarge(raw)) {
        setError("File is too large. Max 10 MB each.");
        continue;
      }
      accepted.push(raw);
    }
    return accepted;
  }

  async function persistPages(
    items: PendingPage[],
    targetDocumentId: string | null
  ): Promise<{
    workingDocs: VisitDocument[];
    addedPages: VisitDocumentPage[];
    documentId: string | null;
  }> {
    const supabase = createClient();
    let workingDocs = documents;
    let activeId = targetDocumentId;
    const addedPages: VisitDocumentPage[] = [];
    for (const item of items) {
      patchPending(item.id, { status: "uploading", progress: 12 });
      const tick = window.setInterval(() => {
        setPendings((prev) =>
          prev.map((entry) =>
            entry.id === item.id && entry.progress < 85
              ? { ...entry, progress: entry.progress + 6 }
              : entry
          )
        );
      }, 180);
      try {
        const raw = item.file;
        const filename =
          raw.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "file";
        const urlReq = getDeskVisitDocumentUploadUrl(token, appointmentId, {
          filename,
          contentType: raw.type,
        });
        const file = await downscaleVisitDocumentFile(raw);
        const uploadRes =
          file.type === raw.type
            ? await urlReq
            : await getDeskVisitDocumentUploadUrl(token, appointmentId, {
                filename: file.name,
                contentType: file.type,
              });
        patchPending(item.id, { progress: 55 });
        const { path, token: uploadToken } = uploadRes.data;
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(path, uploadToken, file);
        if (uploadErr) throw new Error("upload");
        patchPending(item.id, { progress: 92 });
        if (!activeId) {
          const created = await createDeskVisitDocument(token, appointmentId, {
            documentType: mode === "internal_labs" ? "lab_report" : "other",
            orderedBy: mode === "internal_labs" ? "us" : "outside",
            filePath: path,
            fileType: file.type,
          });
          workingDocs = [...workingDocs, created.data.document];
          activeId = created.data.document.id;
          activeDocumentIdRef.current = activeId;
          setPendingTargetDocId(activeId);
          const page = newestPage(created.data.document);
          if (page) addedPages.push(page);
        } else {
          const added = await addDeskVisitDocumentPage(
            token,
            appointmentId,
            activeId,
            { filePath: path, fileType: file.type }
          );
          workingDocs = workingDocs.map((doc) =>
            doc.id === activeId ? added.data.document : doc
          );
          const page = newestPage(added.data.document);
          if (page) addedPages.push(page);
        }
        setDocuments(workingDocs);
        dropPending(item.id);
      } catch {
        window.clearInterval(tick);
        patchPending(item.id, { status: "failed", progress: 0 });
        throw new Error("upload");
      } finally {
        window.clearInterval(tick);
      }
    }
    return { workingDocs, addedPages, documentId: activeId };
  }

  async function commitFiles(
    fileList: FileList | null,
    action: LabCommitAction
  ) {
    const accepted = collectAccepted(fileList);
    resetPickers();
    if (accepted.length === 0) return;
    const staged: PendingPage[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
      progress: 8,
      status: "queued",
    }));
    setError(null);
    setBusy(true);
    setPendingTargetDocId(activeDocumentIdRef.current);
    setPendings((prev) => [...prev, ...staged]);
    try {
      const result = await persistPages(staged, activeDocumentIdRef.current);
      if (mode === "internal_labs" && result.addedPages.length > 0) {
        invalidateDeskLabResultLoop(queryClient, appointmentId);
      }
      setCommitAction(null);
      if (action === "extract" && result.documentId) {
        const doc = result.workingDocs.find(
          (item) => item.id === result.documentId
        );
        const extractable = result.addedPages.filter(isExtractableVisitPage);
        if (doc && extractable.length > 0) {
          setBusy(false);
          await runExtractPages(doc, extractable);
        }
      }
    } catch (err) {
      setError(deskErrorMessage(err, "Upload failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function handlePickerChange(fileList: FileList | null) {
    void commitFiles(
      fileList,
      chooseSourceThenCommit ? (commitAction ?? "extract") : "upload"
    );
  }

  async function patchDocument(
    documentId: string,
    body: {
      documentType?: VisitDocumentType;
      reportDate?: string | null;
      orderedBy?: VisitDocumentOrderedBy;
    }
  ) {
    setError(null);
    try {
      const res = await updateDeskVisitDocument(
        token,
        appointmentId,
        documentId,
        body
      );
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === documentId ? res.data.document : doc))
      );
    } catch (err) {
      setError(deskErrorMessage(err, "Could not update the label"));
    }
  }

  async function removeDocument(documentId: string) {
    setError(null);
    const removed = documents.find((doc) => doc.id === documentId);
    let restoreAt = 0;
    setDocuments((prev) => {
      restoreAt = prev.findIndex((doc) => doc.id === documentId);
      return prev.filter((doc) => doc.id !== documentId);
    });
    if (activeDocumentIdRef.current === documentId) {
      activeDocumentIdRef.current = null;
    }
    try {
      await deleteDeskVisitDocument(token, appointmentId, documentId);
      if (mode === "internal_labs") {
        invalidateDeskLabResultLoop(queryClient, appointmentId);
      }
    } catch (err) {
      if (removed) {
        setDocuments((prev) => {
          if (prev.some((doc) => doc.id === documentId)) return prev;
          const next = [...prev];
          const index =
            restoreAt < 0 ? next.length : Math.min(restoreAt, next.length);
          next.splice(index, 0, removed);
          return next;
        });
        activeDocumentIdRef.current = documentId;
      }
      setError(deskErrorMessage(err, "Could not remove the report"));
    }
  }

  async function writeLabOrders(
    updates: Parameters<typeof upsertDeskLabOrders>[2]
  ) {
    setBusy(true);
    setError(null);
    try {
      await upsertDeskLabOrders(token, appointmentId, updates);
      await ordersQuery.refetch();
      invalidateDeskLabResultLoop(queryClient, appointmentId);
    } catch (err) {
      setError(deskErrorMessage(err, "Could not update the test"));
    } finally {
      setBusy(false);
    }
  }

  const extractBusy = extractingPageId !== null || extractingDocId !== null;

  const extractGroup = useCallback(
    async (
      doc: VisitDocument,
      page: VisitDocumentPage
    ): Promise<
      | { ok: true; group: LabExtractVerifyGroup }
      | { ok: false; message: string | null }
    > => {
      try {
        const res = await extractDeskVisitDocumentPageLab(
          token,
          appointmentId,
          doc.id,
          page.id
        );
        let fileUrl: string | null = null;
        try {
          const url = await getDeskVisitDocumentDownloadUrl(
            token,
            appointmentId,
            doc.id,
            page.id
          );
          fileUrl = url.data.downloadUrl;
        } catch {
          fileUrl = null;
        }
        return {
          ok: true,
          group: {
            attachmentId: page.id,
            sourceLabel: `Page ${page.page_index + 1}`,
            pageCount: res.data.pageCount,
            skippedPageCount: res.data.skippedPageIndexes.length,
            candidates: matchExtractedLabRows(res.data.rows),
            source: res.data.source,
            previewUrl: page.file_type.startsWith("image/") ? fileUrl : null,
            fileUrl,
            fileType: page.file_type,
          },
        };
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : null;
        return { ok: false, message };
      }
    },
    [appointmentId, token]
  );

  async function runExtractPages(
    doc: VisitDocument,
    pages: VisitDocumentPage[]
  ) {
    if (pages.length === 0) return;
    setError(null);
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
      const outcome = await extractGroup(doc, page);
      if (outcome.ok) {
        next.push(outcome.group);
      } else {
        failed += 1;
        firstFailure = firstFailure ?? outcome.message;
      }
    }
    setExtractingPageId(null);
    setExtractingDocId(null);
    if (next.length === 0) {
      setError(
        firstFailure ??
          "Could not extract this report. Enter the values on the visit."
      );
      return;
    }
    if (failed > 0) {
      setError("Could not extract every page. Review the ones that succeeded.");
    }
    setVerifyDocId(doc.id);
    setReportDate(doc.report_date ?? "");
    setGroups(next);
    setVerifyOpen(true);
  }

  async function startExtractPages(
    doc: VisitDocument,
    pages: VisitDocumentPage[]
  ) {
    if (busy || extractBusy || verifyOpen || pages.length === 0) return;
    await runExtractPages(doc, pages);
  }

  async function handleConfirmExtract(selected: LabExtractConfirmRow[]) {
    if (!verifyDocId) {
      setVerifyOpen(false);
      setGroups([]);
      return;
    }
    const byPage = new Map<string, LabExtractConfirmRow[]>();
    for (const row of selected) {
      const list = byPage.get(row.attachmentId) ?? [];
      list.push(row);
      byPage.set(row.attachmentId, list);
    }
    const panels = [];
    for (const [pageId, rows] of Array.from(byPage.entries())) {
      if (rows.length === 0) continue;
      const { report, rows: applyRows } = buildExtractedLabApply(rows, {
        attachmentId: pageId,
        reportDate: rows[0]?.reportDate ?? reportDate,
        title: rows[0]?.sourceLabel,
      });
      panels.push({
        pageId,
        report: {
          id: report.id,
          kind: "lab" as const,
          title: report.title,
          reportDate: report.reportDate ?? null,
          labName: report.labName ?? null,
          attachmentIds: report.attachmentIds,
          findings: null,
          entryMethod: "extracted" as const,
        },
        rows: applyRows.map((row) => ({
          id: row.id,
          source: "patient_report" as const,
          name: row.name,
          value: row.value ?? null,
          unit: row.unit ?? null,
          date: row.date ?? null,
          interpretation: null,
          notes: null,
          reportId: row.reportId ?? report.id,
          refLow: row.refLow ?? null,
          refHigh: row.refHigh ?? null,
          refText: row.refText ?? null,
          method: row.method ?? null,
        })),
      });
    }
    if (panels.length === 0) {
      setVerifyOpen(false);
      setGroups([]);
      return;
    }
    try {
      const res = await confirmDeskVisitDocumentExtractedResults(
        token,
        appointmentId,
        verifyDocId,
        panels
      );
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === verifyDocId ? res.data.document : doc))
      );
      invalidateDeskLabResultLoop(queryClient, appointmentId);
      setVerifyOpen(false);
      setGroups([]);
      setVerifyDocId(null);
    } catch (err) {
      setError(deskErrorMessage(err, "Could not save the extracted values"));
    }
  }

  async function openPage(documentId: string, pageId: string) {
    try {
      const res = await getDeskVisitDocumentDownloadUrl(
        token,
        appointmentId,
        documentId,
        pageId
      );
      if (res.data.downloadUrl) {
        window.open(res.data.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(deskErrorMessage(err, "Could not open the file"));
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading {title.toLowerCase()}…
      </p>
    );
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {summaryLine(visible)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-8 shrink-0 px-2"
          onClick={() => setOpen(true)}
        >
          {visible.length > 0 ? "Edit" : "Add"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">
          {mode === "internal_labs"
            ? loop.total === 0
              ? "No tests yet"
              : loop.complete
                ? "All tests closed"
                : `${loop.closed}/${loop.total} closed`
            : "Optional"}
        </p>
      </div>
      {mode === "internal_labs" ? (
        <DeskLabOrdersList
          orders={ordersQuery.data ?? []}
          loading={ordersQuery.isPending && !ordersQuery.data}
          error={
            ordersQuery.error
              ? deskErrorMessage(ordersQuery.error, "Could not load tests")
              : null
          }
          coverDocumentId={coverDocumentId}
          busy={busy}
          onCover={(orderId) => {
            if (!coverDocumentId) {
              setError("Photograph the report first.");
              return;
            }
            void writeLabOrders([
              { orderId, status: "uploaded", documentId: coverDocumentId },
            ]);
          }}
          onNotDone={(orderId, reasonCode, reasonNote) => {
            void writeLabOrders([
              { orderId, status: "not_done", reasonCode, reasonNote },
            ]);
          }}
          onClear={(orderId) => {
            void writeLabOrders([{ orderId, status: "pending" }]);
          }}
        />
      ) : null}
      <p className="text-sm text-muted-foreground">{hint}</p>
      <div className="space-y-2">
        {chooseSourceThenCommit ? (
          <div className="inline-flex">
            <Button
              type="button"
              variant={commitAction === "upload" ? "outline" : "default"}
              className="h-9 rounded-r-none"
              disabled={busy || extractBusy || verifyOpen}
              onClick={() => setCommitAction("extract")}
              data-testid="desk-lab-upload-and-extract"
            >
              {busy && !extractBusy
                ? "Uploading…"
                : extractBusy
                  ? "Extracting…"
                  : "Upload and extract"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant={commitAction === "upload" ? "outline" : "default"}
                  className="h-9 rounded-l-none border-l border-primary-foreground/20 px-2"
                  disabled={busy || extractBusy || verifyOpen}
                  aria-label="More upload actions"
                  data-testid="desk-lab-upload-more"
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  disabled={busy || extractBusy || verifyOpen}
                  onSelect={() => setCommitAction("upload")}
                  data-testid="desk-lab-upload-only"
                >
                  Upload only
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        {!chooseSourceThenCommit || commitAction ? (
          <div className="flex flex-wrap items-center gap-2">
            {chooseSourceThenCommit ? (
              <p className="w-full text-xs text-muted-foreground">
                {commitAction === "upload"
                  ? "Upload only — choose camera or file"
                  : "Choose camera or file"}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={busy || extractBusy}
              data-testid="desk-lab-camera"
              onClick={() => {
                activeDocumentIdRef.current = null;
                cameraRef.current?.click();
              }}
            >
              <Camera className="mr-1.5 h-4 w-4" aria-hidden />
              Camera
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={busy || extractBusy}
              data-testid="desk-lab-file"
              onClick={() => {
                activeDocumentIdRef.current = null;
                fileRef.current?.click();
              }}
            >
              <Paperclip className="mr-1.5 h-4 w-4" aria-hidden />
              File
            </Button>
            {chooseSourceThenCommit ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9 px-2 text-muted-foreground"
                onClick={() => setCommitAction(null)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        ) : null}
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          multiple
          className="sr-only"
          aria-label="Take report photo"
          data-testid="desk-lab-camera-input"
          onChange={(event) => handlePickerChange(event.target.files)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          className="sr-only"
          aria-label="Choose report file"
          data-testid="desk-lab-file-input"
          onChange={(event) => handlePickerChange(event.target.files)}
        />
      </div>
      {pendings.length > 0 && !pendingTargetDocId ? (
        <div className="flex flex-wrap gap-2" aria-label="Uploading pages">
          {pendings.map((item) => (
            <PendingPageTile
              key={item.id}
              item={item}
              onDismiss={dropPending}
            />
          ))}
        </div>
      ) : null}

      {visible.map((doc) => {
        const canExtract =
          mode === "internal_labs" || doc.document_type === "lab_report";
        const extractable = canExtract
          ? doc.pages.filter(isExtractableVisitPage)
          : [];
        const extractingThisDoc = extractingDocId === doc.id;
        return (
          <div
            key={doc.id}
            className="space-y-2 rounded-lg border border-border/80 bg-background p-3"
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[8rem] flex-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                {mode === "internal_labs" ? (
                  <p className="mt-1 flex h-9 items-center text-sm text-foreground">
                    {VISIT_DOCUMENT_TYPE_LABEL.lab_report}
                  </p>
                ) : (
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={doc.document_type}
                    onChange={(event) =>
                      void patchDocument(doc.id, {
                        documentType: event.target.value as VisitDocumentType,
                      })
                    }
                  >
                    {VISIT_DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {VISIT_DOCUMENT_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="min-w-[8rem]">
                <Label className="text-xs text-muted-foreground">
                  Report date
                </Label>
                <Input
                  type="date"
                  className="mt-1 h-9"
                  value={doc.report_date ?? ""}
                  onChange={(event) =>
                    void patchDocument(doc.id, {
                      reportDate: event.target.value || null,
                    })
                  }
                />
              </div>
              <div className="min-w-[7rem]">
                <Label className="text-xs text-muted-foreground">
                  Ordered by
                </Label>
                {mode === "internal_labs" ? (
                  <p className="mt-1 flex h-9 items-center text-sm text-foreground">
                    Us
                  </p>
                ) : (
                  <p className="mt-1 flex h-9 items-center text-sm text-foreground">
                    Outside
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-9 px-2"
                aria-label="Remove document"
                onClick={() => void removeDocument(doc.id)}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
              {extractable.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  disabled={busy || extractBusy || verifyOpen}
                  onClick={() => void startExtractPages(doc, extractable)}
                  data-testid="desk-page-lab-extract-all"
                >
                  {extractingThisDoc ? "Extracting…" : "Extract all"}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {doc.pages.map((page) => {
                const isImage = page.file_type.startsWith("image/");
                const extracted = visitPageExtracted(doc, page.id);
                const active = extractingPageId === page.id;
                return (
                  <div key={page.id} className="flex flex-col items-stretch">
                    <button
                      type="button"
                      className="flex h-14 w-14 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground"
                      onClick={() => void openPage(doc.id, page.id)}
                    >
                      {isImage ? (
                        <span className="text-xs">p{page.page_index + 1}</span>
                      ) : (
                        <FileText className="h-5 w-5" aria-hidden />
                      )}
                    </button>
                    {canExtract && isExtractableVisitPage(page) ? (
                      <button
                        type="button"
                        className="mt-0.5 w-14 border-t border-border px-0 py-0.5 text-[10px] font-medium hover:bg-muted/60 disabled:opacity-50"
                        onClick={() => void startExtractPages(doc, [page])}
                        disabled={
                          busy || extractBusy || extracted || verifyOpen
                        }
                        data-testid={
                          extracted
                            ? "desk-page-lab-extract-done"
                            : "desk-page-lab-extract"
                        }
                      >
                        {active ? "…" : extracted ? "Done" : "Extract"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {pendingTargetDocId === doc.id
                ? pendings.map((item) => (
                    <PendingPageTile
                      key={item.id}
                      item={item}
                      onDismiss={dropPending}
                    />
                  ))
                : null}
              <Button
                type="button"
                variant="outline"
                className="h-14 w-14"
                disabled={busy || extractBusy}
                aria-label="Add another page"
                onClick={() => {
                  activeDocumentIdRef.current = doc.id;
                  cameraRef.current?.click();
                }}
              >
                +
              </Button>
            </div>
            {canExtract ? (
              <DeskExtractedResultsTable panels={doc.extracted_results ?? []} />
            ) : null}
          </div>
        );
      })}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          disabled={busy}
          onClick={() => {
            if (onFinished) {
              onFinished();
              return;
            }
            setOpen(false);
          }}
        >
          {mode === "internal_labs"
            ? loop.complete
              ? (finishLabel ?? "Done")
              : loop.total === 0
                ? "Skip"
                : "Finish later"
            : visible.length > 0
              ? (finishLabel ?? "Done")
              : "Skip"}
        </Button>
      </div>

      <LabExtractVerifyDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        groups={groups}
        reportDate={reportDate}
        busy={extractBusy}
        onConfirm={(selected) => void handleConfirmExtract(selected)}
      />
    </div>
  );
}
