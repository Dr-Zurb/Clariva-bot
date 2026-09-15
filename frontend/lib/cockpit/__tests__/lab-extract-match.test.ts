import { describe, expect, it } from "vitest";
import type { RawExtractedLabRow } from "@/lib/api/lab-extract";
import {
  buildExtractedLabApply,
  isExtractCandidatePrechecked,
  matchExtractedLabRow,
  matchExtractedLabRows,
  normalizeUnitKey,
  parsePrintedRange,
} from "@/lib/cockpit/lab-extract-match";

function raw(partial: Partial<RawExtractedLabRow> & Pick<RawExtractedLabRow, "rawName">): RawExtractedLabRow {
  return {
    rawValue: null,
    rawUnit: null,
    rawRange: null,
    rawMethod: null,
    pageIndex: 0,
    lineText: partial.rawName,
    ...partial,
  };
}

describe("parsePrintedRange", () => {
  it("reads paired numeric ranges", () => {
    expect(parsePrintedRange("12.0 - 15.0")).toEqual({ low: 12, high: 15, text: null });
    expect(parsePrintedRange("12.0–15.0")).toEqual({ low: 12, high: 15, text: null });
    expect(parsePrintedRange("4.5 to 5.5")).toEqual({ low: 4.5, high: 5.5, text: null });
  });

  it("reads open bounds and keeps the printed text", () => {
    expect(parsePrintedRange("<200")).toEqual({ low: null, high: 200, text: "<200" });
    expect(parsePrintedRange(">40")).toEqual({ low: 40, high: null, text: ">40" });
  });

  it("keeps qualitative range text", () => {
    expect(parsePrintedRange("Negative")).toEqual({
      low: null,
      high: null,
      text: "Negative",
    });
  });
});

describe("normalizeUnitKey", () => {
  it("treats micro-sign and spacing variants as the same unit", () => {
    expect(normalizeUnitKey("g/dL")).toBe(normalizeUnitKey("g / dl"));
    expect(normalizeUnitKey("10^3/µL")).toBe(normalizeUnitKey("10^3/uL"));
  });
});

