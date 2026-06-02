/**
 * Unit tests for `computePreSendWarnings`
 * (EHR Sub-batch C / T4.21 — C.4).
 *
 * Runner note (mirrors `match-allergens.test.ts`):
 *   The frontend package does not yet have Jest / Vitest installed —
 *   only `@playwright/test` for E2E. This file is written in a
 *   runner-agnostic Jest-compatible style (`@jest/globals`-style
 *   imports, plain `describe` / `it` / `expect`) so it becomes
 *   executable the moment a frontend test runner is wired up. Until
 *   then, the helper is purely TypeScript with no React / DOM /
 *   network deps so any of `{ jest + ts-jest, vitest, node:test + tsx }`
 *   will run it.
 *
 * Coverage:
 *   - empty-rx detection (medicines + investigations + education)
 *   - no-diagnosis detection
 *   - unacked-allergy filter (uses ack-key shape from
 *     `AllergyClashBanner`)
 *   - unacked-ddi filter (uses ack-key shape from `InteractionChips`)
 *   - DDI severity aggregation (highest severity surfaces)
 *   - warning ordering (clinical severity first)
 *   - focusTargetFor returns the first warning's target
 *   - warningKindsForTelemetry de-dupes + preserves order
 */

import { describe, it, expect } from "@jest/globals";
import {
  computePreSendWarnings,
  focusTargetFor,
  warningKindsForTelemetry,
  type PreSendInputs,
  type PreSendWarning,
} from "./pre-send-warnings";
import { ackKeyForAllergyMatch } from "@/components/ehr/AllergyClashBanner";
import { ackKeyForDdi } from "@/components/ehr/InteractionChips";
import type { AllergyMatch } from "./match-allergens";
import type {
  InteractionRow,
  InteractionSeverity,
} from "@/lib/api/drug-interactions";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function makeAllergyMatch(
  medicineIndex: number,
  allergyId: string,
  overrides: Partial<AllergyMatch> = {},
): AllergyMatch {
  return {
    medicineIndex,
    medicineName: "Amoxicillin",
    allergyId,
    allergenMatched: "Penicillin",
    severity: "moderate",
    reaction: null,
    matchKind: "free-text-substring",
    ...overrides,
  };
}

let ddiCounter = 0;
function makeDdi(
  severity: InteractionSeverity,
  overrides: Partial<InteractionRow> = {},
): InteractionRow {
  ddiCounter += 1;
  return {
    id: `ddi-${ddiCounter}`,
    drug_a_id: "drug-a",
    drug_b_id: "drug-b",
    severity,
    description: "Test interaction",
    recommendation: "Use caution",
    source: "Test",
    source_url: null,
    ...overrides,
  };
}

/** Build a defaults-filled inputs object so tests only specify what
 *  matters to them. Defaults represent a populated Rx with no
 *  warnings — `filledMedicineCount: 1` keeps empty-rx inert across
 *  unrelated tests; `hasAttachments: false` is the safe baseline. */
function makeInputs(overrides: Partial<PreSendInputs> = {}): PreSendInputs {
  return {
    filledMedicineCount: 1,
    hasInvestigations: false,
    hasPatientEducation: false,
    hasDiagnosis: true,
    hasAttachments: false,
    allergyMatches: [],
    medicineInstanceIds: [],
    ddiInteractions: [],
    isAcked: () => false,
    ...overrides,
  };
}

/** Convenience: build an `isAcked` predicate from a known ack-key set. */
function ackedSet(...keys: string[]): (key: string) => boolean {
  const s = new Set(keys);
  return (key) => s.has(key);
}

// ---------------------------------------------------------------------------
// Empty-state tests
// ---------------------------------------------------------------------------

