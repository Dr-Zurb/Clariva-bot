import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import { LastVisitDiagnosesStrip } from "@/components/cockpit/rx/last-visit/LastVisitDiagnosesStrip";
import { LastVisitSummaryProvider } from "@/hooks/useLastVisitSummary";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";

const prescriptionIdRef = { current: "rx-1" as string | null };

const SUMMARY: LastVisitSummary = {
  sourcePrescriptionId: "rx-prior",
  sourceCreatedAt: "2026-08-12T10:00:00.000Z",
  complaints: [],
  diagnoses: [
    {
      id: "prior-dx",
      label: "Acute bronchitis",
      kind: "primary",
      certainty: "provisional",
      status: "new",
    },
  ],
  provisionalDiagnosis: "Acute bronchitis",
  medicines: [],
  investigationsOrders: null,
  advice: null,
  followUp: null,
  followUpValue: null,
  followUpUnit: null,
};

function Probe() {
  const { state } = useRxForm();
  const first = state.fields.diagnoses[0];
  return (
    <div data-testid="dx-probe">
      {first ? `${first.label}|${first.acuity ?? ""}` : ""}
    </div>
  );
}

function renderStrip() {
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
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <LastVisitSummaryProvider value={SUMMARY}>
          <LastVisitDiagnosesStrip />
          <Probe />
        </LastVisitSummaryProvider>
      </RxFormProvider>
    </QueryClientProvider>
  );
}

describe("LastVisitDiagnosesStrip", () => {
  it("adds a last-visit diagnosis with acuity and can swap acuity on the same card", () => {
    renderStrip();
    fireEvent.click(
      screen.getByTestId("last-visit-diagnoses-item-prior-dx-worsening")
    );
    expect(screen.getByTestId("dx-probe")).toHaveTextContent(
      "Acute bronchitis|worsening"
    );
    fireEvent.click(
      screen.getByTestId("last-visit-diagnoses-item-prior-dx-improving")
    );
    expect(screen.getByTestId("dx-probe")).toHaveTextContent(
      "Acute bronchitis|improving"
    );
  });
});
