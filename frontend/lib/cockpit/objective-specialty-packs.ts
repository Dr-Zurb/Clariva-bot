/**
 * obj-18 (P4-D4) — static specialty exam packs (exam-catalog §E2).
 *
 * Read-only starter **content** catalog keyed by P3's `SpecialtyEmphasis` buckets
 * (`normalizeSpecialty`). Packs fill RxForm objective state through obj-17's
 * `buildObjectiveTemplateApplyActions('objective_full', …)` — they never write
 * `doctor_settings` layout/visibility (P3 owns that layer) and never auto-persist.
 * A doctor's saved template or hand-edits always win on the next apply/save.
 *
 * Content vs. visibility are orthogonal: P3's modality/specialty seed only
 * reorders/hides top-level sections; packs seed vitals / structured exam systems /
 * custom-section titles inside those sections.
 */
import type { SpecialtyEmphasis } from "@/lib/cockpit/objective-default-layout";
import { normalizeSpecialty } from "@/lib/cockpit/objective-default-layout";
import { resolveExamSystem } from "@/lib/cockpit/exam-schema";
import type { RxTemplateObjective } from "@/types/rx-template";
import type { CustomSubsection, ExamSystemFinding, TestResultRow } from "@/types/prescription";

/** One named starter bundle — shaped like `objective_json` on a saved template. */
export interface ObjectiveSpecialtyPack {
  /** Stable catalog id (not a DB row). */
  id: string;
  name: string;
  description: string;
  objective: RxTemplateObjective;
}

function normalFinding(systemId: string): ExamSystemFinding {
  const def = resolveExamSystem(systemId);
  return {
    systemId: def.systemId,
    status: "normal",
    findings: [],
    notes: def.normalLine,
  };
}

function packCustomSection(suffix: string, title: string): CustomSubsection {
  return {
    id: `pack-${suffix}`,
    title,
    body: null,
    children: [],
  };
}

/**
 * obj-23: an in-clinic point-of-care starter row (source `in_clinic_poc`). Static
 * content only — no value/date; the doctor fills those at the chair. Ids are
 * re-minted on apply, so the pack-prefixed id is just a stable catalog handle.
 */
function pocResultRow(
  suffix: string,
  name: string,
  opts?: { unit?: string; notes?: string },
): TestResultRow {
  return {
    id: `pack-poc-${suffix}`,
    source: "in_clinic_poc",
    name,
    value: null,
    unit: opts?.unit ?? null,
    date: null,
    interpretation: null,
    notes: opts?.notes ?? null,
  };
}

function buildGeneralMedicinePack(): ObjectiveSpecialtyPack {
  return {
    id: "gp-general",
    name: "General medicine exam",
    description: "Vitals, general, cardiovascular, respiratory, and abdominal systems marked normal.",
    objective: {
      examinationJson: ["general", "cvs", "resp", "abd"].map(normalFinding),
      testResultsJson: [
        pocResultRow("rbs", "Random blood sugar (glucometer)", { unit: "mg/dL" }),
      ],
    },
  };
}

