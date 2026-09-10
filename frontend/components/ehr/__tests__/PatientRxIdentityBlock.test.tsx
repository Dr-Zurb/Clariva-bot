import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientRxIdentityBlock } from "@/components/ehr/PatientRxIdentityBlock";

describe("PatientRxIdentityBlock", () => {
  it("renders an open letter identity and hides empty fields", () => {
    render(
      <PatientRxIdentityBlock
        fields={{
          patientName: "Jaimal Singh",
          patientAge: "50 y",
          patientGender: "male",
          visitDateLabel: "24 Aug 2026",
          patientPhone: "9915738699",
          guardianName: "Minder Singh",
          guardianRelation: "father",
        }}
      />,
    );

    expect(screen.getByText("Jaimal Singh")).toBeInTheDocument();
    expect(screen.getByText("50 y · M")).toBeInTheDocument();
    expect(screen.getByText("24 Aug 2026")).toBeInTheDocument();
    expect(screen.getByText(/9915738699/)).toBeInTheDocument();
    expect(screen.getByText(/s\/o Minder Singh/)).toBeInTheDocument();
    expect(screen.queryByText(/MRN/)).not.toBeInTheDocument();
    expect(screen.queryByText("Residence")).not.toBeInTheDocument();
  });

  it("puts name, age, and date on one line for compact", () => {
    const { container } = render(
      <PatientRxIdentityBlock
        preset="compact"
        fields={{
          patientName: "Jaimal Singh",
          patientAge: "50 y",
          patientGender: "male",
          visitDateLabel: "24 Aug 2026",
          patientPhone: "9915738699",
          address: "Buter Kalan, Amritsar",
        }}
      />,
    );

    expect(container.firstElementChild?.textContent).toMatch(
      /Jaimal Singh\s*·\s*50 y · M\s*·\s*24 Aug 2026/,
    );
    expect(container.firstElementChild?.textContent).toMatch(
      /9915738699\s+·\s+Buter Kalan/,
    );
  });

  it("renders hospital chart cells for the grid preset", () => {
    render(
      <PatientRxIdentityBlock
        preset="grid"
        fields={{
          patientName: "Jaimal Singh",
          patientAge: "50 y",
          patientGender: "male",
          visitDateLabel: "24 Aug 2026",
          patientPhone: "9915738699",
          guardianName: "Minder Singh",
          guardianRelation: "father",
          address: "Buter Kalan, Amritsar",
          medicalRecordNumber: "P-00042",
        }}
      />,
    );

    expect(screen.getByText(/MRN/)).toBeInTheDocument();
    expect(screen.getByText(/Name/)).toBeInTheDocument();
    expect(screen.getByText("Jaimal Singh")).toBeInTheDocument();
    expect(screen.getByText(/Address/)).toBeInTheDocument();
    expect(screen.getByText(/Relative/)).toBeInTheDocument();
    expect(screen.getByText(/s\/o Minder Singh/)).toBeInTheDocument();
  });

  it("leaves a gap after the grid chart without a second ruler", () => {
    const { container } = render(
      <PatientRxIdentityBlock
        compact
        preset="grid"
        fields={{
          patientName: "Jaimal Singh",
          medicalRecordNumber: "P-00042",
        }}
      />,
    );

    const table = container.firstElementChild;
    expect(table?.tagName).toBe("TABLE");
    expect(table).toHaveClass("mb-5");
    expect(table).not.toHaveClass("border-b");
  });

  it("makes a large patient name bigger than medium", () => {
    const { rerender } = render(
      <PatientRxIdentityBlock
        compact
        textSize="medium"
        fields={{ patientName: "Jaimal Singh" }}
      />,
    );
    const medium = Number.parseFloat(
      screen.getByText("Jaimal Singh").style.fontSize,
    );
    rerender(
      <PatientRxIdentityBlock
        compact
        textSize="large"
        fields={{ patientName: "Jaimal Singh" }}
      />,
    );
    expect(
      Number.parseFloat(screen.getByText("Jaimal Singh").style.fontSize),
    ).toBeGreaterThan(medium);
  });
});
