import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PlanActionFooter } from "@/components/cockpit/middle/PlanActionFooter";

const prescriptionIdRef = { current: null as string | null };

vi.mock("@/components/cockpit/rx/SaveStatusPill", () => ({
  SaveStatusPill: () => <span role="status">Saved just now</span>,
}));

function renderFooter(
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

describe("PlanActionFooter", () => {
  it("hides entirely in terminal state", () => {
    const { container } = renderFooter(
      <PlanActionFooter state="terminal" onSendAndFinish={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows Send button when canSendPrescription(state) is true", () => {
    renderFooter(
      <PlanActionFooter state="live" onSendAndFinish={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: /send rx & finish/i }),
    ).toBeInTheDocument();
  });

  it("hides Send button when canSendPrescription(state) is false (ready)", () => {
    renderFooter(
      <PlanActionFooter state="ready" onSendAndFinish={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: /send rx/i }),
    ).not.toBeInTheDocument();
  });

  it("shows SaveStatus pill when not terminal", () => {
    renderFooter(<PlanActionFooter state="ready" onSendAndFinish={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
  });

  it("shows Preview as patient when onPreview is provided", () => {
    renderFooter(
      <PlanActionFooter
        state="ended"
        onSendAndFinish={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /preview as patient/i }),
    ).toBeInTheDocument();
  });
});
