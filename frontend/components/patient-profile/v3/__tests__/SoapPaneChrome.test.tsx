import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SoapPaneChromePortal,
  SoapPaneChromeProvider,
  SoapPaneChromeSlot,
} from "../SoapPaneChrome";

describe("SoapPaneChrome (ckd-12)", () => {
  it("keeps children in-flow when there is no host slot", () => {
    render(
      <div data-testid="body">
        <SoapPaneChromePortal>
          <button type="button">Expand all</button>
        </SoapPaneChromePortal>
      </div>
    );
    expect(screen.getByTestId("body")).toHaveTextContent("Expand all");
  });

  it("portals children into the tab-strip slot", () => {
    render(
      <SoapPaneChromeProvider>
        <div data-testid="strip">
          <SoapPaneChromeSlot />
        </div>
        <div data-testid="body">
          <SoapPaneChromePortal>
            <button type="button">Expand all</button>
          </SoapPaneChromePortal>
        </div>
      </SoapPaneChromeProvider>
    );
    const slot = screen.getByTestId("soap-pane-chrome-slot");
    expect(slot).toHaveTextContent("Expand all");
    expect(screen.getByTestId("body")).not.toHaveTextContent("Expand all");
    expect(screen.getByTestId("strip")).toContainElement(slot);
  });
});