describe("computePreSendWarnings — happy path", () => {
  it("returns no warnings when the form is fully populated", () => {
    const warnings = computePreSendWarnings(
      makeInputs({
        filledMedicineCount: 2,
        hasInvestigations: true,
        hasPatientEducation: true,
        hasDiagnosis: true,
        allergyMatches: [],
        ddiInteractions: [],
      }),
    );
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Empty-rx detection
// ---------------------------------------------------------------------------

describe("computePreSendWarnings — empty-rx", () => {
  it("flags empty-rx when no medicines, no investigations, no education, no attachments", () => {
    const warnings = computePreSendWarnings(
      makeInputs({
        filledMedicineCount: 0,
        hasInvestigations: false,
        hasPatientEducation: false,
        hasAttachments: false,
        hasDiagnosis: true,
      }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject<Partial<PreSendWarning>>({
      kind: "empty-rx",
      targetId: "medicines-section",
    });
  });

  it("does NOT flag empty-rx when any of medicines / investigations / education / attachments is present", () => {
    expect(
      computePreSendWarnings(makeInputs({ filledMedicineCount: 1 })),
    ).toHaveLength(0);
    expect(
      computePreSendWarnings(
        makeInputs({ filledMedicineCount: 0, hasInvestigations: true }),
      ),
    ).toHaveLength(0);
    expect(
      computePreSendWarnings(
        makeInputs({ filledMedicineCount: 0, hasPatientEducation: true }),
      ),
    ).toHaveLength(0);
    // Photo-only Rx — attachments alone satisfy the empty-rx check.
    expect(
      computePreSendWarnings(
        makeInputs({
          filledMedicineCount: 0,
          hasInvestigations: false,
          hasPatientEducation: false,
          hasAttachments: true,
        }),
      ),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// No-diagnosis detection
// ---------------------------------------------------------------------------

describe("computePreSendWarnings — no-diagnosis", () => {
  it("flags no-diagnosis when hasDiagnosis is false", () => {
    const warnings = computePreSendWarnings(
      makeInputs({ hasDiagnosis: false }),
    );
    const dx = warnings.find((w) => w.kind === "no-diagnosis");
    expect(dx).toBeDefined();
    expect(dx?.targetId).toBe("diagnosis");
  });

  it("does NOT flag no-diagnosis when hasDiagnosis is true", () => {
    const warnings = computePreSendWarnings(
      makeInputs({ hasDiagnosis: true }),
    );
    expect(warnings.find((w) => w.kind === "no-diagnosis")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unacked allergy filtering
// ---------------------------------------------------------------------------

describe("computePreSendWarnings — unacked-allergy", () => {
  it("flags unacked-allergy when there are matches and none are acknowledged", () => {
    const match = makeAllergyMatch(0, "allergy-1");
    const warnings = computePreSendWarnings(
      makeInputs({
        allergyMatches: [match],
        medicineInstanceIds: ["m-1"],
      }),
    );
    const allergyW = warnings.find((w) => w.kind === "unacked-allergy");
    expect(allergyW).toBeDefined();
    if (allergyW?.kind !== "unacked-allergy") return;
    expect(allergyW.count).toBe(1);
    expect(allergyW.matches).toHaveLength(1);
    expect(allergyW.targetId).toBe("medicines-section");
  });

  it("filters out matches whose ack key is in the acked set", () => {
    const match = makeAllergyMatch(0, "allergy-1");
    const ackKey = ackKeyForAllergyMatch("m-1", "allergy-1");
    const warnings = computePreSendWarnings(
      makeInputs({
        allergyMatches: [match],
        medicineInstanceIds: ["m-1"],
        isAcked: ackedSet(ackKey),
      }),
    );
    expect(
      warnings.find((w) => w.kind === "unacked-allergy"),
    ).toBeUndefined();
  });

  it("counts multiple unacked matches separately", () => {
    const m1 = makeAllergyMatch(0, "a-1");
    const m2 = makeAllergyMatch(1, "a-2");
    const warnings = computePreSendWarnings(
      makeInputs({
        allergyMatches: [m1, m2],
        medicineInstanceIds: ["m-1", "m-2"],
      }),
    );
    const allergyW = warnings.find((w) => w.kind === "unacked-allergy");
    if (allergyW?.kind !== "unacked-allergy") {
      throw new Error("expected unacked-allergy warning");
    }
    expect(allergyW.count).toBe(2);
  });

  it("surfaces a match defensively when its instance id is missing (parallel-array drift)", () => {
    const match = makeAllergyMatch(5, "a-1"); // index 5 → no instance id at index 5
    const warnings = computePreSendWarnings(
      makeInputs({
        allergyMatches: [match],
        medicineInstanceIds: ["m-1"], // length 1 → index 5 undefined
      }),
    );
    expect(
      warnings.find((w) => w.kind === "unacked-allergy"),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Unacked DDI filtering
// ---------------------------------------------------------------------------

describe("computePreSendWarnings — unacked-ddi", () => {
  it("flags unacked-ddi when there are interactions and none are acknowledged", () => {
    const ddi = makeDdi("major");
    const warnings = computePreSendWarnings(
      makeInputs({ ddiInteractions: [ddi] }),
    );
    const ddiW = warnings.find((w) => w.kind === "unacked-ddi");
    if (ddiW?.kind !== "unacked-ddi") {
      throw new Error("expected unacked-ddi warning");
    }
    expect(ddiW.count).toBe(1);
    expect(ddiW.highestSeverity).toBe("major");
  });

  it("filters out interactions whose ack key is in the acked set", () => {
    const ddi = makeDdi("moderate");
    const warnings = computePreSendWarnings(
      makeInputs({
        ddiInteractions: [ddi],
        isAcked: ackedSet(ackKeyForDdi(ddi.id)),
      }),
    );
    expect(warnings.find((w) => w.kind === "unacked-ddi")).toBeUndefined();
  });

  it("reports the HIGHEST severity across the unacked DDI set", () => {
    const minor = makeDdi("minor");
    const major = makeDdi("major");
    const moderate = makeDdi("moderate");
    const warnings = computePreSendWarnings(
      makeInputs({ ddiInteractions: [minor, major, moderate] }),
    );
    const ddiW = warnings.find((w) => w.kind === "unacked-ddi");
    if (ddiW?.kind !== "unacked-ddi") {
      throw new Error("expected unacked-ddi warning");
    }
    expect(ddiW.highestSeverity).toBe("major");
    expect(ddiW.count).toBe(3);
  });

  it("flags contraindicated as the highest severity when present", () => {
    const major = makeDdi("major");
    const contra = makeDdi("contraindicated");
    const warnings = computePreSendWarnings(
      makeInputs({ ddiInteractions: [major, contra] }),
    );
    const ddiW = warnings.find((w) => w.kind === "unacked-ddi");
    if (ddiW?.kind !== "unacked-ddi") {
      throw new Error("expected unacked-ddi warning");
    }
    expect(ddiW.highestSeverity).toBe("contraindicated");
  });
});

// ---------------------------------------------------------------------------
// Warning ordering
// ---------------------------------------------------------------------------

describe("computePreSendWarnings — ordering", () => {
  it("emits warnings in clinical-severity order: allergy → ddi → no-dx → empty-rx", () => {
    const warnings = computePreSendWarnings(
      makeInputs({
        filledMedicineCount: 0,
        hasInvestigations: false,
        hasPatientEducation: false,
        hasDiagnosis: false,
        allergyMatches: [makeAllergyMatch(0, "a-1")],
        medicineInstanceIds: ["m-1"],
        ddiInteractions: [makeDdi("major")],
      }),
    );
    expect(warnings.map((w) => w.kind)).toEqual([
      "unacked-allergy",
      "unacked-ddi",
      "no-diagnosis",
      "empty-rx",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Focus target helper
// ---------------------------------------------------------------------------

describe("focusTargetFor", () => {
  it("returns the first warning's targetId", () => {
    const dx: PreSendWarning = {
      kind: "no-diagnosis",
      targetId: "diagnosis",
      summary: "x",
    };
    const empty: PreSendWarning = {
      kind: "empty-rx",
      targetId: "medicines-section",
      summary: "y",
    };
    expect(focusTargetFor([dx, empty])).toBe("diagnosis");
    expect(focusTargetFor([empty, dx])).toBe("medicines-section");
  });

  it("falls back to medicines-section on an empty list", () => {
    expect(focusTargetFor([])).toBe("medicines-section");
  });
});

// ---------------------------------------------------------------------------
// Telemetry kinds builder
// ---------------------------------------------------------------------------

describe("warningKindsForTelemetry", () => {
  it("returns kinds in iteration order with no duplicates", () => {
    const warnings: PreSendWarning[] = [
      { kind: "no-diagnosis", targetId: "diagnosis", summary: "x" },
      { kind: "empty-rx", targetId: "medicines-section", summary: "y" },
    ];
    expect(warningKindsForTelemetry(warnings)).toEqual([
      "no-diagnosis",
      "empty-rx",
    ]);
  });

  it("de-dupes if the same kind shows up twice (defensive — V1 doesn't, but the helper is robust)", () => {
    const warnings: PreSendWarning[] = [
      { kind: "no-diagnosis", targetId: "diagnosis", summary: "x" },
      { kind: "no-diagnosis", targetId: "diagnosis", summary: "y" },
    ];
    expect(warningKindsForTelemetry(warnings)).toEqual(["no-diagnosis"]);
  });
});
