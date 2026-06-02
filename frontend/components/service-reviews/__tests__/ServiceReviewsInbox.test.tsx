/**
 * ServiceReviewsInbox — Phase 1–3 gates (brr-04 / brr-09 / brr-13).
 *
 * Run: `vitest run frontend/components/service-reviews/__tests__/ServiceReviewsInbox.test.tsx`
 */

import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within, act, waitFor } from "@testing-library/react";
import { ServiceReviewsInbox } from "@/components/service-reviews/ServiceReviewsInbox";
import type { ServiceStaffReviewListItem } from "@/types/service-staff-review";
import type { DoctorSettings } from "@/types/doctor-settings";
import {
  getServiceStaffReviews,
  postCancelServiceStaffReview,
  postConfirmServiceStaffReview,
  postReassignServiceStaffReview,
} from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  getServiceStaffReviews: vi.fn(),
  postConfirmServiceStaffReview: vi.fn(),
  postReassignServiceStaffReview: vi.fn(),
  postCancelServiceStaffReview: vi.fn(),
}));

const mockPollingState = {
  rows: null as ServiceStaffReviewListItem[] | null,
  isFetching: false,
  refetch: vi.fn(),
};

vi.mock("@/lib/service-reviews/useReviewsPolling", () => ({
  useReviewsPolling: vi.fn(() => mockPollingState),
  REVIEWS_POLL_INTERVAL_MS: 30_000,
}));

const FIXED_NOW = Date.parse("2026-05-31T12:00:00.000Z");

const mockGet = vi.mocked(getServiceStaffReviews);
const mockConfirm = vi.mocked(postConfirmServiceStaffReview);
const mockReassign = vi.mocked(postReassignServiceStaffReview);
const mockCancel = vi.mocked(postCancelServiceStaffReview);

function makeReview(
  overrides: Partial<ServiceStaffReviewListItem> = {}
): ServiceStaffReviewListItem {
  return {
    id: "rev-default",
    doctor_id: "doc-1",
    conversation_id: "conv-1",
    patient_id: "pat-default",
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
    patient_display_name: "Default Patient",
    reason_for_visit_preview: null,
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
      {
        service_id: "svc-2",
        service_key: "followup",
        label: "Follow-up",
      },
    ],
  },
} as unknown as DoctorSettings;

const UNDO_MS = 5000;

function renderInbox(
  reviews: ServiceStaffReviewListItem[],
  settings: DoctorSettings = minimalSettings
) {
  return render(
    <ServiceReviewsInbox initialReviews={reviews} settings={settings} token="test-token" />
  );
}

function patientLinksInTableOrder(): string[] {
  const table = screen.getByRole("table", { name: /service match reviews/i });
  return within(table)
    .getAllByRole("link")
    .map((link) => link.textContent?.trim() ?? "");
}

function getDesktopTable() {
  return screen.getByTestId("review-desktop-table");
}

function clickDesktopConfirm() {
  fireEvent.click(within(getDesktopTable()).getByRole("button", { name: /^confirm$/i }));
}

function clickReviewReason(text: string) {
  fireEvent.click(within(getDesktopTable()).getByText(text));
}

async function advanceDeferredConfirm() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    await Promise.resolve();
  });
}

function fireTriageKey(key: string, target: Element | Document = document.body) {
  fireEvent.keyDown(target, { key, bubbles: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPollingState.rows = null;
  mockPollingState.isFetching = false;
  mockGet.mockResolvedValue({ data: { reviews: [] } } as Awaited<
    ReturnType<typeof getServiceStaffReviews>
  >);
  mockConfirm.mockResolvedValue({ data: { review: makeReview() } } as Awaited<
    ReturnType<typeof postConfirmServiceStaffReview>
  >);
  mockReassign.mockResolvedValue({ data: { review: makeReview() } } as Awaited<
    ReturnType<typeof postReassignServiceStaffReview>
  >);
  mockCancel.mockResolvedValue({ data: { review: makeReview() } } as Awaited<
    ReturnType<typeof postCancelServiceStaffReview>
  >);
});

describe("ServiceReviewsInbox — action parity (brr-04)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Confirm fires postConfirmServiceStaffReview(token, id, {}) after deferred window", async () => {
    const review = makeReview({ id: "rev-confirm", patient_display_name: "Confirm Me" });
    renderInbox([review]);

    clickDesktopConfirm();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/booking link queued/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_MS);
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-confirm", {});
  });

  it("mocked 409 on confirm shows already-resolved banner and refetches", async () => {
    const review = makeReview({ id: "rev-409" });
    mockConfirm.mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 }));

    renderInbox([review]);
    clickDesktopConfirm();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_MS);
      await Promise.resolve();
    });

    expect(screen.getByText(/this request was already resolved/i)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("test-token", "pending");
  });
});

