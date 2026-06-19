import {
  normalizeSickContactSection,
  parseSickContactText,
  serializeSickContactSection,
  sickContactHasContent,
  sickContactInputPromotesVectorRisk,
} from "@/lib/cockpit/social-history-sick-contact";
import {
  normalizeSocialHistoryStructured,
  parseSocialHistoryAsStructured,
  serializeSocialHistory,
} from "@/lib/cockpit/social-history";

describe("social-history-sick-contact", () => {
  it("serializes person-to-person sick contact types", () => {
    expect(
      serializeSickContactSection({
        present: true,
        types: ["flu-covid-cold", "tb-cough"],
        context: ["household"],
        notes: "brother on TB treatment",
      }),
    ).toBe(
      "Sick contact: Flu/COVID/cold, TB/prolonged cough · Household · brother on TB treatment",
    );
  });

  it("serializes explicit none", () => {
    expect(serializeSickContactSection({ present: false })).toBe("Sick contact: None");
  });

  it("parses sick contact text segments", () => {
    expect(
      parseSickContactText(
        "Flu/COVID/cold, TB/prolonged cough · Household · brother on TB treatment",
      ),
    ).toMatchObject({
      present: true,
      types: ["flu-covid-cold", "tb-cough"],
      context: ["household"],
      notes: "brother on TB treatment",
    });
  });

  it("migrates legacy respiratory and rash types", () => {
    expect(
      normalizeSickContactSection({
        present: true,
        types: ["respiratory" as never, "rash-measles" as never, "gi" as never],
      }),
    ).toEqual({
      present: true,
      types: ["flu-covid-cold", "measles-chickenpox", "gi-contact"],
    });
  });

  it("detects legacy vector type for travel promotion", () => {
    expect(
      sickContactInputPromotesVectorRisk({
        present: true,
        types: ["fever-dengue-malaria" as never],
      }),
    ).toBe(true);
    expect(
      normalizeSickContactSection({
        present: true,
        types: ["fever-dengue-malaria" as never, "tb-cough" as never],
      }),
    ).toEqual({ present: true, types: ["tb-cough"] });
  });

  it("treats explicit present flags as content", () => {
    expect(sickContactHasContent({ present: false })).toBe(true);
    expect(normalizeSickContactSection({ present: false })).toEqual({ present: false });
  });

  it("migrates legacy travel-companion context to travel", () => {
    expect(
      normalizeSickContactSection({
        present: true,
        context: ["travel-companion" as never],
      }),
    ).toEqual({ present: true, context: ["travel"] });
    expect(parseSickContactText("Flu/COVID/cold · Travel companion")).toMatchObject({
      present: true,
      types: ["flu-covid-cold"],
      context: ["travel"],
    });
  });
});

describe("social-history travel + sick contact split", () => {
  it("migrates legacy travel.sickContacts to sickContact on normalize", () => {
    expect(
      normalizeSocialHistoryStructured({
        travel: { recent: true, place: "Mumbai", sickContacts: true },
      }),
    ).toEqual({
      travel: { recent: true, place: "Mumbai" },
      sickContact: { present: true },
    });
  });

  it("promotes legacy fever/dengue sick contact type to travel vector risk", () => {
    expect(
      normalizeSocialHistoryStructured({
        sickContact: { present: true, types: ["fever-dengue-malaria" as never] },
      }),
    ).toEqual({
      travel: { recent: true, vectorRisk: true },
      sickContact: { present: true },
    });
  });

  it("parses legacy travel text with sick contacts suffix", () => {
    const structured = parseSocialHistoryAsStructured("Travel: Mumbai (sick contacts)");
    expect(structured.travel).toEqual({ recent: true, place: "Mumbai" });
    expect(structured.sickContact).toEqual({ present: true });
  });

  it("serializes travel vector risk separately from sick contact", () => {
    const text = serializeSocialHistory({
      travel: { recent: true, place: "Mumbai", vectorRisk: true },
      sickContact: {
        present: true,
        types: ["flu-covid-cold"],
        context: ["household"],
        notes: "child with flu",
      },
    });
    expect(text).toContain("Travel: Mumbai (vector-borne area)");
    expect(text).toContain("Sick contact: Flu/COVID/cold · Household · child with flu");
    expect(text).not.toContain("(sick contacts)");
  });
});
