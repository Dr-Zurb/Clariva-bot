"use client";

import Link from "next/link";
import { ArrowLeftRight, Check, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfidenceBadge } from "@/components/service-reviews/ConfidenceBadge";
import { QueuedAgeLabel, SlaCountdown } from "@/components/service-reviews/SlaCountdown";
import type { ServiceStaffReviewListItem } from "@/types/service-staff-review";
import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

function labelForServiceKey(
  catalog: ServiceCatalogV1 | null | undefined,
  key: string
): string | null {
  if (!catalog?.services?.length) return null;
  const k = key.trim().toLowerCase();
  const s = catalog.services.find((x) => x.service_key === k);
  return s?.label ?? null;
}

function patientLabel(review: ServiceStaffReviewListItem): string {
  return (
    review.patient_display_name?.trim() ||
    (review.patient_id ? `Patient ${review.patient_id.slice(0, 8)}…` : "—")
  );
}

function rowStatusLabel(status: ServiceStaffReviewListItem["status"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "reassigned":
      return "Reassigned";
    case "cancelled_by_staff":
      return "Cancelled (staff)";
    case "cancelled_timeout":
      return "Cancelled (timeout)";
    default:
      return status;
  }
}

function formatResolvedAt(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return formatDateTime(iso, { dateStyle: "short", timeStyle: "short" });
}

export interface ReviewCardProps {
  review: ServiceStaffReviewListItem;
  catalog: ServiceCatalogV1 | null | undefined;
  disabled?: boolean;
  onConfirm: (review: ServiceStaffReviewListItem) => void;
  onReassign: (review: ServiceStaffReviewListItem) => void;
  onCancel: (review: ServiceStaffReviewListItem) => void;
  onOpenDetail: (review: ServiceStaffReviewListItem) => void;
  focused?: boolean;
  selected?: boolean;
  showSelection?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}

/**
 * Mobile card for one service-match review (brr-11). PHI in-session only.
 */
export function ReviewCard({
  review,
  catalog,
  disabled = false,
  onConfirm,
  onReassign,
  onCancel,
  onOpenDetail,
  focused = false,
  selected = false,
  showSelection = false,
  onSelectedChange,
}: ReviewCardProps) {
  const isPending = review.status === "pending";
  const propLabel = labelForServiceKey(catalog, review.proposed_catalog_service_key);
  const label = patientLabel(review);

  return (
    <Card
      data-testid={`review-card-${review.id}`}
      data-review-focus-id={review.id}
      aria-selected={focused}
      className={cn(
        "cursor-pointer shadow-sm",
        focused && "ring-2 ring-ring ring-offset-2 ring-offset-background"
      )}
      onClick={() => onOpenDetail(review)}
    >
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        {showSelection && isPending && onSelectedChange && (
          <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelectedChange(checked === true)}
              aria-label={`Select review for ${label}`}
            />
          </div>
        )}
        <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
          {review.patient_id ? (
            <Button asChild variant="link" className="h-auto max-w-full p-0 text-left font-semibold">
              <Link href={`/dashboard/patients-v2/${review.patient_id}`}>{label}</Link>
            </Button>
          ) : (
            <CardTitle className="text-base">{label}</CardTitle>
          )}
          {!isPending && (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {rowStatusLabel(review.status)}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-sm text-foreground">
          {isPending ? (
            review.sla_deadline_at ? (
              <SlaCountdown deadlineIso={review.sla_deadline_at} />
            ) : (
              <QueuedAgeLabel createdAtIso={review.created_at} />
            )
          ) : (
            <span className="text-xs text-muted-foreground">{formatResolvedAt(review.resolved_at)}</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        <p className="line-clamp-2 text-sm text-foreground">
          {review.reason_for_visit_preview ?? "—"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {propLabel ?? review.proposed_catalog_service_key}
          </span>
          <ConfidenceBadge confidence={review.match_confidence} />
        </div>
      </CardContent>

      {isPending && (
        <CardFooter
          className={cn("gap-2 border-t bg-muted/20 pt-3")}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="sm"
            disabled={disabled}
            className="flex-1 sm:flex-none"
            onClick={() => onConfirm(review)}
          >
            <Check />
            Confirm
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                aria-label="More review actions"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={disabled}
                onClick={() => onReassign(review)}
              >
                <ArrowLeftRight aria-hidden="true" />
                Reassign
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={disabled}
                className="text-destructive focus:text-destructive"
                onClick={() => onCancel(review)}
              >
                <X aria-hidden="true" />
                Cancel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardFooter>
      )}
    </Card>
  );
}
