import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  formatApplySummary,
  planPmhApply,
  pmhHasContent,
  pmhMedToCreatePayload,
  snapshotPmh,
  usePmhTemplateApply,
  type ApplyRowResult,
} from "@/lib/chart/use-pmh-template-apply";
import {
  allergiesHaveContent,
  planAllergyApply,
  snapshotAllergies,
  useAllergyTemplateApply,
} from "@/lib/chart/use-allergy-template-apply";
import type { DoctorRxTemplate } from "@/types/rx-template";
import type {
  MedicalBackgroundGrouped,
  PatientAllergy,
  PatientMedication,
} from "@/types/patient-chart";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMed(over: Partial<PatientMedication>): PatientMedication {
  return {
    id: over.id ?? "m1",
    doctor_id: "",
    patient_id: "p1",
    drug_name: over.drug_name ?? "Metformin",
    dose: null,
    frequency: over.frequency ?? null,
    status: over.status ?? "active",
    intake_pattern: null,
    source: null,
    started_on: null,
    stopped_on: null,
    note: over.note ?? null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    strength: over.strength ?? null,
    dose_qty: null,
    dose_unit: null,
    frequency_code: null,
    form: over.form ?? null,
    drug_master_id: null,
    stopped_ago_value: null,
    stopped_ago_unit: null,
    started_ago_value: null,
    started_ago_unit: null,
    stop_reason: null,
    dose_schedule: null,
    strength_value: null,
    strength_unit: null,
    strength_components: null,
    food_timing: null,
  };
}

function makeBackground(): MedicalBackgroundGrouped {
  return {
    conditions: [
      {
        id: "c1",
        doctor_id: "",
        patient_id: "p1",
        condition: "Hypertension",
        status: "active",
        diagnosed_on: null,
        diagnosed_ago_value: null,
        diagnosed_ago_unit: null,
        resolved_ago_value: null,
        resolved_ago_unit: null,
        on_treatment: null,
        note: "well controlled",
        archived_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        medications: [makeMed({ id: "m1", drug_name: "Amlodipine", strength: "5mg" })],
      },
    ],
    unlinkedMedications: [makeMed({ id: "m2", drug_name: "Metformin", status: "past" })],
    links: [],
    notes: null,
  };
}

