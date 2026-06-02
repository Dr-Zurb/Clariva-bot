import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Beaker } from "lucide-react";
import { ChartRailEmptyState } from "../ChartRailEmptyState";
import {
  UnifiedChartRailEmptyState,
  type ChartRailEmptySignals,
} from "../UnifiedChartRailEmptyState";

describe("ChartRailEmptyState", () => {
  it("renders icon + headline", () => {
    render(<ChartRailEmptyState icon={Beaker} headline="No tests" />);
    expect(screen.getByText("No tests")).toBeInTheDocument();
  });

  it("renders CTA when provided and calls onClick", () => {
    const onClick = vi.fn();
    render(
      <ChartRailEmptyState
        icon={Beaker}
        headline="No tests"
        cta={{ label: "Add test", onClick }}
      />,
    );
    fireEvent.click(screen.getByText("Add test"));
    expect(onClick).toHaveBeenCalled();
  });

  it("omits CTA when prop absent", () => {
    render(<ChartRailEmptyState icon={Beaker} headline="No tests" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("UnifiedChartRailEmptyState", () => {
  const allEmpty: ChartRailEmptySignals = {
    allergiesEmpty: true,
    chronicEmpty: true,
    problemListEmpty: true,
    snapshotEmpty: true,
    historyEmpty: true,
  };

  it("renders unified card when all 5 signals are true", () => {
    render(<UnifiedChartRailEmptyState signals={allEmpty} />);
    expect(screen.getByText("No patient context yet")).toBeInTheDocument();
  });

  it("returns null when ANY signal is false", () => {
    const partialEmpty = { ...allEmpty, allergiesEmpty: false };
    const { container } = render(
      <UnifiedChartRailEmptyState signals={partialEmpty} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onAddPatientContext on CTA click", () => {
    const onAdd = vi.fn();
    render(
      <UnifiedChartRailEmptyState
        signals={allEmpty}
        onAddPatientContext={onAdd}
      />,
    );
    fireEvent.click(screen.getByText("Add patient context"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("CTA is absent when onAddPatientContext is undefined", () => {
    render(<UnifiedChartRailEmptyState signals={allEmpty} />);
    expect(screen.queryByText("Add patient context")).not.toBeInTheDocument();
  });
});
