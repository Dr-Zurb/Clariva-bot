import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AllergyCard } from "@/components/ehr/chart/AllergyCard";
import type { PatientAllergy } from "@/types/patient-chart";

const baseAllergy: PatientAllergy = {
  id: "allergy-1",
  doctor_id: "doc-1",
  patient_id: "pat-1",
  allergen: "Penicillin",
  severity: "unknown",
  reaction: null,
  note: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("AllergyCard", () => {
  it("renders collapsed summary by default", () => {
    render(
      <AllergyCard
        allergy={baseAllergy}
        defaultCollapsed
        onPatch={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId("allergy-summary-allergy-1")).toBeInTheDocument();
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unknown" })).not.toBeInTheDocument();
  });

  it("renders temp allergy as collapsed summary with enabled severity chips", () => {
    const onPatch = vi.fn();
    const tempAllergy: PatientAllergy = { ...baseAllergy, id: "temp-123" };
    render(
      <AllergyCard
        allergy={tempAllergy}
        defaultCollapsed
        onPatch={onPatch}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId("allergy-summary-temp-123")).toBeInTheDocument();
    expect(screen.queryByTestId("allergy-card-temp-123")).not.toBeInTheDocument();
    expect(screen.getByTestId("allergy-severity-temp-123")).toBeInTheDocument();
    expect(screen.getByTestId("allergy-severity-temp-123-mild")).toBeEnabled();
    fireEvent.click(screen.getByTestId("allergy-severity-temp-123-severe"));
    expect(onPatch).toHaveBeenCalledWith({ severity: "severe" });
    fireEvent.click(screen.getByTestId("allergy-summary-temp-123"));
    expect(screen.queryByTestId("allergy-card-temp-123")).not.toBeInTheDocument();
  });

  it("expands to show collapse header, severity, and reaction fields", () => {
    render(
      <AllergyCard
        allergy={baseAllergy}
        defaultCollapsed
        onPatch={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("allergy-summary-allergy-1"));
    expect(screen.getByTestId("allergy-card-allergy-1")).toBeInTheDocument();
    expect(screen.getByTestId("allergy-collapse-header-allergy-1")).toBeInTheDocument();
    expect(screen.getByTestId("allergy-severity-allergy-1")).toBeInTheDocument();
    expect(screen.getByTestId("allergy-reaction-allergy-1")).toBeInTheDocument();
    expect(screen.getByTestId("allergy-reaction-quick-add-allergy-1")).toBeInTheDocument();
  });

  it("collapses when the expanded header is clicked", () => {
    render(
      <AllergyCard
        allergy={baseAllergy}
        defaultCollapsed
        onPatch={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("allergy-summary-allergy-1"));
    const header = screen.getByTestId("allergy-collapse-header-allergy-1");
    fireEvent.click(header.querySelector("button")!);
    expect(screen.getByTestId("allergy-summary-allergy-1")).toBeInTheDocument();
    expect(screen.queryByTestId("allergy-card-allergy-1")).not.toBeInTheDocument();
  });

  it("updates severity from chip toggle", () => {
    const onPatch = vi.fn();
    render(
      <AllergyCard
        allergy={baseAllergy}
        defaultCollapsed={false}
        onPatch={onPatch}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("allergy-severity-allergy-1-severe"));
    expect(onPatch).toHaveBeenCalledWith({ severity: "severe" });
  });

  it("appends reaction from quick-add chip", () => {
    const onPatch = vi.fn();
    render(
      <AllergyCard
        allergy={baseAllergy}
        defaultCollapsed={false}
        onPatch={onPatch}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Rash" }));
    expect(onPatch).toHaveBeenCalledWith({ reaction: "Rash" });
  });

  it("commits reaction on blur", () => {
    const onPatch = vi.fn();
    render(
      <AllergyCard
        allergy={baseAllergy}
        defaultCollapsed={false}
        onPatch={onPatch}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("allergy-reaction-allergy-1"), {
      target: { value: "Rash" },
    });
    fireEvent.blur(screen.getByTestId("allergy-reaction-allergy-1"));
    expect(onPatch).toHaveBeenCalledWith({ reaction: "Rash" });
  });
});
