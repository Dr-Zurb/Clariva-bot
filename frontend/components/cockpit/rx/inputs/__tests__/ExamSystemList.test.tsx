import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExamSystemList } from "@/components/cockpit/rx/inputs/ExamSystemList";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { EXAM_CORE_SYSTEM_ORDER } from "@/lib/cockpit/exam-schema";

const prescriptionIdRef = { current: null as string | null };

function ExamFindingsProbe() {
  const { state } = useRxForm();
  return (
    <pre data-testid="exam-findings-probe">
      {JSON.stringify(state.fields.examFindings)}
    </pre>
  );
}

function renderExamList(
  ui: ReactElement = <ExamSystemList />,
  initial?: Partial<RxFormFields>,
) {
  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={{ ...createEmptyRxFormFields(), ...initial }}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {ui}
      <ExamFindingsProbe />
    </RxFormProvider>,
  );
}

function readExamFindings() {
  return JSON.parse(screen.getByTestId("exam-findings-probe").textContent ?? "[]");
}

describe("ExamSystemList (obj-03)", () => {
  it("renders 5 core cards in registry order", () => {
    renderExamList();
    const cards = screen.getAllByTestId(/^exam-system-card-/);
    expect(cards).toHaveLength(5);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual(
      EXAM_CORE_SYSTEM_ORDER.map((id) => `exam-system-card-${id}`),
    );
  });

  it("sets normal status and shows the WNL one-liner on one tap", () => {
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-status-resp-normal"));
    expect(screen.getByText("Chest clear, NVBS bilaterally")).toBeInTheDocument();
    expect(readExamFindings()).toEqual([
      { systemId: "resp", status: "normal", findings: [], notes: null },
    ]);
  });

  it("reveals abnormal chips and writes findings + notes", () => {
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-status-cvs-abnormal"));
    fireEvent.click(screen.getByTestId("exam-finding-cvs-murmur"));
    fireEvent.change(screen.getByTestId("exam-notes-cvs"), {
      target: { value: "grade 3/6" },
    });
    expect(readExamFindings()).toEqual([
      {
        systemId: "cvs",
        status: "abnormal",
        findings: ["Murmur"],
        notes: "grade 3/6",
      },
    ]);
  });

  it("toggles abnormal chips off when clicked again", () => {
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-status-abd-abnormal"));
    const chip = screen.getByTestId("exam-finding-abd-tenderness");
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(readExamFindings()).toEqual([
      { systemId: "abd", status: "abnormal", findings: [], notes: null },
    ]);
  });

  it("clears a system when set back to not examined", () => {
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-status-general-normal"));
    fireEvent.click(screen.getByTestId("exam-status-general-not_examined"));
    expect(readExamFindings()).toEqual([]);
  });

  it('marks all 5 core systems normal via "Mark entire exam normal"', () => {
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-mark-all-normal"));
    const findings = readExamFindings();
    expect(findings).toHaveLength(5);
    expect(findings.map((f: { systemId: string }) => f.systemId)).toEqual([
      ...EXAM_CORE_SYSTEM_ORDER,
    ]);
    for (const row of findings) {
      expect(row.status).toBe("normal");
      expect(row.findings).toEqual([]);
      expect(row.notes).toBeNull();
    }
  });
});

describe("ExamSystemList accessibility (obj-03)", () => {
  it("supports keyboard arrow navigation on the tri-state control", () => {
    renderExamList();
    const notExamined = screen.getByTestId("exam-status-general-not_examined");
    notExamined.focus();
    fireEvent.keyDown(notExamined, { key: "ArrowRight" });
    expect(readExamFindings()).toEqual([
      { systemId: "general", status: "normal", findings: [], notes: null },
    ]);
  });

  it("exposes radiogroup semantics with aria-checked on the selected option", () => {
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-status-cns-normal"));
    expect(screen.getByTestId("exam-status-cns-normal")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("exam-status-cns-abnormal")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("renders read-only when disabled", () => {
    renderExamList(<ExamSystemList disabled />);
    expect(screen.getByTestId("exam-mark-all-normal")).toBeDisabled();
    expect(screen.getByTestId("exam-status-general-normal")).toBeDisabled();
    fireEvent.click(screen.getByTestId("exam-status-general-normal"));
    expect(readExamFindings()).toEqual([]);
  });
});
