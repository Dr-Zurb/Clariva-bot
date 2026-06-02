/**
 * ManagePresetsDialog — unit tests (Vitest + RTL).
 *
 * cc-10 acceptance criteria:
 *   - Rename inline → calls onRename with the new name.
 *   - Delete → confirms → calls onDelete with the preset id.
 *
 * Run: `pnpm --filter frontend vitest run components/consultation/cockpit/__tests__/ManagePresetsDialog`
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import ManagePresetsDialog from "../ManagePresetsDialog";
import type { CockpitLayoutPreset, CockpitLayout } from "@/components/consultation/cockpit/preset-types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DUMMY_LAYOUT: CockpitLayout = {
  slots: ["chart", "body", "rx"],
  widths: [26, 48, 26],
  collapsed: { chart: false, body: false, rx: false },
};

function makePreset(id: string, name: string): CockpitLayoutPreset {
  return { id, name, created_at: "2026-05-01T08:00:00.000Z", layout: DUMMY_LAYOUT };
}

const PRESETS: CockpitLayoutPreset[] = [
  makePreset("p1", "Morning OPD"),
  makePreset("p2", "Evening Rounds"),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ManagePresetsDialog", () => {
  it("renders the preset list", () => {
    render(
      <ManagePresetsDialog
        open
        onOpenChange={vi.fn()}
        presets={PRESETS}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Morning OPD")).toBeInTheDocument();
    expect(screen.getByText("Evening Rounds")).toBeInTheDocument();
  });

  it("shows empty state when presets is empty", () => {
    render(
      <ManagePresetsDialog
        open
        onOpenChange={vi.fn()}
        presets={[]}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText(/no saved presets/i)).toBeInTheDocument();
  });

  it("rename inline → calls onRename with the new name", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);

    render(
      <ManagePresetsDialog
        open
        onOpenChange={vi.fn()}
        presets={PRESETS}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );

    // Click the rename button for the first preset.
    const renameBtn = screen.getAllByLabelText(/rename preset/i)[0];
    fireEvent.click(renameBtn);

    // The input should appear with the current name.
    const input = screen.getByDisplayValue("Morning OPD");
    fireEvent.change(input, { target: { value: "Updated OPD" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith("p1", "Updated OPD");
    });
  });

  it("Escape in rename input cancels without calling onRename", async () => {
    const onRename = vi.fn();

    render(
      <ManagePresetsDialog
        open
        onOpenChange={vi.fn()}
        presets={PRESETS}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );

    const renameBtn = screen.getAllByLabelText(/rename preset/i)[0];
    fireEvent.click(renameBtn);

    const input = screen.getByDisplayValue("Morning OPD");
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape" });

    // The input should be gone; onRename should not have been called.
    await waitFor(() => {
      expect(screen.queryByDisplayValue("Changed")).not.toBeInTheDocument();
    });
    expect(onRename).not.toHaveBeenCalled();
  });

  it("delete → confirm → calls onDelete", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <ManagePresetsDialog
        open
        onOpenChange={vi.fn()}
        presets={PRESETS}
        onRename={vi.fn()}
        onDelete={onDelete}
      />,
    );

    // Click the delete icon for the second preset.
    const deleteBtn = screen.getAllByLabelText(/delete preset/i)[1];
    fireEvent.click(deleteBtn);

    // Confirm button appears.
    const yesBtn = screen.getByRole("button", { name: /yes/i });
    fireEvent.click(yesBtn);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("p2");
    });
  });

  it("delete → cancel → does NOT call onDelete", async () => {
    const onDelete = vi.fn();

    render(
      <ManagePresetsDialog
        open
        onOpenChange={vi.fn()}
        presets={PRESETS}
        onRename={vi.fn()}
        onDelete={onDelete}
      />,
    );

    const deleteBtn = screen.getAllByLabelText(/delete preset/i)[0];
    fireEvent.click(deleteBtn);

    const noBtn = screen.getByRole("button", { name: /no/i });
    fireEvent.click(noBtn);

    expect(onDelete).not.toHaveBeenCalled();
    // Should return to showing the rename/delete buttons.
    await waitFor(() => {
      expect(screen.getAllByLabelText(/delete preset/i)).toHaveLength(2);
    });
  });
});
