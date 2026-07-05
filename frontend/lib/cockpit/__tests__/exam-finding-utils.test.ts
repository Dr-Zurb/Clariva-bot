import { describe, expect, it } from "vitest";
import {
  chipLabelToFindingId,
  deriveCyanosisTypeLabel,
  generalFindingAttributesPreview,
  generalFindingEntryPreview,
  migrateCyanosisAttributes,
  normalizeExamFindingEntry,
  normalizeExamFindingEntries,
  renderGeneralFindingEntry,
  renderExamSystemFindingBody,
  renderCvsFindingEntry,
  cvsFindingAttributesPreview,
  cvsFindingEntryPreview,
  renderRespFindingEntry,
  renderAbdFindingEntry,
  renderCnsFindingEntry,
} from "@/lib/cockpit/exam-finding-utils";
import { parseLymphSites } from "@/lib/cockpit/lymphadenopathy-sites";
import type { ExamSystemFinding } from "@/types/prescription";

describe("exam-finding-utils (obj-31)", () => {
  it("hydrates legacy string findings into structured entries", () => {
    expect(normalizeExamFindingEntry("Pallor")).toEqual({
      findingId: "pallor",
      attributes: {},
    });
    expect(normalizeExamFindingEntry("Distress")).toEqual({
      findingId: "distress",
      attributes: {},
    });
    expect(normalizeExamFindingEntry("Nutrition / habitus")).toEqual({
      findingId: "habitus",
      attributes: {},
    });
    expect(normalizeExamFindingEntry("Murmur")).toEqual({
      findingId: "murmur",
      attributes: {},
    });
  });

  it("preserves structured finding entries on normalize", () => {
    expect(
      normalizeExamFindingEntries([
        { findingId: "pallor", attributes: { site: "Conjunctival", severity: "Mild" } },
      ]),
    ).toEqual([
      { findingId: "pallor", attributes: { site: "Conjunctival", severity: "Mild" } },
    ]);
  });

  it("preserves interior and trailing spaces in note attributes on normalize", () => {
    expect(
      normalizeExamFindingEntries([
        { findingId: "inspection_notes", attributes: { notes: "Epigastric pulsation" } },
        { findingId: "murmur", attributes: { notes: "hello " } },
      ]),
    ).toEqual([
      { findingId: "inspection_notes", attributes: { notes: "Epigastric pulsation" } },
      { findingId: "murmur", attributes: { notes: "hello " } },
    ]);
  });

  it("hydrates legacy CVS murmur chip findingIds into structured murmur", () => {
    expect(normalizeExamFindingEntry({ findingId: "systolic_murmur", attributes: {} })).toEqual({
      findingId: "murmur",
      attributes: { timing: "Systolic" },
    });
  });

  it("renders CVS inspection notes in derived text", () => {
    expect(
      renderCvsFindingEntry({
        findingId: "inspection_notes",
        attributes: { notes: "Epigastric pulsation" },
      }),
    ).toBe("Inspection: Epigastric pulsation");
    expect(
      cvsFindingEntryPreview({
        findingId: "inspection_notes",
        attributes: { notes: "Epigastric pulsation" },
      }),
    ).toBe("Inspection · Epigastric pulsation");
  });

  it("renders structured pulse character/volume in derived text (rhythm lives in vitals)", () => {
    expect(
      renderCvsFindingEntry({
        findingId: "pulse",
        attributes: { character: "Collapsing", volume: "Bounding" },
      }),
    ).toBe("Pulse (Collapsing, Bounding)");
    expect(
      renderCvsFindingEntry({
        findingId: "pulse",
        attributes: { character: "Pulsus alternans", volume: "Low" },
      }),
    ).toBe("Pulse (Pulsus alternans, Low)");
    expect(
      renderCvsFindingEntry({
        findingId: "apex_beat",
        attributes: { position: "Displaced", character: "Heaving" },
      }),
    ).toBe("Apex beat (Displaced, Heaving)");
  });

  it("renders structured CVS murmur, gallop, and JVP in derived text", () => {
    expect(
      renderCvsFindingEntry({
        findingId: "murmur",
        attributes: {
          timing: "Systolic",
          grade: "3/6",
          area: "Mitral",
          radiation: "Axilla",
        },
      }),
    ).toBe("Murmur (Systolic, 3/6, Mitral, Axilla)");
    expect(
      cvsFindingAttributesPreview({
        findingId: "gallop",
        attributes: { type: "S3" },
      }),
    ).toBe("S3");
    expect(
      renderCvsFindingEntry({
        findingId: "jvp_raised",
        attributes: { heightCm: "4" },
      }),
    ).toBe("JVP raised (4 cm)");
  });

  it("renders general finding detail in derived text", () => {
    const entry = {
      findingId: "pallor",
      attributes: { site: "Conjunctival", severity: "Mild" },
    };
    expect(renderGeneralFindingEntry(entry)).toBe("Pallor (Conjunctival, Mild)");
    expect(generalFindingEntryPreview(entry)).toBe("Pallor · Conjunctival · Mild");
    expect(generalFindingAttributesPreview(entry)).toBe("Conjunctival · Mild");
  });

  it("renders tier-1 general findings (distress, plethora, habitus) in derived text", () => {
    expect(
      renderGeneralFindingEntry({
        findingId: "distress",
        attributes: { severity: "Moderate", type: "Respiratory", context: "At rest" },
      }),
    ).toBe("Distress (Moderate, Respiratory, At rest)");
    expect(
      generalFindingAttributesPreview({
        findingId: "plethora",
        attributes: { site: "Facial", severity: "Mild", context: "Fever" },
      }),
    ).toBe("Facial · Mild · Fever");
    expect(
      renderGeneralFindingEntry({
        findingId: "habitus",
        attributes: { pattern: "Wasted/cachectic", severity: "Severe" },
      }),
    ).toBe("Nutrition / habitus (Wasted/cachectic, Severe)");
  });

  it("renders general abnormal system body with semicolon-separated findings", () => {
    const finding: ExamSystemFinding = {
      systemId: "general",
      status: "abnormal",
      findings: [
        { findingId: "pallor", attributes: { site: "Conjunctival" } },
        { findingId: "icterus", attributes: { site: "Scleral" } },
      ],
    };
    expect(renderExamSystemFindingBody(finding)).toBe(
      "Pallor (Conjunctival); Icterus (Scleral)",
    );
  });

  it("sorts general findings in registry order including new subsections", () => {
    const finding: ExamSystemFinding = {
      systemId: "general",
      status: "abnormal",
      findings: [
        { findingId: "pallor", attributes: { site: "Conjunctival" } },
        { findingId: "distress", attributes: { severity: "Mild" } },
        { findingId: "habitus", attributes: { pattern: "Thin" } },
      ],
    };
    expect(renderExamSystemFindingBody(finding)).toBe(
      "Distress (Mild); Pallor (Conjunctival); Nutrition / habitus (Thin)",
    );
  });

  it("slugifies chip labels for non-general systems", () => {
    expect(chipLabelToFindingId("JVP raised")).toBe("jvp_raised");
    expect(chipLabelToFindingId("Reduced AE")).toBe("reduced_ae");
  });

  it("derives cyanosis type from grouped sites and migrates legacy attrs", () => {
    expect(
      deriveCyanosisTypeLabel({ centralSites: "Lips", peripheralSites: "Fingers/toes" }),
    ).toBe("Central & peripheral");
    expect(migrateCyanosisAttributes({ type: "Central", site: "Lips" })).toEqual({
      centralSites: "Lips",
    });
    expect(
      renderGeneralFindingEntry({
        findingId: "cyanosis",
        attributes: { centralSites: "Lips", severity: "Moderate" },
      }),
    ).toBe("Cyanosis (Central: Lips; Moderate)");
  });

  it("migrates legacy flat edema attrs into sitesJson and renders per-site preview", () => {
    const migrated = normalizeExamFindingEntry({
      findingId: "edema",
      attributes: {
        site: "Pedal, Generalized",
        laterality: "Left",
        pitting: "++",
        severity: "Moderate",
        context: "Dependent",
      },
    });
    expect(migrated?.attributes?.sitesJson).toBeTruthy();
    const sites = JSON.parse(migrated!.attributes!.sitesJson!);
    expect(sites).toEqual([
      { site: "pedal", laterality: "Left", grade: "G2", severity: "Moderate", context: ["Dependent"] },
      { site: "generalized", grade: "G2", severity: "Moderate", context: ["Dependent"] },
    ]);
    expect(
      generalFindingAttributesPreview({
        findingId: "edema",
        attributes: migrated!.attributes!,
      }),
    ).toContain("Pedal (Left, G2, Moderate, Dependent)");
    expect(
      renderGeneralFindingEntry({
        findingId: "edema",
        attributes: {
          sitesJson: JSON.stringify([
            { site: "pedal", laterality: "Left", grade: "G2" },
            { site: "ankle", laterality: "Right", grade: "G1" },
          ]),
        },
      }),
    ).toBe("Edema (Pedal: left, G2; Ankle: right, G1)");
  });

  it("renders clubbing detail and migrates legacy grade labels", () => {
    const entry = normalizeExamFindingEntry({
      findingId: "clubbing",
      attributes: {
        grade: "Grade 3",
        distribution: "Fingers",
        laterality: "Bilateral",
      },
    });
    expect(entry?.attributes).toEqual({
      grade: "G3",
      distribution: "Fingers",
      laterality: "Bilateral",
    });
    expect(renderGeneralFindingEntry(entry!)).toBe(
      "Clubbing (G3, Fingers, Bilateral)",
    );
    expect(generalFindingAttributesPreview(entry!)).toBe("G3 · Fingers · Bilateral");
  });

  it("renders lymphadenopathy per-site detail and migrates legacy attrs", () => {
    const entry = normalizeExamFindingEntry({
      findingId: "lymphadenopathy",
      attributes: {
        sites: "Cervical, Axillary",
        character: "Mobile",
      },
    });
    expect(entry?.attributes?.sitesJson).toBeTruthy();
    const migrated = parseLymphSites(entry!.attributes!);
    expect(migrated).toEqual([
      { site: "cervical", character: ["Mobile"] },
      { site: "axillary", character: ["Mobile"] },
    ]);
    const structured = {
      findingId: "lymphadenopathy",
      attributes: {
        sitesJson: JSON.stringify([
          {
            site: "cervical",
            laterality: "Left",
            size: ">2 cm",
            character: ["Tender", "Fixed"],
          },
          { site: "axillary", laterality: "Right", character: ["Mobile"] },
        ]),
      },
    };
    expect(renderGeneralFindingEntry(structured)).toBe(
      "Lymphadenopathy (Cervical: left, >2 cm, tender, fixed; Axillary: right, mobile)",
    );
    expect(generalFindingAttributesPreview(structured)).toBe(
      "Cervical (Left, >2 cm, Tender, Fixed) · Axillary (Right, Mobile)",
    );
  });

  it("hydrates legacy Respiratory chip strings into structured entries", () => {
    expect(normalizeExamFindingEntry("Wheeze")).toEqual({
      findingId: "wheeze",
      attributes: {},
    });
    expect(normalizeExamFindingEntry("Reduced AE")).toEqual({
      findingId: "reduced_ae",
      attributes: {},
    });
  });

  it("renders structured Respiratory wheeze and crackles in derived text", () => {
    expect(
      renderRespFindingEntry({
        findingId: "wheeze",
        attributes: { timing: "Expiratory", character: "Polyphonic", site: "Bilateral" },
      }),
    ).toBe("Wheeze (Expiratory, Polyphonic, Bilateral)");
    expect(
      renderRespFindingEntry({
        findingId: "crackles",
        attributes: { type: "Fine", site: "RLL" },
      }),
    ).toBe("Crackles (Fine, RLL)");
    expect(
      renderRespFindingEntry({ findingId: "wheeze", attributes: {} }),
    ).toBe("Wheeze");
  });

  it("renders Respiratory system body with sorted findings", () => {
    const finding: ExamSystemFinding = {
      systemId: "resp",
      status: "abnormal",
      findings: [
        { findingId: "crackles", attributes: {} },
        { findingId: "wheeze", attributes: {} },
      ],
      notes: null,
    };
    expect(renderExamSystemFindingBody(finding)).toBe("Wheeze; Crackles");
  });

  it("renders Respiratory palpation and percussion subsection notes", () => {
    expect(
      renderRespFindingEntry({
        findingId: "resp_palpation_notes",
        attributes: { notes: "Reduced expansion R > L" },
      }),
    ).toBe("Palpation: Reduced expansion R > L");
    expect(
      renderRespFindingEntry({
        findingId: "resp_percussion_notes",
        attributes: { notes: "Dull R basal" },
      }),
    ).toBe("Percussion: Dull R basal");
    expect(
      renderRespFindingEntry({
        findingId: "resp_auscultation_notes",
        attributes: { notes: "Coarse crepitations RLL" },
      }),
    ).toBe("Auscultation: Coarse crepitations RLL");
  });

  it("renders structured Abdomen findings in derived text", () => {
    expect(
      renderAbdFindingEntry({
        findingId: "tenderness",
        attributes: { region: "Right iliac", severity: "Moderate", signs: "Rebound" },
      }),
    ).toBe("Tenderness (Right iliac, Moderate, Rebound)");
    expect(
      renderAbdFindingEntry({
        findingId: "hepatomegaly",
        attributes: { span: "4 cm", surface: "Smooth", tenderness: "Tender" },
      }),
    ).toBe("Hepatomegaly (4 cm, Smooth, Tender)");
    expect(
      renderAbdFindingEntry({
        findingId: "ascites",
        attributes: { signs: "Shifting dullness", grade: "Moderate" },
      }),
    ).toBe("Ascites (Shifting dullness, Moderate)");
    expect(renderAbdFindingEntry({ findingId: "tenderness", attributes: {} })).toBe(
      "Tenderness",
    );
  });

  it("renders Abdomen subsection notes and sorts the system body", () => {
    expect(
      renderAbdFindingEntry({
        findingId: "abd_inspection_notes",
        attributes: { notes: "Fullness in epigastrium" },
      }),
    ).toBe("Inspection: Fullness in epigastrium");
    expect(
      renderAbdFindingEntry({
        findingId: "abd_bowel_sounds_notes",
        attributes: { notes: "High-pitched tinkling" },
      }),
    ).toBe("Bowel sounds: High-pitched tinkling");

    const finding: ExamSystemFinding = {
      systemId: "abd",
      status: "abnormal",
      findings: [
        { findingId: "ascites", attributes: { signs: "Fluid thrill" } },
        { findingId: "tenderness", attributes: { region: "Epigastric" } },
      ],
      notes: null,
    };
    expect(renderExamSystemFindingBody(finding)).toBe(
      "Tenderness (Epigastric); Ascites (Fluid thrill)",
    );
  });

  it("renders structured CNS findings in derived text", () => {
    expect(
      renderCnsFindingEntry({
        findingId: "weakness",
        attributes: { distribution: "Hemiparesis", side: "Left", power: "3/5" },
      }),
    ).toBe("Weakness / plegia (Hemiparesis, Left, 3/5)");
    expect(
      renderCnsFindingEntry({
        findingId: "gait",
        attributes: { type: "Hemiplegic", features: "Wide-based" },
      }),
    ).toBe("Gait pattern (Hemiplegic, Wide-based)");
    expect(
      renderCnsFindingEntry({
        findingId: "sensory_deficit",
        attributes: { modality: "Pinprick, Temperature", distribution: "Below level" },
      }),
    ).toBe("Sensory deficit (Pinprick, Temperature, Below level)");
    expect(renderCnsFindingEntry({ findingId: "weakness", attributes: {} })).toBe(
      "Weakness / plegia",
    );
  });

  it("renders CNS subsection notes and sorts the system body", () => {
    expect(
      renderCnsFindingEntry({
        findingId: "cns_reflexes_notes",
        attributes: { notes: "Brisk knee jerks" },
      }),
    ).toBe("Reflexes: Brisk knee jerks");

    const finding: ExamSystemFinding = {
      systemId: "cns",
      status: "abnormal",
      findings: [
        { findingId: "gait", attributes: { type: "Hemiplegic" } },
        { findingId: "weakness", attributes: { side: "Left" } },
      ],
      notes: null,
    };
    expect(renderExamSystemFindingBody(finding)).toBe(
      "Weakness / plegia (Left); Gait pattern (Hemiplegic)",
    );
  });
});
