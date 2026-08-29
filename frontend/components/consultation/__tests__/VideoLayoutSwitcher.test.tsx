import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import VideoLayoutSwitcher from "../VideoLayoutSwitcher";

describe("VideoLayoutSwitcher", () => {
  it("marks cockpit tone on the group and uses icon-only active segment", () => {
    render(
      <VideoLayoutSwitcher
        value="speaker"
        onChange={vi.fn()}
        tone="cockpit"
      />,
    );

    const group = screen.getByRole("group", { name: "Video layout" });
    expect(group).toHaveAttribute("data-tone", "cockpit");
    expect(group.className).toMatch(/rounded-full/);
    expect(group.className).toMatch(/bg-muted\/60/);
    expect(group.className).toMatch(/p-0\.5/);

    const speaker = screen.getByRole("button", {
      name: /Switch to Speaker layout/i,
    });
    expect(speaker).toHaveAttribute("aria-pressed", "true");
    expect(speaker.className).toMatch(/bg-background/);
    expect(speaker.className).toMatch(/h-7/);
    expect(speaker.className).not.toMatch(/bg-blue-50/);
    // Visible label is screen-reader only in cockpit.
    expect(speaker.querySelector(".sr-only")?.textContent).toBe("Speaker");
  });

  it("stacks cockpit segments vertically for a narrow pane", () => {
    render(
      <VideoLayoutSwitcher
        value="sidebar"
        onChange={vi.fn()}
        tone="cockpit"
        orientation="vertical"
      />,
    );
    const group = screen.getByRole("group", { name: "Video layout" });
    expect(group).toHaveAttribute("data-orientation", "vertical");
    expect(group.className).toMatch(/flex-col/);
    expect(group.className).toMatch(/w-8/);
  });

  it("keeps blue active segment for default (join) tone", () => {
    render(
      <VideoLayoutSwitcher value="speaker" onChange={vi.fn()} tone="default" />,
    );

    const speaker = screen.getByRole("button", {
      name: /Switch to Speaker layout/i,
    });
    expect(speaker.className).toMatch(/bg-blue-50/);
  });
});
