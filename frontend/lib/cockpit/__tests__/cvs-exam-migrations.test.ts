import { describe, expect, it } from "vitest";
import { migrateCvsFindingEntry, normalizeCvsFindingEntries } from "@/lib/cockpit/cvs-exam-migrations";

describe("cvs-exam-migrations", () => {
  it("migrates legacy timing chip findingIds into structured murmur", () => {
    expect(migrateCvsFindingEntry({ findingId: "systolic_murmur", attributes: {} })).toEqual({
      findingId: "murmur",
      attributes: { timing: "Systolic" },
    });
    expect(migrateCvsFindingEntry({ findingId: "diastolic_murmur", attributes: {} })).toEqual({
      findingId: "murmur",
      attributes: { timing: "Diastolic" },
    });
  });

  it("migrates legacy Split S2 chip findingId to wide split S2", () => {
    expect(migrateCvsFindingEntry({ findingId: "split_s2", attributes: {} })).toEqual({
      findingId: "wide_split_s2",
      attributes: {},
    });
  });

  it("migrates displaced apex and heave to new vocabulary", () => {
    expect(migrateCvsFindingEntry({ findingId: "displaced_apex", attributes: {} })).toEqual({
      findingId: "apex_beat",
      attributes: { position: "Displaced" },
    });
    expect(migrateCvsFindingEntry({ findingId: "heave", attributes: {} })).toEqual({
      findingId: "parasternal_heave",
      attributes: {},
    });
  });

  it("merges duplicate murmur rows after migration", () => {
    expect(
      normalizeCvsFindingEntries([
        { findingId: "systolic_murmur", attributes: { grade: "3/6" } },
        { findingId: "murmur", attributes: { area: "Mitral" } },
      ]),
    ).toEqual([
      {
        findingId: "murmur",
        attributes: { timing: "Systolic", grade: "3/6", area: "Mitral" },
      },
    ]);
  });

  it("merges displaced apex into existing apex beat row", () => {
    expect(
      normalizeCvsFindingEntries([
        { findingId: "displaced_apex", attributes: {} },
        { findingId: "apex_beat", attributes: { character: "Heaving" } },
      ]),
    ).toEqual([
      {
        findingId: "apex_beat",
        attributes: { position: "Displaced", character: "Heaving" },
      },
    ]);
  });

  it("strips legacy pulse rhythm and notes, and drops empty pulse rows", () => {
    expect(
      migrateCvsFindingEntry({
        findingId: "pulse",
        attributes: { rhythm: "Irregular", notes: "thready at rest", character: "Thready" },
      }),
    ).toEqual({
      findingId: "pulse",
      attributes: { character: "Thready" },
    });
    expect(
      normalizeCvsFindingEntries([
        { findingId: "pulse", attributes: { rhythm: "Regular", notes: "moved to vitals" } },
      ]),
    ).toEqual([]);
  });
});
