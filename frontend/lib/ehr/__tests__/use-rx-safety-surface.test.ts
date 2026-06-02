import { describe, expect, it } from "vitest";
import { computeRxSafetyStripVisible } from "@/lib/ehr/use-rx-safety-surface";
import { ackKeyForAllergyMatch } from "@/components/ehr/AllergyClashBanner";
import { ackKeyForDdi } from "@/components/ehr/InteractionChips";

describe("computeRxSafetyStripVisible", () => {
  it("returns not visible when no matches and no DDIs", () => {
    expect(
      computeRxSafetyStripVisible({
        formAllergyMatches: [],
        medicineInstanceIds: ["m-1"],
        ddiInteractions: [],
        isAcked: () => false,
      }),
    ).toEqual({ visible: false, clashesCount: 0, ddiCount: 0 });
  });

  it("counts unacked allergy clashes", () => {
    const result = computeRxSafetyStripVisible({
      formAllergyMatches: [
        {
          medicineIndex: 0,
          medicineName: "Penicillin",
          allergyId: "al-1",
          allergenMatched: "Penicillin",
          severity: "severe",
          reaction: null,
        },
      ],
      medicineInstanceIds: ["m-1"],
      ddiInteractions: [],
      isAcked: () => false,
    });
    expect(result.visible).toBe(true);
    expect(result.clashesCount).toBe(1);
  });

  it("hides acked clashes", () => {
    const result = computeRxSafetyStripVisible({
      formAllergyMatches: [
        {
          medicineIndex: 0,
          medicineName: "Penicillin",
          allergyId: "al-1",
          allergenMatched: "Penicillin",
          severity: "severe",
          reaction: null,
        },
      ],
      medicineInstanceIds: ["m-1"],
      ddiInteractions: [],
      isAcked: (key) => key === ackKeyForAllergyMatch("m-1", "al-1"),
    });
    expect(result.visible).toBe(false);
  });

  it("counts unacked DDIs", () => {
    const result = computeRxSafetyStripVisible({
      formAllergyMatches: [],
      medicineInstanceIds: ["m-1"],
      ddiInteractions: [
        {
          id: "ddi-1",
          drug_a_id: "a",
          drug_b_id: "b",
          severity: "major",
          description: "x",
          recommendation: "y",
          source: null,
          source_url: null,
        },
      ],
      isAcked: (key) => key === ackKeyForDdi("ddi-1"),
    });
    expect(result.visible).toBe(false);
    expect(result.ddiCount).toBe(0);
  });
});
