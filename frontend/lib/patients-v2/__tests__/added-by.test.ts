import { describe, expect, it } from "vitest";
import { formatPatientAddedBy } from "../added-by";

describe("formatPatientAddedBy", () => {
  it("returns null when provenance is unknown", () => {
    expect(formatPatientAddedBy({})).toBeNull();
  });

  it("says you when the viewer created the row", () => {
    expect(
      formatPatientAddedBy(
        { registered_via: "front_desk", created_by: "doc-1", created_by_label: "Doctor" },
        "doc-1"
      )
    ).toBe("Added by you");
  });

  it("names the receptionist when someone else created it at the desk", () => {
    expect(
      formatPatientAddedBy(
        { registered_via: "front_desk", created_by: "staff-1", created_by_label: "Priya" },
        "doc-1"
      )
    ).toBe("Added by front desk (Priya)");
  });

  it("falls back to the channel when there is no label", () => {
    expect(formatPatientAddedBy({ registered_via: "front_desk" }, "doc-1")).toBe(
      "Added by front desk"
    );
  });
});
