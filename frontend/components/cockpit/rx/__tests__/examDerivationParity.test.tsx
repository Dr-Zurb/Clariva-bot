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
  TELECONSULT_EXAM_CAVEAT,
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
    findings: [
      { findingId: "wheeze", attributes: {} },
      { findingId: "crackles", attributes: {} },
    ],
    notes: null,
  },
  {
    systemId: "cvs",
    status: "abnormal",
    findings: [{ findingId: "murmur", attributes: {} }],
    notes: "grade 3/6",
  },
];

const EXPECTED_STRUCTURED_TEXT = [
  "General: Normal",
  "Cardiovascular: Murmur (grade 3/6)",
  "Respiratory: Wheeze; Crackles",
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
      {
        systemId: "spine_exam",
        status: "abnormal",
        findings: [{ findingId: "tenderness", attributes: {} }],
        notes: null,
      },
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
      consultationType="in_clinic"
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
        {
          systemId: "cvs",
          status: "abnormal",
          findings: [
            {
              findingId: "murmur",
              attributes: { timing: "Systolic", grade: "3/6", area: "Mitral" },
            },
          ],
          notes: null,
        },
      ],
    });

    expect(screen.getByTestId("exam-summary-resp")).toHaveTextContent(
      "Bilateral air entry normal, no added sounds",
    );
    expect(screen.getByTestId("exam-summary-cvs")).toHaveTextContent(
      "Murmur · Systolic · 3/6 · Mitral",
    );
    fireEvent.click(screen.getByTestId("exam-toggle-cvs"));
    fireEvent.click(screen.getByTestId("cvs-finding-toggle-murmur"));
    expect(screen.getByTestId("cvs-field-murmur-timing-systolic")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("still previews legacy murmur findingId on load (chip vocabulary migration)", () => {
    renderExamList({
      examFindings: [
        {
          systemId: "cvs",
          status: "abnormal",
          findings: [{ findingId: "murmur", attributes: {} }],
          notes: null,
        },
      ],
    });
    expect(screen.getByTestId("exam-summary-cvs")).toHaveTextContent("Murmur");
    fireEvent.click(screen.getByTestId("exam-toggle-cvs"));
    fireEvent.click(screen.getByTestId("cvs-finding-toggle-murmur"));
    expect(screen.getByTestId("cvs-field-murmur-timing-systolic")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("migrates legacy systolic_murmur chip rows into structured murmur on load", () => {
    renderExamList({
      examFindings: [
        {
          systemId: "cvs",
          status: "abnormal",
          findings: [{ findingId: "systolic_murmur", attributes: {} }],
          notes: null,
        },
      ],
    });
    expect(readExamFindings()).toEqual([
      {
        systemId: "cvs",
        status: "abnormal",
        findings: [{ findingId: "murmur", attributes: { timing: "Systolic" } }],
        notes: null,
      },
    ]);
    fireEvent.click(screen.getByTestId("exam-toggle-cvs"));
    fireEvent.click(screen.getByTestId("cvs-finding-toggle-murmur"));
    expect(screen.getByTestId("cvs-field-murmur-timing-systolic")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("edit reflects in state and re-derives deterministically (edit → save)", () => {
    renderExamList({
      examFindings: [
        {
          systemId: "cvs",
          status: "abnormal",
          findings: [
            { findingId: "murmur", attributes: { timing: "Systolic", grade: "2/6" } },
          ],
          notes: null,
        },
      ],
    });

    fireEvent.click(screen.getByTestId("exam-toggle-cvs"));
    fireEvent.click(screen.getByTestId("exam-finding-cvs-parasternal-heave"));
    const next = readExamFindings();
    expect(next).toEqual([
      {
        systemId: "cvs",
        status: "abnormal",
        findings: [
          { findingId: "murmur", attributes: { timing: "Systolic", grade: "2/6" } },
          { findingId: "parasternal_heave", attributes: {} },
        ],
        notes: null,
      },
    ]);
    expect(deriveExaminationFindingsFromExam(next)).toBe(
      "Cardiovascular: Murmur (Systolic, 2/6); Parasternal heave",
    );
  });

  it("expand toggle reveals General subsection body (obj-32)", () => {
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-toggle-general"));
    expect(screen.getByTestId("general-subsection-appearance")).toBeInTheDocument();
    expect(screen.getByTestId("general-finding-card-pallor")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("exam-mark-normal-general"));
    expect(readExamFindings()).toEqual([
      { systemId: "general", status: "normal", findings: [], notes: null },
    ]);
  });

  it("disabled mode renders read-only (no edits commit)", () => {
    renderExamList(
      { examFindings: [{ systemId: "cns", status: "normal", findings: [], notes: null }] },
      true,
    );
    expect(screen.getByTestId("exam-mark-all-normal")).toBeDisabled();
    fireEvent.click(screen.getByTestId("exam-toggle-general"));
    expect(screen.getByTestId("exam-mark-normal-general")).toBeDisabled();
    fireEvent.click(screen.getByTestId("general-finding-toggle-pallor"));
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

// ---------------------------------------------------------------------------
// tc-03 — scoped teleconsult normal line + limitation caveat (TC-D4 / TC-D5)
// ---------------------------------------------------------------------------

describe("teleconsult exam derivation (tc-03)", () => {
  it("in-clinic byte-parity: explicit in_clinic matches the no-options default", () => {
    const inClinic = deriveExaminationFindingsFromExam(STRUCTURED_EXAM, {
      consultationType: "in_clinic",
    });
    expect(inClinic).toBe(EXPECTED_STRUCTURED_TEXT);
    expect(inClinic).toBe(deriveExaminationFindingsFromExam(STRUCTURED_EXAM));
  });

  it("scopes each normal system to its inspection-only WNL line", () => {
    const text = deriveExaminationFindingsFromExam(
      [
        { systemId: "general", status: "normal", findings: [], notes: null },
        { systemId: "cvs", status: "normal", findings: [], notes: null },
        { systemId: "resp", status: "normal", findings: [], notes: null },
        { systemId: "abd", status: "normal", findings: [], notes: null },
        { systemId: "cns", status: "normal", findings: [], notes: null },
      ],
      { consultationType: "video" },
    );
    expect(text).toBe(
      [
        "General: Well appearing, not in distress",
        "Cardiovascular: No raised JVP or peripheral edema on inspection",
        "Respiratory: No respiratory distress on inspection",
        "Abdomen: No abdominal distension on inspection",
        "CNS / Neuro: Alert and oriented on remote assessment",
        TELECONSULT_EXAM_CAVEAT,
      ].join("\n"),
    );
  });

  it("appends the limitation caveat exactly once after a mixed normal + abnormal block", () => {
    const text = deriveExaminationFindingsFromExam(STRUCTURED_EXAM, {
      consultationType: "video",
    });
    expect(text).toBe(
      [
        "General: Well appearing, not in distress",
        "Cardiovascular: Murmur (grade 3/6)",
        "Respiratory: Wheeze; Crackles",
        "Abdomen: No abdominal distension on inspection",
        "CNS / Neuro: Abnormal",
        TELECONSULT_EXAM_CAVEAT,
      ].join("\n"),
    );
    // Exactly once — not per system.
    expect(text.split(TELECONSULT_EXAM_CAVEAT)).toHaveLength(2);
  });

  it("returns '' for an empty exam even on teleconsult (legacy fallback preserved)", () => {
    expect(deriveExaminationFindingsFromExam([], { consultationType: "video" })).toBe("");
  });

  it("null/unknown modality is treated as teleconsult (isTeleconsult semantics), undefined stays in-clinic", () => {
    const abnormalOnly: ExamSystemFinding[] = [
      { systemId: "resp", status: "abnormal", findings: [{ findingId: "wheeze", attributes: {} }], notes: null },
    ];
    // Explicit null → teleconsult (caveat appended).
    expect(deriveExaminationFindingsFromExam(abnormalOnly, { consultationType: null })).toBe(
      ["Respiratory: Wheeze", TELECONSULT_EXAM_CAVEAT].join("\n"),
    );
    // No options / undefined → in-clinic default (no caveat), byte-identical.
    expect(deriveExaminationFindingsFromExam(abnormalOnly)).toBe("Respiratory: Wheeze");
  });

  it("buildRxPayload threads the modality: default is in-clinic, video scopes + caveats", () => {
    const fields = createEmptyRxFormFields();
    fields.examFindings = STRUCTURED_EXAM;

    expect(buildRxPayload(fields).examinationFindings).toBe(EXPECTED_STRUCTURED_TEXT);
    expect(buildRxPayload(fields, { consultationType: "in_clinic" }).examinationFindings).toBe(
      EXPECTED_STRUCTURED_TEXT,
    );

    const teleconsult = buildRxPayload(fields, { consultationType: "video" });
    expect(teleconsult.examinationFindings).toContain(
      "Abdomen: No abdominal distension on inspection",
    );
    expect(teleconsult.examinationFindings?.endsWith(TELECONSULT_EXAM_CAVEAT)).toBe(true);
    // The stored structured JSON is modality-independent (nothing new persisted).
    expect(teleconsult.examinationJson).toEqual(buildRxPayload(fields).examinationJson);
  });
});
