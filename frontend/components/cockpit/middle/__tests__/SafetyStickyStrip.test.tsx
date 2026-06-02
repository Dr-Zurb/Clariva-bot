import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { RxSafetyProvider } from "@/components/cockpit/rx/RxSafetyContext";
import { SafetyStickyStrip } from "@/components/cockpit/middle/SafetyStickyStrip";
import type { RxSafetySurfaceValue } from "@/lib/ehr/use-rx-safety-surface";

const prescriptionIdRef = { current: null as string | null };

const baseSafety: RxSafetySurfaceValue = {
  matchableMedicines: [],
  medicineInstanceIds: ["m-1"],
  allergies: [],
  drugMasterIndex: new Map(),
  setDrugMasterIndex: vi.fn(),
  ddiInteractions: [],
  formAllergyMatches: [],
  isAcked: () => false,
  onAcknowledge: vi.fn(),
  onAckDdi: vi.fn(),
  visible: false,
  clashesCount: 0,
  ddiCount: 0,
};

vi.mock("@/components/cockpit/rx/RxSafetyContext", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/components/cockpit/rx/RxSafetyContext")
  >();
  return {
    ...actual,
    useRxSafety: vi.fn(() => baseSafety),
  };
});

vi.mock("@/components/ehr/AllergyClashBanner", () => ({
  default: () => <div data-testid="allergy-clash-banner">Allergy alert</div>,
}));

vi.mock("@/components/ehr/InteractionChips", () => ({
  default: () => (
    <div data-testid="interaction-chips">Major interaction</div>
  ),
}));

import { useRxSafety } from "@/components/cockpit/rx/RxSafetyContext";

function renderStrip(ui: ReactElement) {
  return render(
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
      <RxSafetyProvider token="test-token" patientId="pat-1">
        {ui}
      </RxSafetyProvider>
    </RxFormProvider>,
  );
}

describe("SafetyStickyStrip", () => {
  it("returns null when no clashes and no interactions", () => {
    vi.mocked(useRxSafety).mockReturnValue({
      ...baseSafety,
      visible: false,
      clashesCount: 0,
      ddiCount: 0,
    });
    const { container } = renderStrip(<SafetyStickyStrip />);
    expect(container.firstChild).toBeNull();
  });

  it("renders banner when clashes present", () => {
    vi.mocked(useRxSafety).mockReturnValue({
      ...baseSafety,
      visible: true,
      clashesCount: 1,
      ddiCount: 0,
    });
    renderStrip(<SafetyStickyStrip />);
    expect(screen.getByTestId("allergy-clash-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("interaction-chips")).not.toBeInTheDocument();
  });

  it("renders chips when DDIs present", () => {
    vi.mocked(useRxSafety).mockReturnValue({
      ...baseSafety,
      visible: true,
      clashesCount: 0,
      ddiCount: 2,
      ddiInteractions: [
        {
          id: "ddi-1",
          drug_a_id: "a",
          drug_b_id: "b",
          severity: "major",
          description: "Test",
          recommendation: "Avoid",
          source: null,
          source_url: null,
        },
      ],
    });
    renderStrip(<SafetyStickyStrip />);
    expect(screen.getByTestId("interaction-chips")).toBeInTheDocument();
    expect(screen.getByText(/interaction/i)).toBeInTheDocument();
  });
});
