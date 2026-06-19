/**
 * obj-04 close-gate — structured-exam `examination_findings` byte-parity.
 *
 * Gate-critical (OBJ-D2 / P1-D2): the Objective-tab program changed only HOW
 * `examination_findings` is derived on the client (`buildRxPayload`) and
 * persists it to the SAME `prescriptions.examination_findings` column. The
 * downstream consumers that read it do so verbatim:
 *   - Snapshot / visit detail (VisitDetailSideSheet): renders `examination_findings`.
 *   - PDF body (PrescriptionPdfBodyData): does NOT carry an exam field.
 *   - SMS summary (notification-service): does NOT read examination_findings
 *     (asserted in backend notification-prescription-summary.test.ts).
 *
 * This file asserts:
 *   1. A LEGACY row (empty examFindings + General/Systemic free-text) derives
 *      `examination_findings` byte-identical to the input — the snapshot
 *      consumer is therefore unchanged.
 *   2. A STRUCTURED row derives a deterministic, registry-ordered + labelled
 *      string (no insertion-order / key-order dependence; reproducible).
 *   3. Edge cases (empty findings, notes-only abnormal, unknown systemId) stay
 *      deterministic and never throw.
 *   4. Exam state is isolated from the cc/hopi/Dx pipeline columns.
 *   5. save → reload → re-save is a stable fixed point.
 *   6. Component round-trip + a11y over the tri-state cards.
 *
 * Verification only — the sole production change in this slice is obj-01's
 * derivation single-sourcing obj-02's registry (RxFormContext).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  deriveExaminationFindingsFromExam,
  rxFormFieldsFromPrescription,
  useRxForm,
  type ExamSystemFinding,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { ExamSystemList } from "@/components/cockpit/rx/inputs/ExamSystemList";
import { EXAM_CORE_SYSTEM_ORDER } from "@/lib/cockpit/exam-schema";
import { EXAM_DELIMITER, serializeExam } from "@/lib/cockpit/exam-findings";
import type { PrescriptionWithRelations } from "@/types/prescription";

// Columns the PDF body + SMS summary + snapshot actually read off the row.
// `examination_findings` is consumed verbatim by the snapshot; cc/hopi/Dx are
// the unrelated pipeline columns the exam program must never perturb.
const PIPELINE_COLUMNS = [
  "cc",
  "hopi",
  "provisionalDiagnosis",
  "investigations",
  "followUp",
  "medicines",
] as const;

function pipelineProjection(payload: ReturnType<typeof buildRxPayload>) {
  return Object.fromEntries(
    PIPELINE_COLUMNS.map((key) => [key, payload[key] ?? null]),
  );
}

const STRUCTURED_EXAM: ExamSystemFinding[] = [
  // Deliberately scrambled vs. registry order to prove order-independence.
  { systemId: "cns", status: "abnormal", findings: [], notes: null },
  { systemId: "abd", status: "normal", findings: [], notes: null },
  { systemId: "general", status: "normal", findings: [], notes: null },
  {
    systemId: "resp",
    status: "abnormal",
    findings: ["Wheeze", "Crackles"],
    notes: null,
  },
  {
    systemId: "cvs",
    status: "abnormal",
    findings: ["Murmur"],
    notes: "grade 3/6",
  },
];

const EXPECTED_STRUCTURED_TEXT = [
  "General: Normal",
  "Cardiovascular: Murmur (grade 3/6)",
  "Respiratory: Wheeze, Crackles",
  "Abdomen: Normal",
  "CNS / Neuro: Abnormal",
].join("\n");

describe("obj-04 close-gate · examination_findings byte-parity", () => {
  it("legacy row (no structured exam) passes examination_findings through byte-identically", () => {
    const legacyText = `Alert, no distress${EXAM_DELIMITER}Chest clear, abdomen soft`;
    const fields = createEmptyRxFormFields();
    fields.examinationFindings = legacyText;
    // examFindings stays [] — the structured path is not engaged.

    const payload = buildRxPayload(fields);

    expect(payload.examinationFindings).toBe(legacyText);
    expect(payload.examinationJson).toEqual([]);
  });

  it("legacy delimiter round-trips through serializeExam without mutation", () => {
    const general = "Pale, afebrile";
    const systemic = "S1S2 normal";
    const fields = createEmptyRxFormFields();
    fields.examinationFindings = serializeExam(general, systemic);

    const payload = buildRxPayload(fields);
    expect(payload.examinationFindings).toBe(`${general}${EXAM_DELIMITER}${systemic}`);
  });

  it("structured row derives a deterministic, registry-ordered + labelled string", () => {
    const fields = createEmptyRxFormFields();
    fields.examFindings = STRUCTURED_EXAM;
    // A legacy free-text value present too — structured wins on derivation.
    fields.examinationFindings = "stale free text";

    const payload = buildRxPayload(fields);
    expect(payload.examinationFindings).toBe(EXPECTED_STRUCTURED_TEXT);
  });

  it("derivation is insertion-order independent and reproducible across runs", () => {
    const a = deriveExaminationFindingsFromExam(STRUCTURED_EXAM);
    const reversed = deriveExaminationFindingsFromExam([...STRUCTURED_EXAM].reverse());
    const b = deriveExaminationFindingsFromExam(STRUCTURED_EXAM);
    expect(a).toBe(EXPECTED_STRUCTURED_TEXT);
    expect(reversed).toBe(EXPECTED_STRUCTURED_TEXT);
    expect(b).toBe(a);
  });

  it("edge cases stay deterministic and never throw", () => {
    expect(() =>
      deriveExaminationFindingsFromExam([
        { systemId: "abd", status: "abnormal", findings: [], notes: null },
        { systemId: "cvs", status: "abnormal", findings: [], notes: "soft murmur" },
        { systemId: "general", status: "normal", findings: [], notes: null },
      ]),
    ).not.toThrow();

    expect(
      deriveExaminationFindingsFromExam([
        { systemId: "general", status: "normal", findings: [], notes: null },
        { systemId: "cvs", status: "abnormal", findings: [], notes: "soft murmur" },
        { systemId: "abd", status: "abnormal", findings: [], notes: null },
      ]),
    ).toBe(
      [
        "General: Normal",
        "Cardiovascular: Abnormal (soft murmur)",
        "Abdomen: Abnormal",
      ].join("\n"),
    );
  });

  it("an unknown systemId sorts after the core set with a humanized fallback label", () => {
    const text = deriveExaminationFindingsFromExam([
      { systemId: "spine_exam", status: "abnormal", findings: ["Tenderness"], notes: null },
      { systemId: "general", status: "normal", findings: [], notes: null },
    ]);
    expect(text).toBe(["General: Normal", "Spine Exam: Tenderness"].join("\n"));
  });

  it("structured exam is isolated from the cc/hopi/Dx pipeline columns", () => {
    const withExam = createEmptyRxFormFields();
    withExam.cc = "Cough";
    withExam.provisionalDiagnosis = "Bronchitis";
    withExam.examFindings = STRUCTURED_EXAM;

    const withoutExam = createEmptyRxFormFields();
    withoutExam.cc = "Cough";
    withoutExam.provisionalDiagnosis = "Bronchitis";

    expect(pipelineProjection(buildRxPayload(withExam))).toEqual(
      pipelineProjection(buildRxPayload(withoutExam)),
    );
  });

  it("save → reload → re-save is a stable fixed point for exam fields", () => {
    const fields = createEmptyRxFormFields();
    fields.examFindings = STRUCTURED_EXAM;

    const firstSave = buildRxPayload(fields);

    const reloadedRow = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "structured",
      examination_findings: firstSave.examinationFindings ?? null,
      examination_json: firstSave.examinationJson ?? [],
    } as unknown as PrescriptionWithRelations;

    const secondSave = buildRxPayload(rxFormFieldsFromPrescription(reloadedRow));

    expect(secondSave.examinationFindings).toBe(firstSave.examinationFindings);
    expect(secondSave.examinationJson).toEqual(firstSave.examinationJson);
    expect(secondSave.examinationFindings).toBe(EXPECTED_STRUCTURED_TEXT);
  });
});

// ---------------------------------------------------------------------------
// Component round-trip + a11y over the tri-state cards (gate 2.1 / 2.2)
// ---------------------------------------------------------------------------

const prescriptionIdRef = { current: null as string | null };

function ExamFindingsProbe() {
  const { state } = useRxForm();
  return (
    <pre data-testid="exam-findings-probe">
      {JSON.stringify(state.fields.examFindings)}
    </pre>
  );
}

function renderExamList(initial?: Partial<RxFormFields>, disabled = false) {
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
      <ExamSystemList disabled={disabled} />
      <ExamFindingsProbe />
    </RxFormProvider>,
  );
}

function readExamFindings(): ExamSystemFinding[] {
  return JSON.parse(screen.getByTestId("exam-findings-probe").textContent ?? "[]");
}

describe("obj-04 close-gate · exam card round-trip + a11y", () => {
  it("hydrates cards from a stored structured prescription (load → reflect)", () => {
    renderExamList({
      examFindings: [
        { systemId: "resp", status: "normal", findings: [], notes: null },
        { systemId: "cvs", status: "abnormal", findings: ["Murmur"], notes: null },
      ],
    });

    // resp normal → WNL one-liner visible; its status radio is checked.
    expect(screen.getByText("Chest clear, NVBS bilaterally")).toBeInTheDocument();
    expect(screen.getByTestId("exam-status-resp-normal")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // cvs abnormal → selected chip reflects stored finding.
    expect(screen.getByTestId("exam-finding-cvs-murmur")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("edit reflects in state and re-derives deterministically (edit → save)", () => {
    renderExamList({
      examFindings: [{ systemId: "cvs", status: "abnormal", findings: ["Murmur"], notes: null }],
    });

    fireEvent.click(screen.getByTestId("exam-finding-cvs-gallop"));
    const next = readExamFindings();
    expect(next).toEqual([
      { systemId: "cvs", status: "abnormal", findings: ["Murmur", "Gallop"], notes: null },
    ]);
    expect(deriveExaminationFindingsFromExam(next)).toBe(
      "Cardiovascular: Murmur, Gallop",
    );
  });

  it("tri-state control is keyboard operable with correct aria", () => {
    renderExamList();
    const notExamined = screen.getByTestId("exam-status-general-not_examined");
    notExamined.focus();
    fireEvent.keyDown(notExamined, { key: "ArrowRight" });
    expect(readExamFindings()).toEqual([
      { systemId: "general", status: "normal", findings: [], notes: null },
    ]);
    expect(screen.getByTestId("exam-status-general-normal")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("disabled mode renders read-only (no edits commit)", () => {
    renderExamList(
      { examFindings: [{ systemId: "cns", status: "normal", findings: [], notes: null }] },
      true,
    );
    expect(screen.getByTestId("exam-mark-all-normal")).toBeDisabled();
    expect(screen.getByTestId("exam-status-general-abnormal")).toBeDisabled();
    fireEvent.click(screen.getByTestId("exam-status-general-abnormal"));
    // State unchanged — the only entry remains the pre-seeded cns normal.
    expect(readExamFindings()).toEqual([
      { systemId: "cns", status: "normal", findings: [], notes: null },
    ]);
  });

  it('"mark entire exam normal" sets all 5 core systems in registry order', () => {
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-mark-all-normal"));
    const findings = readExamFindings();
    expect(findings.map((f) => f.systemId)).toEqual([...EXAM_CORE_SYSTEM_ORDER]);
    expect(deriveExaminationFindingsFromExam(findings)).toBe(
      [
        "General: Normal",
        "Cardiovascular: Normal",
        "Respiratory: Normal",
        "Abdomen: Normal",
        "CNS / Neuro: Normal",
      ].join("\n"),
    );
  });
});
