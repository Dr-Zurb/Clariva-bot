import { describe, expect, it } from "vitest";
import {
  deriveDifferentialDiagnosis,
  derivePrimaryDiagnosis,
  enforceSinglePrimary,
  normalizeDiagnoses,
  seedAcuityFromLegacyVisit,
  seedDifferentialsFromLegacy,
  seedPrimaryDiagnosisFromLegacy,
  sortDiagnosesPrimaryFirst,
} from "@/lib/cockpit/diagnoses";
import type { DiagnosisRow } from "@/types/prescription";

function row(partial: Partial<DiagnosisRow> & { id: string; label: string }): DiagnosisRow {
  return {
    kind: "secondary",
    certainty: "provisional",
    status: "new",
    note: null,
    acuity: null,
    conditionId: null,
    ...partial,
  };
}

describe("normalizeDiagnoses", () => {
  it("drops rows without a label", () => {
    expect(
      normalizeDiagnoses([
        row({ id: "a", label: "  " }),
        row({ id: "b", label: "URI", kind: "primary" }),
      ]),
    ).toEqual([
      expect.objectContaining({ id: "b", label: "URI", kind: "primary" }),
    ]);
  });

  it("defaults unknown enums and demotes extra primaries", () => {
    const out = normalizeDiagnoses([
      {
        id: "1",
        label: "Asthma",
        kind: "primary",
        certainty: "confirmed",
        status: "ongoing",
      },
      {
        id: "2",
        label: "GERD",
        kind: "primary",
        certainty: "maybe" as DiagnosisRow["certainty"],
        status: "weird" as DiagnosisRow["status"],
      },
    ] as DiagnosisRow[]);
    expect(out[0].kind).toBe("primary");
    expect(out[1].kind).toBe("secondary");
    expect(out[1].certainty).toBe("provisional");
    expect(out[1].status).toBe("new");
  });

  it("maps deprecated rule_out certainty to provisional (Working)", () => {
    const out = normalizeDiagnoses([
      row({
        id: "p",
        label: "URI",
        kind: "primary",
        certainty: "rule_out",
      }),
    ]);
    expect(out[0].certainty).toBe("provisional");
  });

  it("accepts differential + excluded and clears conditionId + acuity on differentials", () => {
    const out = normalizeDiagnoses([
      row({
        id: "d",
        label: "Pneumonia",
        kind: "differential",
        certainty: "excluded",
        acuity: "stable",
        conditionId: "550e8400-e29b-41d4-a716-446655440099",
      }),
    ]);
    expect(out[0]).toMatchObject({
      kind: "differential",
      certainty: "excluded",
      conditionId: null,
      acuity: null,
    });
  });

  it("keeps per-diagnosis acuity on committed rows", () => {
    const out = normalizeDiagnoses([
      row({
        id: "p",
        label: "URI",
        kind: "primary",
        acuity: "improving",
      }),
    ]);
    expect(out[0].acuity).toBe("improving");
  });

  it("preserves ICD code/codeTitle and trims blanks to null (asmt-06)", () => {
    const out = normalizeDiagnoses([
      row({
        id: "c",
        label: "Hypertension",
        kind: "primary",
        code: " BA00 ",
        codeTitle: " Essential hypertension ",
      }),
      row({
        id: "u",
        label: "Uncoded",
        kind: "secondary",
        code: "  ",
      }),
    ]);
    expect(out[0].code).toBe("BA00");
    expect(out[0].codeTitle).toBe("Essential hypertension");
    expect(out[1].code).toBeNull();
    expect(out[1].codeTitle).toBeNull();
  });
});

describe("derivePrimaryDiagnosis", () => {
  it("returns the primary label trimmed", () => {
    expect(
      derivePrimaryDiagnosis([
        row({ id: "s", label: "Secondary", kind: "secondary" }),
        row({ id: "p", label: "  Viral URI  ", kind: "primary" }),
      ]),
    ).toBe("Viral URI");
  });

  it("falls back to the first committed row, never a differential", () => {
    expect(
      derivePrimaryDiagnosis([
        row({ id: "d", label: "DDx only", kind: "differential" }),
        row({ id: "a", label: "Only", kind: "secondary" }),
      ]),
    ).toBe("Only");
  });

  it("returns empty when only differentials exist", () => {
    expect(
      derivePrimaryDiagnosis([
        row({ id: "d", label: "Pneumonia", kind: "differential" }),
      ]),
    ).toBe("");
  });

  it("returns empty string for an empty list", () => {
    expect(derivePrimaryDiagnosis([])).toBe("");
  });
});

