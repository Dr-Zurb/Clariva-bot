import type { ReactNode } from "react";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { FamilyHistoryField } from "@/components/cockpit/rx/subjective/FamilyHistoryField";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import type { FamilyHistoryStructured } from "@/lib/cockpit/family-history";

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

describe("FamilyHistoryField", () => {
  it("renders add-relative chips when expanded", () => {
    function Harness() {
      const [value, setValue] = useState<FamilyHistoryStructured>({});
      return <FamilyHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Family history" }));
    expect(screen.getByTestId("family-history-add-father")).toBeInTheDocument();
    expect(screen.getByTestId("family-history-notes")).toBeInTheDocument();
  });

  it("selects none and hides relative rows and section notes", () => {
    function Harness() {
      const [value, setValue] = useState<FamilyHistoryStructured>({});
      return <FamilyHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Family history" }));
    fireEvent.click(screen.getByRole("button", { name: "None significant" }));
    expect(screen.queryByTestId("family-history-add-father")).not.toBeInTheDocument();
    expect(screen.queryByTestId("family-history-notes")).not.toBeInTheDocument();
  });

  it("saves additional notes into structured state", () => {
    function Harness() {
      const [value, setValue] = useState<FamilyHistoryStructured>({});
      return <FamilyHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Family history" }));
    fireEvent.change(screen.getByTestId("family-history-notes"), {
      target: { value: "Consanguinity — first cousins" },
    });
    expect(screen.getByDisplayValue("Consanguinity — first cousins")).toBeInTheDocument();
  });

  it("adds father card and condition via combobox", () => {
    function Harness() {
      const [value, setValue] = useState<FamilyHistoryStructured>({});
      return <FamilyHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Family history" }));
    fireEvent.click(screen.getByTestId("family-history-add-father"));
    expect(screen.getByTestId("family-history-card-father")).toBeInTheDocument();

    const combobox = screen.getByTestId("family-history-condition-combobox-father");
    fireEvent.focus(combobox);
    fireEvent.click(screen.getByRole("option", { name: "Hypertension" }));

    expect(screen.getByTestId(/family-history-entry-father-/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Note (optional)")).toBeInTheDocument();
  });

  it("adds custom condition when Enter is pressed on unmatched text", () => {
    function Harness() {
      const [value, setValue] = useState<FamilyHistoryStructured>({});
      return <FamilyHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Family history" }));
    fireEvent.click(screen.getByTestId("family-history-add-father"));

    const combobox = screen.getByTestId("family-history-condition-combobox-father");
    fireEvent.change(combobox, { target: { value: "hemophilia" } });
    fireEvent.keyDown(combobox, { key: "Enter" });

    expect(screen.getByDisplayValue("hemophilia")).toBeInTheDocument();
  });

  it("resolves synonym to catalog condition on Enter", () => {
    function Harness() {
      const [value, setValue] = useState<FamilyHistoryStructured>({});
      return <FamilyHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Family history" }));
    fireEvent.click(screen.getByTestId("family-history-add-father"));

    const combobox = screen.getByTestId("family-history-condition-combobox-father");
    fireEvent.change(combobox, { target: { value: "diabetes" } });
    fireEvent.keyDown(combobox, { key: "Enter" });

    expect(screen.getByText("Diabetes mellitus")).toBeInTheDocument();
  });

  it("allows adding multiple sibling cards", () => {
    function Harness() {
      const [value, setValue] = useState<FamilyHistoryStructured>({});
      return <FamilyHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Family history" }));
    fireEvent.click(screen.getByTestId("family-history-add-sibling"));
    fireEvent.click(screen.getByTestId("family-history-add-sibling"));

    expect(screen.getAllByText("Sibling", { selector: "span.text-xs.font-semibold" })).toHaveLength(2);
    expect(screen.getAllByTestId(/^family-history-card-sibling-/)).toHaveLength(2);
  });

  it("shows other relative card when add chip is clicked", () => {
    function Harness() {
      const [value, setValue] = useState<FamilyHistoryStructured>({});
      return <FamilyHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Family history" }));
    fireEvent.click(screen.getByTestId("family-history-add-other-relative"));
    expect(screen.getByTestId("family-history-card-other-relative")).toBeInTheDocument();
    expect(screen.getByTestId("family-history-other")).toBeInTheDocument();
  });
});
