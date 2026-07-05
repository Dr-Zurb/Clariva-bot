import { describe, expect, it } from "vitest";
import { migrateAbdFindingEntry, normalizeAbdFindingEntries } from "@/lib/cockpit/abd-exam-migrations";

describe("abd-exam-migrations", () => {
  it("migrates legacy shifting dullness / fluid thrill chips into structured ascites", () => {
    expect(migrateAbdFindingEntry({ findingId: "shifting_dullness", attributes: {} })).toEqual({
      findingId: "ascites",
      attributes: { signs: "Shifting dullness" },
    });
    expect(migrateAbdFindingEntry({ findingId: "fluid_thrill", attributes: {} })).toEqual({
      findingId: "ascites",
      attributes: { signs: "Fluid thrill" },
    });
  });

  it("preserves caller attributes over the seeded legacy values", () => {
    expect(
      migrateAbdFindingEntry({ findingId: "shifting_dullness", attributes: { grade: "Moderate" } }),
    ).toEqual({
      findingId: "ascites",
      attributes: { signs: "Shifting dullness", grade: "Moderate" },
    });
  });

  it("leaves unknown findingIds untouched", () => {
    expect(migrateAbdFindingEntry({ findingId: "distension", attributes: {} })).toEqual({
      findingId: "distension",
      attributes: {},
    });
  });

  it("merges duplicate ascites rows after migration", () => {
    expect(
      normalizeAbdFindingEntries([
        { findingId: "shifting_dullness", attributes: {} },
        { findingId: "ascites", attributes: { grade: "Tense" } },
      ]),
    ).toEqual([
      {
        findingId: "ascites",
        attributes: { signs: "Shifting dullness", grade: "Tense" },
      },
    ]);
  });
});
