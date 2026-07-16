import type { ReactElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExamSystemList } from "@/components/cockpit/rx/inputs/ExamSystemList";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  deriveExaminationFindingsFromExam,
  useRxForm,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { EXAM_CORE_SYSTEM_ORDER } from "@/lib/cockpit/exam-schema";

const prescriptionIdRef = { current: null as string | null };

function ExamFindingsProbe() {
  const { state } = useRxForm();
  return (
    <>
      <pre data-testid="exam-findings-probe">
        {JSON.stringify(state.fields.examFindings)}
      </pre>
      <pre data-testid="vitals-fields-probe">
        {JSON.stringify({
          vitalsHr: state.fields.vitalsHr,
          vitalsPulseRhythm: state.fields.vitalsPulseRhythm,
          vitalsNotes: state.fields.vitalsNotes,
        })}
      </pre>
    </>
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

/** tc-02: render the exam list under a teleconsult modality (video). */
function renderTeleconsultExamList(initial?: Partial<RxFormFields>) {
  return renderExamList(<ExamSystemList />, initial, "video");
}

function subsectionOrder(systemId: string, ids: readonly string[]): string[] {
  const pattern = new RegExp(`^${systemId}-subsection-(?:${ids.join("|")})$`);
  return screen
    .getAllByTestId(pattern)
    .map((el) => el.getAttribute("data-testid") ?? "");
}

function readVitalsField(key: "vitalsHr" | "vitalsPulseRhythm" | "vitalsNotes") {
  const all = JSON.parse(screen.getByTestId("vitals-fields-probe").textContent ?? "{}");
  return all[key];
}

function readExamFindings() {
  return JSON.parse(screen.getByTestId("exam-findings-probe").textContent ?? "[]");
}

function expandSystem(systemId: string) {
  fireEvent.click(screen.getByTestId(`exam-toggle-${systemId}`));
}

/** Open a collapsible edema site card so its detail fields become interactive. */
function openEdemaCard(site: string) {
  fireEvent.click(screen.getByTestId(`general-edema-panel-${site}-toggle`));
}

/** Open a collapsible lymphadenopathy site card so its detail fields become interactive. */
function openLymphCard(site: string) {
  fireEvent.click(screen.getByTestId(`general-lymph-panel-${site}-toggle`));
}

describe("ExamSystemList (obj-03 · obj-30)", () => {
  it("renders 5 core cards plus Additional notes in registry order", () => {
    renderExamList();
    const cards = screen.getAllByTestId(/^exam-system-card-/);
    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      ...EXAM_CORE_SYSTEM_ORDER.map((id) => `exam-system-card-${id}`),
      "exam-system-card-additional_notes",
    ]);
  });

  it("starts with nothing selected (implicitly not examined) and shows the count summary", () => {
    renderExamList();
    expect(readExamFindings()).toEqual([]);
    expect(screen.queryByTestId("exam-status-general-normal")).toBeNull();
    expect(screen.getByTestId("exam-summary-counts")).toHaveTextContent(
      "0 normal · 0 abnormal · 5 not examined",
    );
  });

  it("toggles Mark normal off when clicked again", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("exam-mark-normal-general"));
    expect(readExamFindings()).toEqual([
      { systemId: "general", status: "normal", findings: [], notes: null },
    ]);
    fireEvent.click(screen.getByTestId("exam-mark-normal-general"));
    expect(readExamFindings()).toEqual([]);
    expect(screen.getByTestId("exam-mark-normal-general")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("selecting a finding deselects Mark normal", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("exam-mark-normal-general"));
    fireEvent.click(screen.getByTestId("exam-mark-normal-general"));
    fireEvent.click(screen.getByTestId("general-finding-toggle-cyanosis"));
    fireEvent.click(screen.getByTestId("general-field-cyanosis-centralSites-lips"));
    expect(readExamFindings()).toEqual([
      {
        systemId: "general",
        status: "abnormal",
        findings: [{ findingId: "cyanosis", attributes: { centralSites: "Lips" } }],
        notes: null,
      },
    ]);
    expect(screen.getByTestId("exam-mark-normal-general")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("hides finding cards when Mark normal is active", () => {
    renderExamList();
    expandSystem("general");
    expect(screen.getByTestId("general-finding-card-pallor")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("exam-mark-normal-general"));
    expect(screen.queryByTestId("general-finding-card-pallor")).toBeNull();
    expect(screen.queryByTestId("general-subsection-appearance")).toBeNull();
  });

  it("always shows all General finding cards collapsed (obj-32)", () => {
    renderExamList();
    expandSystem("general");
    expect(screen.getByTestId("general-finding-card-pallor")).toHaveAttribute(
      "data-recorded",
      "false",
    );
    expect(screen.getByTestId("general-finding-card-cyanosis")).toBeInTheDocument();
    // Body stays mounted for the smooth height animation, but is collapsed/hidden
    // (inside an aria-hidden region) until the finding is opened.
    expect(
      screen
        .getByTestId("general-field-cyanosis-centralSites-lips")
        .closest('[aria-hidden="true"]'),
    ).not.toBeNull();
    fireEvent.click(screen.getByTestId("general-finding-toggle-cyanosis"));
    expect(screen.getByTestId("general-field-group-cyanosis-central")).toBeInTheDocument();
    expect(screen.getByTestId("general-field-cyanosis-centralSites-lips")).toBeInTheDocument();
  });

  it("keeps the card expanded when deselecting the last chip (obj-32 bug)", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("general-finding-toggle-cyanosis"));
    const lips = screen.getByTestId("general-field-cyanosis-centralSites-lips");
    fireEvent.click(lips);
    expect(readExamFindings()).toEqual([
      {
        systemId: "general",
        status: "abnormal",
        findings: [{ findingId: "cyanosis", attributes: { centralSites: "Lips" } }],
        notes: null,
      },
    ]);
    // Deselecting the only chip clears the row but the card stays open.
    fireEvent.click(screen.getByTestId("general-field-cyanosis-centralSites-lips"));
    expect(readExamFindings()).toEqual([]);
    expect(screen.getByTestId("general-field-cyanosis-centralSites-lips")).toBeInTheDocument();
  });

  it("records per-site edema with independent laterality and grade (obj-32)", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("general-finding-toggle-edema"));
    fireEvent.click(screen.getByTestId("general-edema-site-chip-pedal"));
    fireEvent.click(screen.getByTestId("general-edema-site-chip-ankle"));
    openEdemaCard("pedal");
    fireEvent.click(screen.getByTestId("general-edema-pedal-laterality-left"));
    fireEvent.click(screen.getByTestId("general-edema-pedal-grade-g2"));
    openEdemaCard("ankle");
    fireEvent.click(screen.getByTestId("general-edema-ankle-laterality-right"));
    fireEvent.click(screen.getByTestId("general-edema-ankle-grade-g1"));

    const findings = readExamFindings();
    expect(findings[0]?.findings[0]?.findingId).toBe("edema");
    const sites = JSON.parse(findings[0]?.findings[0]?.attributes?.sitesJson ?? "[]");
    expect(sites).toEqual([
      { site: "pedal", laterality: "Left", grade: "G2" },
      { site: "ankle", laterality: "Right", grade: "G1" },
    ]);
    expect(screen.getByTestId("general-edema-pedal-grade-help")).toBeInTheDocument();
  });

  it("hides laterality on the generalized edema panel (obj-32)", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("general-finding-toggle-edema"));
    fireEvent.click(screen.getByTestId("general-edema-site-chip-generalized"));
    expect(screen.getByTestId("general-edema-panel-generalized")).toBeInTheDocument();
    openEdemaCard("generalized");
    expect(
      screen.queryByTestId("general-edema-generalized-laterality-bilateral"),
    ).toBeNull();
    fireEvent.click(screen.getByTestId("general-edema-generalized-grade-g3"));
    const findings = readExamFindings();
    const sites = JSON.parse(findings[0]?.findings[0]?.attributes?.sitesJson ?? "[]");
    expect(sites).toEqual([{ site: "generalized", grade: "G3" }]);
  });

  it("keeps edema card expanded when the last site chip is deselected (obj-32)", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("general-finding-toggle-edema"));
    fireEvent.click(screen.getByTestId("general-edema-site-chip-pedal"));
    openEdemaCard("pedal");
    fireEvent.click(screen.getByTestId("general-edema-pedal-laterality-left"));
    expect(readExamFindings()).toHaveLength(1);
    fireEvent.click(screen.getByTestId("general-edema-site-chip-pedal"));
    expect(readExamFindings()).toEqual([]);
    expect(screen.getByTestId("general-edema-sites-panel")).toBeInTheDocument();
  });

  it("adds an edema site card collapsed (no scroll) and glides it to top when opened (obj-32)", () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("general-finding-toggle-edema"));

    // Ignore the finding card's own open glide; only observe the site-card behavior.
    scrollSpy.mockClear();

    // Adding the site chip inserts a collapsed card without moving the viewport.
    fireEvent.click(screen.getByTestId("general-edema-site-chip-pedal"));
    const panel = screen.getByTestId("general-edema-panel-pedal");
    expect(panel).toHaveAttribute("data-open", "false");
    expect(scrollSpy).not.toHaveBeenCalled();

    // Opening the card glides it to the top of the scroll area (native fallback in jsdom).
    openEdemaCard("pedal");
    expect(panel).toHaveAttribute("data-open", "true");
    expect(panel.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    scrollSpy.mockRestore();
  });

  it("glides a systemic exam card into view when expanded (concurrent with the animation)", () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-toggle-cvs"));

    // No scrollable ancestor in the test DOM, so the glide falls back to native
    // smooth scroll, fired synchronously with the toggle (no deferral).
    const card = screen.getByTestId("exam-system-card-cvs");
    expect(card.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    scrollSpy.mockRestore();
  });

  it("glides a General finding card into view when expanded (concurrent with the animation)", () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("general-finding-toggle-pallor"));

    const card = screen.getByTestId("general-finding-card-pallor");
    expect(card.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    scrollSpy.mockRestore();
  });

  it("does not scroll when Expand all is used", () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-expand-all"));
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it("accordion: opening one exam system closes siblings", () => {
    renderExamList();
    expandSystem("general");
    expect(screen.getByTestId("exam-toggle-general")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("exam-toggle-cvs")).toHaveAttribute("aria-expanded", "false");

    expandSystem("cvs");
    expect(screen.getByTestId("exam-toggle-cvs")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("exam-toggle-general")).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses and expands all subsections within a system (General)", () => {
    renderExamList();
    expandSystem("general");

    expect(screen.getByTestId("exam-expand-all-subsections-general")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("exam-collapse-all-subsections-general"));

    for (const id of ["demeanor", "appearance", "volume", "peripheral", "nutrition"]) {
      expect(screen.getByTestId(`general-subsection-${id}`)).toHaveAttribute("data-open", "false");
    }

    fireEvent.click(screen.getByTestId("exam-expand-all-subsections-general"));

    for (const id of ["demeanor", "appearance", "volume", "peripheral", "nutrition"]) {
      expect(screen.getByTestId(`general-subsection-${id}`)).toHaveAttribute("data-open", "true");
    }
  });

  it("collapses and expands all subsections within CVS", () => {
    renderExamList();
    expandSystem("cvs");

    fireEvent.click(screen.getByTestId("exam-collapse-all-subsections-cvs"));
    expect(screen.getByTestId("cvs-subsection-inspection")).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByTestId("exam-expand-all-subsections-cvs"));
    expect(screen.getByTestId("cvs-subsection-inspection")).toHaveAttribute("data-open", "true");
  });

  it("does not scroll when per-system Expand all subsections is used", () => {
    renderExamList();
    expandSystem("general");
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    fireEvent.click(screen.getByTestId("exam-collapse-all-subsections-general"));
    fireEvent.click(screen.getByTestId("exam-expand-all-subsections-general"));
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it("hides per-system subsection disclosure when the system is marked normal", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("exam-mark-normal-general"));
    expect(screen.queryByTestId("exam-expand-all-subsections-general")).toBeNull();
    expect(screen.queryByTestId("exam-collapse-all-subsections-general")).toBeNull();
  });

  it("sets normal status when expanded and Mark normal is tapped", () => {
    renderExamList();
    expandSystem("resp");
    fireEvent.click(screen.getByTestId("exam-mark-normal-resp"));
    expect(screen.getByText("Bilateral air entry normal, no added sounds")).toBeInTheDocument();
    expect(readExamFindings()).toEqual([
      { systemId: "resp", status: "normal", findings: [], notes: null },
    ]);
    expect(screen.getByTestId("exam-summary-counts")).toHaveTextContent(
      "1 normal · 0 abnormal · 4 not examined",
    );
  });

  it("writes structured murmur + notes when expanded (CVS auscultation cards)", () => {
    renderExamList();
    expandSystem("cvs");
    fireEvent.click(screen.getByTestId("cvs-finding-toggle-murmur"));
    fireEvent.click(screen.getByTestId("cvs-field-murmur-timing-systolic"));
    fireEvent.click(screen.getByTestId("cvs-field-murmur-grade-3-6"));
    fireEvent.click(screen.getByTestId("cvs-field-murmur-area-mitral"));
    fireEvent.change(screen.getByTestId("exam-notes-cvs"), {
      target: { value: "radiates to axilla" },
    });
    expect(readExamFindings()).toEqual([
      {
        systemId: "cvs",
        status: "abnormal",
        findings: [
          {
            findingId: "murmur",
            attributes: { timing: "Systolic", grade: "3/6", area: "Mitral" },
          },
        ],
        notes: "radiates to axilla",
      },
    ]);
  });

  it("records a General finding via always-present collapsed card (obj-32)", () => {
    renderExamList();
    expandSystem("general");
    expect(screen.getByTestId("general-finding-card-pallor")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("general-finding-toggle-pallor"));
    fireEvent.click(screen.getByTestId("general-field-pallor-site-conjunctival"));
    fireEvent.click(screen.getByTestId("general-field-pallor-severity-mild"));
    expect(readExamFindings()).toEqual([
      {
        systemId: "general",
        status: "abnormal",
        findings: [
          { findingId: "pallor", attributes: { site: "Conjunctival", severity: "Mild" } },
        ],
        notes: null,
      },
    ]);
    fireEvent.click(screen.getByTestId("exam-done-general"));
    expect(screen.getByTestId("exam-summary-general")).toHaveTextContent(
      "Pallor · Conjunctival · Mild",
    );
  });

  it("persists General subsection notes (Demeanor, Appearance, …)", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("general-subsection-toggle-appearance"));
    fireEvent.change(screen.getByTestId("general-appearance-notes"), {
      target: { value: "Mild conjunctival pallor" },
    });
    expect(readExamFindings()).toEqual([
      {
        systemId: "general",
        status: "abnormal",
        findings: [
          {
            findingId: "general_appearance_notes",
            attributes: { notes: "Mild conjunctival pallor" },
          },
        ],
        notes: null,
      },
    ]);
    expect(screen.getByTestId("general-subsection-appearance")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(screen.getByTestId("general-subsection-demeanor")).toHaveAttribute(
      "data-open",
      "false",
    );
  });

  it("accordion: opening one General subsection closes siblings", () => {
    renderExamList();
    expandSystem("general");
    expect(screen.getByTestId("general-subsection-demeanor")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("general-subsection-appearance")).toHaveAttribute(
      "data-open",
      "false",
    );

    fireEvent.click(screen.getByTestId("general-subsection-toggle-appearance"));
    expect(screen.getByTestId("general-subsection-appearance")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(screen.getByTestId("general-subsection-demeanor")).toHaveAttribute("data-open", "false");
  });

  it("records clubbing with grade, distribution, laterality, and grade help (obj-32)", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("general-finding-toggle-clubbing"));
    expect(screen.getByTestId("general-clubbing-grade-help")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("general-field-clubbing-grade-g3"));
    fireEvent.click(screen.getByTestId("general-field-clubbing-distribution-fingers"));
    fireEvent.click(screen.getByTestId("general-field-clubbing-laterality-bilateral"));
    expect(readExamFindings()).toEqual([
      {
        systemId: "general",
        status: "abnormal",
        findings: [
          {
            findingId: "clubbing",
            attributes: {
              grade: "G3",
              distribution: "Fingers",
              laterality: "Bilateral",
            },
          },
        ],
        notes: null,
      },
    ]);
  });

  it("records per-site lymphadenopathy with independent character per site (obj-32)", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("general-finding-toggle-lymphadenopathy"));
    fireEvent.click(screen.getByTestId("general-lymph-site-chip-cervical"));
    fireEvent.click(screen.getByTestId("general-lymph-site-chip-axillary"));
    openLymphCard("cervical");
    fireEvent.click(screen.getByTestId("general-lymph-cervical-laterality-left"));
    fireEvent.click(screen.getByTestId("general-lymph-cervical-size-2-cm"));
    fireEvent.click(screen.getByTestId("general-lymph-cervical-character-tender"));
    fireEvent.click(screen.getByTestId("general-lymph-cervical-character-fixed"));
    openLymphCard("axillary");
    fireEvent.click(screen.getByTestId("general-lymph-axillary-laterality-right"));
    fireEvent.click(screen.getByTestId("general-lymph-axillary-character-mobile"));

    const findings = readExamFindings();
    expect(findings[0]?.findings[0]?.findingId).toBe("lymphadenopathy");
    const sites = JSON.parse(findings[0]?.findings[0]?.attributes?.sitesJson ?? "[]");
    expect(sites).toEqual([
      {
        site: "cervical",
        laterality: "Left",
        size: ">2 cm",
        character: ["Tender", "Fixed"],
      },
      { site: "axillary", laterality: "Right", character: ["Mobile"] },
    ]);
  });

  it("groups abnormal chips into labelled subsections when expanded", () => {
    renderExamList();
    expandSystem("resp");
    expect(screen.getByTestId("exam-findings-resp-auscultation")).toBeInTheDocument();
    expect(screen.getByTestId("exam-findings-resp-inspection")).toBeInTheDocument();
    expect(screen.getByTestId("exam-findings-resp-percussion")).toBeInTheDocument();
  });

  it("toggles abnormal chips off when clicked again", () => {
    renderExamList();
    expandSystem("abd");
    const chip = screen.getByTestId("exam-finding-abd-scars");
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(readExamFindings()).toEqual([]);
  });

  it("clears a system back to not examined via the reset control", () => {
    renderExamList();
    expandSystem("general");
    fireEvent.click(screen.getByTestId("exam-mark-normal-general"));
    expect(readExamFindings()).toHaveLength(1);
    fireEvent.click(screen.getByTestId("exam-clear-general"));
    expect(readExamFindings()).toEqual([]);
  });

  it("clears a system via in-section Clear beside Mark normal", () => {
    renderExamList();
    expandSystem("cvs");
    fireEvent.click(screen.getByTestId("exam-finding-cvs-visible-pulsations"));
    expect(readExamFindings()).toHaveLength(1);
    expect(screen.getByTestId("exam-clear-section-cvs")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("exam-clear-section-cvs"));
    expect(readExamFindings()).toEqual([]);
    expect(screen.getByTestId("exam-clear-section-cvs")).toBeDisabled();
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

  it('resets all systems to not examined via "Clear all"', () => {
    renderExamList();
    expect(screen.getByTestId("exam-clear-all")).toBeDisabled();
    fireEvent.click(screen.getByTestId("exam-mark-all-normal"));
    expect(screen.getByTestId("exam-summary-counts")).toHaveTextContent(
      "5 normal · 0 abnormal · 0 not examined",
    );
    expect(screen.getByTestId("exam-clear-all")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("exam-clear-all"));
    expect(screen.getByTestId("exam-clear-all-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("exam-clear-all-dialog-confirm"));
    expect(readExamFindings()).toEqual([]);
    expect(screen.getByTestId("exam-summary-counts")).toHaveTextContent(
      "0 normal · 0 abnormal · 5 not examined",
    );
    expect(screen.getByTestId("exam-clear-all")).toBeDisabled();
  });

  it("expands and collapses all cards via the header controls", () => {
    renderExamList();
    fireEvent.click(screen.getByTestId("exam-expand-all"));
    // Card bodies stay mounted for the smooth height animation; expanded means the
    // body is not inside a collapsed (aria-hidden) region, collapsed means it is.
    expect(
      screen.getByTestId("cvs-subsection-auscultation").closest('[aria-hidden="true"]'),
    ).toBeNull();
    fireEvent.click(screen.getByTestId("exam-collapse-all"));
    expect(
      screen.getByTestId("cvs-subsection-auscultation").closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it("shows collapsed summary preview after Done", () => {
    renderExamList();
    expandSystem("cvs");
    fireEvent.click(screen.getByTestId("cvs-finding-toggle-murmur"));
    fireEvent.click(screen.getByTestId("cvs-field-murmur-timing-systolic"));
    fireEvent.click(screen.getByTestId("cvs-field-murmur-grade-2-6"));
    fireEvent.click(screen.getByTestId("exam-done-cvs"));
    expect(screen.getByTestId("exam-summary-cvs")).toHaveTextContent(
      "Murmur · Systolic · 2/6",
    );
  });

  it("renders editable vitals rate/rhythm/notes in the Pulse subsection", () => {
    renderExamList(<ExamSystemList />, {
      vitalsHr: 88,
      vitalsPulseRhythm: "irregular",
    });
    expandSystem("cvs");
    expect((screen.getByTestId("cvs-pulse-rate") as HTMLInputElement).value).toBe("88");
    expect((screen.getByTestId("vital-context-vitalsPulseRhythm") as HTMLSelectElement).value).toBe(
      "irregular",
    );
    expect(screen.getByTestId("cvs-inline-finding-pulse")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-chip-group-pulse-peripheral")).toBeInTheDocument();
    expect(screen.queryByTestId("cvs-finding-card-pulse")).not.toBeInTheDocument();
  });

  it("edits pulse rate and rhythm into the shared vitals fields from CVS", () => {
    renderExamList();
    expandSystem("cvs");
    fireEvent.change(screen.getByTestId("cvs-pulse-rate"), { target: { value: "72" } });
    fireEvent.change(screen.getByTestId("vital-context-vitalsPulseRhythm"), {
      target: { value: "regular" },
    });
    fireEvent.change(screen.getByTestId("vital-note-vitalsHr"), {
      target: { value: "regular at rest" },
    });
    expect(readVitalsField("vitalsHr")).toBe(72);
    expect(readVitalsField("vitalsPulseRhythm")).toBe("regular");
    expect(readVitalsField("vitalsNotes")).toEqual({ vitalsHr: "regular at rest" });
  });

  it("renders inline apex beat fields and Palpation chip group in Precordium", () => {
    renderExamList();
    expandSystem("cvs");
    expect(screen.getByTestId("cvs-subsection-precordium")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-inline-finding-apex_beat")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-chip-group-precordium-palpation")).toBeInTheDocument();
    // All system bodies stay mounted now, so "Palpation" appears in several systems —
    // scope the assertion to the CVS card.
    expect(
      within(screen.getByTestId("exam-system-card-cvs")).getAllByText("Palpation").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId("cvs-finding-card-apex_beat")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cvs-field-apex_beat-notes")).not.toBeInTheDocument();
    expect(screen.getByTestId("cvs-precordium-notes")).toBeInTheDocument();
  });

  it("renders expandable auscultation cards with notes in each group", () => {
    renderExamList();
    expandSystem("cvs");
    expect(screen.getByTestId("cvs-subsection-auscultation")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-chip-group-card-auscultation-s1_s2")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-chip-group-card-auscultation-added_sounds")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-finding-card-gallop")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-finding-card-murmur")).toBeInTheDocument();
    expect(screen.queryByTestId("cvs-inline-finding-gallop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cvs-inline-finding-murmur")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cvs-chip-group-toggle-auscultation-s1_s2"));
    fireEvent.click(screen.getByTestId("exam-finding-cvs-loud-s1"));
    fireEvent.change(screen.getByTestId("cvs-chip-group-notes-auscultation-s1_s2"), {
      target: { value: "mitral stenosis pattern" },
    });
    fireEvent.click(screen.getByTestId("cvs-finding-toggle-gallop"));
    fireEvent.click(screen.getByTestId("cvs-field-gallop-type-s3"));
    fireEvent.change(screen.getByTestId("cvs-field-gallop-notes"), {
      target: { value: "at apex" },
    });

    expect(readExamFindings()).toEqual([
      {
        systemId: "cvs",
        status: "abnormal",
        findings: expect.arrayContaining([
          { findingId: "loud_s1", attributes: {} },
          {
            findingId: "auscultation_s1_s2_notes",
            attributes: { notes: "mitral stenosis pattern" },
          },
          { findingId: "gallop", attributes: { type: "S3", notes: "at apex" } },
        ]),
        notes: null,
      },
    ]);
  });

  it("renders inline JVP height and subsection notes without a collapsible card", () => {
    renderExamList();
    expandSystem("cvs");
    expect(screen.getByTestId("cvs-subsection-jvp")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-inline-finding-jvp_raised")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-field-jvp_raised-heightCm")).toBeInTheDocument();
    expect(screen.getByTestId("cvs-jvp-notes")).toBeInTheDocument();
    expect(screen.queryByTestId("cvs-finding-card-jvp_raised")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cvs-field-jvp_raised-notes")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("cvs-field-jvp_raised-heightCm"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByTestId("cvs-jvp-notes"), {
      target: { value: "visible pulsations" },
    });
    expect(readExamFindings()).toEqual([
      {
        systemId: "cvs",
        status: "abnormal",
        findings: [
          {
            findingId: "jvp_raised",
            attributes: { heightCm: "5", notes: "visible pulsations" },
          },
        ],
        notes: null,
      },
    ]);
    expect(deriveExaminationFindingsFromExam(readExamFindings())).toBe(
      "Cardiovascular: JVP raised (5 cm, visible pulsations)",
    );
  });

  it("persists Precordium notes on apex_beat and includes them in derived text", () => {
    renderExamList();
    expandSystem("cvs");
    fireEvent.click(screen.getByTestId("cvs-field-apex_beat-position-displaced"));
    const notesInput = screen.getByTestId("cvs-precordium-notes") as HTMLInputElement;
    fireEvent.change(notesInput, { target: { value: "5th ICS lateral" } });
    const next = readExamFindings();
    expect(next).toEqual([
      {
        systemId: "cvs",
        status: "abnormal",
        findings: [
          {
            findingId: "apex_beat",
            attributes: { position: "Displaced", notes: "5th ICS lateral" },
          },
        ],
        notes: null,
      },
    ]);
    expect(deriveExaminationFindingsFromExam(next)).toBe(
      "Cardiovascular: Apex beat (Displaced, 5th ICS lateral)",
    );
  });

  it("persists CVS inspection notes and includes them in derived text", () => {
    renderExamList();
    expandSystem("cvs");
    expect(screen.getByTestId("cvs-inspection-notes")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("exam-finding-cvs-visible-pulsations"));
    const notesInput = screen.getByTestId("cvs-inspection-notes") as HTMLInputElement;
    for (const chunk of ["Epigastric", " ", "pulsation"]) {
      fireEvent.change(notesInput, {
        target: { value: `${notesInput.value}${chunk}` },
      });
    }
    expect(notesInput.value).toBe("Epigastric pulsation");
    const next = readExamFindings();
    expect(next).toEqual([
      {
        systemId: "cvs",
        status: "abnormal",
        findings: expect.arrayContaining([
          { findingId: "inspection_notes", attributes: { notes: "Epigastric pulsation" } },
          { findingId: "visible_pulsations", attributes: {} },
        ]),
        notes: null,
      },
    ]);
    expect(deriveExaminationFindingsFromExam(next)).toBe(
      "Cardiovascular: Inspection: Epigastric pulsation; Visible pulsations",
    );
  });
});

describe("ExamSystemList accessibility (obj-03 · obj-30)", () => {
  it("exposes aria-expanded on the expand toggle", () => {
    renderExamList();
    expect(screen.getByTestId("exam-toggle-general")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expandSystem("general");
    expect(screen.getByTestId("exam-toggle-general")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("exposes aria-pressed on Mark normal when selected", () => {
    renderExamList();
    expandSystem("cns");
    fireEvent.click(screen.getByTestId("exam-mark-normal-cns"));
    expect(screen.getByTestId("exam-mark-normal-cns")).toHaveAttribute("aria-pressed", "true");
  });

  it("renders read-only when disabled", () => {
    renderExamList(<ExamSystemList disabled />);
    expect(screen.getByTestId("exam-mark-all-normal")).toBeDisabled();
    expandSystem("general");
    expect(screen.getByTestId("exam-mark-normal-general")).toBeDisabled();
    fireEvent.click(screen.getByTestId("exam-mark-normal-general"));
    expect(readExamFindings()).toEqual([]);
  });
});

describe("ExamSystemList teleconsult preset (tc-02)", () => {
  it("in-clinic: no feasibility tags and in-person subsections are not de-emphasised", () => {
    renderExamList();
    expandSystem("resp");
    expect(screen.queryByTestId("resp-subsection-tag-palpation")).toBeNull();
    expect(screen.queryByTestId("resp-subsection-tag-auscultation")).toBeNull();
    expect(screen.getByTestId("resp-subsection-palpation")).toHaveAttribute(
      "data-deemphasised",
      "false",
    );
  });

  it("teleconsult: in-person-only subsections are tagged, collapsed, and de-emphasised", () => {
    renderTeleconsultExamList();
    expandSystem("resp");

    const palpation = screen.getByTestId("resp-subsection-palpation");
    expect(palpation).toHaveAttribute("data-open", "false");
    expect(palpation).toHaveAttribute("data-deemphasised", "true");
    expect(screen.getByTestId("resp-subsection-tag-palpation")).toHaveTextContent(
      "In-person only",
    );
    expect(screen.getByTestId("resp-subsection-tag-auscultation")).toHaveTextContent(
      "In-person only",
    );

    // Assessable subsections stay untagged and undimmed.
    expect(screen.queryByTestId("resp-subsection-tag-inspection")).toBeNull();
    expect(screen.getByTestId("resp-subsection-inspection")).toHaveAttribute(
      "data-deemphasised",
      "false",
    );
  });

  it("teleconsult: orders assessable subsections before in-person-only ones (CNS)", () => {
    renderTeleconsultExamList();
    expandSystem("cns");
    const order = subsectionOrder("cns", [
      "mental",
      "speech",
      "cranial",
      "motor",
      "reflexes",
      "sensory",
      "coordination",
      "gait",
      "meningeal",
      "autonomic",
    ]);
    // The three contact-dependent subsections sink to the bottom, in schema order.
    expect(order.slice(-3)).toEqual([
      "cns-subsection-reflexes",
      "cns-subsection-sensory",
      "cns-subsection-meningeal",
    ]);
  });

  it("teleconsult: opt-in expand + recording a finding flips the tag to Patient-assisted", () => {
    renderTeleconsultExamList();
    expandSystem("resp");

    // Opt-in: the doctor taps the muted subsection to expand it.
    fireEvent.click(screen.getByTestId("resp-subsection-toggle-palpation"));
    expect(screen.getByTestId("resp-subsection-palpation")).toHaveAttribute(
      "data-open",
      "true",
    );

    fireEvent.click(screen.getByTestId("exam-finding-resp-chest-wall-tenderness"));

    expect(screen.getByTestId("resp-subsection-tag-palpation")).toHaveTextContent(
      "Patient-assisted",
    );
    expect(screen.getByTestId("resp-subsection-palpation")).toHaveAttribute(
      "data-deemphasised",
      "false",
    );
    expect(readExamFindings()).toEqual([
      {
        systemId: "resp",
        status: "abnormal",
        findings: [{ findingId: "chest_wall_tenderness", attributes: {} }],
        notes: null,
      },
    ]);
  });

  it("teleconsult: does not auto-open an in-person-only subsection that already has data", () => {
    renderTeleconsultExamList({
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

    const palpation = screen.getByTestId("resp-subsection-palpation");
    expect(palpation).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("resp-subsection-tag-palpation")).toHaveTextContent(
      "Patient-assisted",
    );
  });

  it("teleconsult: the in-card 'Mark normal' preview uses the scoped WNL line", () => {
    renderTeleconsultExamList();
    expandSystem("resp");
    fireEvent.click(screen.getByTestId("exam-mark-normal-resp"));
    expect(screen.getByText("No respiratory distress on inspection")).toBeInTheDocument();
    expect(screen.queryByText("Bilateral air entry normal, no added sounds")).toBeNull();
  });

  it("in-clinic: the 'Mark normal' preview keeps the full in-clinic WNL line", () => {
    renderExamList();
    expandSystem("resp");
    fireEvent.click(screen.getByTestId("exam-mark-normal-resp"));
    expect(
      screen.getByText("Bilateral air entry normal, no added sounds"),
    ).toBeInTheDocument();
  });

  it("teleconsult: General is all-assessable so it carries no feasibility tags", () => {
    renderTeleconsultExamList();
    expandSystem("general");
    expect(
      within(screen.getByTestId("exam-system-card-general")).queryByText(/In-person only/),
    ).toBeNull();
    expect(
      within(screen.getByTestId("exam-system-card-general")).queryByText(/Patient-assisted/),
    ).toBeNull();
  });
});
