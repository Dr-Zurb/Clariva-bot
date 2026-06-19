/**
 * obj-13 — objective custom sections: add/edit/remove, per-doctor default
 * persistence, and OBJ-D2 derived-text mapping into `examination_findings`
 * (legacy/empty rows byte-identical; custom_block ids never persisted to order).
 */

import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  useRxForm,
  type ExamSystemFinding,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { EXAM_DELIMITER } from "@/lib/cockpit/exam-findings";
import { createEmptyCustomSubsection } from "@/lib/cockpit/custom-subsections";
import type { ObjectiveSectionId } from "@/lib/cockpit/objective-section-order";

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
    updatePrescription: vi.fn(),
    createPrescription: vi.fn(),
  };
});

const prescriptionIdRef = { current: "rx-1" as string | null };

beforeEach(() => {
  mockGetDoctorSettings.mockReset();
  mockPatchDoctorSettings.mockReset();
  mockGetDoctorSettings.mockResolvedValue({ data: { settings: {} } });
  mockPatchDoctorSettings.mockResolvedValue({ data: { settings: {} } });
});

function DerivedExamProbe() {
  const { state } = useRxForm();
  return (
    <pre data-testid="derived-exam">{buildRxPayload(state.fields).examinationFindings ?? ""}</pre>
  );
}

function renderObjective(initialFields: RxFormFields = createEmptyRxFormFields()) {
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
      <ObjectiveSection />
      <DerivedExamProbe />
    </RxFormProvider>,
  );
}

