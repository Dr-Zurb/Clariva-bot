/**
 * tc-04 — teleconsult-exam close gate.
 *
 * Consolidates in-clinic regression guard, teleconsult behaviour matrix, a11y,
 * and end-to-end derivation proof in one place. Product logic lives in tc-01..03;
 * this file only verifies the cross-cutting gate.
 */
import type { ReactElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExamSystemList } from "@/components/cockpit/rx/inputs/ExamSystemList";
import {
  RxFormProvider,
  TELECONSULT_EXAM_CAVEAT,
  buildRxPayload,
  createEmptyRxFormFields,
  deriveExaminationFindingsFromExam,
  useRxForm,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import {
  listSubsectionsByFeasibility,
  resolveSubsectionRemoteFeasibility,
} from "@/lib/cockpit/exam-schema";
import { ABD_EXAM_SUBSECTIONS } from "@/lib/cockpit/abd-exam-finding-schema";
import { CNS_EXAM_SUBSECTIONS } from "@/lib/cockpit/cns-exam-finding-schema";
import { CVS_EXAM_SUBSECTIONS } from "@/lib/cockpit/cvs-exam-finding-schema";
import { RESP_EXAM_SUBSECTIONS } from "@/lib/cockpit/resp-exam-finding-schema";

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
  consultationType: string | null = "in_clinic",
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
      consultationType={consultationType}
    >
      {ui}
      <ExamFindingsProbe />
    </RxFormProvider>,
  );
}

function renderTeleconsultExamList(initial?: Partial<RxFormFields>) {
  return renderExamList(<ExamSystemList />, initial, "video");
}

function readExamFindings() {
  return JSON.parse(screen.getByTestId("exam-findings-probe").textContent ?? "[]");
}

function expandSystem(systemId: string) {
  fireEvent.click(screen.getByTestId(`exam-toggle-${systemId}`));
}

function subsectionOrder(systemId: string, ids: readonly string[]): string[] {
  const pattern = new RegExp(`^${systemId}-subsection-(?:${ids.join("|")})$`);
  return screen
    .getAllByTestId(pattern)
    .map((el) => el.getAttribute("data-testid") ?? "");
}

function assessableFirst(subsections: readonly { id: string; remote?: string }[]): string[] {
  const assessable = listSubsectionsByFeasibility(subsections, "assessable").map((s) => s.id);
  const inPerson = listSubsectionsByFeasibility(subsections, "in_person_only").map((s) => s.id);
  return [...assessable, ...inPerson];
}

function inPersonOnlyIds(subsections: readonly { id: string; remote?: string }[]): string[] {
  return subsections
    .filter((s) => resolveSubsectionRemoteFeasibility(s) === "in_person_only")
    .map((s) => s.id);
}

/** Generic feasibility labels — must never carry patient identifiers (TC-D / PHI gate). */
const FEASIBILITY_TAG_LABELS = ["In-person only", "Patient-assisted"] as const;

// ---------------------------------------------------------------------------
// 1. In-clinic parity (regression guard · TC-D5)
// ---------------------------------------------------------------------------

describe("tc-04 · in-clinic parity (regression guard)", () => {
  it("1.2 in-clinic: no feasibility tags and subsections are not de-emphasised", () => {
    renderExamList();
    for (const systemId of ["resp", "cvs", "abd", "cns"] as const) {
      expandSystem(systemId);
      expect(screen.queryByText("In-person only")).toBeNull();
      expect(screen.queryByText("Patient-assisted")).toBeNull();
    }
    expandSystem("resp");
    expect(screen.getByTestId("resp-subsection-palpation")).toHaveAttribute(
      "data-deemphasised",
      "false",
    );
  });

  it("1.2 in-clinic: subsection order follows the schema (not assessable-first)", () => {
    renderExamList();
    expandSystem("resp");
    const schemaOrder = RESP_EXAM_SUBSECTIONS.map((s) => `resp-subsection-${s.id}`);
    expect(subsectionOrder("resp", RESP_EXAM_SUBSECTIONS.map((s) => s.id))).toEqual(schemaOrder);
  });

  it("1.2 in-clinic: auto-opens a subsection that already has recorded data", () => {
    renderExamList(<ExamSystemList />, {
      examFindings: [
        {
          systemId: "resp",
          status: "abnormal",
          findings: [{ findingId: "chest_wall_tenderness", attributes: {} }],
          notes: null,
        },
      ],
    });
    expandSystem("resp");
    expect(screen.getByTestId("resp-subsection-palpation")).toHaveAttribute("data-open", "true");
  });
});