describe("deriveDifferentialDiagnosis (asmt-05 / ASMT-D4′)", () => {
  it("returns non-excluded differential labels, order-preserving", () => {
    expect(
      deriveDifferentialDiagnosis([
        row({ id: "p", label: "URI", kind: "primary" }),
        row({ id: "d1", label: "Pneumonia", kind: "differential" }),
        row({
          id: "d2",
          label: "TB",
          kind: "differential",
          certainty: "excluded",
        }),
        row({ id: "d3", label: "Asthma", kind: "differential" }),
      ]),
    ).toEqual(["Pneumonia", "Asthma"]);
  });

  it("de-dupes by normalized label", () => {
    expect(
      deriveDifferentialDiagnosis([
        row({ id: "d1", label: "Pneumonia", kind: "differential" }),
        row({ id: "d2", label: "  pneumonia  ", kind: "differential" }),
      ]),
    ).toEqual(["Pneumonia"]);
  });

  it("is byte-identical to a legacy chip list for equal content", () => {
    const labels = ["Pneumonia", "TB"];
    const cards = labels.map((label, i) =>
      row({ id: `d${i}`, label, kind: "differential" }),
    );
    expect(deriveDifferentialDiagnosis(cards)).toEqual(labels);
  });
});

describe("seedPrimaryDiagnosisFromLegacy", () => {
  it("seeds one primary row from free text", () => {
    const seeded = seedPrimaryDiagnosisFromLegacy("Asthma", "fixed-id");
    expect(seeded).toEqual([
      {
        id: "fixed-id",
        label: "Asthma",
        kind: "primary",
        certainty: "provisional",
        status: "new",
        note: null,
        acuity: null,
        conditionId: null,
        code: null,
        codeTitle: null,
      },
    ]);
  });

  it("returns empty for blank legacy text", () => {
    expect(seedPrimaryDiagnosisFromLegacy("  ")).toEqual([]);
  });
});

describe("seedAcuityFromLegacyVisit", () => {
  it("seeds primary acuity from visit-level when unset", () => {
    const out = seedAcuityFromLegacyVisit(
      [row({ id: "p", label: "URI", kind: "primary" })],
      "stable",
    );
    expect(out[0].acuity).toBe("stable");
  });

  it("does not overwrite an existing per-diagnosis acuity", () => {
    const out = seedAcuityFromLegacyVisit(
      [row({ id: "p", label: "URI", kind: "primary", acuity: "improving" })],
      "worsening",
    );
    expect(out[0].acuity).toBe("improving");
  });

  it("no-ops when only differentials exist", () => {
    const out = seedAcuityFromLegacyVisit(
      [row({ id: "d", label: "TB", kind: "differential" })],
      "stable",
    );
    expect(out[0].acuity).toBeNull();
  });
});

describe("seedDifferentialsFromLegacy (asmt-05)", () => {
  it("seeds differential cards, skipping blanks and already-present labels", () => {
    const existing = [
      row({ id: "p", label: "URI", kind: "primary" }),
      row({ id: "d0", label: "Pneumonia", kind: "differential" }),
    ];
    const seeded = seedDifferentialsFromLegacy(
      ["Pneumonia", "  TB  ", "", "Asthma"],
      existing,
    );
    expect(seeded.map((r) => r.label)).toEqual(["TB", "Asthma"]);
    expect(seeded.every((r) => r.kind === "differential")).toBe(true);
    expect(seeded.every((r) => r.certainty === "provisional")).toBe(true);
  });
});

describe("conditionId normalize (asmt-04)", () => {
  it("keeps a string conditionId and collapses empty/malformed to null", () => {
    const out = normalizeDiagnoses([
      row({
        id: "a",
        label: "HTN",
        kind: "primary",
        conditionId: "550e8400-e29b-41d4-a716-446655440099",
      }),
      row({
        id: "b",
        label: "DM",
        kind: "secondary",
        conditionId: "  ",
      }),
    ]);
    expect(out[0].conditionId).toBe("550e8400-e29b-41d4-a716-446655440099");
    expect(out[1].conditionId).toBeNull();
  });
});

describe("enforceSinglePrimary / sortDiagnosesPrimaryFirst", () => {
  it("promotes the requested id and demotes others", () => {
    const out = enforceSinglePrimary(
      [
        row({ id: "a", label: "A", kind: "primary" }),
        row({ id: "b", label: "B", kind: "secondary" }),
      ],
      "b",
    );
    expect(out.find((r) => r.id === "b")?.kind).toBe("primary");
    expect(out.find((r) => r.id === "a")?.kind).toBe("secondary");
  });

  it("never promotes or demotes a differential", () => {
    const out = enforceSinglePrimary(
      [
        row({ id: "d", label: "DDx", kind: "differential" }),
        row({ id: "a", label: "A", kind: "secondary" }),
      ],
      "d",
    );
    expect(out.find((r) => r.id === "d")?.kind).toBe("differential");
    expect(out.find((r) => r.id === "a")?.kind).toBe("primary");
  });

  it("leaves only-differentials without inventing a primary", () => {
    const out = enforceSinglePrimary([
      row({ id: "d", label: "DDx", kind: "differential" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("differential");
  });

  it("orders primary → secondary → differential", () => {
    const sorted = sortDiagnosesPrimaryFirst([
      row({ id: "d", label: "D", kind: "differential" }),
      row({ id: "s", label: "S", kind: "secondary" }),
      row({ id: "p", label: "P", kind: "primary" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["p", "s", "d"]);
  });
});
