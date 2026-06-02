/**
 * text-B7 — PinnedMessagesBanner tests.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PinnedMessagesBanner } from "@/components/consultation/PinnedMessagesBanner";
import type { ConsultationMessage } from "@/lib/text/types";

function pinnedMessage(
  id: string,
  body: string,
  pinnedAt: string,
): ConsultationMessage {
  return {
    id,
    sessionId: "sess-1",
    senderId: "doc-1",
    senderRole: "doctor",
    body,
    createdAt: "2026-04-28T10:00:00.000Z",
    kind: "text",
    pinned_at: pinnedAt,
    pinned_by: "doc-1",
  };
}

describe("PinnedMessagesBanner", () => {
  it("renders collapsed count and expands to show pinned rows", () => {
    const onJumpToPin = vi.fn();
    render(
      <PinnedMessagesBanner
        pinned={[
          pinnedMessage("m1", "Take **500mg** twice daily", "2026-04-28T11:00:00.000Z"),
          pinnedMessage("m2", "Return if fever persists", "2026-04-28T10:30:00.000Z"),
        ]}
        currentUserRole="patient"
        layout="standalone"
        onJumpToPin={onJumpToPin}
      />,
    );

    expect(screen.getByText("📌 2 pinned")).toBeInTheDocument();
    expect(screen.queryByText(/500mg/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /2 pinned/i }));

    const jumpButton = screen.getByRole("button", {
      name: /Jump to pinned message: Take \*\*500mg\*\* twice daily/i,
    });
    expect(jumpButton).toBeInTheDocument();
    fireEvent.click(jumpButton);
    expect(onJumpToPin).toHaveBeenCalledWith("m1");
  });

  it("calls onUnpin for doctor long-press / desktop unpin control", () => {
    const onUnpin = vi.fn();
    render(
      <PinnedMessagesBanner
        pinned={[pinnedMessage("m1", "Red-flag symptoms", "2026-04-28T11:00:00.000Z")]}
        currentUserRole="doctor"
        layout="canvas"
        onJumpToPin={vi.fn()}
        onUnpin={onUnpin}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /1 pinned/i }));
    fireEvent.click(screen.getByRole("button", { name: "Unpin message" }));
    expect(onUnpin).toHaveBeenCalledWith("m1");
  });
});
