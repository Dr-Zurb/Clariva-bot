import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTION_ORDER,
  HISTORY_FIELD_SECTION_IDS,
  historyFieldKeyToSectionId,
  normalizeSectionOrder,
  resolveAvailableSectionIds,
  resolveInitialSectionOrder,
  resolveStaticSectionIds,
  toCustomBlockSectionId,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";
import { HISTORY_FIELD_DEFS } from "@/lib/cockpit/history-field-chips";

describe("subjective-section-order (subj-23)", () => {
  it("derives history section ids from HISTORY_FIELD_DEFS", () => {
    expect(HISTORY_FIELD_SECTION_IDS).toEqual(
      HISTORY_FIELD_DEFS.map((def) => historyFieldKeyToSectionId(def.fieldKey)),
    );
    expect(historyFieldKeyToSectionId("familyHistory")).toBe("family_history");
    expect(historyFieldKeyToSectionId("socialHistory")).toBe("social_history");
    expect(historyFieldKeyToSectionId("pastSurgicalHistory")).toBe("past_surgical");
  });

  it("DEFAULT_SECTION_ORDER matches today's hardcoded layout slots", () => {
    expect(DEFAULT_SECTION_ORDER.indexOf("chief_complaints")).toBeLessThan(
      DEFAULT_SECTION_ORDER.indexOf("patient_background"),
    );
    expect(DEFAULT_SECTION_ORDER.indexOf("patient_background")).toBeLessThan(
      DEFAULT_SECTION_ORDER.indexOf("allergies"),
    );
    expect(DEFAULT_SECTION_ORDER.indexOf("past_surgical")).toBeLessThan(
      DEFAULT_SECTION_ORDER.indexOf("family_history"),
    );
    expect(DEFAULT_SECTION_ORDER.indexOf("social_history")).toBeLessThan(
      DEFAULT_SECTION_ORDER.indexOf("free_text_notes"),
    );
    expect(DEFAULT_SECTION_ORDER.indexOf("free_text_notes")).toBeLessThan(
      DEFAULT_SECTION_ORDER.indexOf("custom_subsections"),
    );
  });

  it("normalizeSectionOrder returns canonical order when stored is empty", () => {
    const linkedAvailable = resolveAvailableSectionIds(true, []);
    expect(normalizeSectionOrder([], linkedAvailable)).toEqual(linkedAvailable);

    const fallbackAvailable = resolveAvailableSectionIds(false, []);
    expect(normalizeSectionOrder(DEFAULT_SECTION_ORDER, fallbackAvailable)).toEqual(
      fallbackAvailable,
    );
  });

  it("normalizeSectionOrder drops unknown and unavailable ids", () => {
    const available: SubjectiveSectionId[] = [
      "chief_complaints",
      "family_history",
      "free_text_notes",
    ];
    expect(
      normalizeSectionOrder(
        ["unknown_section", "chief_complaints", "allergies", "family_history", "chief_complaints"],
        available,
      ),
    ).toEqual(["chief_complaints", "family_history", "free_text_notes"]);
  });

  it("normalizeSectionOrder inserts newly-available ids at canonical slots", () => {
    const available = resolveAvailableSectionIds(true, []);

    expect(
      normalizeSectionOrder(
        ["chief_complaints", "family_history", "free_text_notes"],
        available,
      ),
    ).toEqual([
      "chief_complaints",
      "patient_background",
      "allergies",
      "family_history",
      "social_history",
      "free_text_notes",
    ]);
  });

  it("normalizeSectionOrder preserves stored relative order for known ids", () => {
    const available = resolveAvailableSectionIds(false, []);

    expect(
      normalizeSectionOrder(
        ["social_history", "chief_complaints", "family_history"],
        available,
      ),
    ).toEqual([
      "social_history",
      "chief_complaints",
      "past_surgical",
      "family_history",
      "free_text_notes",
    ]);
  });

  it("expands legacy custom_subsections marker into block ids", () => {
    const blockId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
    const order = resolveInitialSectionOrder(
      ["chief_complaints", "custom_subsections", "free_text_notes"],
      false,
      [blockId],
    );
    expect(order).toEqual([
      "chief_complaints",
      "past_surgical",
      "family_history",
      "social_history",
      toCustomBlockSectionId(blockId),
      "free_text_notes",
    ]);
  });

  it("resolveStaticSectionIds omits the legacy custom bucket", () => {
    expect(resolveStaticSectionIds(false)).not.toContain("custom_subsections");
  });
});
