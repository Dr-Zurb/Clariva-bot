import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { InvestigationsAutoMerge } from "@/components/cockpit/middle/InvestigationsAutoMerge";

const trackNarrowMerge = vi.fn();
vi.mock("@/lib/patient-profile/telemetry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/patient-profile/telemetry")>();
  return {
    ...actual,
    trackCockpitV2RMiddleNarrowMergeLanded: (...args: unknown[]) =>
      trackNarrowMerge(...args),
  };
});

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

describe("InvestigationsAutoMerge", () => {
  beforeEach(() => {
    trackNarrowMerge.mockClear();
  });

  it("renders chip-row wrapper with narrow-merge container-query classes", () => {
    renderWithRxForm(<InvestigationsAutoMerge state="live" />);
    const wrapper = screen.getByTestId("investigations-auto-merge");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.className).toContain("block");
    expect(wrapper.className).toContain("@[720px]/middle-bottom:hidden");
  });

  it("subscribes to investigationsOrders via RxFormContext", () => {
    renderWithRxForm(<InvestigationsAutoMerge state="live" />, {
      ...createEmptyRxFormFields(),
      investigationsOrders: "CBC; LFT",
    });
    expect(screen.getByText("CBC")).toBeInTheDocument();
    expect(screen.getByText("LFT")).toBeInTheDocument();
  });

  it("disables chip input when state is ended", () => {
    renderWithRxForm(<InvestigationsAutoMerge state="ended" />);
    expect(
      screen.queryByRole("textbox", { name: /investigation name/i }),
    ).not.toBeInTheDocument();
  });

  it("updates investigationsOrders on chip add", () => {
    renderWithRxForm(<InvestigationsAutoMerge state="live" />);
    const input = screen.getByRole("textbox", { name: /investigation name/i });
    fireEvent.change(input, { target: { value: "MRI" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("MRI")).toBeInTheDocument();
  });

  it("fires narrow-merge telemetry when appointmentId is provided", () => {
    renderWithRxForm(
      <InvestigationsAutoMerge state="live" appointmentId="appt-narrow-1" />,
    );
    expect(trackNarrowMerge).toHaveBeenCalledWith({});
  });

  it("does not fire telemetry without appointmentId", () => {
    renderWithRxForm(<InvestigationsAutoMerge state="live" />);
    expect(trackNarrowMerge).not.toHaveBeenCalled();
  });
});
