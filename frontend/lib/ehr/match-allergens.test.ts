/**
 * Unit tests for `matchAllergens` (EHR Sub-batch C / T4.18).
 *
 * Runner note (tracked in `tasks-subbatch-C-safety.md`):
 *   The frontend package does not yet have Jest / Vitest installed —
 *   only `@playwright/test` for E2E. This file is written in a
 *   runner-agnostic Jest-compatible style (`@jest/globals`-style
 *   imports, plain `describe` / `it` / `expect`) so it becomes
 *   executable the moment a frontend test runner is wired up. Until
 *   then, the `ts-jest` toolchain in the backend package can run
 *   this file directly because the matcher has zero React / DOM
 *   dependencies — copy-execute is a one-liner.
 *
 * The test cases below cover every scenario called out in the
 * sub-batch C task spec (Step 2) and explicitly assert the
 * documented V1 false-negative for allergen-class matches
 * (Penicillin allergy → Amoxicillin prescribed).
 */

import { describe, it, expect } from "@jest/globals";
import {
  matchAllergens,
  normalizeForAllergyMatch,
  type AllergyMatch,
} from "./match-allergens";
import type {
  PatientAllergy,
  PatientAllergySeverity,
} from "@/types/patient-chart";
import type { DrugMasterRow } from "@/types/drug-master";
import type { PrescriptionMedicine } from "@/types/prescription";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

let allergyCounter = 0;
function makeAllergy(
  allergen: string,
  overrides: Partial<PatientAllergy> = {},
): PatientAllergy {
  allergyCounter += 1;
  return {
    id: `allergy-${allergyCounter}`,
    doctor_id: "doctor-1",
    patient_id: "patient-1",
    allergen,
    severity: "moderate" as PatientAllergySeverity,
    reaction: null,
    note: null,
    archived_at: null,
    created_at: "2026-05-04T00:00:00.000Z",
    updated_at: "2026-05-04T00:00:00.000Z",
    ...overrides,
  };
}

let drugCounter = 0;
function makeDrug(
  generic_name: string,
  brand_names: string[] = [],
  overrides: Partial<DrugMasterRow> = {},
): DrugMasterRow {
  drugCounter += 1;
  return {
    id: `drug-${drugCounter}`,
    generic_name,
    brand_names,
    strength: null,
    form: null,
    route_default: null,
    created_at: "2026-05-04T00:00:00.000Z",
    updated_at: "2026-05-04T00:00:00.000Z",
    ...overrides,
  };
}

function makeMedicine(
  medicine_name: string,
  drug_master_id: string | null = null,
): { medicine_name: string; drug_master_id: string | null } {
  return { medicine_name, drug_master_id };
}

function indexOf(...drugs: DrugMasterRow[]): Map<string, DrugMasterRow> {
  const m = new Map<string, DrugMasterRow>();
  for (const d of drugs) m.set(d.id, d);
  return m;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("normalizeForAllergyMatch", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeForAllergyMatch("  Paracetamol  ")).toBe("paracetamol");
  });

  it("leaves internal whitespace alone", () => {
    expect(normalizeForAllergyMatch("Penicillin V")).toBe("penicillin v");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeForAllergyMatch("   ")).toBe("");
  });
});

describe("matchAllergens — empty inputs", () => {
  it("returns no matches when there are no medicines", () => {
    const allergies = [makeAllergy("Paracetamol")];
    expect(matchAllergens([], allergies, new Map())).toEqual([]);
  });

  it("returns no matches when there are no allergies", () => {
    const meds = [makeMedicine("Amoxicillin")];
    expect(matchAllergens(meds, [], new Map())).toEqual([]);
  });

  it("ignores allergies that are archived", () => {
    const meds = [makeMedicine("Paracetamol")];
    const allergy = makeAllergy("Paracetamol", {
      archived_at: "2026-05-01T00:00:00.000Z",
    });
    expect(matchAllergens(meds, [allergy], new Map())).toEqual([]);
  });

  it("ignores allergies whose allergen normalizes to empty", () => {
    const meds = [makeMedicine("Paracetamol")];
    const allergy = makeAllergy("   ");
    expect(matchAllergens(meds, [allergy], new Map())).toEqual([]);
  });

  it("skips medicine rows with no candidates (empty name + no drug_master_id)", () => {
    const meds = [makeMedicine("", null)];
    const allergy = makeAllergy("Paracetamol");
    expect(matchAllergens(meds, [allergy], new Map())).toEqual([]);
  });
});

