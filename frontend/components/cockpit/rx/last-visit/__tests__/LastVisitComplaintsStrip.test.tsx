import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import { LastVisitComplaintsStrip } from "@/components/cockpit/rx/last-visit/LastVisitComplaintsStrip";
import { LastVisitSummaryProvider } from "@/hooks/useLastVisitSummary";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";

const prescriptionIdRef = { current: "rx-1" as string | null };

const SUMMARY: LastVisitSummary = {
  sourcePrescriptionId: "rx-prior",
  sourceCreatedAt: "2026-08-12T10:00:00.000Z",
  complaints: [
    {
      id: "prior-cough",
      name: "Cough",
      duration: "5 days",
      onset: "5 days ago",
    },
  ],
  diagnoses: [],
  provisionalDiagnosis: null,
  medicines: [],
  investigationsOrders: null,
  advice: null,
  followUp: null,
  followUpValue: null,
  followUpUnit: null,
};

function ComplaintsProbe() {
  const { state } = useRxForm();
  const first = state.fields.complaints[0];
  return (
    <div data-testid="complaint-probe">
      {first
        ? `${first.name}|${first.notes ?? ""}|${first.duration ?? ""}`
        : ""}
    </div>
  );
}

function renderStrip() {
  const fields = createEmptyRxFormFields();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={fields}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <LastVisitSummaryProvider value={SUMMARY}>
          <LastVisitComplaintsStrip />
          <ComplaintsProbe />
        </LastVisitSummaryProvider>
      </RxFormProvider>
    </QueryClientProvider>
  );
}

describe("LastVisitComplaintsStrip", () => {
  it("adds the complaint with a course note and can swap the course", () => {
    renderStrip();
    fireEvent.click(
      screen.getByTestId("last-visit-complaints-item-prior-cough-Worsening")
    );
    expect(screen.getByTestId("complaint-probe")).toHaveTextContent(
      "Cough|Worsening|"
    );
    fireEvent.click(
      screen.getByTestId("last-visit-complaints-item-prior-cough-Improving")
    );
    expect(screen.getByTestId("complaint-probe")).toHaveTextContent(
      "Cough|Improving|"
    );
    expect(
      screen.queryByTestId("last-visit-complaints-repeat")
    ).not.toBeInTheDocument();
  });
});
