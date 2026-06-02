import { paneTreeToFlat } from "../layout-tree";
import type { PatientProfileLayout } from "../types";

/** Derive leaf order + per-leaf state from a v4 layout (test helper). */
export function layoutFlat(layout: PatientProfileLayout) {
  return paneTreeToFlat(layout.paneTree);
}
