import { beforeEach, describe, expect, it } from "vitest";
import {
  entryCardUiStorageKey,
  hasEntryCardSurface,
  parseEntryCardUiBucket,
  patchEntryCardUi,
  readEntryCardUi,
  writeEntryCardUi,
} from "@/lib/cockpit/entry-card-ui-state";

const SCOPE = "appt-test-1";

describe("entry-card-ui-state", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("builds a stable storage key", () => {
    expect(entryCardUiStorageKey(SCOPE)).toBe(`clariva:entry-card-ui:${SCOPE}`);
  });

  it("round-trips single-open surfaces including explicit null", () => {
    patchEntryCardUi(SCOPE, { medicines: "med-1", diagnoses: null });
    expect(readEntryCardUi(SCOPE)).toEqual({
      medicines: "med-1",
      diagnoses: null,
    });
    expect(hasEntryCardSurface(SCOPE, "medicines")).toBe(true);
    expect(hasEntryCardSurface(SCOPE, "diagnoses")).toBe(true);
    expect(hasEntryCardSurface(SCOPE, "complaints")).toBe(false);
  });

  it("patches complaintChildren without wiping other surfaces", () => {
    patchEntryCardUi(SCOPE, { complaints: "c1" });
    patchEntryCardUi(SCOPE, {
      complaintChildren: { c1: "child-a" },
    });
    expect(readEntryCardUi(SCOPE)).toEqual({
      complaints: "c1",
      complaintChildren: { c1: "child-a" },
    });
  });

  it("tracks open PMH condition ids", () => {
    patchEntryCardUi(SCOPE, { pmhConditions: ["cond-1", "cond-2"] });
    expect(readEntryCardUi(SCOPE).pmhConditions).toEqual(["cond-1", "cond-2"]);
  });

  it("parseEntryCardUiBucket ignores junk", () => {
    expect(parseEntryCardUiBucket(null)).toEqual({});
    expect(
      parseEntryCardUiBucket({
        medicines: 12,
        diagnoses: "dx-1",
        pmhConditions: ["ok", 3, ""],
      }),
    ).toEqual({
      diagnoses: "dx-1",
      pmhConditions: ["ok"],
    });
  });

  it("writeEntryCardUi keeps a bucket that is only explicit nulls", () => {
    writeEntryCardUi(SCOPE, { knownConditions: null });
    expect(sessionStorage.getItem(entryCardUiStorageKey(SCOPE))).not.toBeNull();
    expect(hasEntryCardSurface(SCOPE, "knownConditions")).toBe(true);
    expect(readEntryCardUi(SCOPE).knownConditions).toBeNull();
  });
});