describe("matchExtractedLabRow", () => {
  it("maps an alias to the canonical analyte and stays green when unit + range agree", () => {
    const candidate = matchExtractedLabRow(
      raw({
        rawName: "HAEMOGLOBIN (Hb)",
        rawValue: "11.8",
        rawUnit: "g/dL",
        rawRange: "12.0 - 15.0",
        lineText: "HAEMOGLOBIN (Hb) 11.8 g/dL 12.0 - 15.0",
      }),
    );
    expect(candidate).toMatchObject({
      analyteId: "hb",
      name: "Haemoglobin",
      value: "11.8",
      unit: "g/dL",
      refLow: 12,
      refHigh: 15,
      confidence: "green",
      flags: [],
    });
    expect(isExtractCandidatePrechecked(candidate)).toBe(true);
  });

  it("keeps an accepted alt-unit without converting the value", () => {
    const candidate = matchExtractedLabRow(
      raw({
        rawName: "Haemoglobin",
        rawValue: "118",
        rawUnit: "g/L",
      }),
    );
    expect(candidate.analyteId).toBe("hb");
    expect(candidate.unit).toBe("g/L");
    expect(candidate.value).toBe("118");
    expect(candidate.flags).not.toContain("unit_mismatch");
  });

  it("flags a unit that is not in the accepted set", () => {
    const candidate = matchExtractedLabRow(
      raw({
        rawName: "Haemoglobin",
        rawValue: "11.8",
        rawUnit: "mmol/L",
        rawRange: "12.0 - 15.0",
      }),
    );
    expect(candidate.confidence).toBe("flagged");
    expect(candidate.flags).toContain("unit_mismatch");
    expect(candidate.unit).toBe("mmol/L");
  });

  it("flags a printed range that agrees with no library range for that analyte", () => {
    const candidate = matchExtractedLabRow(
      raw({
        rawName: "Haemoglobin",
        rawValue: "11.8",
        rawUnit: "g/dL",
        rawRange: "70 - 110",
      }),
    );
    expect(candidate.flags).toContain("range_mismatch");
    expect(candidate.refLow).toBe(70);
    expect(candidate.refHigh).toBe(110);
  });

  it("flags a value cell holding two numbers, which parses to the first one silently", () => {
    const candidate = matchExtractedLabRow(
      raw({ rawName: "Haemoglobin", rawValue: "11.8 15.0", rawUnit: "g/dL" }),
    );
    // `parseNumericTestValue` would take 11.8 and report nothing wrong, so
    // without this flag a merged value/range cell looks like a clean result.
    expect(candidate.flags).toContain("malformed_value");
    expect(candidate.confidence).toBe("flagged");
  });

  it("flags a doubled decimal point", () => {
    const candidate = matchExtractedLabRow(
      raw({ rawName: "Haemoglobin", rawValue: "11.8.0", rawUnit: "g/dL" }),
    );
    expect(candidate.flags).toContain("malformed_value");
  });

  it("flags a merged cell on an unmatched analyte too", () => {
    const candidate = matchExtractedLabRow(
      raw({ rawName: "Zinc proto-porphyrin", rawValue: "11.8 15.0" }),
    );
    expect(candidate.confidence).toBe("unmatched");
    expect(candidate.flags).toEqual(["unmatched_name", "malformed_value"]);
  });

  it("does not mistake ordinary printed values for merged cells", () => {
    const clean = [
      { rawValue: "11.8", label: "plain decimal" },
      { rawValue: "1,50,000", label: "Indian thousands separators" },
      { rawValue: "<0.01", label: "open bound" },
      { rawValue: "7.5 x10^3/uL", label: "scientific count" },
      { rawValue: "11.8 g/dL", label: "value with trailing unit" },
      { rawValue: "Negative", label: "qualitative" },
    ];
    for (const { rawValue, label } of clean) {
      const candidate = matchExtractedLabRow(raw({ rawName: "Haemoglobin", rawValue }));
      expect(candidate.flags, label).not.toContain("malformed_value");
    }
  });

  it("does not flag a female printed Hb range against the unsexed library default", () => {
    const candidate = matchExtractedLabRow(
      raw({
        rawName: "Hb",
        rawValue: "13.1",
        rawUnit: "g/dL",
        rawRange: "12.0 - 15.0",
      }),
    );
    expect(candidate.flags).not.toContain("range_mismatch");
    expect(candidate.confidence).toBe("green");
  });

  it("keeps unmatched names as custom-row candidates", () => {
    const candidate = matchExtractedLabRow(
      raw({
        rawName: "Zinc proto-porphyrin",
        rawValue: "42",
        rawUnit: "µg/dL",
      }),
    );
    expect(candidate).toMatchObject({
      analyteId: null,
      name: "Zinc proto-porphyrin",
      confidence: "unmatched",
      flags: ["unmatched_name"],
    });
    expect(isExtractCandidatePrechecked(candidate)).toBe(false);
  });

  it("does not flag qualitative values as non-numeric", () => {
    const candidate = matchExtractedLabRow(
      raw({
        rawName: "HBsAg",
        rawValue: "Negative",
        rawRange: "Negative",
      }),
    );
    expect(candidate.flags).not.toContain("non_numeric_value");
  });

  it("prefills the library range when the PDF printed none", () => {
    const candidate = matchExtractedLabRow(
      raw({
        rawName: "HbA1c",
        rawValue: "6.4",
        rawUnit: "%",
      }),
    );
    expect(candidate.analyteId).toBe("hba1c");
    expect(candidate.refHigh).toBe(5.6);
    expect(candidate.refText).toBeNull();
  });
});

describe("buildExtractedLabApply", () => {
  it("stamps extracted entryMethod and only the confirmed rows", () => {
    const hb = matchExtractedLabRow(
      raw({ rawName: "Hb", rawValue: "11.8", rawUnit: "g/dL" }),
    );
    const { report, rows } = buildExtractedLabApply([hb], {
      attachmentId: "att-pdf",
      reportDate: "2026-09-06",
      title: "CBC",
      createId: (() => {
        let n = 0;
        return () => `id-${n++}`;
      })(),
    });
    expect(report).toMatchObject({
      id: "id-0",
      kind: "lab",
      title: "CBC",
      reportDate: "2026-09-06",
      attachmentIds: ["att-pdf"],
      entryMethod: "extracted",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "id-1",
      reportId: "id-0",
      name: "Haemoglobin",
      value: "11.8",
      date: "2026-09-06",
      interpretation: null,
    });
  });
});

describe("matchExtractedLabRows", () => {
  it("preserves order and page provenance", () => {
    const rows = matchExtractedLabRows([
      raw({ rawName: "Hb", rawValue: "11.8", rawUnit: "g/dL", pageIndex: 0 }),
      raw({ rawName: "Unknown panel X", rawValue: "1", pageIndex: 1 }),
    ]);
    expect(rows.map((r) => r.analyteId)).toEqual(["hb", null]);
    expect(rows[1].raw.pageIndex).toBe(1);
  });
});
