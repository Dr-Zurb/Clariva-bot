/**
 * rxd-03 — PlanSection active-row tracking (one editor at a time).
 * rxs-03 — Plan-pane keyboard shortcuts.
 * plan-p0 — Peer zones + plan SOAP family chrome.
 * med-lib-01 — Medications zone without starter packs / favorites.
 */

import { useCallback, useRef, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { PlanSection } from "@/components/cockpit/rx/sections/PlanSection";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import {
  SOAP_TAB_FAMILY_ACCENT,
  SOAP_TAB_HEADING_ICON,
} from "@/components/cockpit/rx/sections/section-chrome";
import * as cockpitTelemetry from "@/lib/patient-profile/telemetry";

const mockResolveInvestigation = vi.fn();

vi.mock("@/lib/api/investigation-parse", () => ({
  resolveInvestigationWithAI: (...args: unknown[]) =>
    mockResolveInvestigation(...args),
}));

vi.mock("@/components/cockpit/rx/plan/AdviceHandoutsStrip", () => ({
  AdviceHandoutsStrip: () => <div data-testid="advice-handouts-strip" />,
}));

vi.mock("@/lib/patient-profile/telemetry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/patient-profile/telemetry")>();
  return {
    ...actual,
    trackCockpitV2RRxPolishShortcutUsed: vi.fn(),
  };
});

