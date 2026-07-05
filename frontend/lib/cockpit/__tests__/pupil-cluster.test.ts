import { describe, expect, it } from "vitest";
import {
  expandPupilClusterVisibilityKeys,
  isPupilComponentOnlyKey,
  PUPIL_CLUSTER_KEYS,
  PUPIL_CLUSTER_MENU_KEY,
  PUPIL_CLUSTER_MENU_LABEL,
  pupilClusterHasData,
  resolvePupilClusterMenuLabel,
} from "@/lib/cockpit/pupil-cluster";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";

describe("pupil-cluster", () => {
  it("uses left size as the single menu anchor labelled Pupils", () => {
    expect(PUPIL_CLUSTER_MENU_KEY).toBe("vitalsPupilSizeLeftMm");
    expect(resolvePupilClusterMenuLabel(PUPIL_CLUSTER_MENU_KEY)).toBe(PUPIL_CLUSTER_MENU_LABEL);
    expect(resolvePupilClusterMenuLabel("vitalsAvpu")).toBeNull();
  });

  it("hides component keys from standalone picker/menu rows", () => {
    expect(isPupilComponentOnlyKey("vitalsPupilSizeRightMm")).toBe(true);
    expect(isPupilComponentOnlyKey("vitalsPupilReactivityLeft")).toBe(true);
    expect(isPupilComponentOnlyKey("vitalsPupilSizeLeftMm")).toBe(false);
  });

  it("expands cluster visibility to all four stored fields", () => {
    expect(expandPupilClusterVisibilityKeys("vitalsAvpu")).toEqual(["vitalsAvpu"]);
    expect(expandPupilClusterVisibilityKeys(PUPIL_CLUSTER_MENU_KEY)).toEqual([
      ...PUPIL_CLUSTER_KEYS,
    ]);
  });

  it("detects data across any pupil field", () => {
    const empty = createEmptyRxFormFields();
    expect(pupilClusterHasData(empty)).toBe(false);

    const withReactivity = { ...empty, vitalsPupilReactivityRight: "sluggish" as const };
    expect(pupilClusterHasData(withReactivity)).toBe(true);
  });
});
