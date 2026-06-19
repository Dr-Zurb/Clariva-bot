/**
 * obj-12 — objective hidden-set resolver + view-only (buildRxPayload) parity.
 */

import { describe, expect, it } from "vitest";
import {
  hiddenOverridesToPersist,
  isSectionHidden,
  resolveVisibleSections,
  serializeHiddenIds,
} from "@/lib/cockpit/objective-section-visibility";
import {
  resolveAvailableSectionIds,
  type ObjectiveSectionId,
} from "@/lib/cockpit/objective-section-order";
import { buildRxPayload, createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";

const MOUNTABLE = resolveAvailableSectionIds();
const FULL_ORDER: ObjectiveSectionId[] = [
  "vitals",
  "exam",
  "test_results",
  "legacy_exam",
  "legacy_vitals",
];

describe("resolveVisibleSections (obj-12 / P10-D2)", () => {
  it("returns the full order when nothing is hidden", () => {
    expect(resolveVisibleSections(FULL_ORDER, [], MOUNTABLE)).toEqual(FULL_ORDER);
  });

  it("removes a mountable hidden id from the render plan", () => {
    expect(resolveVisibleSections(FULL_ORDER, ["test_results"], MOUNTABLE)).toEqual([
      "vitals",
      "exam",
      "legacy_exam",
      "legacy_vitals",
    ]);
  });

  it("leaves a hidden id that is not currently mountable untouched", () => {
    // `legacy_exam` is hidden but not in the mountable set → passes through.
    const mountable: ObjectiveSectionId[] = ["vitals", "exam", "test_results"];
    expect(resolveVisibleSections(FULL_ORDER, ["legacy_exam"], mountable)).toContain("legacy_exam");
  });

  it("can hide every section (all-hidden ⇒ empty render plan)", () => {
    expect(resolveVisibleSections(FULL_ORDER, FULL_ORDER, MOUNTABLE)).toEqual([]);
  });
});

describe("isSectionHidden (obj-12)", () => {
  it("reports a mountable hidden id as hidden", () => {
    expect(isSectionHidden("vitals", ["vitals"], MOUNTABLE)).toBe(true);
  });

  it("never reports a non-mountable id as hidden", () => {
    expect(isSectionHidden("vitals", ["vitals"], ["exam"])).toBe(false);
  });
});

describe("hiddenOverridesToPersist (obj-12 / P10-D4)", () => {
  it("keeps only known static ids and dedupes preserving first occurrence", () => {
    expect(
      hiddenOverridesToPersist(
        ["test_results", "test_results", "legacy_exam"],
        MOUNTABLE,
      ),
    ).toEqual(["test_results", "legacy_exam"]);
  });

  it("drops unknown and custom_block ids (custom blocks are deleted, not hidden)", () => {
    expect(
      hiddenOverridesToPersist(
        [
          "bogus_section",
          "custom_block:aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
          "vitals",
        ] as unknown as ObjectiveSectionId[],
        MOUNTABLE,
      ),
    ).toEqual(["vitals"]);
  });

  it("retains hidden ids even when not currently mountable (cross-context intent)", () => {
    expect(hiddenOverridesToPersist(["legacy_vitals"], ["vitals"])).toEqual(["legacy_vitals"]);
  });
});

describe("serializeHiddenIds (obj-12)", () => {
  it("is order-insensitive (sorted key)", () => {
    expect(serializeHiddenIds(["test_results", "vitals"])).toBe(
      serializeHiddenIds(["vitals", "test_results"]),
    );
  });
});

describe("obj-12 · visibility output parity (view-only P3-D3)", () => {
  it("buildRxPayload is identical whether an objective section is hidden in the UI or not", () => {
    const fields = createEmptyRxFormFields();
    fields.testResults = "CBC within normal limits";
    fields.vitalsText = "BP 120/80";
    fields.examinationFindings = "Chest clear";

    const visiblePayload = buildRxPayload(fields);
    // Hidden state lives in doctor_settings only — fields (and therefore payload) are unchanged.
    const hiddenPayload = buildRxPayload({ ...fields });

    expect(hiddenPayload).toEqual(visiblePayload);
    expect(hiddenPayload.testResults).toBe("CBC within normal limits");
    expect(hiddenPayload.examinationFindings).toBe("Chest clear");
  });

  it("buildRxPayload source never references objective_section_hidden", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(__dirname, "../../../components/cockpit/rx/RxFormContext.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/objective_section_hidden/);
    expect(src).not.toMatch(/objectiveSectionHidden/);
  });
});
