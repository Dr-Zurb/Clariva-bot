/**
 * ReviewCard — mobile card layout (brr-11).
 *
 * Run: `vitest run frontend/components/service-reviews/__tests__/ReviewCard.test.tsx`
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ReviewCard } from "@/components/service-reviews/ReviewCard";
import type { ServiceStaffReviewListItem } from "@/types/service-staff-review";
import type { DoctorSettings } from "@/types/doctor-settings";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

function makeReview(
  overrides: Partial<ServiceStaffReviewListItem> = {}
): ServiceStaffReviewListItem {
  return {
    id: "rev-card",
    doctor_id: "doc-1",
    conversation_id: "conv-1",
    patient_id: "pat-card",
    correlation_id: null,
    status: "pending",
    proposed_catalog_service_key: "general",
    proposed_catalog_service_id: null,
    proposed_consultation_modality: null,
    match_confidence: "medium",
    match_reason_codes: [],
    candidate_labels: [],
    created_at: "2026-05-31T10:00:00.000Z",
    updated_at: "2026-05-31T10:00:00.000Z",
    resolved_at: null,
    resolved_by_user_id: null,
    final_catalog_service_key: null,
    final_catalog_service_id: null,
    final_consultation_modality: null,
    resolution_internal_note: null,
    patient_display_name: "Card Patient",
    reason_for_visit_preview: "Persistent cough",
    sla_deadline_at: "2026-05-31T12:38:00.000Z",
    ...overrides,
  };
}

const minimalSettings = {
  service_offerings_json: {
    version: 1,
    services: [
      {
        service_id: "svc-1",
        service_key: "general",
        label: "General consult",
      },
    ],
  },
} as unknown as DoctorSettings;

describe("ReviewCard (brr-11)", () => {
  const onConfirm = vi.fn();
  const onReassign = vi.fn();
  const onCancel = vi.fn();
  const onOpenDetail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderCard(review: ServiceStaffReviewListItem) {
    return render(
      <ReviewCard
        review={review}
        catalog={minimalSettings.service_offerings_json}
        onConfirm={onConfirm}
        onReassign={onReassign}
        onCancel={onCancel}
        onOpenDetail={onOpenDetail}
      />
    );
  }

  it("renders patient, reason, proposal + confidence, SLA, and action controls for pending", () => {
    renderCard(makeReview());

    const card = screen.getByTestId("review-card-rev-card");
    expect(within(card).getByText("Card Patient")).toBeInTheDocument();
    expect(within(card).getByText("Persistent cough")).toBeInTheDocument();
    expect(within(card).getByText("General consult")).toBeInTheDocument();
    expect(within(card).getByText("medium")).toBeInTheDocument();
    expect(within(card).getByText(/due in/i)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /^confirm$/i })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /more review actions/i })).toBeInTheDocument();
  });

  it("calls onOpenDetail for card tap and onConfirm without opening detail", () => {
    renderCard(makeReview());

    fireEvent.click(screen.getByText("Persistent cough"));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it("renders outcome + resolved time without action footer for resolved reviews", () => {
    renderCard(
      makeReview({
        status: "confirmed",
        resolved_at: "2026-05-31T11:00:00.000Z",
        sla_deadline_at: null,
      })
    );

    const card = screen.getByTestId("review-card-rev-card");
    expect(within(card).getByText("Confirmed")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /^confirm$/i })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /more review actions/i })).not.toBeInTheDocument();
  });
});
