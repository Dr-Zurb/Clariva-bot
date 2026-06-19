import { describe, expect, it } from "vitest";
import {
  parseSocialHistory,
  parseSocialHistoryAsStructured,
  normalizeSocialHistoryStructured,
  serializeSocialHistory,
  serializeLifestyleCluster,
  serializeSubstanceUseCluster,
  substanceUseClusterFilledCount,
  substanceUseClusterHasContent,
  setAlcohol,
  setSmoking,
  setSmokeless,
  setSocialHistoryDimension,
  setSocialHistoryNotes,
  setSocialHistoryRemainder,
  type SocialHistoryStructured,
  type TobaccoProductRow,
} from "@/lib/cockpit/social-history";

function prod(type: string, partial: Partial<TobaccoProductRow> = {}): TobaccoProductRow {
  return { id: partial.id ?? `p-${type}`, type, ...partial };
}

describe("social-history structured serialize/parse", () => {
  it("round-trips a structured object through serialize and text parse", () => {
    const structured: SocialHistoryStructured = {
      smoking: {
        status: "ex",
        products: [prod("cigarette", { perDay: 10, years: 20 })],
        quitYearsAgo: 2,
      },
      smokeless: {
        status: "current",
        products: [prod("gutka/khaini", { perDay: 4, perDayUnit: "packets", years: 8 })],
      },
      alcohol: {
        status: "current",
        drinks: [
          {
            id: "d-spirits",
            type: "spirits",
            amount: 1,
            amountUnit: "peg",
            frequency: 14,
            frequencyUnit: "week",
          },
        ],
        cage: { cutDown: true, annoyed: true, guilty: true, eyeOpener: false },
        auditC: { frequency: 2, typicalQuantity: 3, bingeFrequency: 3, enabled: true },
      },
      notes: "Lives with parents",
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("Smoking: Ex-smoker");
    expect(text).toContain("≈ 10 pack-yrs");
    expect(text).toContain("Gutka/Khaini");
    expect(text).toContain("CAGE 3/4 positive");
    expect(text).toContain("AUDIT-C 8/12 positive (2,3,3)");
    expect(text).toContain("Lives with parents");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.smoking).toMatchObject({
      status: "ex",
    });
    expect(roundTripped.smoking?.products[0]).toMatchObject({
      type: "cigarette",
      perDay: 10,
      years: 20,
      quitYearsAgo: 2,
    });
    expect(roundTripped.smokeless?.products[0]).toMatchObject({
      type: "gutka/khaini",
      perDay: 4,
      years: 8,
    });
    expect(roundTripped.smokeless).toMatchObject({ status: "current" });
    expect(roundTripped.alcohol).toMatchObject({
      status: "current",
    });
    expect(roundTripped.alcohol?.drinks[0]).toMatchObject({
      type: "spirits",
      amount: 1,
      frequency: 14,
      frequencyUnit: "week",
    });
    expect(roundTripped.alcohol?.auditC).toMatchObject({
      frequency: 2,
      typicalQuantity: 3,
      bingeFrequency: 3,
    });
    expect(roundTripped.notes).toBe("Lives with parents");
  });

  it("serializes and round-trips AUDIT-C answers independently of CAGE", () => {
    const structured: SocialHistoryStructured = {
      alcohol: {
        status: "current",
        drinks: [],
        cage: { cutDown: false, annoyed: false, guilty: false, eyeOpener: false },
        auditC: { frequency: 1, typicalQuantity: 1, bingeFrequency: 1 },
      },
    };
    const text = serializeSocialHistory(structured);
    expect(text).toContain("AUDIT-C 3/12 (1,1,1)");
    expect(text).not.toContain("AUDIT-C positive");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.alcohol?.auditC).toMatchObject({
      frequency: 1,
      typicalQuantity: 1,
      bingeFrequency: 1,
    });
    expect(roundTripped.alcohol?.cage).toMatchObject({
      cutDown: false,
      annoyed: false,
      guilty: false,
      eyeOpener: false,
    });
  });

  it("serializes and round-trips full AUDIT-10 when all questions answered", () => {
    const structured: SocialHistoryStructured = {
      alcohol: {
        status: "current",
        drinks: [],
        auditC: { frequency: 2, typicalQuantity: 2, bingeFrequency: 1 },
        auditFull: {
          unableToStop: 1,
          failedExpectations: 1,
          morningDrink: 0,
          guiltRemorse: 2,
          blackout: 1,
          injury: 0,
          othersConcerned: 2,
        },
      },
    };
    const text = serializeSocialHistory(structured);
    expect(text).toContain("AUDIT-10 12/40 hazardous (2,2,1,1,1,0,2,1,0,2)");
    expect(text).not.toContain("AUDIT-C");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.alcohol?.auditC).toMatchObject({
      frequency: 2,
      typicalQuantity: 2,
      bingeFrequency: 1,
    });
    expect(roundTripped.alcohol?.auditFull).toMatchObject({
      unableToStop: 1,
      failedExpectations: 1,
      morningDrink: 0,
      guiltRemorse: 2,
      blackout: 1,
      injury: 0,
      othersConcerned: 2,
    });
  });

  it("serializes and round-trips max per session and interval frequency", () => {
    const structured: SocialHistoryStructured = {
      alcohol: {
        status: "current",
        drinks: [
          {
            id: "d-interval",
            type: "spirits",
            amount: 2,
            amountUnit: "peg",
            frequency: 10,
            frequencyUnit: "interval",
          },
        ],
        maxPerSession: { amount: 8, amountUnit: "peg" },
      },
    };
    const text = serializeSocialHistory(structured);
    expect(text).toContain("× 1/10d");
    expect(text).toContain("max 8 pegs/session");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.alcohol?.drinks[0]).toMatchObject({
      frequency: 10,
      frequencyUnit: "interval",
    });
    expect(roundTripped.alcohol?.maxPerSession).toMatchObject({ amount: 8 });
  });

  it("omits empty dimensions and compacts never status", () => {
    const structured: SocialHistoryStructured = {
      smoking: { status: "never", products: [] },
      notes: "recent travel",
    };
    expect(serializeSocialHistory(structured)).toBe(
      "Smoking: Non-smoker · recent travel",
    );
  });

  it("accepts legacy JSONB flat fields and normalizes to products", () => {
    const structured: SocialHistoryStructured = {
      smoking: { status: "current", types: ["beedi"], perDay: 5, years: 10 },
    };
    expect(parseSocialHistory(structured).smoking?.products[0]).toMatchObject({
      type: "beedi",
      perDay: 5,
      years: 10,
    });
  });

  it("serializes and parses month-based smoking duration per product", () => {
    const structured: SocialHistoryStructured = {
      smoking: {
        status: "current",
        products: [prod("cigarette", { perDay: 2, years: 12, yearsUnit: "months" })],
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("cigarette 2 cigarettes/day, 12 mo");
    expect(text).toContain("≈ 0.1 pack-yrs");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.smoking?.products[0]).toMatchObject({
      type: "cigarette",
      perDay: 2,
      years: 12,
      yearsUnit: "months",
    });
    expect(roundTripped.smoking).toMatchObject({ status: "current" });
  });

  it("serializes multi-product smoking with combined pack-years", () => {
    const structured: SocialHistoryStructured = {
      smoking: {
        status: "current",
        products: [
          prod("cigarette", { perDay: 10, years: 10 }),
          prod("beedi", { perDay: 10, perDayUnit: "beedis", years: 10 }),
          prod("hookah", { perDay: 2, perDayUnit: "sessions", years: 10 }),
        ],
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("cigarette 10 cigarettes/day, 10 yr");
    expect(text).toContain("beedi 10 beedis/day, 10 yr");
    expect(text).toContain("hookah 2 sessions/day, 10 yr");
    expect(text).toContain("≈ 20 pack-yrs");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.smoking?.products).toHaveLength(3);
  });

  it("serializes and parses per-product past phase with quit duration", () => {
    const structured: SocialHistoryStructured = {
      smoking: {
        status: "current",
        products: [
          prod("beedi", { perDay: 10, years: 10, phase: "past", quitYearsAgo: 3 }),
          prod("cigarette", { perDay: 5, years: 3 }),
        ],
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("beedi 10 beedis/day, 10 yr (past; quit 3 yr ago)");
    expect(text).toContain("cigarette 5 cigarettes/day, 3 yr");
    expect(text).not.toContain("cigarette 5 cigarettes/day, 3 yr (past");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.smoking?.products[0]).toMatchObject({
      type: "beedi",
      phase: "past",
      quitYearsAgo: 3,
      years: 10,
    });
    expect(roundTripped.smoking?.products[1]).toMatchObject({
      type: "cigarette",
      years: 3,
    });
    expect(roundTripped.smoking?.products[1]?.phase).toBeUndefined();
  });

  it("sums pack-years from per-product durations", () => {
    const structured: SocialHistoryStructured = {
      smoking: {
        status: "current",
        products: [
          prod("cigarette", { perDay: 20, years: 10 }),
          prod("beedi", { perDay: 20, years: 5 }),
        ],
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("≈ 15 pack-yrs");
  });

  it("serializes and parses month-based quit duration for ex-smokers", () => {
    const structured: SocialHistoryStructured = {
      smoking: {
        status: "ex",
        products: [prod("cigarette", { perDay: 10, years: 10, quitYearsAgo: 6, quitYearsUnit: "months" })],
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("cigarette 10 cigarettes/day, 10 yr (past; quit 6 mo ago)");
    expect(text).not.toMatch(/,\s*quit 6 mo ago\)/);

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.smoking?.products[0]).toMatchObject({
      quitYearsAgo: 6,
      quitYearsUnit: "months",
    });
  });

  it("migrates legacy section quit to products for ex-smokers on normalize", () => {
    const structured: SocialHistoryStructured = {
      smoking: {
        status: "ex",
        products: [prod("cigarette", { perDay: 10, years: 10 })],
        quitYearsAgo: 6,
        quitYearsUnit: "months",
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("(past; quit 6 mo ago)");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.smoking?.products[0]).toMatchObject({
      quitYearsAgo: 6,
      quitYearsUnit: "months",
    });
  });

  it("serializes and parses quit duration for ex smokeless users", () => {
    const structured: SocialHistoryStructured = {
      smokeless: {
        status: "ex",
        products: [
          prod("khaini", {
            perDay: 2,
            perDayUnit: "packets",
            years: 4,
            quitYearsAgo: 3,
            quitYearsUnit: "months",
          }),
        ],
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("Former user");
    expect(text).toContain("Khaini 2 packets/day, 4 yr (past; quit 3 mo ago)");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.smokeless?.products[0]).toMatchObject({
      type: "khaini",
      perDay: 2,
      years: 4,
      quitYearsAgo: 3,
      quitYearsUnit: "months",
    });
    expect(roundTripped.smokeless?.status).toBe("ex");
  });

  it("serializes and parses month-based quit duration for ex-drinkers", () => {
    const structured: SocialHistoryStructured = {
      alcohol: {
        status: "ex",
        drinks: [
          {
            id: "d1",
            type: "spirits",
            quitYearsAgo: 18,
            quitYearsUnit: "months",
          },
        ],
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("quit 18 mo ago");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.alcohol?.drinks[0]).toMatchObject({
      quitYearsAgo: 18,
      quitYearsUnit: "months",
    });
  });

  it("preserves spaces in other product name through setSmokeless normalize", () => {
    const structured = setSmokeless(
      {},
      {
        status: "current",
        products: [prod("other", { typeOther: "Nas war", perDay: 2 })],
      },
    );

    expect(structured.smokeless?.products[0]?.typeOther).toBe("Nas war");
  });

  it("serializes smokeless with custom type and amount unit", () => {
    const structured: SocialHistoryStructured = {
      smokeless: {
        status: "current",
        products: [
          prod("other", {
            typeOther: "Naswar",
            perDay: 3,
            perDayUnit: "times",
            years: 5,
          }),
        ],
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("Naswar 3 times/day, 5 yr");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.smokeless?.products[0]).toMatchObject({
      type: "other",
      typeOther: "Naswar",
      perDay: 3,
      perDayUnit: "times",
      years: 5,
    });
  });

  it("serializes smokeless with custom amount unit label", () => {
    const structured: SocialHistoryStructured = {
      smokeless: {
        status: "current",
        products: [
          prod("khaini", {
            perDay: 2,
            perDayUnit: "other",
            perDayUnitOther: "pinches",
            years: 10,
          }),
        ],
      },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("Khaini 2 pinches/day, 10 yr");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.smokeless?.products[0]).toMatchObject({
      perDay: 2,
      perDayUnit: "other",
      perDayUnitOther: "pinches",
      years: 10,
    });
  });
});

describe("social-history legacy TEXT hydration", () => {
  it("hydrates v1 labeled tokens without losing phase-2 dimensions", () => {
    const text =
      "Smoking: Ex-smoker · Alcohol: Occasional alcohol · Diet: Vegetarian · Occupation: Teacher · Lives with parents";
    const structured = parseSocialHistoryAsStructured(text);
    expect(structured.smoking).toEqual({ status: "ex", products: [] });
    expect(structured.alcohol).toEqual({
      status: "current",
      drinks: [],
    });
    expect(structured.diet).toEqual({ type: "vegetarian" });
    expect(structured.occupation).toEqual({ text: "Teacher", exposures: [] });
    expect(structured.notes).toBe("Lives with parents");
  });

  it("hydrates legacy comma-separated chip text", () => {
    const structured = parseSocialHistoryAsStructured(
      "Non-smoker, Vegetarian, Sedentary occupation",
    );
    expect(structured.smoking).toEqual({ status: "never", products: [] });
    expect(structured.diet).toEqual({ type: "vegetarian" });
    expect(structured.activity).toMatchObject({ level: "sedentary" });
  });

  it("promotes diet/activity/occupation tokens out of notes losslessly", () => {
    const structured = parseSocialHistoryAsStructured({
      notes: "Diet: Vegetarian · Activity: Sedentary · custom free-text note",
    });
    expect(structured.diet).toEqual({ type: "vegetarian" });
    expect(structured.activity).toMatchObject({ level: "sedentary" });
    expect(structured.notes).toBe("custom free-text note");
  });
});

describe("social-history phase-2 dimensions (sh-05)", () => {
  const phase2Structured: SocialHistoryStructured = {
    substances: {
      status: "current",
      items: [
        {
          id: "s1",
          type: "cannabis",
          route: "inhaled",
          phase: "current",
        },
      ],
    },
    diet: { type: "vegetarian", caffeineCupsPerDay: 2 },
    activity: { level: "moderate", daysPerWeek: 3, items: [] },
    occupation: { text: "Farmer", exposures: ["dust", "heat"] },
    living: { situation: "with-family" },
    travel: { recent: true, place: "Mumbai" },
    sickContact: { present: true },
    sleep: { hoursPerNight: 6, quality: "poor" },
    stress: { level: "high", support: "limited" },
    sexual: { enabled: true, active: true, protection: "sometimes" },
    notes: "additional context",
  };

  it("serializes all phase-2 sections in fixed order before notes", () => {
    const text = serializeSocialHistory(phase2Structured);
    expect(text).toContain("Substances: Current use");
    expect(text).toContain("Cannabis");
    expect(text).toContain("inhaled");
    expect(text).toContain("Diet: Vegetarian");
    expect(text).toContain("Caffeine: Current use — Caffeine (2 cups/day · ~80 mg/serving)");
    expect(text).toContain("Activity: Moderate, 3 days/wk");
    expect(text).toContain("Occupation: Farmer (dust, heat)");
    expect(text).toContain("Living: With family");
    expect(text).toContain("Travel: Mumbai");
    expect(text).toContain("Sick contact: Recent contact");
    expect(text).toContain("Sleep: 6 h, poor");
    expect(text).toContain("Stress: High, limited support");
    expect(text).toContain("Sexual: active, protection sometimes");
    expect(text).toContain("additional context");

    const substancesIdx = text.indexOf("Substances:");
    const dietIdx = text.indexOf("Diet:");
    const caffeineIdx = text.indexOf("Caffeine:");
    const notesIdx = text.indexOf("additional context");
    expect(substancesIdx).toBeLessThan(dietIdx);
    expect(dietIdx).toBeLessThan(caffeineIdx);
    expect(caffeineIdx).toBeLessThan(notesIdx);
  });

  it("round-trips phase-2 dimensions from derived TEXT", () => {
    const text = serializeSocialHistory(phase2Structured);
    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.substances?.items?.[0]).toMatchObject({
      type: "cannabis",
      route: "inhaled",
    });
    expect(roundTripped.diet).toEqual({ type: "vegetarian" });
    expect(roundTripped.caffeine).toMatchObject({
      status: "current",
      items: [{ amount: 2, frequencyUnit: "day", frequency: 1 }],
    });
    expect(roundTripped.activity).toMatchObject({ level: "moderate", daysPerWeek: 3 });
    expect(roundTripped.occupation).toEqual({ text: "Farmer", exposures: ["dust", "heat"] });
    expect(roundTripped.living).toEqual({ situation: "with-family" });
    expect(roundTripped.travel).toMatchObject({
      place: "Mumbai",
      recent: true,
    });
    expect(roundTripped.sickContact).toMatchObject({ present: true });
    expect(roundTripped.sleep).toEqual({ hoursPerNight: 6, quality: "poor" });
    expect(roundTripped.stress).toEqual({ level: "high", support: "limited" });
    expect(roundTripped.sexual).toMatchObject({
      enabled: true,
      active: true,
      protection: "sometimes",
    });
    expect(roundTripped.notes).toBe("additional context");
  });

  it("uses readable living labels and parses legacy Institutional text", () => {
    const structured: SocialHistoryStructured = {
      living: { situation: "institutional", notes: "Old age home" },
    };
    const text = serializeSocialHistory(structured);
    expect(text).toContain("Living: Care facility, Old age home");
    expect(parseSocialHistoryAsStructured("Living: Institutional, Old age home").living).toEqual({
      situation: "institutional",
      notes: "Old age home",
    });
  });

  it("omits gated sexual history until enabled and filled", () => {
    const disabled = serializeSocialHistory({
      sexual: { enabled: false, active: true },
    });
    expect(disabled).toBe("");

    const enabledEmpty = serializeSocialHistory({
      sexual: { enabled: true },
    });
    expect(enabledEmpty).toBe("");
  });

  it("serializes and parses sexual history notes", () => {
    const text = serializeSocialHistory({
      sexual: { enabled: true, active: true, notes: "Uses barrier protection" },
    });
    expect(text).toBe("Sexual: active (Uses barrier protection)");

    const roundTripped = parseSocialHistoryAsStructured(text);
    expect(roundTripped.sexual).toMatchObject({
      enabled: true,
      active: true,
      notes: "Uses barrier protection",
    });
  });

  it("includes IV infection-risk hint for intravenous route", () => {
    const text = serializeSocialHistory({
      substances: {
        status: "current",
        items: [{ id: "s1", type: "opioids", route: "iv" }],
      },
    });
    expect(text).toContain("BBV screen");
  });

  it("hydrates legacy substances shape on normalize", () => {
    const structured = normalizeSocialHistoryStructured({
      substances: { uses: ["cannabis"], route: "inhaled" },
    });
    expect(structured.substances?.items?.[0]?.type).toBe("cannabis");
    expect(structured.substances?.items?.[0]?.route).toBe("inhaled");
  });
});

describe("social-history structured updaters", () => {
  it("replaces within a dimension instead of appending contradictions", () => {
    const initial = setSmoking({}, { status: "never", products: [] });
    const replaced = setSmoking(initial, {
      status: "ex",
      products: [prod("cigarette", { perDay: 10, years: 5 })],
    });
    expect(replaced.smoking?.products[0]).toMatchObject({
      type: "cigarette",
      perDay: 10,
      years: 5,
    });
    expect(replaced.smoking).toMatchObject({ status: "ex" });
    expect(replaced).not.toHaveProperty("smokeless");
  });

  it("clears a dimension when set to null", () => {
    const initial = setAlcohol({}, {
      status: "never",
      types: [],
    });
    expect(setAlcohol(initial, null)).toEqual({});
  });

  it("updates notes independently", () => {
    const withNotes = setSocialHistoryNotes({}, "recent travel to Mumbai");
    expect(withNotes.notes).toBe("recent travel to Mumbai");
    expect(setSocialHistoryNotes(withNotes, "")).toEqual({});
  });

  it("updates smokeless without affecting smoking", () => {
    const base = setSmoking({}, {
      status: "current",
      products: [prod("cigarette", { perDay: 10, years: 5 })],
    });
    const next = setSmokeless(base, {
      status: "current",
      products: [prod("gutka/khaini", { perDay: 2, perDayUnit: "packets", years: 3 })],
    });
    expect(next.smoking).toEqual(base.smoking);
    expect(next.smokeless?.products[0]).toMatchObject({
      type: "gutka/khaini",
      perDay: 2,
      years: 3,
    });
  });
});

describe("social-history v1 dimension API (legacy chip UI)", () => {
  it("round-trips labeled dimension tokens", () => {
    const text =
      "Smoking: Ex-smoker · Alcohol: Occasional alcohol · Diet: Vegetarian · Occupation: Teacher";
    const parsed = parseSocialHistory(text);
    expect(parsed.dimensions).toEqual({
      smoking: "Ex-smoker",
      alcohol: "Occasional alcohol",
      diet: "Vegetarian",
      occupation: "Teacher",
    });
    expect(serializeSocialHistory(parsed)).toBe(text);
  });

  it("preserves additional notes after dimension tokens", () => {
    const text = "Smoking: Non-smoker · Lives with parents";
    const parsed = parseSocialHistory(text);
    expect(parsed.dimensions.smoking).toBe("Non-smoker");
    expect(parsed.remainder).toBe("Lives with parents");
    expect(serializeSocialHistory(parsed)).toBe(text);
  });

  it("replaces within a dimension instead of appending contradictions", () => {
    const initial = setSocialHistoryDimension("", "smoking", "Non-smoker");
    const replaced = setSocialHistoryDimension(initial, "smoking", "Ex-smoker");
    expect(replaced).toBe("Smoking: Ex-smoker");
    expect(parseSocialHistory(replaced).dimensions.smoking).toBe("Ex-smoker");
  });

  it("clears a dimension when the active chip is tapped again", () => {
    const initial = setSocialHistoryDimension("", "alcohol", "No alcohol");
    const cleared = setSocialHistoryDimension(initial, "alcohol", null);
    expect(cleared).toBe("");
  });

  it("updates remainder without dropping dimensions", () => {
    const base = "Smoking: Smoker · Alcohol: No alcohol";
    const next = setSocialHistoryRemainder(base, "recent travel to Mumbai");
    expect(next).toBe(`${base} · recent travel to Mumbai`);
    expect(parseSocialHistory(next).dimensions.smoking).toBe("Smoker");
    expect(parseSocialHistory(next).remainder).toBe("recent travel to Mumbai");
  });
});

describe("social-history clusters", () => {
  it("serializes substance use cluster independently", () => {
    const structured: SocialHistoryStructured = {
      smoking: { status: "never", products: [] },
      alcohol: { status: "current", drinks: [] },
      diet: { type: "vegetarian" },
    };
    expect(serializeSubstanceUseCluster(structured)).toContain("Smoking: Non-smoker");
    expect(serializeSubstanceUseCluster(structured)).toContain("Alcohol:");
    expect(serializeSubstanceUseCluster(structured)).not.toContain("Diet:");
  });

  it("detects cluster content and filled counts", () => {
    const structured: SocialHistoryStructured = {
      smoking: { status: "never", products: [] },
      substances: { status: "current", items: [{ id: "s1", type: "cannabis" }] },
    };
    expect(substanceUseClusterHasContent(structured)).toBe(true);
    expect(substanceUseClusterFilledCount(structured)).toBe(2);
    expect(serializeLifestyleCluster(structured)).toBe("");
  });
});
