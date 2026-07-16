import { describe, expect, it } from "vitest";
import {
  createEmptyRxFormFields,
  EMPTY_RX_MEDICINE,
} from "@/components/cockpit/rx/RxFormContext";
import {
  applyPlanStarterPack,
  getPlanStarterPack,
  PLAN_STARTER_PACKS,
} from "@/lib/cockpit/plan-starter-packs";
import { isMedicineRowComplete } from "@/lib/cockpit/medicine-row-state";

describe("plan-starter-packs (plan-p3)", () => {
  it("ships curated packs with complete medicine rows", () => {
    expect(PLAN_STARTER_PACKS.length).toBeGreaterThanOrEqual(3);
    for (const pack of PLAN_STARTER_PACKS) {
      expect(pack.name.trim()).not.toBe("");
      for (const med of pack.medicines) {
        expect(isMedicineRowComplete(med)).toBe(true);
      }
    }
  });

  it("replaces empty medicine seed and fills plan text fields", () => {
    const pack = getPlanStarterPack("viral_uri");
    expect(pack).toBeDefined();
    const fields = createEmptyRxFormFields([{ ...EMPTY_RX_MEDICINE }]);
    const result = applyPlanStarterPack(fields, pack!);

    expect(result.replacedMedicines).toBe(true);
    expect(result.fields.medicines).toHaveLength(1);
    expect(result.fields.medicines[0]?.medicineName).toBe("Paracetamol");
    expect(result.fields.advice).toContain("Rest");
    expect(result.fields.advice).toContain("Plenty of fluids");
    expect(result.fields.advice).toContain("Return if symptoms worsen");
    expect(result.fields.followUpValue).toBe(3);
    expect(result.fields.followUpUnit).toBe("days");
  });

  it("appends medicines when named rows already exist", () => {
    const pack = getPlanStarterPack("gastritis");
    expect(pack).toBeDefined();
    const fields = {
      ...createEmptyRxFormFields(),
      medicines: [
        {
          ...EMPTY_RX_MEDICINE,
          medicineName: "ORS",
          dosage: "1 sachet",
          frequency: "As needed",
          frequencyCode: "PRN" as const,
          duration: "3 days",
          durationValue: 3,
          durationUnit: "days" as const,
        },
      ],
      advice: "Rest",
    };
    const result = applyPlanStarterPack(fields, pack!);

    expect(result.replacedMedicines).toBe(false);
    expect(result.fields.medicines.map((m) => m.medicineName)).toEqual([
      "Pantoprazole",
      "ORS",
    ]);
    expect(result.fields.advice).toContain("Rest");
    expect(result.fields.advice).toContain("Soft / bland diet");
  });

  it("merges investigation chips and does not overwrite existing follow-up", () => {
    const pack = getPlanStarterPack("fever_workup");
    expect(pack).toBeDefined();
    const fields = {
      ...createEmptyRxFormFields(),
      investigationsOrders: "ESR",
      followUpValue: 7,
      followUpUnit: "days" as const,
    };
    const result = applyPlanStarterPack(fields, pack!);

    expect(result.fields.investigationsOrders).toContain("ESR");
    expect(result.fields.investigationsOrders).toContain("CBC");
    expect(result.fields.followUpValue).toBe(7);
    expect(result.fields.followUpUnit).toBe("days");
  });

  it("adds referral specialty from soft-tissue pack without duplicating", () => {
    const pack = getPlanStarterPack("sprain");
    expect(pack).toBeDefined();
    const once = applyPlanStarterPack(createEmptyRxFormFields(), pack!);
    expect(once.fields.referralSpecialties).toEqual(["Orthopaedics"]);
    expect(once.fields.referral).toBe("");
    const twice = applyPlanStarterPack(
      {
        ...createEmptyRxFormFields(),
        referralSpecialties: once.fields.referralSpecialties,
      },
      pack!,
    );
    expect(twice.fields.referralSpecialties).toEqual(["Orthopaedics"]);
  });
});
