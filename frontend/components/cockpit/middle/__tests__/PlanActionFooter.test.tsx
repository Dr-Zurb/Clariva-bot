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
      <PlanActionFooter state="terminal" onReview={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows Done when canSendPrescription(state) is true", () => {
    renderFooter(<PlanActionFooter state="wrap_up" onReview={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /done/i }),
    ).toBeInTheDocument();
  });

  it("keeps Done during a live consult", () => {
    renderFooter(<PlanActionFooter state="live" onReview={vi.fn()} />);
    expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument();
  });

  it("hides Done when canSendPrescription(state) is false (ready)", () => {
    renderFooter(<PlanActionFooter state="ready" onReview={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /done/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Preview as patient in ready when onPreview is provided", () => {
    renderFooter(
      <PlanActionFooter state="ready" onPreview={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: /preview as patient/i }),
    ).toBeInTheDocument();
  });

  it("does not keep Print on the footer", () => {
    renderFooter(
      <PlanActionFooter state="ended" onReview={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: /^print$/i }),
    ).not.toBeInTheDocument();
  });

  it("shows SaveStatus pill when not terminal", () => {
    renderFooter(<PlanActionFooter state="ready" onPreview={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
  });

  it("quiets footer chrome during live consult", () => {
    renderFooter(<PlanActionFooter state="live" onReview={vi.fn()} />);
    expect(screen.getByTestId("plan-action-footer")).toHaveAttribute(
      "data-live-quiet",
      "true",
    );
  });
});
