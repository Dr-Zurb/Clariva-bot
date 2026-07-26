"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileImage } from "lucide-react";

import { DocPreview } from "@/components/admin/verifications/DocPreview";
import { VerificationStatusBadge } from "@/components/admin/verifications/statusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAdminVerificationDetailQuery } from "@/hooks/queries/useAdminVerificationsQuery";
import {
  approveAdminVerification,
  rejectAdminVerification,
  requestChangesAdminVerification,
  type AdminVerificationListItem,
} from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

const CHANGES_PRESETS = [
  "Certificate is blurry — please re-upload a clearer photo or PDF.",
  "Government ID is missing or unreadable.",
  "Name or registration number doesn't match — please re-upload the correct certificate.",
  "Wrong document uploaded — please upload your medical registration certificate.",
];

const REJECT_PRESETS = [
  "Unable to verify this registration against the submitted documents.",
  "Submitted documents do not appear to belong to a licensed doctor.",
  "Registration details could not be confirmed with the council.",
];

type DocKind = "certificate" | "gov_id";

function formatSubmittedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/**
 * admin-console · Notion-style single-height row: name opens the profile,
 * per-doc icons open a popup, Approve / Changes / Reject act inline.
 * Signed URLs are fetched lazily the first time a doc icon is clicked.
 */
