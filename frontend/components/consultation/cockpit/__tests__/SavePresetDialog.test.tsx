/**
 * SavePresetDialog — unit tests (Vitest + RTL).
 *
 * cc-10 acceptance criteria:
 *   - Submit button is disabled when name is empty.
 *   - Character counter updates as the user types.
 *   - Eviction warning only renders when `nextEvictionTarget` is non-null.
 *   - Submit calls `onSave(name, layout)` and closes the dialog on success.
 *
 * Run: `pnpm --filter frontend vitest run components/consultation/cockpit/__tests__/SavePresetDialog`
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import SavePresetDialog from "../SavePresetDialog";
import type { CockpitLayout, CockpitLayoutPreset } from "@/components/consultation/cockpit/preset-types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DUMMY_LAYOUT: CockpitLayout = {
  slots: ["chart", "body", "rx"],
  widths: [26, 48, 26],
  collapsed: { chart: false, body: false, rx: false },
};

const DUMMY_PRESET: CockpitLayoutPreset = {
  id: "p1",
  name: "Morning OPD",
  created_at: "2026-01-01T00:00:00.000Z",
  layout: DUMMY_LAYOUT,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SavePresetDialog", () => {
  it("submit button is disabled when name is empty", () => {
    render(
      <SavePresetDialog
        open
        onOpenChange={vi.fn()}
        currentLayout={DUMMY_LAYOUT}
        onSave={vi.fn()}
        nextEvictionTarget={null}
      />,
    );

    const submitBtn = screen.getByRole("button", { name: /save/i });
    expect(submitBtn).toBeDisabled();
  });

  it("character counter updates as the user types", () => {
    render(
      <SavePresetDialog
        open
        onOpenChange={vi.fn()}
        currentLayout={DUMMY_LAYOUT}
        onSave={vi.fn()}
        nextEvictionTarget={null}
      />,
    );

    const input = screen.getByLabelText(/preset name/i);
    expect(screen.getByText("0/60")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Morning OPD" } });
    expect(screen.getByText("11/60")).toBeInTheDocument();
  });

  it("eviction warning is NOT shown when nextEvictionTarget is null", () => {
    render(
      <SavePresetDialog
        open
        onOpenChange={vi.fn()}
        currentLayout={DUMMY_LAYOUT}
        onSave={vi.fn()}
        nextEvictionTarget={null}
      />,
    );

    expect(screen.queryByText(/evict/i)).not.toBeInTheDocument();
  });

  it("eviction warning IS shown when nextEvictionTarget is set", () => {
    render(
      <SavePresetDialog
        open
        onOpenChange={vi.fn()}
        currentLayout={DUMMY_LAYOUT}
        onSave={vi.fn()}
        nextEvictionTarget={DUMMY_PRESET}
      />,
    );

    expect(screen.getByText(/morning opd/i)).toBeInTheDocument();
    expect(screen.getByText(/evict & save/i)).toBeInTheDocument();
  });

  it("calls onSave with the typed name and layout, then closes the dialog", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <SavePresetDialog
        open
        onOpenChange={onOpenChange}
        currentLayout={DUMMY_LAYOUT}
        onSave={onSave}
        nextEvictionTarget={null}
      />,
    );

    const input = screen.getByLabelText(/preset name/i);
    fireEvent.change(input, { target: { value: "Evening OPD" } });

    const submitBtn = screen.getByRole("button", { name: /save/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("Evening OPD", DUMMY_LAYOUT);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows error message when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Server error"));

    render(
      <SavePresetDialog
        open
        onOpenChange={vi.fn()}
        currentLayout={DUMMY_LAYOUT}
        onSave={onSave}
        nextEvictionTarget={null}
      />,
    );

    const input = screen.getByLabelText(/preset name/i);
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });
});
