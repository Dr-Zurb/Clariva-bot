/**
 * `<CustomizeBar>` — unit tests (Vitest + RTL).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CustomizeBar from "../CustomizeBar";

describe("<CustomizeBar>", () => {
  const onSaveCurrentLayout = vi.fn().mockResolvedValue(undefined);
  const onResetToDefault = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderBar(
    overrides: Partial<React.ComponentProps<typeof CustomizeBar>> = {},
  ) {
    render(
      <CustomizeBar
        presetCount={2}
        atPresetCap={false}
        onSaveCurrentLayout={onSaveCurrentLayout}
        onResetToDefault={onResetToDefault}
        {...overrides}
      />,
    );
  }

  it("disables Save when the name input is empty", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /save preset/i })).toBeDisabled();
  });

  it("disables Save when at the preset cap", () => {
    renderBar({ atPresetCap: true, presetCount: 5 });
    expect(screen.getByRole("button", { name: /save preset/i })).toBeDisabled();
    expect(screen.getByPlaceholderText("Preset limit reached (5/5)")).toBeDisabled();
  });

  it("shows the N/5 preset count hint", () => {
    renderBar({ presetCount: 3 });
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("calls onSaveCurrentLayout with a trimmed name when Save is clicked", async () => {
    renderBar();
    fireEvent.change(screen.getByPlaceholderText("Name this layout…"), {
      target: { value: "  My layout  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save preset/i }));

    await waitFor(() => {
      expect(onSaveCurrentLayout).toHaveBeenCalledWith("My layout");
    });
    expect(screen.getByPlaceholderText("Name this layout…")).toHaveValue("");
  });

  it("calls onSaveCurrentLayout when Enter is pressed in the name input", async () => {
    renderBar();
    const input = screen.getByPlaceholderText("Name this layout…");
    fireEvent.change(input, { target: { value: "Quick save" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSaveCurrentLayout).toHaveBeenCalledWith("Quick save");
    });
  });

  it("Reset to default is always enabled and calls onResetToDefault", () => {
    renderBar({ atPresetCap: true, presetCount: 5 });
    const resetBtn = screen.getByRole("button", { name: /reset to default/i });
    expect(resetBtn).toBeEnabled();
    fireEvent.click(resetBtn);
    expect(onResetToDefault).toHaveBeenCalledTimes(1);
  });

  it("renders warningSlot when provided", () => {
    renderBar({
      warningSlot: <span data-testid="cramped-warning">Cramped layout</span>,
    });
    expect(screen.getByTestId("cramped-warning")).toBeInTheDocument();
  });
});