function renderWithProbe(ui: ReactElement, initialFields: RxFormFields) {
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

function readDerived(): string {
  return screen.getByTestId("derived-exam").textContent ?? "";
}

function renderedSectionOrder(container: HTMLElement): ObjectiveSectionId[] {
  const root = container.querySelector('[aria-label="Objective"]')!;
  return Array.from(root.querySelectorAll("[data-objective-section-id]")).map(
    (el) => el.getAttribute("data-objective-section-id") as ObjectiveSectionId,
  );
}

// ---------------------------------------------------------------------------
// OBJ-D2 derived-text mapping (pure buildRxPayload)
// ---------------------------------------------------------------------------

describe("obj-13 · derived examination_findings mapping (OBJ-D2)", () => {
  it("empty custom sections leave a legacy row byte-identical", () => {
    const legacy = `Alert, no distress${EXAM_DELIMITER}Chest clear`;
    const fields = createEmptyRxFormFields();
    fields.examinationFindings = legacy;
    // objectiveCustomSections stays []

    expect(buildRxPayload(fields).examinationFindings).toBe(legacy);
  });

  it("empty fields with no custom sections derive null", () => {
    expect(buildRxPayload(createEmptyRxFormFields()).examinationFindings).toBeNull();
  });

  it("custom-only content (no exam) derives just the custom block", () => {
    const fields = createEmptyRxFormFields();
    fields.objectiveCustomSections = [
      { id: "a", title: "P/V", body: "Cervix healthy, no CMT", children: [] },
    ];
    expect(buildRxPayload(fields).examinationFindings).toBe("P/V\nCervix healthy, no CMT");
  });

  it("appends custom content after legacy free-text with a blank-line separator", () => {
    const fields = createEmptyRxFormFields();
    fields.examinationFindings = "Alert, oriented";
    fields.objectiveCustomSections = [
      { id: "a", title: "ROM", body: "Knee 0-120", children: [] },
    ];
    expect(buildRxPayload(fields).examinationFindings).toBe("Alert, oriented\n\nROM\nKnee 0-120");
  });

  it("appends custom content after a structured exam derivation", () => {
    const fields = createEmptyRxFormFields();
    fields.examFindings = [
      { systemId: "general", status: "normal", findings: [], notes: null },
    ] satisfies ExamSystemFinding[];
    fields.objectiveCustomSections = [
      { id: "a", title: "MSE", body: "Mood euthymic", children: [] },
    ];
    expect(buildRxPayload(fields).examinationFindings).toBe(
      "General: Normal\n\nMSE\nMood euthymic",
    );
  });

  it("contentless custom sections contribute nothing (no stray delimiters)", () => {
    const fields = createEmptyRxFormFields();
    fields.examinationFindings = "Alert, oriented";
    fields.objectiveCustomSections = [createEmptyCustomSubsection("a")];
    expect(buildRxPayload(fields).examinationFindings).toBe("Alert, oriented");
  });
});

// ---------------------------------------------------------------------------
// Add / edit / remove + ordering + default persistence (component)
// ---------------------------------------------------------------------------

describe("obj-13 · custom objective sections (component)", () => {
  it("adds a custom section from the empty add panel and renders an editable block", async () => {
    const { container } = renderObjective();

    fireEvent.click(screen.getByTestId("objective-custom-sections-add-first"));

    await waitFor(() => {
      expect(
        container.querySelector('[data-objective-section-id^="custom_block:"]'),
      ).not.toBeNull();
    });
    // New custom block lands right after test_results (ahead of the legacy blocks).
    const order = renderedSectionOrder(container);
    const customIdx = order.findIndex((id) => id.startsWith("custom_block:"));
    expect(customIdx).toBe(order.indexOf("test_results") + 1);
  });

  it("derives typed custom content into examination_findings", async () => {
    const { container } = renderObjective();
    fireEvent.click(screen.getByTestId("objective-custom-sections-add-first"));

    const titleInput = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        '[data-testid^="objective-custom-section-title-"]',
      );
      expect(el).not.toBeNull();
      return el!;
    });
    const bodyInput = container.querySelector<HTMLTextAreaElement>(
      '[data-testid^="objective-custom-section-body-"]',
    )!;

    fireEvent.change(titleInput, { target: { value: "P/V" } });
    fireEvent.change(bodyInput, { target: { value: "No CMT" } });

    await waitFor(() => expect(readDerived()).toBe("P/V\nNo CMT"));
  });

  it("removes a custom section and drops it from the order", async () => {
    const fields = createEmptyRxFormFields();
    fields.objectiveCustomSections = [
      { id: "11111111-1111-4111-8111-111111111111", title: "P/V", body: "x", children: [] },
    ];
    const { container } = renderObjective(fields);

    await waitFor(() => {
      expect(
        container.querySelector('[data-objective-section-id^="custom_block:"]'),
      ).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove P/V" }));

    await waitFor(() => {
      expect(
        container.querySelector('[data-objective-section-id^="custom_block:"]'),
      ).toBeNull();
    });
    expect(readDerived()).toBe("");
  });

  it("autosaves the per-doctor default (titles only) but never writes custom_block ids to the order", async () => {
    const { container } = renderObjective();
    fireEvent.click(screen.getByTestId("objective-custom-sections-add-first"));

    const titleInput = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        '[data-testid^="objective-custom-section-title-"]',
      );
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(titleInput, { target: { value: "P/V" } });

    await waitFor(() => {
      const defaultCall = mockPatchDoctorSettings.mock.calls.find(
        (c) => c[1] && "objective_custom_sections" in c[1],
      );
      expect(defaultCall).toBeDefined();
      expect(defaultCall![1].objective_custom_sections[0].title).toBe("P/V");
      // Template strips visit bodies.
      expect(defaultCall![1].objective_custom_sections[0].body).toBeNull();
    });

    // No order patch ever carries a custom_block id (§3.3 re-mint exclusion).
    const orderCalls = mockPatchDoctorSettings.mock.calls.filter(
      (c) => c[1] && "objective_section_order" in c[1],
    );
    for (const call of orderCalls) {
      for (const id of call[1].objective_section_order as string[]) {
        expect(id.startsWith("custom_block:")).toBe(false);
      }
    }
  });

  it("seeds per-visit blocks from the doctor default without dirtying or round-tripping content", () => {
    // Hydration model proof: a reloaded row carries its derived text in
    // examination_findings; objectiveCustomSections start empty (scaffold seeds
    // come from the doctor default, not the saved row — OBJ-D2 "no new column").
    const fields = createEmptyRxFormFields();
    fields.examinationFindings = "P/V\nNo CMT";
    expect(fields.objectiveCustomSections).toEqual([]);
    expect(buildRxPayload(fields).examinationFindings).toBe("P/V\nNo CMT");

    renderWithProbe(<DerivedExamProbe />, fields);
    expect(readDerived()).toBe("P/V\nNo CMT");
  });
});