describe("matchAllergens — direct generic-name match", () => {
  it("matches when free-text medicine name equals the allergen", () => {
    const meds = [makeMedicine("Paracetamol")];
    const allergy = makeAllergy("Paracetamol");
    const matches = matchAllergens(meds, [allergy], new Map());

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject<Partial<AllergyMatch>>({
      medicineIndex: 0,
      medicineName: "Paracetamol",
      allergyId: allergy.id,
      allergenMatched: "Paracetamol",
      matchKind: "free-text-substring",
    });
  });

  it("matches via drug_master.generic_name when the medicine is autocomplete-linked", () => {
    const drug = makeDrug("Paracetamol", ["Crocin", "Calpol"]);
    const meds = [makeMedicine("Paracetamol", drug.id)];
    const allergy = makeAllergy("Paracetamol");

    const matches = matchAllergens(meds, [allergy], indexOf(drug));

    expect(matches).toHaveLength(1);
    expect(matches[0].matchKind).toBe("generic-substring");
    expect(matches[0].allergyId).toBe(allergy.id);
  });
});

describe("matchAllergens — brand-match path (the working case)", () => {
  it("matches Crocin × Paracetamol allergy WHEN drug_master_id is set", () => {
    // The doctor used T2.8 autocomplete, so the row is linked to the
    // canonical Paracetamol generic with Crocin in its brand list.
    const drug = makeDrug("Paracetamol", ["Crocin", "Calpol"]);
    const meds = [makeMedicine("Crocin", drug.id)];
    const allergy = makeAllergy("Paracetamol");

    const matches = matchAllergens(meds, [allergy], indexOf(drug));

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject<Partial<AllergyMatch>>({
      medicineIndex: 0,
      medicineName: "Crocin",
      allergyId: allergy.id,
      // The match attribution prefers the strongest signal: the
      // canonical generic_name is checked before brand_names, so
      // generic-substring wins over brand-substring here.
      matchKind: "generic-substring",
    });
  });

  it("attributes matchKind = 'brand-substring' when only the brand contains the allergen", () => {
    // Allergen "Crocin" against linked medicine whose generic is
    // "Paracetamol" but whose brand list contains "Crocin": the
    // generic candidate fails (no substring overlap with "crocin"),
    // and the brand candidate is what triggers the match.
    const drug = makeDrug("Paracetamol", ["Crocin", "Calpol"]);
    const meds = [makeMedicine("Crocin", drug.id)];
    const allergy = makeAllergy("Crocin");

    const matches = matchAllergens(meds, [allergy], indexOf(drug));

    expect(matches).toHaveLength(1);
    expect(matches[0].matchKind).toBe("brand-substring");
  });

  it("does NOT match Crocin × Paracetamol allergy when the row is free-text only (no drug_master_id)", () => {
    // Doctor typed "Crocin" without using autocomplete → no
    // drug_master_id → no brand metadata to expand against. Substring
    // check between "crocin" and "paracetamol" has no overlap.
    // This is the documented V1 gap reinforcing why B1 should ship
    // before C: free-text adoption pre-T2.8 produces false negatives
    // on the brand-match path.
    const meds = [makeMedicine("Crocin", null)];
    const allergy = makeAllergy("Paracetamol");

    expect(matchAllergens(meds, [allergy], new Map())).toEqual([]);
  });
});

