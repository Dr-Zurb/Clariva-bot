import { describe, expect, it } from "vitest";
import {
  DESK_PREP_LABELS,
  DESK_PREP_LETTERS,
  EMPTY_DESK_PREP,
  deskPrepAriaLabel,
  deskPrepFromFlags,
  deskPrepFromRow,
} from "@/lib/desk/prep";

describe("deskPrepFromFlags", () => {
  it("stays unused when the today list has no prep flags", () => {
    expect(deskPrepFromFlags({})).toEqual(EMPTY_DESK_PREP);
    expect(deskPrepFromFlags(null)).toEqual(EMPTY_DESK_PREP);
    expect(deskPrepFromFlags(undefined)).toEqual(EMPTY_DESK_PREP);
    expect(deskPrepFromRow({})).toEqual(EMPTY_DESK_PREP);
  });

  it("fills V from list-payload vitals hints", () => {
    expect(deskPrepFromFlags({ has_desk_vitals: true }).vitals).toBe("filled");
    expect(deskPrepFromFlags({ has_desk_vitals: false }).vitals).toBe("empty");
    expect(deskPrepFromFlags({ has_vitals: true }).vitals).toBe("filled");
    expect(deskPrepFromFlags({ has_vitals: false }).vitals).toBe("empty");
    expect(
      deskPrepFromFlags({ vitals_captured_at: "2026-09-12T10:00:00Z" }).vitals
    ).toBe("filled");
  });

  it("fills D from list-payload document hints", () => {
    expect(deskPrepFromFlags({ has_visit_documents: true }).reports).toBe(
      "filled"
    );
    expect(deskPrepFromFlags({ has_visit_documents: false }).reports).toBe(
      "empty"
    );
    expect(deskPrepFromFlags({ visit_document_count: 2 }).reports).toBe(
      "filled"
    );
    expect(deskPrepFromFlags({ visit_document_count: 0 }).reports).toBe(
      "empty"
    );
  });

  it("fills H from the sidecar flags on the list", () => {
    expect(deskPrepFromFlags({ has_history_submission: true }).history).toBe(
      "filled"
    );
    expect(deskPrepFromFlags({ has_history_submission: false }).history).toBe(
      "empty"
    );
    expect(deskPrepFromFlags({ has_history: true }).history).toBe("filled");
    expect(deskPrepFromFlags({ history_submission_id: "sub_1" }).history).toBe(
      "filled"
    );
  });

  it("does not invent a filled slot from an empty appointment-shaped row", () => {
    expect(
      deskPrepFromFlags({
        id: "apt_1",
        patient_checked_in_at: "2026-09-12T10:00:00Z",
      })
    ).toEqual(EMPTY_DESK_PREP);
  });
});

describe("desk prep chrome", () => {
  it("keeps the V / H / D letters and tooltips stable", () => {
    expect(DESK_PREP_LETTERS).toEqual({
      vitals: "V",
      history: "H",
      reports: "D",
    });
    expect(DESK_PREP_LABELS).toEqual({
      vitals: "Vitals",
      history: "History",
      reports: "Reports",
    });
    expect(deskPrepAriaLabel(EMPTY_DESK_PREP)).toBe(
      "Visit prep. Vitals unknown. History unknown. Reports unknown."
    );
  });
});
