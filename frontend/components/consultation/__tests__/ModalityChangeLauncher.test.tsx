import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ModalityChangeLauncher from "../ModalityChangeLauncher";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock("@/lib/api/modality-change", () => ({
  getModalityChangeState: vi.fn(),
}));

import { getModalityChangeState } from "@/lib/api/modality-change";

describe("ModalityChangeLauncher", () => {
  beforeEach(() => {
    vi.mocked(getModalityChangeState).mockReset();
    vi.mocked(getModalityChangeState).mockResolvedValue({
      state: {
        currentModality: "video",
        upgradeCount: 0,
        downgradeCount: 0,
        activePendingRequest: null,
      },
    } as Awaited<ReturnType<typeof getModalityChangeState>>);
  });

  it("hides the bordered trigger in menu mode and opens a portaled panel", async () => {
    const onOpenChange = vi.fn();
    const onAvailabilityChange = vi.fn();

    const { rerender } = render(
      <ModalityChangeLauncher
        sessionId="sess-1"
        token="tok"
        userRole="doctor"
        triggerVariant="none"
        open={false}
        onOpenChange={onOpenChange}
        onAvailabilityChange={onAvailabilityChange}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Change modality/i }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(onAvailabilityChange).toHaveBeenCalled();
    });

    rerender(
      <ModalityChangeLauncher
        sessionId="sess-1"
        token="tok"
        userRole="doctor"
        triggerVariant="none"
        open
        onOpenChange={onOpenChange}
        onAvailabilityChange={onAvailabilityChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("modality-change-options")).toBeInTheDocument();
    });
    expect(screen.getByTestId("modality-change-options").parentElement).toBe(
      document.body,
    );
    expect(screen.getByText(/Downgrade to/i)).toBeInTheDocument();
  });

  it("still renders the default bordered button for text / legacy mounts", async () => {
    render(
      <ModalityChangeLauncher
        sessionId="sess-1"
        token="tok"
        userRole="doctor"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Change modality/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Change modality/i }));
    expect(screen.getByTestId("modality-change-options")).toBeInTheDocument();
  });
});
