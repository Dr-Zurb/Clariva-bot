import { describe, expect, it } from "vitest";
import {
  addPastSurgicalCatalogProcedure,
  addPastSurgicalOtherProcedure,
  normalizePastSurgicalHistoryStructured,
  parsePastSurgicalHistoryAsStructured,
  patchPastSurgicalProcedureEntry,
  serializePastSurgicalHistory,
  setPastSurgicalHistoryNone,
} from "@/lib/cockpit/past-surgical-history";

describe("past-surgical-history", () => {
  it("serializes none and procedure rows with ago timing and notes", () => {
    expect(serializePastSurgicalHistory({ none: true })).toBe("No prior surgeries");
    expect(
      serializePastSurgicalHistory({
        procedures: [
          { id: "1", procedure: "appendectomy", agoValue: 16, agoUnit: "years" },
          { id: "2", procedure: "lscs", agoValue: 8, agoUnit: "years", notes: "elective" },
        ],
      }),
    ).toBe("Appendectomy (16 years ago), LSCS (8 years ago, elective)");
  });

  it("serializes singular ago units", () => {
    expect(
      serializePastSurgicalHistory({
        procedures: [{ id: "1", procedure: "cholecystectomy", agoValue: 1, agoUnit: "years" }],
      }),
    ).toBe("Cholecystectomy (1 year ago)");
  });

  it("serializes custom procedure and section notes", () => {
    expect(
      serializePastSurgicalHistory({
        procedures: [{ id: "1", procedure: "other", procedureOther: "Laparotomy" }],
        notes: "Multiple laparotomies abroad",
      }),
    ).toBe("Laparotomy · Multiple laparotomies abroad");
  });

  it("parses legacy text into structured rows", () => {
    const parsed = parsePastSurgicalHistoryAsStructured("Appendectomy 2010, LSCS (2018)");
    expect(parsed.procedures).toHaveLength(2);
    expect(parsed.procedures?.[0]).toMatchObject({ procedure: "appendectomy", notes: "2010" });
    expect(parsed.procedures?.[1]).toMatchObject({ procedure: "lscs", notes: "2018" });
  });

  it("parses relative ago from text", () => {
    const parsed = parsePastSurgicalHistoryAsStructured("Appendectomy (5 years ago)");
    expect(parsed.procedures?.[0]).toMatchObject({
      procedure: "appendectomy",
      agoValue: 5,
      agoUnit: "years",
    });
  });

  it("parses none patterns", () => {
    expect(parsePastSurgicalHistoryAsStructured("No prior surgeries")).toEqual({ none: true });
    expect(parsePastSurgicalHistoryAsStructured("NPS")).toEqual({ none: true });
  });

  it("preserves spaces in custom procedure names while editing", () => {
    let structured = addPastSurgicalOtherProcedure({}, "");
    const entryId = structured.procedures?.[0]?.id ?? "";
    structured = patchPastSurgicalProcedureEntry(structured, entryId, {
      procedureOther: "Lap chole",
    });
    const normalized = normalizePastSurgicalHistoryStructured(structured, {
      keepEmptyProcedureRows: true,
    });
    expect(normalized.procedures?.[0]?.procedureOther).toBe("Lap chole");
  });

  it("clears procedures when none is selected", () => {
    let structured = addPastSurgicalCatalogProcedure({}, "appendectomy");
    structured = setPastSurgicalHistoryNone(structured, true);
    expect(structured).toEqual({ none: true });
    expect(serializePastSurgicalHistory(structured)).toBe("No prior surgeries");
  });

  it("migrates legacy year and detail fields into notes on normalize", () => {
    const normalized = normalizePastSurgicalHistoryStructured({
      procedures: [
        {
          id: "1",
          procedure: "tkr",
          year: "2018",
          side: "left",
          approach: "lap",
          complication: false,
        } as never,
      ],
    });
    expect(normalized.procedures?.[0]).toMatchObject({
      procedure: "tkr",
      notes: "2018, left, lap, uneventful",
    });
    expect(normalized.procedures?.[0]).not.toHaveProperty("year");
    expect(normalized.procedures?.[0]).not.toHaveProperty("side");
  });
});
