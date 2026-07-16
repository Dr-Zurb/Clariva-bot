import { describe, expect, it } from "vitest";
import {
  filterReferralSpecialtyCatalog,
  REFERRAL_SPECIALTY_CATALOG,
  REFERRAL_SPECIALTY_QUICK_PICK_LABELS,
  resolveReferralSpecialtyCatalog,
  referralSpecialtyLabelForValue,
} from "@/lib/cockpit/referral-specialty-catalog";

describe("referral-specialty-catalog", () => {
  it("ships a broad catalog and a short quick-pick subset", () => {
    expect(REFERRAL_SPECIALTY_CATALOG.length).toBeGreaterThanOrEqual(30);
    expect(REFERRAL_SPECIALTY_QUICK_PICK_LABELS).toHaveLength(8);
    for (const label of REFERRAL_SPECIALTY_QUICK_PICK_LABELS) {
      expect(REFERRAL_SPECIALTY_CATALOG.some((o) => o.label === label)).toBe(
        true,
      );
    }
    expect(REFERRAL_SPECIALTY_QUICK_PICK_LABELS.slice(0, 4)).toEqual([
      "Internal Medicine",
      "General Surgery",
      "Gynaecology",
      "Orthopaedics",
    ]);
  });

  it("filters by label and aliases", () => {
    const byUro = filterReferralSpecialtyCatalog(
      REFERRAL_SPECIALTY_CATALOG,
      "uro",
    );
    expect(byUro.some((o) => o.label === "Urology")).toBe(true);

    const byKidney = filterReferralSpecialtyCatalog(
      REFERRAL_SPECIALTY_CATALOG,
      "kidney",
    );
    expect(byKidney.some((o) => o.label === "Nephrology")).toBe(true);
  });

  it("resolves exact label and alias to catalog value", () => {
    expect(resolveReferralSpecialtyCatalog("Urology")).toBe("urology");
    expect(resolveReferralSpecialtyCatalog("ortho")).toBe("orthopaedics");
    expect(resolveReferralSpecialtyCatalog("nope-specialty")).toBeUndefined();
    expect(referralSpecialtyLabelForValue("cardiology")).toBe("Cardiology");
  });
});
