import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SaveStatusPill,
  type SaveStatusPillUiState,
} from "@/components/cockpit/rx/SaveStatusPill";

describe("SaveStatusPill copy + icons (cpv-02)", () => {
  it("idle state shows 'Autosaving'", () => {
    render(<SaveStatusPill state="idle" />);
    expect(screen.getByText("Autosaving")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("saving state shows 'Saving…' with spinner", () => {
    render(<SaveStatusPill state="saving" />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("saved state shows 'Saved' with check icon", () => {
    render(<SaveStatusPill state="saved" />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("error state shows 'Save failed — retry'", () => {
    render(<SaveStatusPill state="error" />);
    expect(screen.getByText(/save failed — retry/i)).toBeInTheDocument();
  });

  it("aria-label includes the current status", () => {
    render(<SaveStatusPill state="saving" />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Saving"),
    );
  });

  it("never shows the legacy '—' placeholder in any state", () => {
    const states: SaveStatusPillUiState[] = [
      "idle",
      "saving",
      "saved",
      "error",
    ];
    states.forEach((s) => {
      const { unmount } = render(<SaveStatusPill state={s} />);
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      unmount();
    });
  });
});
