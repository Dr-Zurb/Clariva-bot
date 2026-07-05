import { describe, expect, it } from "vitest";
import { migrateCnsFindingEntry, normalizeCnsFindingEntries } from "@/lib/cockpit/cns-exam-migrations";

describe("cns-exam-migrations", () => {
  it("migrates legacy power/sensory loss chips into structured weakness", () => {
    expect(migrateCnsFindingEntry({ findingId: "power_sensory_loss", attributes: {} })).toEqual({
      findingId: "weakness",
      attributes: {},
    });
    expect(
      migrateCnsFindingEntry({ findingId: "power_loss", attributes: { side: "Left" } }),
    ).toEqual({
      findingId: "weakness",
      attributes: { side: "Left" },
    });
  });

  it("leaves unknown findingIds untouched", () => {
    expect(migrateCnsFindingEntry({ findingId: "hypertonia", attributes: {} })).toEqual({
      findingId: "hypertonia",
      attributes: {},
    });
  });

  it("merges duplicate weakness rows after migration", () => {
    expect(
      normalizeCnsFindingEntries([
        { findingId: "power_sensory_loss", attributes: { side: "Right" } },
        { findingId: "weakness", attributes: { power: "4/5" } },
      ]),
    ).toEqual([
      {
        findingId: "weakness",
        attributes: { side: "Right", power: "4/5" },
      },
    ]);
  });
});
