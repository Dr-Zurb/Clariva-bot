/**
 * CommandBar — unit tests (Vitest + RTL).
 *
 * Run: `pnpm --filter frontend test components/patient-profile/__tests__/CommandBar.test.tsx`
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import CommandBar from "@/components/patient-profile/CommandBar";
import { registerCommand } from "@/lib/patient-profile/command-registry";

function openPalette(): void {
  fireEvent.keyDown(window, {
    key: "k",
    ctrlKey: true,
    bubbles: true,
  });
}

describe("CommandBar", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
    vi.clearAllMocks();
  });

  it('typing "send" matches Send Rx command; Enter executes and closes dialog', async () => {
    const action = vi.fn();
    cleanups.push(
      registerCommand({
        id: "send-rx",
        label: "Send Rx & finish",
        keywords: ["send", "finish"],
        group: "Plan",
        action,
      }),
    );

    render(<CommandBar />);
    openPalette();

    expect(await screen.findByPlaceholderText(/type a command/i)).toBeInTheDocument();
    expect(screen.getByText("Send Rx & finish")).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/type a command/i);
    fireEvent.change(input, { target: { value: "send" } });

    fireEvent.click(screen.getByText("Send Rx & finish"));

    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();
  });
});
