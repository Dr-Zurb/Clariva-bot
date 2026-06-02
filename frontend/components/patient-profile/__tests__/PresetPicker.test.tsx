/**
 * PresetPicker — R-LAYOUT-UX tree preset menu (clpm-05).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import PresetPicker from "../PresetPicker";
import type { LayoutNode } from "@/lib/patient-profile/types";

const currentTree: LayoutNode = {
  kind: "split",
  direction: "horizontal",
  children: [
    { kind: "pane", paneId: "chart" },
    { kind: "pane", paneId: "body" },
  ],
  sizes: [50, 50],
};

function openDropdown() {
  const btn = screen.getByRole("button", { name: /layout/i });
  fireEvent.pointerDown(btn, { button: 0, bubbles: true, cancelable: true });
  fireEvent.click(btn);
}

describe("PresetPicker", () => {
  const onApplyPreset = vi.fn();
  const onSaveCurrentLayout = vi.fn();
  const onResetToTemplate = vi.fn();
  const onRestoreHiddenPane = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPicker(overrides: Partial<React.ComponentProps<typeof PresetPicker>> = {}) {
    render(
      <PresetPicker
        currentLayoutTree={currentTree}
        templatePaneIds={["chart", "body", "rx", "snapshot"]}
        paneTitleById={{
          chart: "Patient chart",
          body: "Consultation",
          rx: "Rx",
          snapshot: "Snapshot",
        }}
        customPresets={[]}
        customPresetsLoading={false}
        customPresetsError={false}
        atPresetCap={false}
        onApplyPreset={onApplyPreset}
        onSaveCurrentLayout={onSaveCurrentLayout}
        onResetToTemplate={onResetToTemplate}
        onRestoreHiddenPane={onRestoreHiddenPane}
        {...overrides}
      />,
    );
  }

  it("lists built-in and my presets sections", () => {
    renderPicker();
    openDropdown();
    expect(screen.getByText("Built-in")).toBeInTheDocument();
    expect(screen.getByText("My presets")).toBeInTheDocument();
    expect(screen.getByText("Telemed (Video)")).toBeInTheDocument();
  });

  it("calls onApplyPreset when a built-in is selected", () => {
    renderPicker();
    openDropdown();
    fireEvent.click(screen.getByText("Telemed (Voice)").closest("[role='menuitem']")!);
    expect(onApplyPreset).toHaveBeenCalledTimes(1);
    expect(onApplyPreset.mock.calls[0][0].id).toBe("builtin-telemed-voice");
  });

  it("hides save when at preset cap", () => {
    renderPicker({ atPresetCap: true });
    openDropdown();
    expect(screen.queryByText("Save current layout")).not.toBeInTheDocument();
  });

  it("lists hidden panes not in the current tree", () => {
    renderPicker();
    openDropdown();
    expect(screen.getByText("Hidden panes")).toBeInTheDocument();
    expect(screen.getByText(/Restore: Snapshot/)).toBeInTheDocument();
  });

  it("calls onRestoreHiddenPane when restore is selected", () => {
    renderPicker();
    openDropdown();
    fireEvent.click(screen.getByText(/Restore: Snapshot/).closest("[role='menuitem']")!);
    expect(onRestoreHiddenPane).toHaveBeenCalledWith("snapshot");
  });

  it("does not show rename/delete affordances when customizeMode is off", () => {
    renderPicker({
      customizeMode: false,
      customPresets: [
        {
          id: "custom-1",
          name: "My layout",
          createdAt: "2026-05-01T00:00:00.000Z",
          sourceTemplateId: "telemed-video",
          layoutTree: currentTree,
        },
      ],
      onDeletePreset: vi.fn(),
      onRenamePreset: vi.fn(),
    });
    openDropdown();
    expect(screen.queryByLabelText(/Rename My layout/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Delete My layout/i)).not.toBeInTheDocument();
  });

  it("shows rename/delete affordances when customizeMode is on", () => {
    renderPicker({
      customizeMode: true,
      customPresets: [
        {
          id: "custom-1",
          name: "My layout",
          createdAt: "2026-05-01T00:00:00.000Z",
          sourceTemplateId: "telemed-video",
          layoutTree: currentTree,
        },
      ],
      onDeletePreset: vi.fn(),
      onRenamePreset: vi.fn(),
    });
    openDropdown();
    expect(screen.getByLabelText("Rename My layout")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete My layout")).toBeInTheDocument();
  });

  it("calls onRenamePreset when rename is committed with Enter", () => {
    const onRenamePreset = vi.fn();
    renderPicker({
      customizeMode: true,
      customPresets: [
        {
          id: "custom-1",
          name: "My layout",
          createdAt: "2026-05-01T00:00:00.000Z",
          layoutTree: currentTree,
        },
      ],
      onRenamePreset,
    });
    openDropdown();
    fireEvent.click(screen.getByLabelText("Rename My layout"));
    const input = screen.getByDisplayValue("My layout");
    fireEvent.change(input, { target: { value: "Updated layout" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRenamePreset).toHaveBeenCalledWith("custom-1", "Updated layout");
  });

  it("calls onDeletePreset after two-click confirm", () => {
    const onDeletePreset = vi.fn();
    renderPicker({
      customizeMode: true,
      customPresets: [
        {
          id: "custom-1",
          name: "My layout",
          createdAt: "2026-05-01T00:00:00.000Z",
          layoutTree: currentTree,
        },
      ],
      onDeletePreset,
    });
    openDropdown();
    fireEvent.click(screen.getByLabelText("Delete My layout"));
    fireEvent.click(screen.getByLabelText("Confirm delete My layout"));
    expect(onDeletePreset).toHaveBeenCalledWith("custom-1");
  });
});
