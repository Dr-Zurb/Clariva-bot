/**
 * PaneHeader — unit tests (Vitest + RTL) — cpv-05 column header unification
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PaneHeader from "../PaneHeader";

describe("PaneHeader (cpv-05)", () => {
  it("renders title", () => {
    render(<PaneHeader title="Snapshot" />);
    expect(screen.getByText("Snapshot")).toBeInTheDocument();
  });

  it("renders actions when provided", () => {
    render(
      <PaneHeader
        title="Snapshot"
        actions={<button aria-label="Collapse">▼</button>}
      />,
    );
    expect(screen.getByLabelText("Collapse")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<PaneHeader title="History" subtitle="Last visit 12 Mar" />);
    expect(screen.getByText("Last visit 12 Mar")).toBeInTheDocument();
  });

  it("applies the unified border + bg classes", () => {
    const { container } = render(<PaneHeader title="X" />);
    const header = container.firstChild as HTMLElement;
    expect(header.className).toMatch(/border-b/);
    expect(header.className).toMatch(/bg-card/);
    expect(header.className).toMatch(/border-border/);
  });

  it("renders a <header> element as root", () => {
    render(<PaneHeader title="Patient chart" />);
    expect(document.querySelector("header")).not.toBeNull();
  });

  it("sets id on the <h3> when titleId is provided", () => {
    render(<PaneHeader title="Patient chart" titleId="chart-title" />);
    const heading = screen.getByText("Patient chart");
    expect(heading.tagName).toBe("H3");
    expect(heading).toHaveAttribute("id", "chart-title");
  });

  it("does NOT set id on the <h3> when titleId is omitted", () => {
    render(<PaneHeader title="Consultation" />);
    const heading = screen.getByText("Consultation");
    expect(heading).not.toHaveAttribute("id");
  });

  it("applies the truncate class to the <h3>", () => {
    render(<PaneHeader title="A very long column title that could overflow" />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.className).toContain("truncate");
  });

  it("does NOT render actions container when actions is omitted", () => {
    const { container } = render(<PaneHeader title="Patient chart" />);
    const titleRow = container.querySelector("header > div");
    expect(titleRow?.children).toHaveLength(1);
  });

  it("renders dragHandle slot when provided", () => {
    render(
      <PaneHeader
        title="Patient chart"
        dragHandle={<span data-testid="drag-handle">⠿</span>}
      />,
    );
    expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
  });

  it("renders dragHandle to the left of the title (before the <h3> in the DOM)", () => {
    const { container } = render(
      <PaneHeader
        title="Patient chart"
        dragHandle={<span data-testid="drag-handle">⠿</span>}
      />,
    );
    const titleGroup = container.querySelector("header > div > div");
    const children = Array.from(titleGroup?.children ?? []);
    const dragHandleIdx = children.findIndex(
      (el) => el.getAttribute("data-testid") === "drag-handle",
    );
    const h3Idx = children.findIndex((el) => el.tagName === "H3");
    expect(dragHandleIdx).toBeLessThan(h3Idx);
  });

  it("passes className to the outer <header>", () => {
    render(<PaneHeader title="Patient chart" className="extra-class" />);
    const header = document.querySelector("header");
    expect(header?.className).toContain("extra-class");
  });

  it("sets data-cockpit-pane-id when paneId is provided", () => {
    render(<PaneHeader title="History" paneId="history" />);
    const header = document.querySelector("header");
    expect(header).toHaveAttribute("data-cockpit-pane-id", "history");
  });
});
