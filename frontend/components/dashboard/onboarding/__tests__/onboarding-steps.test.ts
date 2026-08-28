import { describe, expect, it } from "vitest";

import type { OnboardingStatus } from "@/lib/api";
import {
  buildGoLiveChecklist,
  isGoLiveComplete,
  remainingGoLiveSteps,
} from "../onboarding-steps";

const incompleteSetup: OnboardingStatus = {
  instagramConnected: false,
  practiceInfoSet: true,
  pricingSet: false,
  availabilitySet: false,
  complete: false,
};

const completeSetup: OnboardingStatus = {
  instagramConnected: true,
  practiceInfoSet: true,
  pricingSet: true,
  availabilitySet: true,
  complete: true,
};

describe("buildGoLiveChecklist", () => {
  it("puts Get verified first, then the four setup steps", () => {
    const steps = buildGoLiveChecklist(incompleteSetup, "unverified");
    expect(steps.map((s) => s.id)).toEqual([
      "verify",
      "instagram",
      "practice",
      "pricing",
      "availability",
    ]);
    expect(steps[0]?.href).toBe("/dashboard/get-verified");
    expect(steps[0]?.cta).toBe("Get verified");
    expect(steps[0]?.done).toBe(false);
  });

  it("marks verify done only when status is verified", () => {
    expect(buildGoLiveChecklist(incompleteSetup, "verified")[0]?.done).toBe(
      true
    );
    expect(
      buildGoLiveChecklist(incompleteSetup, "pending_review")[0]?.done
    ).toBe(false);
    expect(
      buildGoLiveChecklist(incompleteSetup, "pending_review")[0]?.statusLabel
    ).toBe("Under review");
  });

  it("uses Update documents / Fix & resubmit CTAs for review outcomes", () => {
    expect(
      buildGoLiveChecklist(incompleteSetup, "changes_requested")[0]?.cta
    ).toBe("Update documents");
    expect(buildGoLiveChecklist(incompleteSetup, "rejected")[0]?.cta).toBe(
      "Fix & resubmit"
    );
  });

  it("does not hijack Instagram href when unverified", () => {
    const ig = buildGoLiveChecklist(incompleteSetup, "unverified").find(
      (s) => s.id === "instagram"
    );
    expect(ig?.href).toBe("/dashboard/settings/integrations");
    expect(ig?.cta).toBe("Connect");
  });
});

describe("remainingGoLiveSteps / isGoLiveComplete", () => {
  it("counts verify among remaining when unverified", () => {
    const remaining = remainingGoLiveSteps(completeSetup, "unverified");
    expect(remaining.map((s) => s.id)).toEqual(["verify"]);
  });

  it("is complete only when setup complete AND verified", () => {
    expect(isGoLiveComplete(completeSetup, "verified")).toBe(true);
    expect(isGoLiveComplete(completeSetup, "unverified")).toBe(false);
    expect(isGoLiveComplete(incompleteSetup, "verified")).toBe(false);
  });
});