describe("ServiceReviewsInbox — quick-resolve (brr-07)", () => {
  const assistHint = {
    pattern_key: "pattern-1",
    feature_snapshot_hash: "hash-1",
    total_resolutions: 8,
    top_resolutions: [
      { final_catalog_service_key: "general", count: 5, label: "General consult" },
      { final_catalog_service_key: "followup", count: 3, label: "Follow-up" },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("matching resolution routes to deferred confirm with Undo toast", async () => {
    const review = makeReview({
      id: "rev-quick-confirm",
      proposed_catalog_service_key: "general",
      assist_hint: assistHint,
    });
    renderInbox([review]);

    fireEvent.click(screen.getByRole("button", { name: /resolve as general consult · 5×/i }));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/booking link queued/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^undo$/i })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_MS);
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-quick-confirm", {});
  });

  it("different in-catalog resolution fires immediate reassign without teaching append", async () => {
    const review = makeReview({
      id: "rev-quick-reassign",
      proposed_catalog_service_key: "general",
      assist_hint: assistHint,
    });
    renderInbox([review]);

    fireEvent.click(screen.getByRole("button", { name: /resolve as follow-up · 3×/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockReassign).toHaveBeenCalledWith("test-token", "rev-quick-reassign", {
      catalogServiceKey: "followup",
      catalogServiceId: "svc-2",
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("unknown-catalog resolution omits the quick-resolve button", () => {
    renderInbox([
      makeReview({
        proposed_catalog_service_key: "general",
        assist_hint: {
          ...assistHint,
          top_resolutions: [
            { final_catalog_service_key: "removed", count: 2, label: "Removed service" },
          ],
        },
      }),
    ]);

    expect(screen.queryByRole("button", { name: /resolve as/i })).not.toBeInTheDocument();
  });

  it("no assist hint renders no quick-resolve buttons", () => {
    renderInbox([makeReview({ assist_hint: null })]);
    expect(screen.queryByRole("button", { name: /resolve as/i })).not.toBeInTheDocument();
  });
});

describe("ServiceReviewsInbox — SLA rendering + sort (brr-04)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an SLA chip when sla_deadline_at is present", () => {
    renderInbox([
      makeReview({
        id: "rev-sla",
        sla_deadline_at: "2026-05-31T12:38:00.000Z",
        patient_display_name: "SLA Patient",
      }),
    ]);

    expect(document.body).toHaveTextContent("Due in 38m");
  });

  it("renders queued-age fallback when sla_deadline_at is null", () => {
    renderInbox([
      makeReview({
        id: "rev-queued",
        sla_deadline_at: null,
        created_at: "2026-05-31T09:00:00.000Z",
        patient_display_name: "Queued Patient",
      }),
    ]);

    expect(document.body).toHaveTextContent("queued 3h ago");
  });

  it("sorts pending rows soonest-deadline-first (null deadlines last, older first)", () => {
    renderInbox([
      makeReview({
        id: "rev-late",
        patient_id: "pat-late",
        patient_display_name: "Charlie Late",
        sla_deadline_at: "2026-05-31T14:00:00.000Z",
      }),
      makeReview({
        id: "rev-soon",
        patient_id: "pat-soon",
        patient_display_name: "Bob Soon",
        sla_deadline_at: "2026-05-31T12:30:00.000Z",
      }),
      makeReview({
        id: "rev-null-old",
        patient_id: "pat-null-old",
        patient_display_name: "Alice Null Old",
        sla_deadline_at: null,
        created_at: "2026-05-31T07:00:00.000Z",
      }),
      makeReview({
        id: "rev-null-new",
        patient_id: "pat-null-new",
        patient_display_name: "Dana Null New",
        sla_deadline_at: null,
        created_at: "2026-05-31T11:00:00.000Z",
      }),
    ]);

    expect(patientLinksInTableOrder()).toEqual([
      "Bob Soon",
      "Charlie Late",
      "Alice Null Old",
      "Dana Null New",
    ]);
  });

  it("preserves overflow-x-auto wrapper for mobile table scroll", () => {
    const { container } = renderInbox([makeReview()]);
    const wrapper = container.querySelector('[data-testid="review-desktop-table"]');
    expect(wrapper).toBeTruthy();
    expect(wrapper).toHaveClass("overflow-x-auto");
    expect(wrapper?.querySelector("table")).toBeTruthy();
    expect(container.querySelector('[data-testid="review-mobile-list"]')).toBeTruthy();
  });
});

describe("ServiceReviewsInbox — Phase 2 optimistic gate (brr-09)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Confirm → Undo before window: postConfirm not called and row restored", async () => {
    const review = makeReview({ id: "rev-undo", patient_display_name: "Undo Patient" });
    renderInbox([review]);

    clickDesktopConfirm();
    expect(screen.queryByText("Undo Patient")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
    expect(within(getDesktopTable()).getByText("Undo Patient")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_MS);
      await Promise.resolve();
    });

    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("Confirm → advance past window: called once and list reconciles", async () => {
    const review = makeReview({ id: "rev-elapse", patient_display_name: "Elapse Patient" });
    mockGet.mockResolvedValueOnce({ data: { reviews: [] } } as Awaited<
      ReturnType<typeof getServiceStaffReviews>
    >);
    renderInbox([review]);

    clickDesktopConfirm();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_MS);
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-elapse", {});
    expect(mockGet).toHaveBeenCalledWith("test-token", "pending");
  });

  it("Confirm → unmount mid-window flushes the call once", async () => {
    const review = makeReview({ id: "rev-unmount-flush", patient_display_name: "Unmount Patient" });
    const { unmount } = renderInbox([review]);

    clickDesktopConfirm();
    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-unmount-flush", {});
  });

  it("does not show N-new pill while a deferred commit is in flight", () => {
    const inFlight = makeReview({ id: "rev-in-flight", patient_display_name: "In Flight" });
    mockPollingState.rows = [
      inFlight,
      makeReview({ id: "rev-genuinely-new", patient_display_name: "Genuinely New" }),
    ];

    renderInbox([inFlight]);
    clickDesktopConfirm();

    expect(screen.getByText(/booking link queued/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\d+ new/i })).not.toBeInTheDocument();
  });
});

