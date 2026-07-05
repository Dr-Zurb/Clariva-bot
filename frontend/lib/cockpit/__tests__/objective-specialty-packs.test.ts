/**
 * obj-18 — specialty exam pack catalog + apply through obj-17.
 */

import { describe, expect, it } from "vitest";
import { normalizeSpecialty } from "@/lib/cockpit/objective-default-layout";
import {
  buildObjectiveTemplateApplyActions,
} from "@/lib/cockpit/apply-objective-template";
import { specialtyPackToSyntheticTemplate } from "@/lib/cockpit/objective-specialty-pack-apply";
import {
  resolveObjectiveSpecialtyPacks,
  type ObjectiveSpecialtyPack,
} from "@/lib/cockpit/objective-specialty-packs";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormReducer,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";

function baseState(fields = createEmptyRxFormFields()): RxFormState {
  return {
    fields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    saveError: null,
    submitError: null,
  };
}

function applyPack(pack: ObjectiveSpecialtyPack) {
  const template = specialtyPackToSyntheticTemplate(pack);
  const actions = buildObjectiveTemplateApplyActions(
    "objective_full",
    template,
    createEmptyRxFormFields(),
  );
  let state = baseState();
  for (const action of actions) {
    state = rxFormReducer(state, action);
  }
  return state.fields;
}

describe("objective-specialty-packs (obj-18)", () => {
  it("normalizeSpecialty bucket resolves the expected pack id", () => {
    const cardiology = resolveObjectiveSpecialtyPacks("Cardiology");
    expect(normalizeSpecialty("Cardiology")).toBe("cardiology");
    expect(cardiology[0]?.id).toBe("cardiology-standard");

    const gp = resolveObjectiveSpecialtyPacks("General Physician");
    expect(gp[0]?.id).toBe("gp-general");

    const unknown = resolveObjectiveSpecialtyPacks(null);
    expect(unknown[0]?.id).toBe("gp-general");
    expect(resolveObjectiveSpecialtyPacks("Radiology")[0]?.id).toBe("gp-general");
  });

  it("every SpecialtyEmphasis bucket has at least one non-empty pack", () => {
    const emphases = [
      "gp",
      "unknown",
      "cardiology",
      "pulmonology",
      "gynaecology",
      "obstetrics",
      "paediatrics",
      "orthopaedics",
      "dermatology",
      "ent",
      "ophthalmology",
      "psychiatry",
      "neurology",
    ] as const;
    for (const emphasis of emphases) {
      const packs = resolveObjectiveSpecialtyPacks(emphasis);
      expect(packs.length).toBeGreaterThan(0);
      expect(packs[0]?.name.trim()).not.toBe("");
      const objective = packs[0]!.objective;
      const hasExam = (objective.examinationJson ?? []).length > 0;
      const hasCustom = (objective.customSections ?? []).length > 0;
      const hasVitals =
        objective.vitalsBpPosture != null || objective.vitalsGcsTotal != null;
      expect(hasExam || hasCustom || hasVitals).toBe(true);
    }
  });

  it("cardiology pack apply fills expected exam systems and custom sections", () => {
    const pack = resolveObjectiveSpecialtyPacks("cardiology")[0]!;
    const fields = applyPack(pack);

    expect(fields.vitalsBpPosture).toBe("sitting");
    expect(fields.examFindings.map((f) => f.systemId).sort()).toEqual(["cvs", "general"]);
    expect(fields.objectiveCustomSections.map((s) => s.title)).toEqual(
      expect.arrayContaining(["Peripheral pulses", "JVP"]),
    );
    expect(fields.testResults).toBe("");
  });

  it("pack apply leaves unrelated subjective fields untouched", () => {
    const start = createEmptyRxFormFields();
    start.cc = "Fever";
    start.complaints = [{ id: "c-1", name: "Cough", category: "default" }];

    const pack = resolveObjectiveSpecialtyPacks("pulmonology")[0]!;
    const template = specialtyPackToSyntheticTemplate(pack);
    const actions = buildObjectiveTemplateApplyActions("objective_full", template, start);
    let state = baseState(start);
    for (const action of actions) {
      state = rxFormReducer(state, action);
    }

    expect(state.fields.cc).toBe("Fever");
    expect(state.fields.complaints[0]?.name).toBe("Cough");
    expect(state.fields.examFindings.some((f) => f.systemId === "resp")).toBe(true);
  });

  it("pack apply → buildRxPayload matches hand-entry of the same content (OBJ-D2)", () => {
    const pack = resolveObjectiveSpecialtyPacks("neurology")[0]!;
    const applied = applyPack(pack);

    const hand = createEmptyRxFormFields();
    hand.vitalsGcsTotal = 15;
    hand.examFindings = pack.objective.examinationJson ?? [];
    hand.objectiveCustomSections = (pack.objective.customSections ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      body: s.body ?? null,
      children: s.children ?? [],
    }));

    expect(buildRxPayload(applied)).toEqual(buildRxPayload(hand));
  });

  it("cardiology / pulmonology packs apply in-clinic POC result rows (obj-23)", () => {
    const cardiology = resolveObjectiveSpecialtyPacks("cardiology")[0]!;
    const cardioFields = applyPack(cardiology);
    const cardioPoc = cardioFields.testResultsStructured.filter(
      (r) => r.source === "in_clinic_poc",
    );
    expect(cardioPoc.map((r) => r.name)).toEqual(["ECG"]);

    const pulmonology = resolveObjectiveSpecialtyPacks("pulmonology")[0]!;
    const pulmFields = applyPack(pulmonology);
    expect(
      pulmFields.testResultsStructured
        .filter((r) => r.source === "in_clinic_poc")
        .map((r) => r.name),
    ).toEqual(expect.arrayContaining(["SpO₂ (room air)", "Peak expiratory flow rate"]));
    // derived legacy text reflects the POC rows on save (OBJ-D2)
    expect(buildRxPayload(pulmFields).testResults).toContain("SpO₂ (room air)");
  });

  it("synthetic pack template is not a persisted doctor_rx_templates row shape mistake", () => {
    const pack = resolveObjectiveSpecialtyPacks("dermatology")[0]!;
    const template = specialtyPackToSyntheticTemplate(pack);
    expect(template.id.startsWith("specialty-pack-")).toBe(true);
    expect(template.scope).toBe("objective_full");
    expect(template.objective_json.customSections?.length).toBeGreaterThan(0);
  });
});
