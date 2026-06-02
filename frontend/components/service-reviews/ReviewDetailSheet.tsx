"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfidenceBadge } from "@/components/service-reviews/ConfidenceBadge";
import type { ServiceStaffReviewListItem } from "@/types/service-staff-review";
import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";
import {
  matchExplanationSummary,
  matchReasonChipMeta,
  parseCandidateLabels,
  parseMatchReasonCodes,
} from "@/lib/staff-review-match-explain";

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

export interface ReviewDetailSheetProps {
  review: ServiceStaffReviewListItem;
  catalog: ServiceCatalogV1 | null | undefined;
  onClose: () => void;
}

/**
 * Right-side detail drawer for one service-match review (brr-10).
 * PHI renders in-session only; avoid console logging patient or reason text.
 */
export function ReviewDetailSheet({ review, catalog, onClose }: ReviewDetailSheetProps) {
  const reasonCodes = parseMatchReasonCodes(review.match_reason_codes);
  const candidates = parseCandidateLabels(review.candidate_labels);
  const isResolved = review.status !== "pending";
  const matchSummary = matchExplanationSummary(reasonCodes, review.match_confidence);
  const propLabel = labelForServiceKey(catalog, review.proposed_catalog_service_key);
  const finalKey = review.final_catalog_service_key?.trim();
  const finalLabel = finalKey ? labelForServiceKey(catalog, finalKey) : null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="review-detail-sheet"
      >
        <SheetHeader>
          <SheetTitle>Review detail</SheetTitle>
          <SheetDescription>{patientLabel(review)}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {review.reason_for_visit_preview && (
            <section aria-labelledby="review-detail-reason">
              <h3
                id="review-detail-reason"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Reason for visit
              </h3>
              <p className="mt-2 text-sm text-foreground">{review.reason_for_visit_preview}</p>
            </section>
          )}

          <section aria-labelledby="review-detail-proposal">
            <h3
              id="review-detail-proposal"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              AI proposal
            </h3>
            <div className="mt-2 space-y-2 text-sm text-foreground">
              <p>
                <span className="font-medium">{propLabel ?? review.proposed_catalog_service_key}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  ({review.proposed_catalog_service_key})
                </span>
              </p>
              {isResolved && finalKey && (
                <p>
                  <span className="text-muted-foreground">Final visit type: </span>
                  <span className="font-medium">{finalLabel ?? finalKey}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({finalKey})</span>
                </p>
              )}
              <ConfidenceBadge confidence={review.match_confidence} />
            </div>
          </section>

          <section aria-labelledby="review-detail-signals">
            <h3
              id="review-detail-signals"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Matcher signals
            </h3>
            <p
              className="mt-2 text-sm text-muted-foreground"
              data-testid="review-detail-match-summary"
            >
              {matchSummary}
            </p>
            {reasonCodes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No reason codes stored.</p>
            ) : (
              <ul
                className="mt-3 list-disc space-y-2 pl-5 text-sm text-foreground"
                data-testid="review-detail-reason-codes"
              >
                {reasonCodes.map((code) => {
                  const m = matchReasonChipMeta(code);
                  return (
                    <li key={code}>
                      <span className="font-medium">{m.label}</span>
                      <span className="text-muted-foreground"> — </span>
                      {m.detail}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {candidates.length > 0 && (
            <section aria-labelledby="review-detail-candidates">
              <h3
                id="review-detail-candidates"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Candidate services considered
              </h3>
              <ul
                className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground"
                data-testid="review-detail-candidates"
              >
                {candidates.map((c) => (
                  <li key={`${c.service_key}-${c.label}`}>
                    {c.label}{" "}
                    <span className="text-muted-foreground">({c.service_key})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {isResolved && (
            <section aria-labelledby="review-detail-resolution" data-testid="review-detail-audit">
              <h3
                id="review-detail-resolution"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Resolution
              </h3>
              <div className="mt-2 space-y-1.5 text-sm text-foreground">
                <p>
                  <span className="text-muted-foreground">Outcome: </span>
                  {rowStatusLabel(review.status)}
                </p>
                {review.resolved_by_user_id && (
                  <p>
                    <span className="text-muted-foreground">Resolved by: </span>
                    {review.resolved_by_user_id}
                  </p>
                )}
                {review.resolution_internal_note && (
                  <p>
                    <span className="text-muted-foreground">Note: </span>
                    {review.resolution_internal_note}
                  </p>
                )}
              </div>
            </section>
          )}

          <section aria-label="Conversation" data-testid="review-detail-conversation">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Instagram conversation
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">Conversation view coming soon.</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