export function VerificationRow({
  token,
  row,
}: {
  token: string;
  row: AdminVerificationListItem;
}) {
  const queryClient = useQueryClient();
  const [docsRequested, setDocsRequested] = useState(false);
  const [openDoc, setOpenDoc] = useState<DocKind | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState<
    "approve" | "changes" | "reject" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
    refetch: refetchDetail,
  } = useAdminVerificationDetailQuery(
    docsRequested ? token : "",
    docsRequested ? row.doctorId : "",
  );

  const canAct = row.status === "pending_review";

  function openDocDialog(kind: DocKind) {
    setDocsRequested(true);
    setOpenDoc(kind);
  }

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
  }

  async function handleApprove() {
    setActionError(null);
    setActing("approve");
    try {
      await approveAdminVerification(token, row.doctorId);
      await invalidate();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Approve failed. Try again.",
      );
    } finally {
      setActing(null);
    }
  }

  async function handleRequestChanges() {
    setActionError(null);
    const note = changesNote.trim();
    if (!note) {
      setActionError("A note is required.");
      return;
    }
    setActing("changes");
    try {
      await requestChangesAdminVerification(token, row.doctorId, note);
      setChangesOpen(false);
      setChangesNote("");
      await invalidate();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Request changes failed. Try again.",
      );
    } finally {
      setActing(null);
    }
  }

  async function handleReject() {
    setActionError(null);
    const reason = rejectReason.trim();
    if (!reason) {
      setActionError("A reject reason is required.");
      return;
    }
    setActing("reject");
    try {
      await rejectAdminVerification(token, row.doctorId, reason);
      setRejectOpen(false);
      setRejectReason("");
      await invalidate();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Reject failed. Try again.",
      );
    } finally {
      setActing(null);
    }
  }

  const docUrl =
    openDoc === "certificate"
      ? detail?.certificateSignedUrl ?? null
      : openDoc === "gov_id"
        ? detail?.govIdSignedUrl ?? null
        : null;
  const docLabel = openDoc === "gov_id" ? "Government ID" : "Certificate";

  return (
    <>
      <TableRow className="h-10 border-border/50 hover:bg-muted/40">
        <TableCell className="min-w-[11rem] whitespace-nowrap py-1.5">
          <Link
            href={`/admin/verifications/${row.doctorId}`}
            className="font-medium text-primary underline-offset-2 hover:underline"
            title={row.fullName ?? undefined}
          >
            {row.fullName ?? "Untitled"}
          </Link>
        </TableCell>
        <TableCell className="whitespace-nowrap py-1.5 font-mono text-xs">
          {row.registrationNumber ?? "—"}
        </TableCell>
        <TableCell
          className="max-w-[14rem] truncate whitespace-nowrap py-1.5 text-muted-foreground"
          title={row.councilState ?? undefined}
        >
          {row.councilState ?? "—"}
        </TableCell>
        <TableCell
          className="max-w-[10rem] truncate whitespace-nowrap py-1.5 text-muted-foreground"
          title={row.specialty ?? undefined}
        >
          {row.specialty ?? "—"}
        </TableCell>
        <TableCell className="whitespace-nowrap py-1.5 text-muted-foreground">
          {formatSubmittedAt(row.submittedAt)}
        </TableCell>
        <TableCell className="whitespace-nowrap py-1.5">
          <VerificationStatusBadge status={row.status} />
        </TableCell>
        <TableCell className="w-10 px-1 py-1.5 text-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="View certificate"
            title="View certificate"
            onClick={() => openDocDialog("certificate")}
          >
            <FileImage className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </TableCell>
        <TableCell className="w-10 px-1 py-1.5 text-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="View government ID"
            title="View government ID"
            onClick={() => openDocDialog("gov_id")}
          >
            <FileImage className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap py-1.5 text-right">
          {canAct ? (
            <div className="inline-flex items-center justify-end gap-1">
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={acting !== null}
                onClick={() => void handleApprove()}
              >
                {acting === "approve" ? "…" : "Approve"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={acting !== null}
                onClick={() => {
                  setActionError(null);
                  setChangesOpen(true);
                }}
              >
                Changes
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 px-2 text-xs"
                disabled={acting !== null}
                onClick={() => {
                  setActionError(null);
                  setRejectOpen(true);
                }}
              >
                Reject
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {actionError && !rejectOpen && !changesOpen ? (
            <p
              className="mt-0.5 truncate text-right text-[11px] text-destructive"
              role="alert"
              title={actionError}
            >
              {actionError}
            </p>
          ) : null}
        </TableCell>
      </TableRow>

      {/* Single-doc preview */}
      <Dialog
        open={openDoc !== null}
        onOpenChange={(open) => {
          if (!open) setOpenDoc(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {(row.fullName ?? "Submission") + " — " + docLabel}
            </DialogTitle>
            <DialogDescription>
              Short-lived preview. Open the full profile for review history.
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : detailError ? (
            <div className="space-y-2 text-sm">
              <p className="text-destructive">Could not load the document.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void refetchDetail()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <DocPreview label={docLabel} url={docUrl} compact />
          )}

          <DialogFooter className="sm:justify-between">
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={`/admin/verifications/${row.doctorId}`}>
                Open full profile
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request changes (soft re-upload) */}
      <Dialog
        open={changesOpen}
        onOpenChange={(open) => {
          setChangesOpen(open);
          if (!open) {
            setChangesNote("");
            setActionError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              {row.fullName ?? "This doctor"} will see a soft “quick update
              needed” message with your note and can re-submit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {CHANGES_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto whitespace-normal px-2 py-1 text-left text-xs"
                  disabled={acting !== null}
                  onClick={() => setChangesNote(preset)}
                >
                  {preset}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`changes-note-${row.doctorId}`}>
                Note (required)
              </Label>
              <textarea
                id={`changes-note-${row.doctorId}`}
                value={changesNote}
                onChange={(e) => setChangesNote(e.target.value)}
                rows={3}
                maxLength={500}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Pick a preset above or write what to fix."
                disabled={acting !== null}
              />
            </div>
            {actionError ? (
              <p className="text-sm text-destructive" role="alert">
                {actionError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={acting !== null}
              onClick={() => setChangesOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={acting !== null}
              onClick={() => void handleRequestChanges()}
            >
              {acting === "changes" ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject with reason (+ presets) — hard decline */}
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) {
            setRejectReason("");
            setActionError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject submission</DialogTitle>
            <DialogDescription>
              Hard decline for {row.fullName ?? "this doctor"}. Prefer “Request
              changes” if a clearer photo or a corrected field would fix it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {REJECT_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto whitespace-normal px-2 py-1 text-left text-xs"
                  disabled={acting !== null}
                  onClick={() => setRejectReason(preset)}
                >
                  {preset}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`reject-reason-${row.doctorId}`}>
                Reason (required)
              </Label>
              <textarea
                id={`reject-reason-${row.doctorId}`}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={500}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Pick a preset above or write a reason."
                disabled={acting !== null}
              />
            </div>
            {actionError ? (
              <p className="text-sm text-destructive" role="alert">
                {actionError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={acting !== null}
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={acting !== null}
              onClick={() => void handleReject()}
            >
              {acting === "reject" ? "Rejecting…" : "Confirm reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