// ---------------------------------------------------------------------------
// 2. Teleconsult behaviour matrix
// ---------------------------------------------------------------------------

describe("tc-04 · teleconsult behaviour matrix", () => {
  it("2.1 Respiratory: assessable-first; in-person-only greyed, collapsed, tagged", () => {
    renderTeleconsultExamList();
    expandSystem("resp");

    const expectedOrder = assessableFirst(RESP_EXAM_SUBSECTIONS).map((id) => `resp-subsection-${id}`);
    expect(subsectionOrder("resp", RESP_EXAM_SUBSECTIONS.map((s) => s.id))).toEqual(expectedOrder);

    for (const id of inPersonOnlyIds(RESP_EXAM_SUBSECTIONS)) {
      const subsection = screen.getByTestId(`resp-subsection-${id}`);
      expect(subsection).toHaveAttribute("data-open", "false");
      expect(subsection).toHaveAttribute("data-deemphasised", "true");
      expect(screen.getByTestId(`resp-subsection-tag-${id}`)).toHaveTextContent("In-person only");
    }
  });

  it("2.1 Cardiovascular: assessable-first; palpation/auscultation subsections tagged", () => {
    renderTeleconsultExamList();
    expandSystem("cvs");

    const expectedOrder = assessableFirst(CVS_EXAM_SUBSECTIONS).map((id) => `cvs-subsection-${id}`);
    expect(subsectionOrder("cvs", CVS_EXAM_SUBSECTIONS.map((s) => s.id))).toEqual(expectedOrder);

    for (const id of inPersonOnlyIds(CVS_EXAM_SUBSECTIONS)) {
      expect(screen.getByTestId(`cvs-subsection-${id}`)).toHaveAttribute("data-deemphasised", "true");
      expect(screen.getByTestId(`cvs-subsection-tag-${id}`)).toHaveTextContent("In-person only");
    }
    // Pulse (vitals) stays foregrounded — no tag.
    expect(screen.queryByTestId("cvs-subsection-tag-pulse")).toBeNull();
  });

  it("2.1 Abdomen: assessable-first; palpation/auscultation/percussion tagged", () => {
    renderTeleconsultExamList();
    expandSystem("abd");

    const expectedOrder = assessableFirst(ABD_EXAM_SUBSECTIONS).map((id) => `abd-subsection-${id}`);
    expect(subsectionOrder("abd", ABD_EXAM_SUBSECTIONS.map((s) => s.id))).toEqual(expectedOrder);

    for (const id of inPersonOnlyIds(ABD_EXAM_SUBSECTIONS)) {
      expect(screen.getByTestId(`abd-subsection-tag-${id}`)).toHaveTextContent("In-person only");
    }
  });

  it("2.1 CNS: contact-dependent subsections sink to the bottom", () => {
    renderTeleconsultExamList();
    expandSystem("cns");

    const order = subsectionOrder("cns", CNS_EXAM_SUBSECTIONS.map((s) => s.id));
    const inPerson = inPersonOnlyIds(CNS_EXAM_SUBSECTIONS).map((id) => `cns-subsection-${id}`);
    expect(order.slice(-inPerson.length)).toEqual(inPerson);
  });

  it("2.1 General: all assessable — no feasibility tags anywhere on the card", () => {
    renderTeleconsultExamList();
    expandSystem("general");
    const card = screen.getByTestId("exam-system-card-general");
    for (const label of FEASIBILITY_TAG_LABELS) {
      expect(within(card).queryByText(label)).toBeNull();
    }
  });

  it("2.2 patient-assisted finding stores as today and derives into examination_findings with caveat", () => {
    renderTeleconsultExamList();
    expandSystem("resp");
    fireEvent.click(screen.getByTestId("resp-subsection-toggle-palpation"));
    fireEvent.click(screen.getByTestId("exam-finding-resp-chest-wall-tenderness"));

    const findings = readExamFindings();
    expect(findings).toEqual([
      {
        systemId: "resp",
        status: "abnormal",
        findings: [{ findingId: "chest_wall_tenderness", attributes: {} }],
        notes: null,
      },
    ]);
    expect(screen.getByTestId("resp-subsection-tag-palpation")).toHaveTextContent(
      "Patient-assisted",
    );

    const derived = deriveExaminationFindingsFromExam(findings, { consultationType: "video" });
    expect(derived).toBe(
      ["Respiratory: Chest wall tenderness", TELECONSULT_EXAM_CAVEAT].join("\n"),
    );
    expect(
      buildRxPayload(
        { ...createEmptyRxFormFields(), examFindings: findings },
        { consultationType: "video" },
      ).examinationFindings,
    ).toBe(derived);
  });

  it("2.3 mark normal on teleconsult: scoped preview + derivation; empty exam stays ''", () => {
    renderTeleconsultExamList();
    expandSystem("cvs");
    fireEvent.click(screen.getByTestId("exam-mark-normal-cvs"));
    expect(
      screen.getByText("No raised JVP or peripheral edema on inspection"),
    ).toBeInTheDocument();

    const findings = readExamFindings();
    const derived = deriveExaminationFindingsFromExam(findings, { consultationType: "video" });
    expect(derived).toBe(
      [
        "Cardiovascular: No raised JVP or peripheral edema on inspection",
        TELECONSULT_EXAM_CAVEAT,
      ].join("\n"),
    );
    expect(deriveExaminationFindingsFromExam([], { consultationType: "video" })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 3. Accessibility
// ---------------------------------------------------------------------------

describe("tc-04 · accessibility", () => {
  it("3.1 feasibility tag is textual (announced label, not colour-only)", () => {
    renderTeleconsultExamList();
    expandSystem("resp");

    const tag = screen.getByTestId("resp-subsection-tag-palpation");
    expect(tag).toHaveTextContent("In-person only");
    // The label lives in the element's text content — not only in a CSS class or aria-hidden chrome.
    expect(tag.textContent?.trim()).toBe("In-person only");
    expect(tag.className).not.toMatch(/sr-only|visually-hidden/i);
  });

  it("3.1b in-person-only tag exposes a teleconsult hint (sr-only + hover tooltip)", () => {
    renderTeleconsultExamList();
    expandSystem("resp");

    const toggle = screen.getByTestId("resp-subsection-toggle-palpation");
    expect(toggle).toHaveAttribute(
      "aria-describedby",
      "resp-subsection-hint-palpation",
    );
    const srHint = document.getElementById("resp-subsection-hint-palpation");
    expect(srHint).toHaveTextContent(/not feasible remotely/i);
    expect(srHint?.textContent?.toLowerCase()).not.toContain("video");

    const tag = screen.getByTestId("resp-subsection-tag-palpation");
    fireEvent.focus(tag);
    fireEvent.pointerMove(tag);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/not feasible remotely/i);
  });

  it("3.2 opt-in expand of an in-person-only subsection is keyboard-operable", () => {
    renderTeleconsultExamList();
    expandSystem("resp");

    const toggle = screen.getByTestId("resp-subsection-toggle-palpation");
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("resp-subsection-palpation")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("exam-finding-resp-chest-wall-tenderness")).toBeInTheDocument();
  });

  it("3.3 feasibility labels are generic clinical terms — no identifiers in tag text or test ids", () => {
    renderTeleconsultExamList();
    expandSystem("resp");

    // Only the two approved generic labels may appear — never appointment/patient ids.
    for (const label of FEASIBILITY_TAG_LABELS) {
      expect(label).not.toMatch(/\d{4,}|@|mrn|phone|dob/i);
    }
    const tag = screen.getByTestId("resp-subsection-tag-palpation");
    expect(FEASIBILITY_TAG_LABELS).toContain(tag.textContent?.trim());
    expect(tag.getAttribute("data-testid")).toMatch(/^resp-subsection-tag-[a-z_]+$/);
  });

  it("3.4 CNS cranial: subsection stays assessable; limited chips and cards expose teleconsult hints", () => {
    renderTeleconsultExamList();
    expandSystem("cns");

    expect(screen.queryByTestId("cns-subsection-tag-cranial")).toBeNull();
    expect(screen.getByTestId("cns-subsection-cranial")).toHaveAttribute(
      "data-deemphasised",
      "false",
    );
    expect(screen.getByTestId("cns-cranial-teleconsult-note")).toHaveTextContent(
      /observable on teleconsult/i,
    );

    const absentGag = screen.getByTestId("exam-finding-cns-absent-gag");
    expect(absentGag).toHaveAttribute("data-in-person-only", "true");
    expect(absentGag).toHaveAttribute("data-teleconsult-limited", "true");
    fireEvent.focus(absentGag);
    fireEvent.pointerMove(absentGag);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/not feasible remotely/i);

    const facialDroop = screen.getByTestId("exam-finding-cns-facial-droop");
    expect(facialDroop.getAttribute("data-teleconsult-limited")).not.toBe("true");

    expect(screen.getByTestId("cns-finding-card-cn_vision")).toHaveAttribute(
      "data-teleconsult-limited",
      "true",
    );
    expect(screen.getByTestId("cns-finding-card-cn_facial")).toHaveAttribute(
      "data-teleconsult-limited",
      "false",
    );
  });

  it("3.5 CNS cranial: selecting a flagged chip or card shows Patient-assisted", () => {
    renderTeleconsultExamList();
    expandSystem("cns");
    fireEvent.click(screen.getByTestId("cns-subsection-toggle-cranial"));

    fireEvent.click(screen.getByTestId("exam-finding-cns-absent-gag"));
    expect(screen.getByTestId("exam-finding-cns-absent-gag")).toHaveAttribute(
      "data-patient-assisted",
      "true",
    );
    expect(screen.getByTestId("exam-finding-cns-absent-gag-patient-assisted")).toHaveTextContent(
      "Patient-assisted",
    );

    fireEvent.click(screen.getByTestId("cns-finding-toggle-cn_vision"));
    fireEvent.click(screen.getByTestId("cns-field-cn_vision-fundus-papilledema"));
    expect(screen.getByTestId("cns-finding-card-cn_vision")).toHaveAttribute(
      "data-patient-assisted",
      "true",
    );
    expect(screen.getByTestId("cns-finding-patient-assisted-cn_vision")).toHaveTextContent(
      "Patient-assisted",
    );
    expect(screen.getByTestId("cns-finding-card-cn_vision")).toHaveAttribute(
      "data-teleconsult-limited",
      "false",
    );
  });

  it("3.6 mixed subsections: CVS pulse, General volume, CNS motor expose item hints", () => {
    renderTeleconsultExamList();

    expandSystem("cvs");
    expect(screen.getByTestId("cvs-pulse-teleconsult-note")).toHaveTextContent(/teleconsult/i);
    expect(screen.getByTestId("exam-finding-cvs-radio-radial-delay")).toHaveAttribute(
      "data-teleconsult-limited",
      "true",
    );
    expect(screen.getByTestId("cvs-inline-finding-pulse")).toHaveAttribute(
      "data-teleconsult-limited",
      "true",
    );

    expandSystem("general");
    expect(screen.getByTestId("general-volume-teleconsult-note")).toHaveTextContent(/teleconsult/i);
    expect(screen.getByTestId("general-finding-card-edema")).toHaveAttribute(
      "data-teleconsult-limited",
      "true",
    );

    expandSystem("cns");
    expect(screen.getByTestId("cns-motor-teleconsult-note")).toHaveTextContent(/teleconsult/i);
    expect(screen.getByTestId("exam-finding-cns-spasticity")).toHaveAttribute(
      "data-teleconsult-limited",
      "true",
    );
    expect(screen.getByTestId("cns-finding-card-weakness")).toHaveAttribute(
      "data-teleconsult-limited",
      "true",
    );
  });
});