describe("matchAllergens — V1 documented false negatives", () => {
  // KNOWN V1 GAP (tracked as follow-up in tasks-subbatch-C-safety.md):
  // Allergen-class matching ("Penicillin" allergy → "Amoxicillin"
  // prescribed) requires an allergen-class lookup table. V1 is pure
  // bidirectional substring, which has zero overlap between
  // "penicillin" and "amoxicillin". The test asserts the EXPECTED
  // V1 behaviour (no match) so a future allergen-class fix will
  // surface this test as a deliberate breaking change.
  it("does NOT match Amoxicillin × Penicillin allergy (V1 gap — needs allergen-class table)", () => {
    const drug = makeDrug("Amoxicillin", ["Mox", "Amoxil"]);
    const meds = [makeMedicine("Amoxicillin", drug.id)];
    const allergy = makeAllergy("Penicillin");

    expect(matchAllergens(meds, [allergy], indexOf(drug))).toEqual([]);
  });

  // KNOWN V1 GAP: free-text brand → free-text generic without T2.8
  // adoption. Same root cause as the brand-match test above.
  it("does NOT match free-text 'Crocin' × Paracetamol allergy (V1 gap — needs T2.8 adoption)", () => {
    const meds = [makeMedicine("crocin")];
    const allergy = makeAllergy("Paracetamol");
    expect(matchAllergens(meds, [allergy], new Map())).toEqual([]);
  });
});

describe("matchAllergens — normalization", () => {
  it("ignores leading/trailing whitespace on the allergen", () => {
    const meds = [makeMedicine("Paracetamol")];
    const allergy = makeAllergy("   Paracetamol   ");
    expect(matchAllergens(meds, [allergy], new Map())).toHaveLength(1);
  });

  it("ignores case mismatch on either side", () => {
    const meds = [makeMedicine("PARACETAMOL")];
    const allergy = makeAllergy("paracetamol");
    expect(matchAllergens(meds, [allergy], new Map())).toHaveLength(1);
  });

  it("normalizes drug_master generic + brand entries", () => {
    const drug = makeDrug("  Paracetamol  ", [" Crocin "]);
    const meds = [makeMedicine("Crocin", drug.id)];
    const allergy = makeAllergy("paracetamol");

    const matches = matchAllergens(meds, [allergy], indexOf(drug));
    expect(matches).toHaveLength(1);
    expect(matches[0].matchKind).toBe("generic-substring");
  });
});

describe("matchAllergens — bidirectional substring", () => {
  it("matches when the allergen is a substring of the medicine name", () => {
    // PCN-V is a niche penicillin formulation. Allergen "PCN-V"
    // contained within medicine "Penicillin V (PCN-V) tablets"
    // (free-text) — bidirectional includes catches the long-medicine
    // / short-allergen direction.
    const meds = [makeMedicine("Penicillin V (PCN-V) tablets")];
    const allergy = makeAllergy("PCN-V");
    expect(matchAllergens(meds, [allergy], new Map())).toHaveLength(1);
  });

  it("matches when the medicine name is a substring of the allergen", () => {
    // Allergen captured as a long free-text string ("Aspirin and other
    // NSAIDs"); medicine "Aspirin" is the prescribed drug. The
    // allergen.includes(candidate) direction catches it.
    const meds = [makeMedicine("Aspirin")];
    const allergy = makeAllergy("Aspirin and other NSAIDs");
    expect(matchAllergens(meds, [allergy], new Map())).toHaveLength(1);
  });
});