vi.mock("@/components/ehr/DrugAutocomplete", () => ({
  default: ({
    inputId,
    value,
    onChange,
    placeholder,
  }: {
    inputId?: string;
    value: string;
    onChange?: (v: string) => void;
    placeholder?: string;
  }) => (
    <input
      id={inputId}
      aria-label={placeholder ?? "Medicine name"}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

const prescriptionIdRef = { current: null as string | null };

const EMPTY_PLAN_DEFAULTS = {
  sectionOrder: [] as const,
  sectionCollapsed: {},
  sectionHidden: [] as const,
};

function completeMedicine(name: string): RxMedicine {
  return {
    medicineName: name,
    dosage: "500mg",
    route: "",
    frequency: "Three times daily",
    duration: "5 days",
    instructions: "",
    drugMasterId: null,
    frequencyCode: "TID",
    durationValue: 5,
    durationUnit: "days",
    routeCode: null,
    doseQty: null,
    doseUnit: null,
    form: null,
    foodTiming: null,
  };
}

function isRowInEditorMode(index: number): boolean {
  return document.getElementById(`med-dosage-${index}`) !== null;
}

function isRowInSummaryMode(index: number): boolean {
  return screen.queryByTestId(`medicine-row-summary-${index}`) !== null;
}

function expandMedicineSummary(name: string) {
  return screen.getByRole("button", { name: `${name} — expand medication` });
}

function PlanSectionHarness({
  initialFields,
  initialInstanceIds,
  disabled = false,
  onSendAndFinish,
  canSend = false,
  heading = null,
}: {
  initialFields: RxFormFields;
  initialInstanceIds: string[];
  disabled?: boolean;
  onSendAndFinish?: () => void;
  canSend?: boolean;
  heading?: string | null;
}) {
  const [medicineInstanceIds, setMedicineInstanceIds] =
    useState(initialInstanceIds);
  const nextIdRef = useRef(initialInstanceIds.length);
  const generateInstanceIds = useCallback((count: number) => {
    return Array.from({ length: count }, () => {
      nextIdRef.current += 1;
      return `instance-${nextIdRef.current}`;
    });
  }, []);

  return (
    <div data-cockpit-pane-id="plan">
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
        <PrescriptionFormShellProvider
          value={
            {
              loading: false,
              initialFields,
              entryMode: "structured",
              setEntryMode: vi.fn(),
              prescription: null,
              setPrescription: vi.fn(),
              prescriptionIdRef,
              attachments: [],
              setAttachments: vi.fn(),
              setInitialFields: vi.fn(),
              generateInstanceIds,
              instanceIdSeqRef: nextIdRef,
              medicineInstanceIds,
              setMedicineInstanceIds,
              subjectiveSectionOrder: [],
              setSubjectiveSectionOrder: vi.fn(),
              subjectiveSectionCollapsed: {},
              setSubjectiveSectionCollapsed: vi.fn(),
              subjectiveSectionHidden: [],
              setSubjectiveSectionHidden: vi.fn(),
              objectiveDefaults: null,
              setObjectiveDefaults: vi.fn(),
              planDefaults: {
                sectionOrder: [...EMPTY_PLAN_DEFAULTS.sectionOrder],
                sectionCollapsed: { ...EMPTY_PLAN_DEFAULTS.sectionCollapsed },
                sectionHidden: [...EMPTY_PLAN_DEFAULTS.sectionHidden],
              },
              setPlanDefaults: vi.fn(),
    assessmentDefaults: null,
    setAssessmentDefaults: vi.fn(),
              providerProps: {
                key: "test",
                appointmentId: "appt-1",
                patientId: "pat-1",
                token: "test-token",
                entryMode: "structured",
                initialFields,
                autosaveEnabled: false,
                prescriptionIdRef,
                onPrescriptionCreated: vi.fn(),
              },
            } satisfies RxFormProviderSetup
          }
        >
          <PlanSection
            heading={heading}
            disabled={disabled}
            safetyLifted
            token="test-token"
            medicineInstanceIds={medicineInstanceIds}
            setMedicineInstanceIds={setMedicineInstanceIds}
            generateInstanceIds={generateInstanceIds}
            drugMasterIndex={new Map()}
            setDrugMasterIndex={() => {}}
            allergies={[]}
            ddiInteractions={[]}
            isAcked={() => false}
            onAcknowledge={() => {}}
            onAckDdi={() => {}}
            onSendAndFinish={onSendAndFinish}
            canSend={canSend}
          />
        </PrescriptionFormShellProvider>
      </RxFormProvider>
    </div>
  );
}

function renderPlanSection(
  medicines: RxMedicine[],
  instanceIds: string[],
  options: {
    disabled?: boolean;
    onSendAndFinish?: () => void;
    canSend?: boolean;
    heading?: string | null;
  } = {},
) {
  const initialFields = {
    ...createEmptyRxFormFields(medicines),
    medicines,
  };
  return render(
    <PlanSectionHarness
      initialFields={initialFields}
      initialInstanceIds={instanceIds}
      disabled={options.disabled}
      onSendAndFinish={options.onSendAndFinish}
      canSend={options.canSend}
      heading={options.heading ?? null}
    />,
  );
}

function fireDocumentKey(
  key: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = {},
): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      metaKey: opts.metaKey ?? false,
      ctrlKey: opts.ctrlKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function modKey(opts: { shiftKey?: boolean } = {}): {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
} {
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
  return isMac
    ? { metaKey: true, shiftKey: opts.shiftKey }
    : { ctrlKey: true, shiftKey: opts.shiftKey };
}

describe("PlanSection peer zones (plan-p0)", () => {
  beforeEach(() => {
    mockResolveInvestigation.mockReset();
  });

  it("capture-bar Enter prepends the newest medicine at the top", () => {
    renderPlanSection([completeMedicine("Amlodipine")], ["instance-a"]);

    const input = screen.getByLabelText(/Add medicine/i);
    fireEvent.change(input, {
      target: { value: "telmisartan 40 mg 1 tab od" },
    });
    fireEvent.keyDown(input.parentElement!, { key: "Enter" });

    expect(screen.getByTestId("medicine-row-summary-0")).toHaveTextContent(
      /telmisartan/i,
    );
    expect(screen.getByTestId("medicine-row-summary-1")).toHaveTextContent(
      /Amlodipine/i,
    );
  });

  it("renders plan peer zones with medications capture bar (no favorites strip)", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"], {
      heading: "Plan",
    });

    expect(screen.getByTestId("plan-medications-zone")).toBeInTheDocument();
    expect(screen.getByTestId("plan-investigations-zone")).toBeInTheDocument();
    expect(screen.getByTestId("plan-follow-up-zone")).toBeInTheDocument();
    expect(screen.getByTestId("plan-advice-zone")).toBeInTheDocument();
    expect(screen.getByTestId("plan-referral-zone")).toBeInTheDocument();
    expect(screen.getByTestId("plan-notes-zone")).toBeInTheDocument();

    const medsZone = screen.getByTestId("plan-medications-zone");
    expect(screen.queryByTestId("favorites-chip-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-starter-packs")).not.toBeInTheDocument();
    expect(medsZone).toContainElement(
      screen.getByTestId("medicines-section-template"),
    );
    expect(within(medsZone).getByText("Medications")).toBeInTheDocument();
    expect(within(screen.getByTestId("plan-follow-up-zone")).getByText("Follow-up")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Toggle Advice & education/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Clinical notes (private)"),
    ).toBeInTheDocument();
  });

  it("places Investigations before Medications (plan-c-01)", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    const investigations = screen.getByTestId("plan-investigations-zone");
    const medications = screen.getByTestId("plan-medications-zone");
    expect(
      investigations.compareDocumentPosition(medications) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders L1 sections as collapsible cards with plan scroll-top (plan-c-02)", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    expect(screen.getByTestId("plan-scroll-top")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Toggle Investigations \/ orders/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Toggle Medications/i }),
    ).toBeInTheDocument();
  });

  it("renders a single Advice section with quick picks and handouts (no education L2)", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    const adviceZone = screen.getByTestId("plan-advice-zone");
    expect(within(adviceZone).getByTestId("plan-advice-quick-picks")).toBeInTheDocument();
    expect(within(adviceZone).getByTestId("advice-handouts-strip")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-education-l2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-advice-l2")).not.toBeInTheDocument();
  });

  it("applies plan family chrome on the section heading", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"], {
      heading: "Plan",
    });

    const heading = screen.getByRole("heading", { name: "Plan" });
    expect(heading.className).toContain(SOAP_TAB_FAMILY_ACCENT.plan);
    expect(SOAP_TAB_HEADING_ICON.plan).toBeDefined();
  });

  it("keeps follow-up value + notes inside one zone", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    const zone = screen.getByTestId("plan-follow-up-zone");
    expect(within(zone).getByLabelText("Follow-up value")).toBeInTheDocument();
    expect(within(zone).getByLabelText("Notes")).toBeInTheDocument();
    expect(within(zone).getByTestId("plan-follow-up-quick-picks")).toBeInTheDocument();
    expect(screen.queryByText("Follow-up (structured)")).not.toBeInTheDocument();
  });

  it("applies follow-up quick pick to structured fields", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    fireEvent.click(screen.getByRole("button", { name: "+ 1 week" }));
    expect(screen.getByLabelText("Follow-up value")).toHaveValue(1);
    // Selected chip becomes pressed/disabled without the + prefix
    expect(screen.getByRole("button", { name: "1 week" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders plan-p2 quick-pick strips in advice, referral, investigations, and follow-up", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    expect(screen.getByTestId("plan-advice-quick-picks")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-education-quick-picks")).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-referral-quick-picks")).toBeInTheDocument();
    expect(
      screen.getByTestId("plan-referral-urgency-quick-picks"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plan-referral-reason-quick-picks"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plan-referral-specialty-combobox"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("plan-investigation-quick-picks")).toBeInTheDocument();
    expect(screen.getByTestId("plan-follow-up-quick-picks")).toBeInTheDocument();
  });

  it("applies referral urgency + specialty chips without writing into notes", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    fireEvent.click(screen.getByRole("button", { name: "+ Urgent" }));
    fireEvent.click(screen.getByRole("button", { name: "+ ENT" }));
    const notes = screen.getByLabelText(/^referral notes$/i);
    expect(notes).toHaveValue("");
    expect(screen.getByRole("button", { name: "Urgent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "ENT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("plan-referral-specialty-selected")).toHaveTextContent(
      "ENT",
    );
    expect(screen.getByTestId("plan-referral-zone")).toHaveTextContent(
      /Urgent referral · ENT/,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Further evaluation" }));
    expect(notes).toHaveValue("");
    expect(screen.getByTestId("plan-referral-zone")).toHaveTextContent(
      /Urgent referral · ENT · Further evaluation/,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear referral" }));
    expect(notes).toHaveValue("");
    expect(screen.getByRole("button", { name: "+ Urgent" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "+ ENT" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("commits a specialty from the searchable combobox into the selected row", async () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    const input = screen.getByLabelText("Search specialty");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Nephrology" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(
        screen.getByTestId("plan-referral-specialty-selected"),
      ).toHaveTextContent("Nephrology");
    });
    expect(screen.getByTestId("plan-referral-zone")).toHaveTextContent(
      /Nephrology/,
    );
    expect(screen.getByLabelText(/^referral notes$/i)).toHaveValue("");
  });

  it("allows multi-select specialties from chips", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    fireEvent.click(screen.getByRole("button", { name: "+ ENT" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Cardiology" }));
    expect(screen.getByTestId("plan-referral-specialty-selected")).toHaveTextContent(
      "ENT",
    );
    expect(screen.getByTestId("plan-referral-specialty-selected")).toHaveTextContent(
      "Cardiology",
    );
    expect(screen.getByTestId("plan-referral-zone")).toHaveTextContent(
      /ENT, Cardiology/,
    );
  });

  it("appends an advice quick pick into the advice field without duplicating", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    fireEvent.click(screen.getByRole("button", { name: "+ Rest" }));
    const advice = screen.getByLabelText(/^advice & education$/i);
    expect(advice).toHaveValue("Rest");

    fireEvent.click(screen.getByRole("button", { name: "Rest" }));
    expect(advice).toHaveValue("Rest");
  });

  it("adds an investigation quick pick as an order chip", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    fireEvent.click(screen.getByRole("button", { name: "+ CBC" }));

    const zone = screen.getByTestId("plan-investigations-zone");
    expect(
      within(zone).getByRole("button", { name: "Remove CBC" }),
    ).toBeInTheDocument();
    expect(
      within(zone).queryByRole("button", { name: "+ CBC" }),
    ).not.toBeInTheDocument();
    // Full panel commits immediately — no staging confirm.
    expect(
      within(zone).queryByTestId("investigation-panel-checklist"),
    ).not.toBeInTheDocument();
  });

  it("trims a committed panel via expand-to-edit (INV-D11 basket)", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    fireEvent.click(screen.getByRole("button", { name: "+ LFT" }));
    const zone = screen.getByTestId("plan-investigations-zone");
    expect(within(zone).getByRole("button", { name: "Remove LFT" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("investigation-panel-expand-lft"));
    const checklist = screen.getByTestId("investigation-panel-checklist");
    fireEvent.click(within(checklist).getByRole("button", { name: "Clear" }));
    fireEvent.click(within(checklist).getByRole("button", { name: "SGOT (AST)" }));
    fireEvent.click(within(checklist).getByRole("button", { name: "SGPT (ALT)" }));

    expect(screen.getByTestId("investigation-panel-rename-nudge")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("investigation-panel-close"));

    // Basket stays one top-level row; membership is trimmed inside.
    expect(within(zone).getByRole("button", { name: "Remove LFT" })).toBeInTheDocument();
    expect(
      within(zone).queryByRole("button", { name: "Remove SGOT (AST)" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("investigation-panel-expand-lft"));
    const reopened = screen.getByTestId("investigation-panel-checklist");
    expect(
      within(reopened).getByRole("button", { name: "SGOT (AST)", pressed: true }),
    ).toBeInTheDocument();
    expect(
      within(reopened).getByRole("button", { name: "SGPT (ALT)", pressed: true }),
    ).toBeInTheDocument();
    expect(
      within(reopened).getByRole("button", { name: "Total bilirubin", pressed: false }),
    ).toBeInTheDocument();
  });

  it("adds a test inside an expanded package (INV-D11)", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    fireEvent.click(screen.getByRole("button", { name: "+ LFT" }));
    fireEvent.click(screen.getByTestId("investigation-panel-expand-lft"));

    const memberInput = screen.getByTestId("investigation-panel-member-combobox");
    fireEvent.change(memberInput, { target: { value: "Chest X-ray" } });
    fireEvent.keyDown(memberInput, { key: "Enter" });

    const checklist = screen.getByTestId("investigation-panel-checklist");
    expect(within(checklist).getByText("Chest X-ray")).toBeInTheDocument();
    expect(screen.getByTestId("investigation-panel-rename-nudge")).toBeInTheDocument();

    // Still one top-level LFT row (member is inside the basket, not a sibling).
    const zone = screen.getByTestId("plan-investigations-zone");
    expect(within(zone).getByRole("button", { name: "Remove LFT" })).toBeInTheDocument();
    expect(
      within(zone).queryByRole("button", { name: "Remove Chest X-ray" }),
    ).not.toBeInTheDocument();
  });

  it("shows catalog suggestions for near-miss free text (inv-lib-04)", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    const input = screen.getByLabelText("Investigation name");
    fireEvent.change(input, { target: { value: "liver function" } });
    // Shift+Enter forces the custom path (same as diagnosis free-text).
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(screen.getByTestId("investigation-suggest-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("investigation-suggest-accept-0"));
    // Accepting a panel commits immediately (no staging confirm).
    const zone = screen.getByTestId("plan-investigations-zone");
    expect(within(zone).getByRole("button", { name: "Remove LFT" })).toBeInTheDocument();
  });

  it("falls back to the gated AI resolver for opaque free text (inv-lib-04)", async () => {
    mockResolveInvestigation.mockResolvedValue({
      data: { candidates: [{ term: "Liver function test", confidence: 0.9 }] },
    });
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    const input = screen.getByLabelText("Investigation name");
    // Opaque text with no local catalog near-miss → AI resolve fires.
    fireEvent.change(input, { target: { value: "qwerty zxcvb" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(mockResolveInvestigation).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({ text: "qwerty zxcvb", tier: "default" }),
    );

    // The AI term maps back onto the catalog (client-side constraint) → LFT.
    const accept = await screen.findByTestId("investigation-suggest-accept-0");
    fireEvent.click(accept);
    const zone = screen.getByTestId("plan-investigations-zone");
    expect(within(zone).getByRole("button", { name: "Remove LFT" })).toBeInTheDocument();
  });

  it("auto-commits opaque free text as custom when AI finds no catalog match", async () => {
    mockResolveInvestigation.mockResolvedValue({
      data: { candidates: [] },
    });
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    const input = screen.getByLabelText("Investigation name");
    fireEvent.change(input, { target: { value: "lkdlkjflasjfsd" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(mockResolveInvestigation).toHaveBeenCalled();
    });

    // No second Enter — empty AI result commits as typed custom order.
    await waitFor(() => {
      expect(
        screen.queryByTestId("investigation-suggest-panel"),
      ).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId("plan-investigations-zone")).getByRole(
          "button",
          { name: "Remove lkdlkjflasjfsd" },
        ),
      ).toBeInTheDocument();
    });
  });

  it("auto-commits opaque free text as custom when AI resolve errors", async () => {
    mockResolveInvestigation.mockRejectedValue(new Error("boom"));
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    const input = screen.getByLabelText("Investigation name");
    fireEvent.change(input, { target: { value: "zzxqwerty999" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(mockResolveInvestigation).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("investigation-suggest-panel"),
      ).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId("plan-investigations-zone")).getByRole(
          "button",
          { name: "Remove zzxqwerty999" },
        ),
      ).toBeInTheDocument();
    });
  });
});

describe("PlanSection active-row tracking", () => {
  it("keeps one editor at a time when tapping another row summary", () => {
    renderPlanSection(
      [completeMedicine("Paracetamol"), completeMedicine("Ibuprofen")],
      ["instance-a", "instance-b"],
    );

    expect(isRowInSummaryMode(0)).toBe(true);
    expect(isRowInSummaryMode(1)).toBe(true);

    fireEvent.click(expandMedicineSummary("Paracetamol"));
    expect(isRowInEditorMode(0)).toBe(true);
    expect(isRowInSummaryMode(1)).toBe(true);

    fireEvent.click(expandMedicineSummary("Ibuprofen"));
    expect(isRowInSummaryMode(0)).toBe(true);
    expect(isRowInEditorMode(1)).toBe(true);
  });

  it("collapses a named incomplete row when a sibling is activated", () => {
    renderPlanSection(
      [
        {
          ...completeMedicine("Draft"),
          dosage: "",
          frequency: "",
          duration: "",
          frequencyCode: null,
          durationValue: null,
          durationUnit: null,
        },
        completeMedicine("Paracetamol"),
      ],
      ["instance-a", "instance-b"],
    );

    expect(isRowInSummaryMode(0)).toBe(true);
    expect(isRowInSummaryMode(1)).toBe(true);

    fireEvent.click(expandMedicineSummary("Draft"));
    expect(isRowInEditorMode(0)).toBe(true);

    fireEvent.click(expandMedicineSummary("Paracetamol"));
    expect(isRowInSummaryMode(0)).toBe(true);
    expect(isRowInEditorMode(1)).toBe(true);
  });

  it("starts a newly added row as the active editor", async () => {
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"]);

    screen.getByLabelText(/Add medicine/i).focus();
    fireDocumentKey("m", modKey());

    await waitFor(() => {
      expect(isRowInEditorMode(0)).toBe(true);
      expect(isRowInSummaryMode(1)).toBe(true);
    });
  });

  it("clears the active row when the active row is deleted", () => {
    renderPlanSection(
      [completeMedicine("Paracetamol"), completeMedicine("Ibuprofen")],
      ["instance-a", "instance-b"],
    );

    fireEvent.click(expandMedicineSummary("Ibuprofen"));
    expect(isRowInEditorMode(1)).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove medicine 2" }),
    );

    expect(isRowInSummaryMode(0)).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Ibuprofen — expand medication" }),
    ).toBeNull();
  });

  it("allows deleting the last remaining medicine", () => {
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"]);

    fireEvent.click(
      within(expandMedicineSummary("Paracetamol")).getByRole("button", {
        name: "Delete medicine row",
      }),
    );

    expect(
      screen.queryByRole("button", { name: "Paracetamol — expand medication" }),
    ).toBeNull();
    expect(screen.queryByTestId("medicine-row-summary-0")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Add medicine/i)).toBeInTheDocument();
  });

  it("keeps the same active instance id after deleting a row before it", () => {
    renderPlanSection(
      [
        completeMedicine("Aspirin"),
        completeMedicine("Paracetamol"),
        completeMedicine("Ibuprofen"),
      ],
      ["instance-a", "instance-b", "instance-c"],
    );

    fireEvent.click(expandMedicineSummary("Ibuprofen"));
    expect(isRowInEditorMode(2)).toBe(true);

    const rowOneSummary = expandMedicineSummary("Aspirin");
    fireEvent.click(
      within(rowOneSummary).getByRole("button", { name: "Delete medicine row" }),
    );

    expect(isRowInEditorMode(1)).toBe(true);
    expect(screen.getByDisplayValue("Ibuprofen")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Aspirin")).not.toBeInTheDocument();
  });

  it("moves focus between summary rows with ArrowDown and ArrowUp", () => {
    renderPlanSection(
      [completeMedicine("Paracetamol"), completeMedicine("Ibuprofen")],
      ["instance-a", "instance-b"],
    );

    const firstSummary = expandMedicineSummary("Paracetamol");
    const secondSummary = expandMedicineSummary("Ibuprofen");
    const list = firstSummary.parentElement as HTMLElement;

    firstSummary.focus();
    expect(document.activeElement).toBe(firstSummary);

    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(document.activeElement).toBe(secondSummary);

    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(document.activeElement).toBe(firstSummary);
  });
});

describe("PlanSection densification telemetry (rxd-04)", () => {
  beforeEach(() => {
    window.__cockpitV2RRxPolishDensificationLanded = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fires densification telemetry once when summary rows are visible", () => {
    const spy = vi.spyOn(
      cockpitTelemetry,
      "trackCockpitV2RRxPolishDensificationLanded",
    );
    renderPlanSection(
      [completeMedicine("Paracetamol"), completeMedicine("Ibuprofen")],
      ["instance-a", "instance-b"],
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      appointmentId: "appt-1",
      completedRowsCount: 2,
      editorRowsCount: 0,
    });
    spy.mockRestore();
  });

  it("does not fire when no rows are complete", () => {
    const spy = vi.spyOn(
      cockpitTelemetry,
      "trackCockpitV2RRxPolishDensificationLanded",
    );
    renderPlanSection(
      [
        {
          ...completeMedicine("Draft"),
          dosage: "",
          frequency: "",
          duration: "",
          frequencyCode: null,
          durationValue: null,
          durationUnit: null,
        },
      ],
      ["instance-a"],
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("PlanSection keyboard shortcuts (rxs-03)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Cmd/Ctrl+M adds a medicine row when focus is inside the plan pane", async () => {
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"]);

    screen.getByLabelText(/Add medicine/i).focus();

    fireDocumentKey("m", modKey());

    expect(cockpitTelemetry.trackCockpitV2RRxPolishShortcutUsed).toHaveBeenCalledWith(
      {
        combo: "mod+m",
        action: "add-medicine",
      },
    );
    await waitFor(() => {
      // ADD_MEDICINE prepends — new blank editor is index 0; prior row is summary at 1.
      expect(document.getElementById("med-dosage-0")).toBeInTheDocument();
      expect(expandMedicineSummary("Paracetamol")).toBeInTheDocument();
    });
  });

  it("Cmd/Ctrl+Enter from textarea does not send when canSend is true", () => {
    const onSendAndFinish = vi.fn();
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"], {
      onSendAndFinish,
      canSend: true,
    });

    const advice = screen.getByLabelText(/^advice & education$/i);
    advice.focus();

    fireDocumentKey("Enter", modKey());

    expect(onSendAndFinish).not.toHaveBeenCalled();
  });

  it("Cmd/Ctrl+Shift+Enter from textarea sends when canSend is true", () => {
    const onSendAndFinish = vi.fn();
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"], {
      onSendAndFinish,
      canSend: true,
    });

    const advice = screen.getByLabelText(/^advice & education$/i);
    advice.focus();

    fireDocumentKey("Enter", modKey({ shiftKey: true }));

    expect(onSendAndFinish).toHaveBeenCalledTimes(1);
  });
});
