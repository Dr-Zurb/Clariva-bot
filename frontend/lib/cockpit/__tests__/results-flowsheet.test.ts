import { describe, expect, it } from "vitest";
import {
  buildAnalyteTrendByKey,
  buildResultsFlowsheet,
  mergeResultsDateGroups,
  parseResultNumericValue,
  resultsFlowsheetAnalyteKey,
  resultsTimelineToDateGroups,
} from "@/lib/cockpit/results-flowsheet";
import type { ResultsTimelineEntry } from "@/types/patient-chart";
import type { TestResultRow } from "@/types/prescription";

function row(partial: Partial<TestResultRow> & Pick<TestResultRow, "id" | "name">): TestResultRow {
  return {
    source: "patient_report",
    value: null,
    unit: null,
    interpretation: null,
    date: null,
    notes: null,
    reportId: null,
    refLow: null,
    refHigh: null,
    refText: null,
    method: null,
    ...partial,
  };
}

describe("buildResultsFlowsheet", () => {
  it("lays analytes across newest-first dates and leaves gaps empty", () => {
    const sheet = buildResultsFlowsheet([
      [
        "2026-09-06",
        [row({ id: "hb-today", name: "Haemoglobin", value: "11.8", unit: "g/dL" })],
      ],
      [
        "2026-06-02",
        [
          row({ id: "hb-jun", name: "Hb", value: "13.2", unit: "g/dL" }),
          row({ id: "a1c-jun", name: "HbA1c", value: "7.8", unit: "%" }),
        ],
      ],
    ]);

    expect(sheet.dateKeys).toEqual(["2026-09-06", "2026-06-02"]);
    expect(sheet.rows.map((item) => item.key)).toEqual([
      resultsFlowsheetAnalyteKey("Haemoglobin"),
      resultsFlowsheetAnalyteKey("HbA1c"),
    ]);
    expect(sheet.rows[0]).toMatchObject({
      name: "Haemoglobin",
      unit: "g/dL",
      cells: [
        { rowId: "hb-today", value: "11.8" },
        { rowId: "hb-jun", value: "13.2" },
      ],
    });
    expect(sheet.rows[1]?.cells).toEqual([null, { rowId: "a1c-jun", value: "7.8" }]);
  });

  it("keeps the first row when the same analyte is repeated on one date", () => {
    const sheet = buildResultsFlowsheet([
      [
        "2026-09-06",
        [
          row({ id: "first", name: "Haemoglobin", value: "12" }),
          row({ id: "second", name: "Hb", value: "99" }),
        ],
      ],
    ]);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]?.cells[0]).toEqual({ rowId: "first", value: "12" });
  });

  it("does not merge unmatched custom names", () => {
    const sheet = buildResultsFlowsheet([
      [
        "2026-09-06",
        [
          row({ id: "a", name: "My special test", value: "1" }),
          row({ id: "b", name: "Other custom", value: "2" }),
        ],
      ],
    ]);
    expect(sheet.rows.map((item) => item.key)).toEqual([
      "name:my special test",
      "name:other custom",
    ]);
  });
});

describe("analyte trend series", () => {
  it("parses plain numbers and rejects qualitative values", () => {
    expect(parseResultNumericValue("11.8")).toBe(11.8);
    expect(parseResultNumericValue("1,200")).toBe(1200);
    expect(parseResultNumericValue("Negative")).toBeNull();
    expect(parseResultNumericValue("<200")).toBeNull();
    expect(parseResultNumericValue("7.8 %")).toBeNull();
  });

  it("charts numeric points oldest-first and skips undated / non-numeric rows", () => {
    const byKey = buildAnalyteTrendByKey([
      [
        "2026-09-06",
        [row({ id: "hb-today", name: "Haemoglobin", value: "11.8", unit: "g/dL" })],
      ],
      [
        "2026-06-02",
        [
          row({ id: "hb-jun", name: "Hb", value: "13.2", unit: "g/dL", refLow: 12, refHigh: 17 }),
          row({ id: "dip", name: "Urine protein", value: "Negative" }),
        ],
      ],
      ["", [row({ id: "old", name: "Haemoglobin", value: "14" })]],
    ]);
    const hb = byKey.get(resultsFlowsheetAnalyteKey("Haemoglobin"));
    expect(hb?.points.map((point) => point.value)).toEqual([13.2, 11.8]);
    expect(hb?.unit).toBe("g/dL");
    expect(hb?.refLow).toBe(12);
    expect(hb?.refHigh).toBe(17);
    expect(byKey.has(resultsFlowsheetAnalyteKey("Urine protein"))).toBe(false);
  });

  it("lets the current visit replace the same date from the timeline", () => {
    const prior = resultsTimelineToDateGroups([
      {
        prescriptionId: "rx-old",
        appointmentId: "appt-old",
        visitDate: "2026-06-02T09:00:00Z",
        ordered: null,
        resulted: [row({ id: "prior-hb", name: "Hb", value: "14.0", date: "2026-06-02" })],
        mediaCount: 0,
      } satisfies ResultsTimelineEntry,
    ]);
    const current: ReturnType<typeof mergeResultsDateGroups> = [
      ["2026-06-02", [row({ id: "now-hb", name: "Haemoglobin", value: "11.8" })]],
    ];
    const merged = mergeResultsDateGroups(current, prior);
    const hb = buildAnalyteTrendByKey(merged).get(resultsFlowsheetAnalyteKey("Hb"));
    expect(hb?.points).toEqual([{ at: "2026-06-02T12:00:00", value: 11.8 }]);
  });
});
