import { describe, expect, it } from "vitest";
import {
  BP_CLUSTER_KEYS,
  BP_CLUSTER_MENU_KEY,
  BP_CLUSTER_MENU_LABEL,
  bpClusterHasData,
  expandBpClusterVisibilityKeys,
  isBpClusterHidden,
  isBpComponentOnlyKey,
  resolveBpClusterMenuLabel,
} from "@/lib/cockpit/bp-cluster";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";

describe("bp-cluster", () => {
  it("uses systolic as the single menu anchor labelled Blood pressure (BP)", () => {
    expect(BP_CLUSTER_MENU_KEY).toBe("vitalsBpSystolic");
    expect(resolveBpClusterMenuLabel(BP_CLUSTER_MENU_KEY)).toBe(BP_CLUSTER_MENU_LABEL);
    expect(resolveBpClusterMenuLabel("vitalsHr")).toBeNull();
  });

  it("hides diastolic from standalone picker/menu rows", () => {
    expect(isBpComponentOnlyKey("vitalsBpDiastolic")).toBe(true);
    expect(isBpComponentOnlyKey("vitalsBpSystolic")).toBe(false);
  });

  it("expands cluster visibility to both stored fields", () => {
    expect(expandBpClusterVisibilityKeys("vitalsHr")).toEqual(["vitalsHr"]);
    expect(expandBpClusterVisibilityKeys(BP_CLUSTER_MENU_KEY)).toEqual([...BP_CLUSTER_KEYS]);
    expect(expandBpClusterVisibilityKeys("vitalsBpDiastolic")).toEqual([...BP_CLUSTER_KEYS]);
  });

  it("treats the cluster as hidden only when both keys are hidden", () => {
    expect(isBpClusterHidden([])).toBe(false);
    expect(isBpClusterHidden(["vitalsBpSystolic"])).toBe(false);
    expect(isBpClusterHidden(["vitalsBpDiastolic"])).toBe(false);
    expect(isBpClusterHidden(["vitalsBpSystolic", "vitalsBpDiastolic"])).toBe(true);
  });

  it("detects data across flat columns or structured readings", () => {
    const empty = createEmptyRxFormFields();
    expect(bpClusterHasData(empty)).toBe(false);

    expect(bpClusterHasData({ ...empty, vitalsBpDiastolic: 80 })).toBe(true);
    expect(
      bpClusterHasData({
        ...empty,
        vitalsBpReadings: [{ systolic: 120, diastolic: 80 }],
      }),
    ).toBe(true);
  });
});