describe("ServiceReviewsInbox — Phase 2 filters gate (brr-09)", () => {
  it('filter "Low only" + sort "Newest" compose over the fixture', async () => {
    renderInbox([
      makeReview({
        id: "high-new",
        patient_display_name: "High New",
        match_confidence: "high",
        created_at: "2026-05-31T11:00:00.000Z",
      }),
      makeReview({
        id: "low-old",
        patient_display_name: "Low Old",
        match_confidence: "low",
        created_at: "2026-05-31T08:00:00.000Z",
      }),
      makeReview({
        id: "low-new",
        patient_display_name: "Low New",
        match_confidence: "low",
        created_at: "2026-05-31T10:30:00.000Z",
      }),
    ]);

    fireEvent.click(screen.getByLabelText("Confidence"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /low only/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("option", { name: /low only/i }));

    fireEvent.click(screen.getByLabelText("Sort"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /^newest$/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("option", { name: /^newest$/i }));

    expect(patientLinksInTableOrder()).toEqual(["Low New", "Low Old"]);
  });
});

describe("ServiceReviewsInbox — API mocks wired", () => {
  it("exports all four mocked service-staff-review API helpers", () => {
    expect(mockGet).toBeDefined();
    expect(mockConfirm).toBeDefined();
    expect(mockReassign).toBeDefined();
    expect(mockCancel).toBeDefined();
  });
});

describe("ServiceReviewsInbox — detail drawer (brr-10)", () => {
  it("opens drawer on row click with match summary, reason codes, and candidates", () => {
    renderInbox([
      makeReview({
        id: "rev-drawer-pending",
        patient_display_name: "Drawer Pending",
        reason_for_visit_preview: "Headache for two days",
        match_confidence: "low",
        match_reason_codes: ["ambiguous_complaint", "keyword_hint_match"],
        candidate_labels: [
          { service_key: "general", label: "General consult" },
          { service_key: "followup", label: "Follow-up" },
        ],
      }),
    ]);

    expect(screen.queryByTestId("review-detail-sheet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show technical detail/i })).not.toBeInTheDocument();

    clickReviewReason("Headache for two days");

    const sheet = screen.getByTestId("review-detail-sheet");
    expect(within(sheet).getByRole("heading", { name: /review detail/i })).toBeInTheDocument();
    expect(within(sheet).getByTestId("review-detail-match-summary")).toHaveTextContent(
      /visit wording could fit multiple visit types/i
    );
    expect(within(sheet).getByTestId("review-detail-reason-codes")).toHaveTextContent("Ambiguous");
    expect(within(sheet).getByTestId("review-detail-reason-codes")).toHaveTextContent("Hints");
    expect(within(sheet).getByTestId("review-detail-candidates")).toHaveTextContent("General consult");
    expect(within(sheet).getByTestId("review-detail-candidates")).toHaveTextContent("Follow-up");
    expect(within(sheet).queryByTestId("review-detail-audit")).not.toBeInTheDocument();
  });

  it("shows resolved audit fields for a non-pending fixture", () => {
    renderInbox([
      makeReview({
        id: "rev-drawer-resolved",
        status: "reassigned",
        patient_display_name: "Drawer Resolved",
        reason_for_visit_preview: "Needs a follow-up visit",
        final_catalog_service_key: "followup",
        resolved_at: "2026-05-31T11:00:00.000Z",
        resolved_by_user_id: "staff-user-uuid-123",
        resolution_internal_note: "Patient wanted follow-up instead.",
        match_reason_codes: ["staff_reassigned_service"],
      }),
    ]);

    clickReviewReason("Needs a follow-up visit");

    const audit = within(screen.getByTestId("review-detail-sheet")).getByTestId("review-detail-audit");
    expect(audit).toHaveTextContent("Outcome:");
    expect(audit).toHaveTextContent("Reassigned");
    expect(audit).toHaveTextContent("staff-user-uuid-123");
    expect(audit).toHaveTextContent("Patient wanted follow-up instead.");
  });

  it("shows conversation placeholder without extra network calls", () => {
    renderInbox([
      makeReview({
        patient_display_name: "Convo Patient",
        reason_for_visit_preview: "Skin rash",
      }),
    ]);

    clickReviewReason("Skin rash");

    const conversation = within(screen.getByTestId("review-detail-sheet")).getByTestId(
      "review-detail-conversation"
    );
    expect(conversation).toHaveTextContent(/conversation view coming soon/i);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("does not open drawer when clicking Confirm", () => {
    renderInbox([makeReview({ patient_display_name: "Action Patient" })]);

    clickDesktopConfirm();

    expect(screen.queryByTestId("review-detail-sheet")).not.toBeInTheDocument();
  });
});

describe("ServiceReviewsInbox — mobile cards (brr-11)", () => {
  it("renders mobile card list alongside desktop table", () => {
    renderInbox([
      makeReview({
        id: "rev-mobile",
        patient_display_name: "Mobile Patient",
        reason_for_visit_preview: "Back pain",
      }),
    ]);

    expect(screen.getByTestId("review-mobile-list")).toBeInTheDocument();
    expect(screen.getByTestId("review-card-rev-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("review-desktop-table")).toBeInTheDocument();
  });

  it("opens drawer when tapping a mobile card body", () => {
    renderInbox([
      makeReview({
        id: "rev-mobile-tap",
        reason_for_visit_preview: "Mobile tap reason",
      }),
    ]);

    const card = screen.getByTestId("review-card-rev-mobile-tap");
    fireEvent.click(within(card).getByText("Mobile tap reason"));

    expect(screen.getByTestId("review-detail-sheet")).toBeInTheDocument();
  });

  it("does not open drawer when tapping mobile Confirm", () => {
    renderInbox([makeReview({ id: "rev-mobile-confirm" })]);

    const card = screen.getByTestId("review-card-rev-mobile-confirm");
    fireEvent.click(within(card).getByRole("button", { name: /^confirm$/i }));

    expect(screen.queryByTestId("review-detail-sheet")).not.toBeInTheDocument();
  });
});

describe("ServiceReviewsInbox — keyboard and bulk (brr-12)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bulk-confirm schedules one commit per selected row with a single batch toast", async () => {
    renderInbox([
      makeReview({ id: "rev-bulk-1", patient_display_name: "Bulk One" }),
      makeReview({ id: "rev-bulk-2", patient_display_name: "Bulk Two" }),
      makeReview({ id: "rev-bulk-3", patient_display_name: "Bulk Three" }),
    ]);

    fireEvent.click(screen.getAllByRole("checkbox", { name: /select review for bulk one/i })[0]);
    fireEvent.click(screen.getAllByRole("checkbox", { name: /select review for bulk two/i })[0]);
    fireEvent.click(screen.getAllByRole("checkbox", { name: /select review for bulk three/i })[0]);

    expect(screen.getByTestId("review-bulk-bar")).toHaveTextContent("3 selected");
    fireEvent.click(screen.getByRole("button", { name: /confirm selected/i }));

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/3 confirmed · undo/i)).toBeInTheDocument();
    expect(screen.queryByText("Bulk One")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_MS);
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledTimes(3);
  });

  it("bulk-confirm Undo cancels all pending commits before network calls", async () => {
    renderInbox([
      makeReview({ id: "rev-undo-1", patient_display_name: "Undo Bulk One" }),
      makeReview({ id: "rev-undo-2", patient_display_name: "Undo Bulk Two" }),
      makeReview({ id: "rev-undo-3", patient_display_name: "Undo Bulk Three" }),
    ]);

    for (const name of ["Undo Bulk One", "Undo Bulk Two", "Undo Bulk Three"]) {
      fireEvent.click(screen.getAllByRole("checkbox", { name: new RegExp(`select review for ${name}`, "i") })[0]);
    }

    fireEvent.click(screen.getByRole("button", { name: /confirm selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));

    const table = getDesktopTable();
    expect(within(table).getByText("Undo Bulk One")).toBeInTheDocument();
    expect(within(table).getByText("Undo Bulk Two")).toBeInTheDocument();
    expect(within(table).getByText("Undo Bulk Three")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_MS);
      await Promise.resolve();
    });

    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("bulk-confirm reconciles a 409 row while other rows still commit", async () => {
    mockConfirm.mockImplementation(async (_token, id) => {
      if (id === "rev-stale") {
        throw Object.assign(new Error("conflict"), { status: 409 });
      }
      return { data: { review: makeReview({ id }) } } as Awaited<
        ReturnType<typeof postConfirmServiceStaffReview>
      >;
    });

    renderInbox([
      makeReview({ id: "rev-stale", patient_display_name: "Stale Row" }),
      makeReview({ id: "rev-ok", patient_display_name: "Good Row" }),
    ]);

    fireEvent.click(
      screen.getAllByRole("checkbox", { name: /select review for stale row/i })[0]
    );
    fireEvent.click(
      screen.getAllByRole("checkbox", { name: /select review for good row/i })[0]
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm selected/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_MS);
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-stale", {});
    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-ok", {});
    expect(mockGet).toHaveBeenCalled();
  });
});

describe("ServiceReviewsInbox — Phase 3 integration gate (brr-13)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("confirm parity: desktop button, mobile card, keyboard c, and bulk use the same payload", async () => {
    const review = makeReview({ id: "rev-parity-one", patient_display_name: "Parity One" });
    renderInbox([review]);

    clickDesktopConfirm();
    await advanceDeferredConfirm();
    expect(mockConfirm).toHaveBeenLastCalledWith("test-token", "rev-parity-one", {});

    mockConfirm.mockClear();
    renderInbox([makeReview({ id: "rev-parity-card", patient_display_name: "Parity Card" })]);
    const card = screen.getByTestId("review-card-rev-parity-card");
    fireEvent.click(within(card).getByRole("button", { name: /^confirm$/i }));
    await advanceDeferredConfirm();
    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-parity-card", {});

    mockConfirm.mockClear();
    renderInbox([makeReview({ id: "rev-parity-kbd" })]);
    fireTriageKey("c");
    await advanceDeferredConfirm();
    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-parity-kbd", {});

    mockConfirm.mockClear();
    renderInbox([
      makeReview({ id: "rev-parity-bulk-1", patient_display_name: "Bulk A" }),
      makeReview({ id: "rev-parity-bulk-2", patient_display_name: "Bulk B" }),
    ]);
    fireEvent.click(
      screen.getAllByRole("checkbox", { name: /select review for bulk a/i })[0]
    );
    fireEvent.click(
      screen.getAllByRole("checkbox", { name: /select review for bulk b/i })[0]
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm selected/i }));
    await advanceDeferredConfirm();
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-parity-bulk-1", {});
    expect(mockConfirm).toHaveBeenCalledWith("test-token", "rev-parity-bulk-2", {});
  });

  it("keyboard Enter opens the drawer; keyboard r opens the reassign dialog", () => {
    renderInbox([
      makeReview({
        id: "rev-kbd-detail",
        reason_for_visit_preview: "Keyboard detail reason",
      }),
    ]);

    fireTriageKey("Enter");
    expect(screen.getByTestId("review-detail-sheet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    fireTriageKey("r");
    expect(screen.getByRole("dialog", { name: /reassign service/i })).toBeInTheDocument();
  });

  it("keyboard triage keys are ignored while typing or while the drawer is open", async () => {
    renderInbox([makeReview({ id: "rev-kbd-guard", reason_for_visit_preview: "Guard reason" })]);

    const search = screen.getByLabelText(/search/i);
    fireEvent.keyDown(search, { key: "c", bubbles: true });
    await advanceDeferredConfirm();
    expect(mockConfirm).not.toHaveBeenCalled();

    clickReviewReason("Guard reason");
    expect(screen.getByTestId("review-detail-sheet")).toBeInTheDocument();
    fireTriageKey("c");
    await advanceDeferredConfirm();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("bulk-confirm commits exactly N rows after the deferred window", async () => {
    renderInbox([
      makeReview({ id: "rev-commit-1", patient_display_name: "Commit One" }),
      makeReview({ id: "rev-commit-2", patient_display_name: "Commit Two" }),
      makeReview({ id: "rev-commit-3", patient_display_name: "Commit Three" }),
    ]);

    for (const name of ["Commit One", "Commit Two", "Commit Three"]) {
      fireEvent.click(
        screen.getAllByRole("checkbox", { name: new RegExp(`select review for ${name}`, "i") })[0]
      );
    }
    fireEvent.click(screen.getByRole("button", { name: /confirm selected/i }));
    expect(mockConfirm).not.toHaveBeenCalled();

    await advanceDeferredConfirm();
    expect(mockConfirm).toHaveBeenCalledTimes(3);
  });

  it("does not log PHI to console when rendering inbox and opening the drawer", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    renderInbox([
      makeReview({
        patient_display_name: "Secret Patient",
        reason_for_visit_preview: "Sensitive reason text",
        resolution_internal_note: "Internal audit note",
      }),
    ]);
    clickReviewReason("Sensitive reason text");

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
