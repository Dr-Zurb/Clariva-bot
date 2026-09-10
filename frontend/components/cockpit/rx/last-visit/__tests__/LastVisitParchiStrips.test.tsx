import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import { LastVisitHopiStrip } from "@/components/cockpit/rx/last-visit/LastVisitParchiStrips";
import { LastVisitUnmatchedCustomSectionsStrip } from "@/components/cockpit/rx/last-visit/LastVisitCustomSectionStrip";
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
  investigationsOrders: null,
  advice: null,
  followUp: null,
  followUpValue: null,
  followUpUnit: null,
  hopi: "Worse at night",
  customSubsections: [
    { id: "sec-diet", title: "Diet", body: "Low salt", children: [] },
  ],
};

function Probe() {
  const { state } = useRxForm();
  return (
    <div data-testid="parchi-probe">
      {`${state.fields.hopi}|${state.fields.customSubsections[0]?.title ?? ""}|${state.fields.customSubsections[0]?.body ?? ""}`}
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
          <LastVisitHopiStrip />
          <LastVisitUnmatchedCustomSectionsStrip scope="subjective" />
          <Probe />
        </LastVisitSummaryProvider>
      </RxFormProvider>
    </QueryClientProvider>
  );
}

describe("LastVisitParchiStrips", () => {
  it("uses last-visit notes and adds a last-visit-only custom section", () => {
    renderStrips();
    fireEvent.click(screen.getByTestId("last-visit-hopi-use"));
    fireEvent.click(
      screen.getByTestId("last-visit-custom-subjective-unmatched-sec-diet-add")
    );
    expect(screen.getByTestId("parchi-probe")).toHaveTextContent(
      "Worse at night|Diet|Low salt"
    );
  });
});
