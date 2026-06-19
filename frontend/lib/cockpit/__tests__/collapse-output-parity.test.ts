/**
 * subj-31 close-gate — collapse state is UI-only; patient payload unchanged.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";

describe("subj-31 · collapse output parity (structural)", () => {
  it("buildRxPayload output is identical for the same fields (collapse is not an input)", () => {
    const fields = createEmptyRxFormFields();
    fields.complaints = [
      {
        id: "c1",
        name: "Headache",
        attributes: {},
        associatedComplaints: [],
      },
    ];
    fields.hopi = "Extra notes";

    const baseline = buildRxPayload(fields);
    const again = buildRxPayload({ ...fields });
    expect(again).toEqual(baseline);
  });

  it("buildRxPayload source never references subjective_section_collapsed", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../components/cockpit/rx/RxFormContext.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/subjective_section_collapsed/);
    expect(src).not.toMatch(/subjectiveSectionCollapsed/);
  });
});