describe("matchAllergens — multiple matches", () => {
  it("emits one match per (medicine, allergy) pair across multiple medicines", () => {
    // Spec verbatim: "allergen 'Sulfa' + medicine 'Sulfa drug' +
    // medicine 'Sulfasalazine' → 2 matches".
    const meds = [
      makeMedicine("Sulfa drug"),
      makeMedicine("Sulfasalazine"),
    ];
    const allergy = makeAllergy("Sulfa");

    const matches = matchAllergens(meds, [allergy], new Map());

    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.medicineIndex)).toEqual([0, 1]);
    expect(matches.every((m) => m.matchKind === "free-text-substring")).toBe(
      true,
    );
  });

  it("emits one match per allergy when multiple allergies match the same medicine", () => {
    // Two distinct allergies both hit the same medicine. Expected:
    // 2 matches, same medicineIndex, different allergyIds.
    const meds = [makeMedicine("Co-trimoxazole")];
    const allergyA = makeAllergy("Sulfa");
    const allergyB = makeAllergy("Trimethoprim");

    const matches = matchAllergens(meds, [allergyA, allergyB], new Map());

    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.medicineIndex)).toEqual([0, 0]);
    expect(matches.map((m) => m.allergyId).sort()).toEqual(
      [allergyA.id, allergyB.id].sort(),
    );
  });

  it("dedupes within a single (medicine, allergy) pair when multiple candidates would match", () => {
    // Allergen "Sulfa" against a medicine whose canonical generic
    // ("Sulfasalazine") AND brand ("Salazo-sulfa") both contain
    // "sulfa". Per the §19 LOCKED rule, we emit ONE match per
    // (medicine, allergy) pair, not one per matching candidate.
    const drug = makeDrug("Sulfasalazine", ["Salazo-sulfa"]);
    const meds = [makeMedicine("Salazo-sulfa", drug.id)];
    const allergy = makeAllergy("Sulfa");

    const matches = matchAllergens(meds, [allergy], indexOf(drug));

    expect(matches).toHaveLength(1);
    // The first candidate iterated is the generic, so it wins.
    expect(matches[0].matchKind).toBe("generic-substring");
  });
});

describe("matchAllergens — unrelated drugs do not produce false positives", () => {
  it("returns no matches across a basket of unrelated drugs and allergens", () => {
    const meds = [
      makeMedicine("Metformin"),
      makeMedicine("Atorvastatin"),
      makeMedicine("Lisinopril"),
      makeMedicine("Levothyroxine"),
    ];
    const allergies = [
      makeAllergy("Penicillin"),
      makeAllergy("Sulfa"),
      makeAllergy("Latex"),
      makeAllergy("Peanuts"),
    ];

    expect(matchAllergens(meds, allergies, new Map())).toEqual([]);
  });

  it("does not match when an unrelated drug_master row is in the index", () => {
    const drug = makeDrug("Metformin");
    const meds = [makeMedicine("Metformin", drug.id)];
    const allergy = makeAllergy("Penicillin");

    expect(matchAllergens(meds, [allergy], indexOf(drug))).toEqual([]);
  });
});

describe("matchAllergens — passes through severity + reaction for the banner", () => {
  it("preserves severity and reaction from the allergy row", () => {
    const meds = [makeMedicine("Paracetamol")];
    const allergy = makeAllergy("Paracetamol", {
      severity: "severe",
      reaction: "Anaphylaxis within 30 minutes of exposure",
    });

    const matches = matchAllergens(meds, [allergy], new Map());

    expect(matches).toHaveLength(1);
    expect(matches[0].severity).toBe("severe");
    expect(matches[0].reaction).toBe(
      "Anaphylaxis within 30 minutes of exposure",
    );
  });
});

describe("matchAllergens — accepts the API row shape directly", () => {
  it("works when callers pass a full PrescriptionMedicine row", () => {
    // The matcher's input is structurally typed; verify a row that
    // satisfies the full PrescriptionMedicine shape (e.g. straight
    // out of `listPrescriptionsByAppointment`) is accepted without
    // mapping.
    const apiRow: PrescriptionMedicine = {
      id: "pm-1",
      prescription_id: "rx-1",
      medicine_name: "Paracetamol",
      dosage: "500 mg",
      route: "Oral",
      frequency: "TID",
      duration: "5 days",
      instructions: null,
      sort_order: 0,
      created_at: "2026-05-04T00:00:00.000Z",
      drug_master_id: null,
      frequency_code: "TID",
      duration_value: 5,
      duration_unit: "days",
      route_code: "oral",
      dose_qty: null,
      dose_unit: null,
      form: null,
      food_timing: null,
    };
    const allergy = makeAllergy("Paracetamol");

    expect(matchAllergens([apiRow], [allergy], new Map())).toHaveLength(1);
  });
});
