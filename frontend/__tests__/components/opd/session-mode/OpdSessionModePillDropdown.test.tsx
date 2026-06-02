/**
 * OpdSessionModePillDropdown — DL-12 / DL-14 / DL-15 (pdm-11).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom";

import { OpdSessionModePillDropdown } from "@/components/opd/session-mode/OpdSessionModePillDropdown";

const mockDialog = vi.fn();

vi.mock("@/components/opd/SessionModeConversionDialog", () => ({
  SessionModeConversionDialog: (props: {
    open: boolean;
    fromMode: string;
    toMode: string;
    source?: string;
    onConfirmed: () => void;
  }) => {
    mockDialog(props);
    if (!props.open) return null;
    return (
      <div data-testid="conversion-dialog">
        <span>
          {props.fromMode}→{props.toMode}:{props.source}
        </span>
        <button type="button" onClick={props.onConfirmed}>
          Mock confirm
        </button>
      </div>
    );
  },
}));

function renderPill(
  overrides: Partial<React.ComponentProps<typeof OpdSessionModePillDropdown>> = {}
) {
  const onConverted = vi.fn();
  const props = {
    token: "tok",
    date: "2026-05-20",
    mode: "slot" as const,
    modeChangeCount: 0,
    isPastDate: false,
    onConverted,
    ...overrides,
  };
  const view = render(<OpdSessionModePillDropdown {...props} />);
  return { ...view, onConverted, props };
}

function openModeDropdown() {
  const trigger = screen.getByRole("button", { name: /switch day mode/i });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  return trigger;
}

describe("OpdSessionModePillDropdown", () => {
  beforeEach(() => {
    mockDialog.mockClear();
  });

  it("renders a disabled pill on past dates without a mode menu", () => {
    renderPill({ isPastDate: true, date: "2026-05-01", mode: "queue" });
    expect(screen.getByText("Queue")).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("button", { name: /switch day mode/i })
    ).not.toBeInTheDocument();
  });

  it("opens dropdown with mode options and no DL-14 when change_count is 0", async () => {
    renderPill({ mode: "slot", modeChangeCount: 0 });
    openModeDropdown();
    expect(
      await screen.findByText(/Switch this day to/i)
    ).toBeInTheDocument();
    expect(screen.getByText("✓ Slot mode (current)")).toBeInTheDocument();
    expect(screen.getByText("Queue mode")).toBeInTheDocument();
    expect(
      screen.queryByText(/changed this day's mode/i)
    ).not.toBeInTheDocument();
  });

  it("shows DL-14 advisory when change_count >= 2", async () => {
    renderPill({ mode: "queue", modeChangeCount: 3 });
    openModeDropdown();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("3 times");
    expect(alert).toHaveTextContent(/re-notified each time/i);
  });

  it("opens conversion dialog with opd_tab source when switching modes", async () => {
    renderPill({ mode: "slot" });
    openModeDropdown();
    fireEvent.click(await screen.findByText("Queue mode"));
    expect(screen.getByTestId("conversion-dialog")).toBeInTheDocument();
    expect(screen.getByText("slot→queue:opd_tab")).toBeInTheDocument();
    expect(mockDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        fromMode: "slot",
        toMode: "queue",
        source: "opd_tab",
        open: true,
      })
    );
  });

  it("calls onConverted when the dialog confirms", async () => {
    const { onConverted } = renderPill({ mode: "slot" });
    openModeDropdown();
    fireEvent.click(await screen.findByText("Queue mode"));
    fireEvent.click(screen.getByRole("button", { name: "Mock confirm" }));
    expect(onConverted).toHaveBeenCalledTimes(1);
  });

  it("does not open dialog when selecting the current mode item", async () => {
    renderPill({ mode: "slot" });
    openModeDropdown();
    const menu = await screen.findByRole("menu");
    const currentItem = within(menu).getByText("✓ Slot mode (current)");
    expect(currentItem).toHaveAttribute("data-disabled");
    fireEvent.click(currentItem);
    expect(screen.queryByTestId("conversion-dialog")).not.toBeInTheDocument();
  });
});
