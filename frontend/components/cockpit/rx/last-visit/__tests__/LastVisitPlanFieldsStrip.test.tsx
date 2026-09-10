import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import {
  LastVisitAdviceStrip,
  LastVisitFollowUpStrip,
  LastVisitInvestigationsStrip,
} from "@/components/cockpit/rx/last-visit/LastVisitPlanFieldsStrip";
import { LastVisitSummaryProvider } from "@/hooks/useLastVisitSummary";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";

const prescriptionIdRef = { current: "rx-1" as string | null };

const SUMMARY: LastVisitSummary = {
  sourcePrescriptionId: "rx-prior",
  sourceCreatedAt: "2026-08-12T10:00:00.000Z",
  complaints: [],
  diagnoses: [],
  provisionalDiagnosis: null,
  medicines: [],
  investigationsOrders: "CBC; LFT",
  advice: "Continue same treatment if improving.",
  followUp: null,
  followUpValue: 7,
  followUpUnit: "days",
};

function Probe() {
  const { state } = useRxForm();
  return (
    <div data-testid="plan-probe">
      {`${state.fields.investigationsOrders}|${state.fields.advice}|${state.fields.followUpValue ?? ""}|${state.fields.followUpUnit ?? ""}`}
    </div>
  );
}

function renderStrips() {
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
          <LastVisitInvestigationsStrip />
          <LastVisitAdviceStrip />
          <LastVisitFollowUpStrip />
          <Probe />
        </LastVisitSummaryProvider>
      </RxFormProvider>
    </QueryClientProvider>
  );
}

describe("LastVisitPlanFieldsStrip", () => {
  it("adds last-visit investigations, advice, and follow-up", () => {
    renderStrips();
    fireEvent.click(
      screen.getByTestId("last-visit-investigations-item-0-repeat")
    );
    fireEvent.click(screen.getByTestId("last-visit-advice-add"));
    fireEvent.click(screen.getByTestId("last-visit-follow-up-use"));
    expect(screen.getByTestId("plan-probe")).toHaveTextContent(
      "CBC|Continue same treatment if improving.|7|days"
    );
  });
});
