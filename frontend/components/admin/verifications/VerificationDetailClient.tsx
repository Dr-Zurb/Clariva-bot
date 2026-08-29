"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { DocPreview } from "@/components/admin/verifications/DocPreview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminVerificationDetailQuery } from "@/hooks/queries/useAdminVerificationsQuery";
import {
  approveAdminVerification,
  rejectAdminVerification,
  requestChangesAdminVerification,
} from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { VerificationStatusBadge } from "./statusBadge";

const CHANGES_PRESETS = [
  "Certificate is blurry — please re-upload a clearer photo or PDF.",
  "Government ID is missing or unreadable.",
  "Name or registration number doesn't match — please re-upload the correct certificate.",
];

const REJECT_PRESETS = [
  "Unable to verify this registration against the submitted documents.",
  "Submitted documents do not appear to belong to a licensed doctor.",
  "Registration details could not be confirmed with the council.",
];

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

interface VerificationDetailClientProps {
  token: string;
  doctorId: string;
}

/**
 * admin-console · review detail with inline doc preview + 3-way verdict
 * (Approve / Request changes / Reject).
 */
export function VerificationDetailClient({
  token,
  doctorId,
}: VerificationDetailClientProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } =
    useAdminVerificationDetailQuery(token, doctorId);

  const [panel, setPanel] = useState<"changes" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.verificationDetail(doctorId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.all,
      }),
    ]);
  }

  async function handleApprove() {
    setActionError(null);
    setActing(true);
    try {
      await approveAdminVerification(token, doctorId);
      setPanel(null);
      setNote("");
      await invalidate();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Approve failed. Try again.",
      );
    } finally {
      setActing(false);
    }
  }

  async function handleRequestChanges() {
    setActionError(null);
    const trimmed = note.trim();
    if (!trimmed) {
      setActionError("A note is required.");
      return;
    }
    setActing(true);
    try {
      await requestChangesAdminVerification(token, doctorId, trimmed);
      setPanel(null);
      setNote("");
      await invalidate();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Request changes failed. Try again.",
      );
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    setActionError(null);
    const reason = note.trim();
    if (!reason) {
      setActionError("A reject reason is required.");
      return;
    }
    setActing(true);
    try {
      await rejectAdminVerification(token, doctorId, reason);
      setPanel(null);
      setNote("");
      await invalidate();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Reject failed. Try again.",
      );
    } finally {
      setActing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <p className="text-destructive">Could not load this verification.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => void refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const canAct = data.status === "pending_review";
  const presets = panel === "changes" ? CHANGES_PRESETS : REJECT_PRESETS;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/verifications"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All verifications
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {data.fullName ?? "Unnamed submission"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted {formatWhen(data.submittedAt)}
          </p>
        </div>
        <VerificationStatusBadge status={data.status} />
      </div>

      <dl className="grid gap-3 rounded-md border border-border p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Registration number</dt>
          <dd className="mt-0.5 font-mono">{data.registrationNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Council / state</dt>
          <dd className="mt-0.5">{data.councilState ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Specialty</dt>
          <dd className="mt-0.5">{data.specialty ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Reviewed</dt>
          <dd className="mt-0.5">
            {formatWhen(data.reviewedAt)}
            {data.reviewedBy ? (
              <span className="ml-1 text-muted-foreground">
                · {data.reviewedBy}
              </span>
            ) : null}
          </dd>
        </div>
        {data.rejectReason ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">
              {data.status === "changes_requested"
                ? "Reviewer note"
                : "Reject reason"}
            </dt>
            <dd className="mt-0.5">{data.rejectReason}</dd>
          </div>
        ) : null}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <DocPreview label="Certificate" url={data.certificateSignedUrl} />
        <DocPreview label="Government ID" url={data.govIdSignedUrl} />
      </div>

      {canAct ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <p className="text-sm font-medium">Review decision</p>
          {actionError ? (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={acting}
              onClick={() => void handleApprove()}
            >
              {acting && panel === null ? "Approving…" : "Approve"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={acting}
              onClick={() => {
                setPanel("changes");
                setNote("");
                setActionError(null);
              }}
            >
              Request changes
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={acting}
              onClick={() => {
                setPanel("reject");
                setNote("");
                setActionError(null);
              }}
            >
              Reject
            </Button>
          </div>

          {panel ? (
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal px-2 py-1 text-left text-xs"
                    disabled={acting}
                    onClick={() => setNote(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="review-note">
                  {panel === "changes" ? "Note (required)" : "Reason (required)"}
                </Label>
                <textarea
                  id="review-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={
                    panel === "changes"
                      ? "What should the doctor fix?"
                      : "Why is this being declined?"
                  }
                  disabled={acting}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={panel === "reject" ? "destructive" : "default"}
                  disabled={acting}
                  onClick={() =>
                    void (panel === "changes"
                      ? handleRequestChanges()
                      : handleReject())
                  }
                >
                  {acting
                    ? panel === "changes"
                      ? "Sending…"
                      : "Rejecting…"
                    : panel === "changes"
                      ? "Send request"
                      : "Confirm reject"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={acting}
                  onClick={() => {
                    setPanel(null);
                    setNote("");
                    setActionError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
