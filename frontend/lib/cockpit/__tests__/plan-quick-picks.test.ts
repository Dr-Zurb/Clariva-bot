import { describe, expect, it } from "vitest";
import {
  appendUniquePlanPhrase,
  appendReferralPhrase,
  applyFollowUpQuickPick,
  applyReferralUrgency,
  hydrateReferralFields,
  isFollowUpQuickPickSelected,
  isReferralUrgencySelected,
  planPhraseAlreadyPresent,
  planPhraseTokenPresent,
  resolveReferralForOutput,
  stripReferralUrgency,
  PLAN_ADVICE_QUICK_PICKS,
  PLAN_EDUCATION_QUICK_PICKS,
  PLAN_FOLLOW_UP_QUICK_PICKS,
  PLAN_INVESTIGATION_QUICK_PICKS,
  PLAN_REFERRAL_QUICK_PICKS,
  PLAN_REFERRAL_REASON_QUICK_PICKS,
  PLAN_REFERRAL_URGENCY_QUICK_PICKS,
} from "@/lib/cockpit/plan-quick-picks";

describe("plan-quick-picks (plan-p2)", () => {
  it("ships non-empty static catalogs", () => {
    expect(PLAN_ADVICE_QUICK_PICKS.length).toBeGreaterThan(0);
    expect(PLAN_ADVICE_QUICK_PICKS).toContain("Return if symptoms worsen");
    expect(PLAN_EDUCATION_QUICK_PICKS.length).toBeGreaterThan(0);
    expect(PLAN_REFERRAL_QUICK_PICKS.length).toBeGreaterThan(0);
    expect(PLAN_REFERRAL_URGENCY_QUICK_PICKS.length).toBeGreaterThan(0);
    expect(PLAN_REFERRAL_REASON_QUICK_PICKS.length).toBeGreaterThan(0);
    expect(PLAN_FOLLOW_UP_QUICK_PICKS.length).toBeGreaterThanOrEqual(5);
    // Curated ~2-row OPD set — not every panel/imaging in the library.
    expect(PLAN_INVESTIGATION_QUICK_PICKS.length).toBeGreaterThanOrEqual(8);
    expect(PLAN_INVESTIGATION_QUICK_PICKS.length).toBeLessThanOrEqual(12);
  });

  it("includes the core OPD investigation commons", () => {
    for (const label of [
      "CBC",
      "LFT",
      "KFT / RFT",
      "Lipid profile",
      "Thyroid profile",
      "HbA1c",
      "Urine routine",
      "CRP / ESR",
      "Chest X-ray",
      "ECG",
      "USG abdomen",
    ]) {
      expect(PLAN_INVESTIGATION_QUICK_PICKS).toContain(label);
    }
  });

  it("follow-up quick picks set structured interval / clear", () => {
    const week = PLAN_FOLLOW_UP_QUICK_PICKS.find((p) => p.label === "1 week");
    expect(week).toBeDefined();
    expect(applyFollowUpQuickPick(week!)).toEqual({
      followUpValue: 1,
      followUpUnit: "weeks",
      clearNotes: false,
    });
    expect(isFollowUpQuickPickSelected(week!, 1, "weeks")).toBe(true);

    const clear = PLAN_FOLLOW_UP_QUICK_PICKS.find(
      (p) => p.label === "No follow-up",
    );
    expect(applyFollowUpQuickPick(clear!)).toEqual({
      followUpValue: null,
      followUpUnit: null,
      clearNotes: true,
    });
    expect(isFollowUpQuickPickSelected(clear!, null, null)).toBe(true);
  });

  it("compiles referral chips into parts without forced for-sentence", () => {
    expect(applyReferralUrgency("", "Urgent")).toBe("Urgent referral");
    expect(applyReferralUrgency("ENT", "Urgent")).toBe(
      "Urgent referral · ENT",
    );
    expect(applyReferralUrgency("Urgent: ENT", "Soon")).toBe(
      "Early referral · ENT",
    );
    expect(stripReferralUrgency("Urgent: Cardiology")).toBe("Cardiology");
    expect(stripReferralUrgency("Urgent referral · Cardiology")).toBe(
      "Cardiology",
    );
    expect(
      isReferralUrgencySelected("Urgent referral · ENT", "Urgent"),
    ).toBe(true);
    expect(isReferralUrgencySelected("Urgent: ENT", "Urgent")).toBe(true);
    expect(isReferralUrgencySelected("Urgent referral · ENT", "Soon")).toBe(
      false,
    );
    expect(appendReferralPhrase("Urgent", "ENT")).toBe(
      "Urgent referral · ENT",
    );
    expect(
      appendReferralPhrase("Urgent referral · ENT", "Further evaluation"),
    ).toBe("Urgent referral · ENT · Further evaluation");
    expect(appendReferralPhrase("", "Orthopaedics")).toBe("Orthopaedics");
    expect(
      appendReferralPhrase("Orthopaedics", "Further evaluation"),
    ).toBe("Orthopaedics · Further evaluation");
    expect(
      appendReferralPhrase("Urgent referral · ENT", "Cardiology"),
    ).toBe("Urgent referral · ENT, Cardiology");
    // Preserve free notes after em-dash when chips change.
    expect(
      applyReferralUrgency("Orthopaedics — Dr. Shah", "Urgent"),
    ).toBe("Urgent referral · Orthopaedics — Dr. Shah");
    expect(applyReferralUrgency("Cardiology", "ER / same day")).toBe(
      "Same-day referral · Cardiology",
    );
  });

  it("hydrates persisted referral into chips + notes without mixing", () => {
    expect(
      hydrateReferralFields(
        "Urgent referral · ENT · Further evaluation — Dr. Shah",
      ),
    ).toEqual({
      referralUrgency: "Urgent",
      referralSpecialties: ["ENT"],
      referralReason: "Further evaluation",
      referral: "Dr. Shah",
    });
    expect(
      hydrateReferralFields(
        "Urgent referral to ENT for further evaluation — Dr. Shah",
      ),
    ).toEqual({
      referralUrgency: "Urgent",
      referralSpecialties: ["ENT"],
      referralReason: "Further evaluation",
      referral: "Dr. Shah",
    });
    expect(
      resolveReferralForOutput({
        urgency: "Routine",
        specialties: ["ENT", "Cardiology"],
        reason: "If not improving",
        freeText: "",
      }),
    ).toBe("Routine referral · ENT, Cardiology · If not improving");
    expect(
      resolveReferralForOutput({
        urgency: "Urgent",
        specialties: ["Cardiology"],
        reason: null,
        freeText: "chest pain workup",
      }),
    ).toBe("Urgent referral · Cardiology — chest pain workup");
  });

  it("planPhraseTokenPresent does not treat ENT as inside Urgent", () => {
    expect(planPhraseTokenPresent("Urgent", "ENT")).toBe(false);
    expect(planPhraseTokenPresent("Urgent referral · ENT", "ENT")).toBe(true);
    expect(planPhraseAlreadyPresent("Urgent", "ENT")).toBe(true);
  });

  it("appendUniquePlanPhrase skips duplicates case-insensitively", () => {
    expect(appendUniquePlanPhrase("", "Rest")).toBe("Rest");
    expect(appendUniquePlanPhrase("Rest", "Rest")).toBe("Rest");
    expect(appendUniquePlanPhrase("rest", "Rest")).toBe("rest");
    expect(appendUniquePlanPhrase("Rest", "Plenty of fluids")).toBe(
      "Rest\nPlenty of fluids",
    );
    expect(appendUniquePlanPhrase("ENT", "Cardiology")).toBe(
      "ENT\nCardiology",
    );
  });

  it("planPhraseAlreadyPresent matches substrings case-insensitively", () => {
    expect(planPhraseAlreadyPresent("Rest\nFluids", "rest")).toBe(true);
    expect(planPhraseAlreadyPresent("Rest", "Plenty of fluids")).toBe(false);
  });
});
