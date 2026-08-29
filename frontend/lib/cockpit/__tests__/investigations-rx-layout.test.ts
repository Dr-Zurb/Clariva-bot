import { describe, expect, it } from "vitest";
import { layoutInvestigationsForRx } from "@/lib/cockpit/investigations-rx-layout";

const JASPREET =
  "CBC, HbA1c, fasting glucose, creatinine and eGFR, electrolytes, fasting lipid profile, TSH, urine ACR, ECG, chest X-ray PA, spirometry when infection-free. Bring home BP diary and glucometer log to the next visit.";

describe("layoutInvestigationsForRx", () => {
  it("turns a comma list plus an instruction sentence into ticks and a note", () => {
    expect(layoutInvestigationsForRx(JASPREET)).toEqual({
      kind: "list",
      items: [
        "CBC",
        "HbA1c",
        "fasting glucose",
        "creatinine and eGFR",
        "electrolytes",
        "fasting lipid profile",
        "TSH",
        "urine ACR",
        "ECG",
        "chest X-ray PA",
        "spirometry when infection-free",
      ],
      note: "Bring home BP diary and glucometer log to the next visit.",
    });
  });

  it("keeps semicolon chips as discrete ticks", () => {
    expect(layoutInvestigationsForRx("ECG; Trop-I; CBC")).toEqual({
      kind: "list",
      items: ["ECG", "Trop-I", "CBC"],
      note: null,
    });
  });

  it("keeps a Title: a, b basket on one tick", () => {
    expect(layoutInvestigationsForRx("ECG; Lipid profile: TC, HDL, LDL")).toEqual({
      kind: "list",
      items: ["ECG", "Lipid profile: TC, HDL, LDL"],
      note: null,
    });
  });

  it("leaves a single sentence as a paragraph", () => {
    expect(
      layoutInvestigationsForRx("CBC if headache persists beyond 2 weeks."),
    ).toEqual({
      kind: "paragraph",
      text: "CBC if headache persists beyond 2 weeks.",
    });
  });

  it("returns null when blank", () => {
    expect(layoutInvestigationsForRx("  ")).toBeNull();
    expect(layoutInvestigationsForRx(null)).toBeNull();
  });
});
