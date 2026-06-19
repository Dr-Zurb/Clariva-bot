import { describe, expect, it } from "vitest";
import {
  addFamilyHistoryCatalogCondition,
  addFamilyHistoryOtherCondition,
  addFamilyHistoryRelative,
  addFamilyHistorySiblingCard,
  addFamilyHistorySiblingCatalogCondition,
  formatSiblingCardLabel,
  normalizeFamilyHistoryStructured,
  parseFamilyHistoryAsStructured,
  patchFamilyHistoryEntry,
  patchFamilyHistorySiblingEntry,
  removeFamilyHistoryEntry,
  removeFamilyHistorySiblingCard,
  resolveCatalogConditionFromQuery,
  serializeFamilyHistory,
  setFamilyHistoryNone,
  setFamilyHistorySiblingDetail,
  formatFamilyHistoryRelativeLabel,
  getFamilyHistoryRelativeEntries,
} from "@/lib/cockpit/family-history";

describe("family-history", () => {
  it("serializes none and relative conditions", () => {
    expect(serializeFamilyHistory({ none: true })).toBe("No significant family history");
    expect(
      serializeFamilyHistory({
        relatives: {
          father: [
            { id: "1", condition: "htn" },
            { id: "2", condition: "dm" },
          ],
          mother: [{ id: "3", condition: "dm" }],
        },
      }),
    ).toBe("Father: Hypertension, Diabetes mellitus · Mother: Diabetes mellitus");
  });

  it("serializes per-condition notes and custom conditions", () => {
    expect(
      serializeFamilyHistory({
        siblings: [{ id: "s1", entries: [{ id: "1", condition: "cad", notes: "MI at 48, deceased" }] }],
        relatives: {
          father: [{ id: "2", condition: "other", conditionOther: "SLE", notes: "diagnosed 30" }],
        },
      }),
    ).toBe("Father: SLE (diagnosed 30) · Sibling: Coronary artery disease (MI at 48, deceased)");
  });

  it("serializes multiple sibling cards with detail labels", () => {
    expect(
      serializeFamilyHistory({
        siblings: [
          {
            id: "s1",
            detail: { order: "older", sex: "brother" },
            entries: [{ id: "1", condition: "htn" }],
          },
          {
            id: "s2",
            detail: { order: "younger", sex: "sister" },
            entries: [{ id: "2", condition: "dm" }],
          },
        ],
      }),
    ).toBe("Older brother: Hypertension · Younger sister: Diabetes mellitus");
  });

  it("migrates legacy relatives.sibling to siblings on normalize", () => {
    const normalized = normalizeFamilyHistoryStructured({
      relatives: {
        sibling: [{ id: "1", condition: "cad" }],
      },
      relativesMeta: { sibling: { order: "older", sex: "brother" } },
    });
    expect(normalized.relatives?.sibling).toBeUndefined();
    expect(normalized.siblings).toHaveLength(1);
    expect(normalized.siblings?.[0]).toMatchObject({
      detail: { order: "older", sex: "brother" },
      entries: [{ condition: "cad" }],
    });
  });

  it("round-trips structured relatives from derived TEXT", () => {
    const text = "Father: HTN, DM · Mother: DM · Other: Paternal uncle — colon cancer · Consanguinity";
    const parsed = parseFamilyHistoryAsStructured(text);
    expect(parsed.relatives?.father?.map((entry) => entry.condition)).toEqual(["htn", "dm"]);
    expect(parsed.relatives?.mother?.[0]?.condition).toBe("dm");
    expect(parsed.other).toBe("Paternal uncle — colon cancer");
    expect(parsed.notes).toBe("Consanguinity");
  });

  it("parses legacy Father — HTN tokens", () => {
    const parsed = parseFamilyHistoryAsStructured("Father — HTN, Mother — DM");
    expect(parsed.relatives?.father?.[0]?.condition).toBe("htn");
    expect(parsed.relatives?.mother?.[0]?.condition).toBe("dm");
  });

  it("migrates legacy string-array relatives on normalize", () => {
    expect(
      normalizeFamilyHistoryStructured({
        relatives: { father: ["htn", "dm"] as unknown as { id: string; condition: "htn" }[] },
      }),
    ).toEqual({
      relatives: {
        father: [
          { id: expect.any(String), condition: "htn" },
          { id: expect.any(String), condition: "dm" },
        ],
      },
    });
  });

  it("clears relatives when none is selected", () => {
    const next = setFamilyHistoryNone(
      {
        relatives: { father: [{ id: "1", condition: "htn" }] },
        siblings: [{ id: "s1", entries: [{ id: "2", condition: "dm" }] }],
        notes: "detail",
      },
      true,
    );
    expect(next).toEqual({ none: true });
  });

  it("adds relative cards before conditions", () => {
    const withRelative = addFamilyHistoryRelative({}, "father");
    expect(withRelative.relatives?.father).toEqual([]);
    const withCondition = addFamilyHistoryCatalogCondition(withRelative, "father", "htn");
    expect(withCondition.relatives?.father?.[0]?.condition).toBe("htn");
  });

  it("supports multiple sibling cards", () => {
    const first = addFamilyHistorySiblingCard({});
    const second = addFamilyHistorySiblingCard(first);
    expect(first.siblings).toHaveLength(1);
    expect(second.siblings).toHaveLength(2);
    expect(first.siblings?.[0]?.id).not.toBe(second.siblings?.[1]?.id);
  });

  it("preserves spaces while editing custom condition on sibling card", () => {
    const withCard = addFamilyHistorySiblingCard({});
    const cardId = withCard.siblings![0]!.id;
    const withCustom = addFamilyHistorySiblingCatalogCondition(withCard, cardId, "htn");
    const entryId = withCustom.siblings![0]!.entries[0]!.id;
    const patched = patchFamilyHistorySiblingEntry(withCustom, cardId, entryId, {
      notes: "type 1 ",
    });
    expect(patched.siblings?.[0]?.entries[0]?.notes).toBe("type 1 ");
  });

  it("preserves spaces while editing custom condition name on father", () => {
    const withRelative = addFamilyHistoryRelative({}, "father");
    const withCustom = addFamilyHistoryOtherCondition(withRelative, "father", "custom");
    const entryId = withCustom.relatives?.father?.[0]?.id!;
    const inProgress = patchFamilyHistoryEntry(withCustom, "father", entryId, {
      conditionOther: "custom ",
    });
    expect(inProgress.relatives?.father?.[0]?.conditionOther).toBe("custom ");
  });

  it("preserves trailing space through edit-time normalize", () => {
    const structured = {
      relatives: {
        father: [{ id: "1", condition: "other" as const, conditionOther: "custom " }],
      },
    };
    const normalized = normalizeFamilyHistoryStructured(structured, { keepEmptyRelativeCards: true });
    expect(normalized.relatives?.father?.[0]?.conditionOther).toBe("custom ");
    expect(getFamilyHistoryRelativeEntries(normalized, "father")[0]?.conditionOther).toBe("custom ");
  });

  it("trims custom condition name on save normalize", () => {
    const structured = {
      relatives: {
        father: [{ id: "1", condition: "other" as const, conditionOther: " custom condition " }],
      },
    };
    const normalized = normalizeFamilyHistoryStructured(structured);
    expect(normalized.relatives?.father?.[0]?.conditionOther).toBe("custom condition");
  });

  it("patches notes on a selected condition", () => {
    const withRelative = addFamilyHistoryRelative({}, "father");
    const withCondition = addFamilyHistoryCatalogCondition(withRelative, "father", "dm");
    const entryId = withCondition.relatives?.father?.[0]?.id;
    expect(entryId).toBeTruthy();
    const withNotes = patchFamilyHistoryEntry(withCondition, "father", entryId!, {
      notes: "type 2",
    });
    expect(withNotes.relatives?.father?.[0]).toMatchObject({ condition: "dm", notes: "type 2" });
  });

  it("removes entries by id", () => {
    const withRelative = addFamilyHistoryRelative({}, "father");
    const withCondition = addFamilyHistoryCatalogCondition(withRelative, "father", "htn");
    const entryId = withCondition.relatives?.father?.[0]?.id!;
    const removed = removeFamilyHistoryEntry(withCondition, "father", entryId);
    expect(removed.relatives?.father).toEqual([]);
  });

  it("removes one sibling card without affecting others", () => {
    const two = addFamilyHistorySiblingCard(addFamilyHistorySiblingCard({}));
    const removeFirst = removeFamilyHistorySiblingCard(two, two.siblings![0]!.id);
    expect(removeFirst.siblings).toHaveLength(1);
    expect(removeFirst.siblings?.[0]?.id).toBe(two.siblings![1]!.id);
  });

  it("resolves catalog labels from typed query", () => {
    expect(resolveCatalogConditionFromQuery("HTN")).toBe("htn");
    expect(resolveCatalogConditionFromQuery("hypertension")).toBe("htn");
    expect(resolveCatalogConditionFromQuery("diabetes")).toBe("dm");
    expect(resolveCatalogConditionFromQuery("heart attack")).toBe("cad");
    expect(resolveCatalogConditionFromQuery("SLE")).toBe("autoimmune");
  });

  it("formats sibling and grandparent labels", () => {
    expect(formatSiblingCardLabel({ order: "older", sex: "brother" })).toBe("Older brother");
    expect(
      formatFamilyHistoryRelativeLabel("grandparent", {
        grandparent: { side: "maternal", sex: "grandmother" },
      }),
    ).toBe("Maternal grandmother");
  });

  it("updates sibling detail per card", () => {
    const card = addFamilyHistorySiblingCard({});
    const cardId = card.siblings![0]!.id;
    const detailed = setFamilyHistorySiblingDetail(card, cardId, { sex: "sister", order: "younger" });
    expect(detailed.siblings?.[0]?.detail).toEqual({ sex: "sister", order: "younger" });
    expect(formatSiblingCardLabel(detailed.siblings?.[0]?.detail)).toBe("Younger sister");
  });

  it("includes section notes in serialized output", () => {
    expect(
      serializeFamilyHistory({
        relatives: { father: [{ id: "1", condition: "htn" }] },
        notes: "Consanguinity",
      }),
    ).toBe("Father: Hypertension · Consanguinity");
  });

  it("dedupes custom conditions on add", () => {
    const base = addFamilyHistoryRelative({}, "father");
    const first = addFamilyHistoryOtherCondition(base, "father", "hemophilia");
    const second = addFamilyHistoryOtherCondition(first, "father", "Hemophilia");
    expect(second.relatives?.father?.filter((e) => e.condition === "other")).toHaveLength(1);
  });
});
