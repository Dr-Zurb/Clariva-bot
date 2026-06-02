/**
 * SideSheetHost — unit tests (Vitest + RTL).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import SideSheetHost, { useSideSheet } from "@/components/patient-profile/SideSheetHost";

function Opener() {
  const { open, close, register } = useSideSheet();
  React.useEffect(() => {
    return register({
      id: "registered",
      title: "Registered",
      widthPct: 35,
      render: () => <p>Registered body</p>,
    });
  }, [register]);
  return (
    <div>
      <button type="button" onClick={() => open({ id: "a", title: "Sheet A", content: <p>Body A</p> })}>
        Open A
      </button>
      <button
        type="button"
        onClick={() =>
          open({ id: "b", title: "Sheet B", content: <p>Body B</p>, defaultWidth: 400 })
        }
      >
        Open B
      </button>
      <button type="button" onClick={() => open("registered")}>
        Open registered
      </button>
      <button type="button" onClick={() => close()}>
        Close
      </button>
    </div>
  );
}

describe("SideSheetHost", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
    );
  });

  it("opens sheet, dismisses via backdrop and Esc", () => {
    render(
      <SideSheetHost>
        <Opener />
      </SideSheetHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open A" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sheet A")).toBeInTheDocument();
    expect(screen.getByText("Body A")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close side sheet"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open A" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("replaces the active sheet on second open", () => {
    render(
      <SideSheetHost>
        <Opener />
      </SideSheetHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open A" }));
    fireEvent.click(screen.getByRole("button", { name: "Open B" }));

    expect(screen.getByText("Sheet B")).toBeInTheDocument();
    expect(screen.queryByText("Body A")).not.toBeInTheDocument();
    expect(screen.getByText("Body B")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("opens a registered anchor by id", () => {
    render(
      <SideSheetHost>
        <Opener />
      </SideSheetHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open registered" }));
    expect(screen.getByText("Registered")).toBeInTheDocument();
    expect(screen.getByText("Registered body")).toBeInTheDocument();
  });
});