const PACKS_BY_EMPHASIS: Record<SpecialtyEmphasis, ObjectiveSpecialtyPack[]> = {
  gp: [buildGeneralMedicinePack()],
  unknown: [buildGeneralMedicinePack()],
  cardiology: [
    {
      id: "cardiology-standard",
      name: "Cardiology exam",
      description: "Sitting BP detail, CVS, peripheral pulses, and JVP sections.",
      objective: {
        vitalsBpPosture: "sitting",
        vitalsBpLimb: "left_arm",
        examinationJson: [normalFinding("cvs"), normalFinding("general")],
        testResultsJson: [
          pocResultRow("ecg", "ECG", { notes: "12-lead, in-clinic" }),
        ],
        customSections: [
          packCustomSection("cardio-pulses", "Peripheral pulses"),
          packCustomSection("cardio-jvp", "JVP"),
        ],
      },
    },
  ],
  pulmonology: [
    {
      id: "pulmonology-standard",
      name: "Pulmonology exam",
      description: "Respiratory system with accessory muscle section; emphasises SpO₂ and RR vitals.",
      objective: {
        examinationJson: [normalFinding("resp"), normalFinding("general")],
        testResultsJson: [
          pocResultRow("spo2", "SpO₂ (room air)", { unit: "%" }),
          pocResultRow("peak-flow", "Peak expiratory flow rate", { unit: "L/min" }),
        ],
        customSections: [packCustomSection("pulm-accessory", "Accessory muscle use")],
      },
    },
  ],
  gynaecology: [
    {
      id: "gynaecology-standard",
      name: "Gynaecology exam",
      description: "Abdominal exam plus P/V, P/S, P/A, and breast custom sections.",
      objective: {
        examinationJson: [normalFinding("abd"), normalFinding("general")],
        customSections: [
          packCustomSection("gyn-pv", "P/V"),
          packCustomSection("gyn-ps", "P/S"),
          packCustomSection("gyn-pa", "P/A"),
          packCustomSection("gyn-breast", "Breast"),
        ],
      },
    },
  ],
  obstetrics: [
    {
      id: "obstetrics-standard",
      name: "Obstetric exam",
      description: "Abdominal exam with obstetric examination and fetal heart sections.",
      objective: {
        examinationJson: [normalFinding("abd"), normalFinding("general")],
        customSections: [
          packCustomSection("obstetric-exam", "Obstetric examination"),
          packCustomSection("fetal-heart", "Fetal heart"),
        ],
      },
    },
  ],
  paediatrics: [
    {
      id: "paediatrics-standard",
      name: "Paediatric exam",
      description: "General, respiratory, and abdominal systems plus growth and developmental sections.",
      objective: {
        examinationJson: [
          normalFinding("general"),
          normalFinding("resp"),
          normalFinding("abd"),
        ],
        customSections: [
          packCustomSection("peds-growth", "Growth / head circumference"),
          packCustomSection("peds-development", "Developmental observation"),
        ],
      },
    },
  ],
  orthopaedics: [
    {
      id: "orthopaedics-standard",
      name: "Orthopaedic exam",
      description: "MSK joint-specific and neurovascular status sections with CNS screen.",
      objective: {
        examinationJson: [normalFinding("general"), normalFinding("cns")],
        customSections: [
          packCustomSection("msk-joint", "MSK — joint-specific"),
          packCustomSection("msk-neurovascular", "Neurovascular status"),
        ],
      },
    },
  ],
  dermatology: [
    {
      id: "dermatology-standard",
      name: "Dermatology exam",
      description: "Skin and lesion examination with dermoscopy notes section.",
      objective: {
        examinationJson: [normalFinding("general")],
        customSections: [
          packCustomSection("derm-skin", "Skin / lesion examination"),
          packCustomSection("derm-dermoscopy", "Dermoscopy notes"),
        ],
      },
    },
  ],
  ent: [
    {
      id: "ent-standard",
      name: "ENT exam",
      description: "ENT systems and neck lymph node custom sections.",
      objective: {
        examinationJson: [normalFinding("general")],
        customSections: [
          packCustomSection("ent-systems", "ENT examination"),
          packCustomSection("ent-nodes", "Neck lymph nodes"),
        ],
      },
    },
  ],
  ophthalmology: [
    {
      id: "ophthalmology-standard",
      name: "Ophthalmology exam",
      description: "Visual acuity and anterior/posterior segment custom sections.",
      objective: {
        customSections: [
          packCustomSection("ophth-va", "Visual acuity"),
          packCustomSection("ophth-segment", "Anterior / posterior segment"),
        ],
      },
    },
  ],
  psychiatry: [
    {
      id: "psychiatry-standard",
      name: "Psychiatry exam",
      description: "General appearance plus a mental state examination (MSE) section.",
      objective: {
        examinationJson: [normalFinding("general")],
        customSections: [packCustomSection("mse", "Mental state examination (MSE)")],
      },
    },
  ],
  neurology: [
    {
      id: "neurology-standard",
      name: "Neurology exam",
      description: "GCS vitals, CNS screen, and cranial nerve / motor / sensory sections.",
      objective: {
        vitalsGcsTotal: 15,
        examinationJson: [normalFinding("cns")],
        customSections: [
          packCustomSection("neuro-cn", "Cranial nerves"),
          packCustomSection("neuro-power", "Power"),
          packCustomSection("neuro-reflexes", "Reflexes"),
          packCustomSection("neuro-sensation", "Sensation"),
          packCustomSection("neuro-gait", "Gait"),
        ],
      },
    },
  ],
};

/** Resolve the static pack list for a doctor specialty label or emphasis bucket. */
export function resolveObjectiveSpecialtyPacks(
  specialty: string | SpecialtyEmphasis | null | undefined,
): ObjectiveSpecialtyPack[] {
  const emphasis: SpecialtyEmphasis =
    typeof specialty === "string" && specialty in PACKS_BY_EMPHASIS
      ? (specialty as SpecialtyEmphasis)
      : normalizeSpecialty(typeof specialty === "string" ? specialty : null);
  return PACKS_BY_EMPHASIS[emphasis];
}

/** One-line summary for picker / strip UI. */
export function describeObjectivePackSummary(pack: ObjectiveSpecialtyPack): string {
  const parts: string[] = [];
  const examCount = pack.objective.examinationJson?.length ?? 0;
  if (examCount > 0) parts.push(`${examCount} exam system${examCount === 1 ? "" : "s"}`);
  const pocCount = pack.objective.testResultsJson?.length ?? 0;
  if (pocCount > 0) parts.push(`${pocCount} POC result${pocCount === 1 ? "" : "s"}`);
  const customCount = pack.objective.customSections?.length ?? 0;
  if (customCount > 0) parts.push(`${customCount} custom section${customCount === 1 ? "" : "s"}`);
  if (pack.objective.vitalsBpPosture || pack.objective.vitalsGcsTotal != null) {
    parts.push("vitals detail");
  }
  return parts.length > 0 ? parts.join(" · ") : pack.description;
}
