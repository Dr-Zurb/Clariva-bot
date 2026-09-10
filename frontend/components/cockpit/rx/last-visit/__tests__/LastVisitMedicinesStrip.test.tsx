import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  EMPTY_RX_MEDICINE,
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import { LastVisitMedicinesStrip } from "@/components/cockpit/rx/last-visit/LastVisitMedicinesStrip";
import { LastVisitSummaryProvider } from "@/hooks/useLastVisitSummary";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";

const prescriptionIdRef = { current: "rx-1" as string | null };

const SUMMARY: LastVisitSummary = {
  sourcePrescriptionId: "rx-prior",
  sourceCreatedAt: "2026-08-12T10:00:00.000Z",
  complaints: [],
  diagnoses: [],
  provisionalDiagnosis: null,
  medicines: [
    {
      medicineName: "Dextromethorphan",
      dosage: "1 tds",
      route: "",
      frequency: "tds",
      duration: "5 days",
      instructions: "",
      drugMasterId: null,
      frequencyCode: null,
      durationValue: 5,
      durationUnit: "days",
      routeCode: null,
      doseQty: 1,
      doseUnit: null,
      form: "syrup",
      foodTiming: null,
    },
  ],
  investigationsOrders: null,
  advice: null,
  followUp: null,
  followUpValue: null,
  followUpUnit: null,
};

function MedicinesProbe() {
  const { state } = useRxForm();
  return (
    <div data-testid="named-meds">
      {state.fields.medicines
        .filter((m) => m.medicineName.trim())
        .map((m) => m.medicineName)
        .join(",")}
    </div>
  );
}

function Host() {
  const [ids, setIds] = useState(["m-0"]);
  let seq = 1;
  return (
    <LastVisitMedicinesStrip
      medicineInstanceIds={ids}
      setMedicineInstanceIds={setIds}
      generateInstanceIds={(count) =>
        Array.from({ length: count }, () => `m-${seq++}`)
      }
    />
  );
}

function renderStrip() {
  const fields = createEmptyRxFormFields();
  fields.medicines = [{ ...EMPTY_RX_MEDICINE }];
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
          <Host />
          <MedicinesProbe />
        </LastVisitSummaryProvider>
      </RxFormProvider>
    </QueryClientProvider>
  );
}

describe("LastVisitMedicinesStrip", () => {
  it("repeats last Rx and undoes in one action", () => {
    renderStrip();
    fireEvent.click(screen.getByTestId("last-visit-medicines-repeat"));
    expect(screen.getByTestId("named-meds")).toHaveTextContent(
      "Dextromethorphan"
    );
    fireEvent.click(screen.getByTestId("last-visit-medicines-undo"));
    expect(screen.getByTestId("named-meds")).toHaveTextContent("");
  });

  it("repeats a single medicine from the row button", () => {
    renderStrip();
    fireEvent.click(
      screen.getByTestId("last-visit-medicines-item-Dextromethorphan-0-repeat")
    );
    expect(screen.getByTestId("named-meds")).toHaveTextContent(
      "Dextromethorphan"
    );
  });
});