function makeTemplate(over: Partial<DoctorRxTemplate>): DoctorRxTemplate {
  return {
    id: "t1",
    doctor_id: "d1",
    name: "T",
    description: null,
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    medicines_json: [],
    subjective_json: {},
    pmh_json: over.pmh_json ?? {},
    allergies_json: over.allergies_json ?? {},
    scope: over.scope ?? "subjective_full",
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function makeAllergy(over: Partial<PatientAllergy>): PatientAllergy {
  return {
    id: over.id ?? "a1",
    doctor_id: "",
    patient_id: "p1",
    allergen: over.allergen ?? "Penicillin",
    severity: over.severity ?? "moderate",
    reaction: over.reaction ?? null,
    note: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// PMH snapshot + plan
// ---------------------------------------------------------------------------

describe("snapshotPmh", () => {
  it("snapshots conditions + flattened deduped medications from chart state", () => {
    const snap = snapshotPmh(makeBackground());
    expect(snap.conditions).toEqual([
      { condition: "Hypertension", status: "active", note: "well controlled" },
    ]);
    expect(snap.medications).toEqual([
      { drugName: "Amlodipine", strength: "5mg", status: "active" },
      { drugName: "Metformin", status: "past" },
    ]);
  });

  it("pmhHasContent reflects presence of any chart row", () => {
    expect(pmhHasContent(makeBackground())).toBe(true);
    expect(pmhHasContent(null)).toBe(false);
    expect(
      pmhHasContent({ conditions: [], unlinkedMedications: [], links: [], notes: "x" }),
    ).toBe(false);
  });
});

describe("planPmhApply (dedup)", () => {
  it("drops conditions/meds that duplicate existing rows (case-insensitive, trimmed)", () => {
    const template = makeTemplate({
      pmh_json: {
        conditions: [{ condition: " hypertension " }, { condition: "Diabetes" }],
        medications: [{ drugName: "amlodipine" }, { drugName: "Aspirin" }],
      },
    });
    const plan = planPmhApply(template, {
      conditions: [{ condition: "Hypertension" }],
      medications: [{ drug_name: "Amlodipine" }],
    });
    expect(plan.conditions.map((c) => c.condition)).toEqual(["Diabetes"]);
    expect(plan.medications.map((m) => m.drugName)).toEqual(["Aspirin"]);
    expect(plan.skipped).toBe(2);
  });

  it("drops intra-template duplicates", () => {
    const template = makeTemplate({
      pmh_json: { conditions: [{ condition: "Asthma" }, { condition: "asthma" }] },
    });
    const plan = planPmhApply(template, { conditions: [], medications: [] });
    expect(plan.conditions).toHaveLength(1);
    expect(plan.skipped).toBe(1);
  });
});

describe("pmhMedToCreatePayload", () => {
  it("maps a templated med to a chart create payload", () => {
    expect(
      pmhMedToCreatePayload({ drugName: " Aspirin ", strength: "75mg", status: "active" }),
    ).toEqual({
      drugName: "Aspirin",
      strength: "75mg",
      dose: null,
      frequency: null,
      status: "active",
      form: null,
      note: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Allergy snapshot + plan
// ---------------------------------------------------------------------------

describe("snapshotAllergies + plan", () => {
  it("snapshots allergen + severity + reaction", () => {
    const snap = snapshotAllergies([
      makeAllergy({ allergen: "Penicillin", severity: "severe", reaction: "rash" }),
      makeAllergy({ id: "a2", allergen: "Sulfa", severity: "unknown" }),
    ]);
    expect(snap.allergies).toEqual([
      { allergen: "Penicillin", severity: "severe", reaction: "rash" },
      { allergen: "Sulfa", severity: "unknown" },
    ]);
  });

  it("allergiesHaveContent reflects presence", () => {
    expect(allergiesHaveContent([makeAllergy({})])).toBe(true);
    expect(allergiesHaveContent([])).toBe(false);
    expect(allergiesHaveContent(null)).toBe(false);
  });

  it("planAllergyApply dedups by allergen", () => {
    const template = makeTemplate({
      allergies_json: { allergies: [{ allergen: "penicillin" }, { allergen: "Latex" }] },
    });
    const plan = planAllergyApply(template, [{ allergen: "Penicillin" }]);
    expect(plan.allergies.map((a) => a.allergen)).toEqual(["Latex"]);
    expect(plan.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// formatApplySummary
// ---------------------------------------------------------------------------

describe("formatApplySummary", () => {
  it("counts only — created / skipped / failed", () => {
    expect(formatApplySummary({ created: 3, skipped: 0, failed: 0 }, "items")).toBe(
      "Added 3 items",
    );
    expect(formatApplySummary({ created: 3, skipped: 2, failed: 1 }, "items")).toBe(
      "Added 3 items · 2 already present · 1 failed",
    );
    expect(formatApplySummary({ created: 0, skipped: 2, failed: 0 }, "items")).toBe(
      "All items already present",
    );
    expect(formatApplySummary({ created: 0, skipped: 0, failed: 0 }, "items")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hook orchestration: create + dedup + partial failure
// ---------------------------------------------------------------------------

describe("usePmhTemplateApply orchestration", () => {
  it("creates missing rows, keeps successes on partial failure, resyncs, reports counts", async () => {
    const template = makeTemplate({
      pmh_json: {
        conditions: [{ condition: "Existing" }, { condition: "NewCond" }],
        medications: [{ drugName: "GoodMed" }, { drugName: "BadMed" }],
      },
    });

    const createCondition = vi.fn(
      async (c): Promise<ApplyRowResult> => (c.condition === "NewCond" ? "created" : "duplicate"),
    );
    const createMedication = vi.fn(
      async (m): Promise<ApplyRowResult> => (m.drugName === "GoodMed" ? "created" : "error"),
    );
    const reload = vi.fn(async () => undefined);
    const onSummary = vi.fn();

    const { result } = renderHook(() =>
      usePmhTemplateApply({
        getExisting: () => ({ conditions: [{ condition: "Existing" }], medications: [] }),
        createCondition,
        createMedication,
        reload,
        onSummary,
      }),
    );

    await result.current(template);

    // "Existing" deduped at plan time → createCondition only called for NewCond.
    expect(createCondition).toHaveBeenCalledTimes(1);
    expect(createMedication).toHaveBeenCalledTimes(2);
    // GoodMed created, BadMed failed → reload once.
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onSummary).toHaveBeenCalledWith({ created: 2, skipped: 1, failed: 1 });
  });

  it("does not resync when every row succeeds or is skipped", async () => {
    const template = makeTemplate({ pmh_json: { conditions: [{ condition: "Only" }] } });
    const reload = vi.fn(async () => undefined);
    const onSummary = vi.fn();

    const { result } = renderHook(() =>
      usePmhTemplateApply({
        getExisting: () => ({ conditions: [], medications: [] }),
        createCondition: async () => "created",
        createMedication: async () => "created",
        reload,
        onSummary,
      }),
    );

    await result.current(template);
    expect(reload).not.toHaveBeenCalled();
    expect(onSummary).toHaveBeenCalledWith({ created: 1, skipped: 0, failed: 0 });
  });

  it("per-call onSummary overrides the hook default (subj-18 full bundle)", async () => {
    const template = makeTemplate({ pmh_json: { conditions: [{ condition: "Only" }] } });
    const hookSummary = vi.fn();
    const callSummary = vi.fn();

    const { result } = renderHook(() =>
      usePmhTemplateApply({
        getExisting: () => ({ conditions: [], medications: [] }),
        createCondition: async () => "created",
        createMedication: async () => "created",
        reload: async () => undefined,
        onSummary: hookSummary,
      }),
    );

    await result.current(template, { onSummary: callSummary });
    expect(callSummary).toHaveBeenCalledWith({ created: 1, skipped: 0, failed: 0 });
    expect(hookSummary).not.toHaveBeenCalled();
  });
});

describe("useAllergyTemplateApply orchestration", () => {
  it("creates deduped allergies and reports counts", async () => {
    const template = makeTemplate({
      allergies_json: { allergies: [{ allergen: "Penicillin" }, { allergen: "Latex" }] },
    });
    const createAllergy = vi.fn(async (): Promise<ApplyRowResult> => "created");
    const reload = vi.fn(async () => undefined);
    const onSummary = vi.fn();

    const { result } = renderHook(() =>
      useAllergyTemplateApply({
        getExisting: () => [{ allergen: "Penicillin" }],
        createAllergy,
        reload,
        onSummary,
      }),
    );

    await result.current(template);
    expect(createAllergy).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(onSummary).toHaveBeenCalledWith({ created: 1, skipped: 1, failed: 0 });
  });
});
