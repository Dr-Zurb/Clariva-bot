import type { ReactElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CockpitState } from "@/lib/patient-profile/state";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import InvestigationsPane from "@/components/patient-profile/panes/InvestigationsPane";

const prescriptionIdRef = { current: null as string | null };

function renderWithRxForm(
  ui: ReactElement,
  initialFields = createEmptyRxFormFields(),
) {
  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={initialFields}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {ui}
    </RxFormProvider>,
  );
}

function renderWithProvider(options: {
  state: CockpitState;
  investigationsCount?: number;
  hideHeader?: boolean;
}) {
  const count = options.investigationsCount ?? 0;
  const investigationsOrders =
    count === 0 ? "" : Array.from({ length: count }, (_, i) => `Test-${i + 1}`).join("; ");
  return renderWithRxForm(
    <InvestigationsPane state={options.state} hideHeader={options.hideHeader} />,
    {
      ...createEmptyRxFormFields(),
      investigationsOrders,
    },
  );
}

describe("InvestigationsPane", () => {
  it("renders the chip-row when in editable state", () => {
    renderWithRxForm(<InvestigationsPane state="live" hideHeader />, {
      ...createEmptyRxFormFields(),
      investigationsOrders: "ECG; Trop-I",
    });
    expect(screen.getByText(/ECG/i)).toBeInTheDocument();
    expect(screen.getByText(/Trop-I/i)).toBeInTheDocument();
  });

  it("hides the add affordance in read-only state", () => {
    renderWithRxForm(<InvestigationsPane state="ended" hideHeader />);
    expect(
      screen.queryByRole("button", { name: /add investigation/i }),
    ).not.toBeInTheDocument();
  });
});

describe("InvestigationsPane empty-state (cnc-03)", () => {
  it("shows empty-state copy + Add CTA when no orders and state is live", () => {
    renderWithProvider({ state: "live", investigationsCount: 0 });
    expect(screen.getByText("No tests ordered yet")).toBeInTheDocument();
    expect(screen.getByLabelText("Add an investigation")).toBeInTheDocument();
  });

  it("hides empty-state when orders exist", () => {
    renderWithProvider({ state: "live", investigationsCount: 1 });
    expect(screen.queryByText("No tests ordered yet")).not.toBeInTheDocument();
  });

  it("hides Add CTA in terminal state", () => {
    renderWithProvider({ state: "terminal", investigationsCount: 0 });
    expect(screen.queryByLabelText("Add an investigation")).not.toBeInTheDocument();
  });

  it("Add button reveals the chip-row input", () => {
    renderWithProvider({ state: "live", investigationsCount: 0 });
    fireEvent.click(screen.getByLabelText("Add an investigation"));
    expect(screen.queryByText("No tests ordered yet")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Investigation name")).toHaveFocus();
  });
});

/**
 * cv3t-03 — decoupled Plan/Investigations share ONE `investigationsOrders`
 * field (P5-DL-4). The v3 tab model splits the old `middle-bottom` couple into
 * two independent tabs; this proves the decouple cannot split state: a write in
 * the standalone Investigations tab is read by any other consumer of the shared
 * provider (here a probe standing in for the Plan-context view).
 */
describe("cv3t-03: decoupled Investigations writes the shared field (no split)", () => {
  function FieldProbe(): ReactElement {
    const { state } = useRxForm();
    return (
      <div data-testid="inv-probe">{state.fields.investigationsOrders}</div>
    );
  }

  it("an order added in the standalone tab is visible to a separate consumer", () => {
    renderWithRxForm(
      <>
        <InvestigationsPane state="live" hideHeader />
        <FieldProbe />
      </>,
    );

    // Probe (the Plan-context view) starts empty — single shared source of truth.
    expect(screen.getByTestId("inv-probe")).toHaveTextContent("");

    fireEvent.click(screen.getByLabelText("Add an investigation"));
    const input = screen.getByLabelText("Investigation name");
    fireEvent.change(input, { target: { value: "ECG" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The write from the standalone tab lands in the one shared field the
    // separate consumer reads — no second copy, no split.
    expect(screen.getByTestId("inv-probe")).toHaveTextContent("ECG");
    const pane = screen.getByTestId("investigations-pane");
    expect(within(pane).getByText("ECG")).toBeInTheDocument();
  });
});
