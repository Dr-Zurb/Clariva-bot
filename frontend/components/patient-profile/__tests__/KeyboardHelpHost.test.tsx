/**
 * KeyboardHelpHost + KeyboardHelpDialog — unit tests (Vitest + RTL).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import KeyboardHelpHost from "@/components/patient-profile/KeyboardHelpHost";
import { registerCommand } from "@/lib/patient-profile/command-registry";

describe("KeyboardHelpHost", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
    vi.clearAllMocks();
  });

  it("opens help dialog on ? when focus is not in a text input", () => {
    cleanups.push(
      registerCommand({
        id: "send-rx",
        label: "Send Rx & finish",
        shortcutHint: "Ctrl/Cmd+Enter",
        group: "Plan",
        action: vi.fn(),
      }),
    );

    render(
      <div>
        <button type="button">Outside</button>
        <KeyboardHelpHost />
      </div>,
    );

    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();

    fireEvent.keyDown(window, { key: "?", bubbles: true });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Send Rx & finish")).toBeInTheDocument();
    expect(screen.getByText("Ctrl/Cmd+Enter")).toBeInTheDocument();
  });

  it("does not open on ? when a textarea has focus", () => {
    render(
      <div>
        <textarea aria-label="Notes" />
        <KeyboardHelpHost />
      </div>,
    );

    const textarea = screen.getByLabelText("Notes");
    textarea.focus();

    fireEvent.keyDown(textarea, { key: "?", bubbles: true });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
