import type { ReactNode } from "react";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { PastSurgicalHistoryField } from "@/components/cockpit/rx/subjective/PastSurgicalHistoryField";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import type { PastSurgicalHistoryStructured } from "@/lib/cockpit/past-surgical-history";

/**
 * The field embeds the (p6) SubjectiveSectionTemplateButton, which calls
 * useRxForm(). Provide a minimal RxFormProvider so the field can render in
 * isolation; the field's own value/onChange props drive the assertions.
 */
function RxFormTestWrapper({ children }: { children: ReactNode }) {
  const prescriptionIdRef = useRef<string | null>("rx-test");
  return (
    <RxFormProvider
      appointmentId="appt-test"
      patientId="pat-test"
      token="test-token"
      entryMode="structured"
      initialFields={createEmptyRxFormFields()}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {children}
    </RxFormProvider>
  );
}

function render(ui: Parameters<typeof rtlRender>[0]) {
  return rtlRender(ui, { wrapper: RxFormTestWrapper });
}

describe("PastSurgicalHistoryField", () => {
  it("renders none chip and quick-add when expanded", () => {
    function Harness() {
      const [value, setValue] = useState<PastSurgicalHistoryStructured>({});
      return <PastSurgicalHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Past surgical history" }));
    expect(screen.getByTestId("past-surgical-none")).toBeInTheDocument();
    expect(screen.getByTestId("past-surgical-quick-add")).toBeInTheDocument();
    expect(screen.getByTestId("past-surgical-notes")).toBeInTheDocument();
  });

  it("selects none and hides procedure rows and section notes", () => {
    function Harness() {
      const [value, setValue] = useState<PastSurgicalHistoryStructured>({});
      return <PastSurgicalHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Past surgical history" }));
    fireEvent.click(screen.getByRole("button", { name: "None prior" }));
    expect(screen.queryByTestId("past-surgical-procedure-rows")).not.toBeInTheDocument();
    expect(screen.queryByTestId("past-surgical-notes")).not.toBeInTheDocument();
  });

  it("adds a procedure via quick-add chip", () => {
    function Harness() {
      const [value, setValue] = useState<PastSurgicalHistoryStructured>({});
      return <PastSurgicalHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Past surgical history" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Appendectomy" }));
    expect(screen.getByTestId("past-surgical-procedure-rows")).toBeInTheDocument();
    expect(screen.getByText("Appendectomy")).toBeInTheDocument();
  });

  it("sets ago value and unit on a procedure row", () => {
    function Harness() {
      const [value, setValue] = useState<PastSurgicalHistoryStructured>({
        procedures: [{ id: "psh-1", procedure: "appendectomy" }],
      });
      return <PastSurgicalHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.change(screen.getByTestId("past-surgical-ago-value-psh-1"), {
      target: { value: "5" },
    });
    expect(screen.getByTestId("past-surgical-ago-value-psh-1")).toHaveValue(5);
    expect(screen.getByTestId("past-surgical-ago-unit-psh-1")).toHaveValue("years");
  });

  it("saves additional notes into structured state", () => {
    function Harness() {
      const [value, setValue] = useState<PastSurgicalHistoryStructured>({});
      return <PastSurgicalHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Past surgical history" }));
    fireEvent.change(screen.getByTestId("past-surgical-notes"), {
      target: { value: "Surgery abroad in 2015" },
    });
    expect(screen.getByDisplayValue("Surgery abroad in 2015")).toBeInTheDocument();
  });
});
