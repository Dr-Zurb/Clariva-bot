/**
 * ibi-04: read-only conversation thread in Booking review detail.
 */

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  clearReviewThreadCacheForTests,
  ReviewConversationThread,
} from "@/components/service-reviews/ReviewConversationThread";
import { getInteractionMessages } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getInteractionMessages: vi.fn(),
}));

const mockGet = vi.mocked(getInteractionMessages);

beforeEach(() => {
  vi.clearAllMocks();
  clearReviewThreadCacheForTests();
});

describe("ReviewConversationThread", () => {
  it("renders messages from the API", async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: {
        messages: [
          {
            id: "m1",
            conversation_id: "conv-1",
            sender_type: "patient",
            content: "I need an appointment",
            intent: null,
            created_at: "2026-07-27T08:00:00.000Z",
          },
          {
            id: "m2",
            conversation_id: "conv-1",
            sender_type: "system",
            content: "Happy to help.",
            intent: null,
            created_at: "2026-07-27T08:00:01.000Z",
          },
        ],
      },
    } as Awaited<ReturnType<typeof getInteractionMessages>>);

    render(
      <ReviewConversationThread token="tok" conversationId="conv-1" />
    );

    expect(screen.getByTestId("review-thread-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("review-thread-list")).toBeInTheDocument();
    });

    expect(screen.getByText("I need an appointment")).toBeInTheDocument();
    expect(screen.getByText("Happy to help.")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("tok", "conv-1", { limit: 50 });
  });

  it("shows empty state when no messages", async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: { messages: [] },
    } as Awaited<ReturnType<typeof getInteractionMessages>>);

    render(
      <ReviewConversationThread token="tok" conversationId="conv-1" />
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-thread-empty")).toBeInTheDocument();
    });
  });

  it("shows patient-waiting when the last message is from the patient", async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: {
        messages: [
          {
            id: "m1",
            conversation_id: "conv-2",
            sender_type: "system",
            content: "Hi!",
            intent: null,
            created_at: "2026-07-27T08:00:00.000Z",
          },
          {
            id: "m2",
            conversation_id: "conv-2",
            sender_type: "patient",
            content: "hello?",
            intent: null,
            created_at: "2026-07-27T09:00:00.000Z",
          },
        ],
        hasMoreOlder: false,
      },
    } as Awaited<ReturnType<typeof getInteractionMessages>>);

    render(
      <ReviewConversationThread token="tok" conversationId="conv-2" />
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-thread-waiting")).toBeInTheDocument();
    });
    expect(screen.getByTestId("review-thread-day")).toBeInTheDocument();
  });
});
