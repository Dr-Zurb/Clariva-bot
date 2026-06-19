import { describe, expect, it, vi } from "vitest";
import {
  buildFamilyHistoryCarryForwardAction,
  buildPastSurgicalHistoryCarryForwardAction,
  buildSocialHistoryCarryForwardAction,
  buildSubjectiveCarryForwardActions,
  cloneComplaintsForCarryForward,
  COPY_ALL_SUBJECTIVE_SELECTION,
  resolvePastSurgicalHistoryForCarryForward,
  resolveSocialHistoryForCarryForward,
} from "@/lib/cockpit/carry-forward-subjective";
import type { Complaint } from "@/types/prescription";

describe("carry-forward-subjective", () => {
  it("clones complaints with new ids", () => {
    const source: Complaint[] = [
      { id: "old-1", name: "Headache", category: "pain" },
      { id: "old-2", name: "", category: "default" },
    ];
    const cloned = cloneComplaintsForCarryForward(source);
    expect(cloned).toHaveLength(1);
    expect(cloned[0].name).toBe("Headache");
    expect(cloned[0].id).not.toBe("old-1");
    expect(cloned[0].category).toBe("pain");
  });

  it("builds copy-all actions for complaints and histories", () => {
    const actions = buildSubjectiveCarryForwardActions(
      {
        complaints: [{ id: "c-1", name: "Fever" }],
        familyHistory: "Father — HTN",
        socialHistory: "Non-smoker",
        pastSurgicalHistory: "Appendectomy 2010",
      },
      COPY_ALL_SUBJECTIVE_SELECTION,
    );

    expect(actions).toHaveLength(4);
    expect(actions[0]).toMatchObject({ type: "SET_COMPLAINTS" });
    expect(actions[1]?.type).toBe("SET_FAMILY_HISTORY_STRUCTURED");
    expect(actions[2]).toMatchObject({ type: "SET_SOCIAL_HISTORY_STRUCTURED" });
    expect(actions[3]?.type).toBe("SET_PAST_SURGICAL_HISTORY_STRUCTURED");
  });

  it("prefers structured past surgical history over legacy TEXT", () => {
    const structured = {
      procedures: [{ id: "psh-1", procedure: "appendectomy" as const, agoValue: 16, agoUnit: "years" as const }],
    };
    const action = buildPastSurgicalHistoryCarryForwardAction({
      pastSurgicalHistoryStructured: structured,
      pastSurgicalHistory: "Legacy only",
    });
    expect(action?.type).toBe("SET_PAST_SURGICAL_HISTORY_STRUCTURED");
    expect(action?.structured.procedures?.[0]).toMatchObject({ procedure: "appendectomy" });
    expect(action?.structured.procedures?.[0]?.id).not.toBe("psh-1");
  });

  it("parses legacy past surgical TEXT when JSONB is absent", () => {
    const resolved = resolvePastSurgicalHistoryForCarryForward({
      pastSurgicalHistory: "Appendectomy 2010",
    });
    expect(resolved?.procedures?.[0]).toMatchObject({ procedure: "appendectomy", notes: "2010" });
  });

  it("prefers structured family history over legacy TEXT", () => {
    const structured = {
      relatives: { father: [{ id: "fh-1", condition: "htn" as const }] },
    };
    const action = buildFamilyHistoryCarryForwardAction({
      familyHistoryStructured: structured,
      familyHistory: "Legacy only",
    });
    expect(action).toEqual({ type: "SET_FAMILY_HISTORY_STRUCTURED", structured });
  });

  it("prefers structured social history over legacy TEXT", () => {
    const structured = {
      smoking: {
        status: "ex" as const,
        products: [{ id: "p1", type: "cigarette", perDay: 10, years: 20 }],
      },
    };
    const action = buildSocialHistoryCarryForwardAction({
      socialHistoryStructured: structured,
      socialHistory: "Legacy only",
    });
    expect(action).toEqual({ type: "SET_SOCIAL_HISTORY_STRUCTURED", structured });
    expect(resolveSocialHistoryForCarryForward({
      socialHistoryStructured: structured,
      socialHistory: "Legacy only",
    })).toEqual(structured);
  });

  it("falls back to parsing legacy TEXT when JSONB is absent", () => {
    const resolved = resolveSocialHistoryForCarryForward({
      socialHistory: "Smoking: Non-smoker",
    });
    expect(resolved?.smoking).toEqual({ status: "never", products: [] });
  });

  it("respects pick-fields selection", () => {
    const actions = buildSubjectiveCarryForwardActions(
      {
        complaints: [{ id: "c-1", name: "Cough" }],
        familyHistory: "Father — HTN",
        socialHistory: null,
        pastSurgicalHistory: null,
      },
      { complaints: false, familyHistory: true, socialHistory: false, pastSurgicalHistory: false },
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("SET_FAMILY_HISTORY_STRUCTURED");
  });

  it("carries forward all phase-2 dimensions incl. gated sexual when present (sh-08)", () => {
    const structured = {
      substances: { uses: ["cannabis"], route: "inhaled" as const },
      diet: { type: "vegetarian" as const, caffeineCupsPerDay: 2 },
      activity: { level: "moderate" as const, daysPerWeek: 3, items: [] },
      occupation: { text: "Farmer", exposures: ["heat"] },
      living: { situation: "with-family" as const },
      travel: { recent: true, place: "Mumbai" },
      sickContact: { present: true },
      sleep: { hoursPerNight: 6, quality: "poor" as const },
      stress: { level: "high" as const, support: "limited" as const },
      sexual: { enabled: true, active: true, protection: "sometimes" as const },
    };

    const action = buildSocialHistoryCarryForwardAction({
      socialHistoryStructured: structured,
      socialHistory: "Legacy TEXT should be ignored",
    });

    expect(action?.type).toBe("SET_SOCIAL_HISTORY_STRUCTURED");
    expect(action?.structured).toMatchObject({
      diet: { type: "vegetarian" },
      caffeine: {
        status: "current",
        items: [{ amount: 2, frequencyUnit: "day", frequency: 1 }],
      },
      activity: { level: "moderate", daysPerWeek: 3, items: [] },
      occupation: { text: "Farmer", exposures: ["heat"] },
      living: { situation: "with-family" },
      travel: { recent: true, place: "Mumbai" },
      sickContact: { present: true },
      sleep: { hoursPerNight: 6, quality: "poor" },
      stress: { level: "high", support: "limited" },
      sexual: { enabled: true, active: true, protection: "sometimes" },
      substances: {
        status: "current",
        items: [expect.objectContaining({ type: "cannabis", route: "inhaled" })],
      },
    });
    expect(resolveSocialHistoryForCarryForward({ socialHistoryStructured: structured })?.sleep).toEqual(
      { hoursPerNight: 6, quality: "poor" },
    );
    expect(
      resolveSocialHistoryForCarryForward({ socialHistoryStructured: structured })?.sexual,
    ).toMatchObject({ enabled: true, active: true });
  });

  it("does not carry forward disabled sexual history from legacy TEXT alone (sh-08)", () => {
    const resolved = resolveSocialHistoryForCarryForward({
      socialHistory: "Sexual: active, protection sometimes",
    });
    expect(resolved?.sexual).toMatchObject({ enabled: true, active: true });
  });

  it("carries forward phase-3 alcohol fields (auditC, maxPerSession, abv, frequency) (sh-13)", () => {
    const structured = {
      alcohol: {
        status: "current" as const,
        drinks: [
          {
            id: "d1",
            type: "beer",
            amount: 330,
            amountUnit: "ml" as const,
            abv: 8,
            frequency: 3,
            frequencyUnit: "month" as const,
          },
        ],
        auditC: { frequency: 2, typicalQuantity: 1, bingeFrequency: 1 },
        auditFull: { unableToStop: 2, injury: 4, othersConcerned: 0 },
        maxPerSession: { amount: 6, amountUnit: "peg" as const },
      },
    };

    const action = buildSocialHistoryCarryForwardAction({
      socialHistoryStructured: structured,
      socialHistory: null,
    });

    expect(action).toMatchObject({
      type: "SET_SOCIAL_HISTORY_STRUCTURED",
      structured: expect.objectContaining({
        alcohol: expect.objectContaining({
          auditC: { frequency: 2, typicalQuantity: 1, bingeFrequency: 1 },
          auditFull: expect.objectContaining({ unableToStop: 2, injury: 4 }),
          maxPerSession: expect.objectContaining({ amount: 6 }),
        }),
      }),
    });
    expect(resolveSocialHistoryForCarryForward({ socialHistoryStructured: structured })?.alcohol).toMatchObject({
      auditC: { frequency: 2, typicalQuantity: 1, bingeFrequency: 1 },
      auditFull: { unableToStop: 2, injury: 4, othersConcerned: 0 },
      maxPerSession: { amount: 6 },
    });
    expect(
      resolveSocialHistoryForCarryForward({ socialHistoryStructured: structured })?.alcohol?.drinks?.[0],
    ).toMatchObject({ abv: 8, frequencyUnit: "month" });
  });
});

describe("cloneComplaintsForCarryForward id generation", () => {
  it("uses randomUUID", () => {
    const spy = vi.spyOn(crypto, "randomUUID").mockReturnValue("new-id");
    const cloned = cloneComplaintsForCarryForward([{ id: "x", name: "Pain" }]);
    expect(cloned[0].id).toBe("new-id");
    spy.mockRestore();
  });
});
