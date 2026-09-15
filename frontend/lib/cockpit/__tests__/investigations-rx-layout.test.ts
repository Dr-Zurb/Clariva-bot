import { describe, expect, it } from "vitest";
import {
  layoutInvestigationsForRx,
  rowsFromInvestigationItems,
} from "@/lib/cockpit/investigations-rx-layout";

const JASPREET =
  "CBC, HbA1c, fasting glucose, creatinine and eGFR, electrolytes, fasting lipid profile, TSH, urine ACR, ECG, chest X-ray PA, spirometry when infection-free. Bring home BP diary and glucometer log to the next visit.";

describe("layoutInvestigationsForRx", () => {
  it("turns a comma list plus an instruction sentence into ticks and a note", () => {
    expect(layoutInvestigationsForRx(JASPREET)).toEqual({
      kind: "list",
      items: [
        { kind: "order", label: "CBC" },
        { kind: "order", label: "HbA1c" },
        { kind: "order", label: "fasting glucose" },
        { kind: "order", label: "creatinine and eGFR" },
        { kind: "order", label: "electrolytes" },
        { kind: "order", label: "fasting lipid profile" },
        { kind: "order", label: "TSH" },
        { kind: "order", label: "urine ACR" },
        { kind: "order", label: "ECG" },
        { kind: "order", label: "chest X-ray PA" },
        { kind: "order", label: "spirometry when infection-free" },
      ],
      note: "Bring home BP diary and glucometer log to the next visit.",
    });
  });

  it("keeps semicolon chips as discrete top-level headings", () => {
    expect(layoutInvestigationsForRx("ECG; Trop-I; CBC")).toEqual({
      kind: "list",
      items: [
        { kind: "package", label: "ECG", members: [] },
        { kind: "package", label: "Trop-I", members: [] },
        { kind: "package", label: "CBC", members: [] },
      ],
      note: null,
    });
  });

  it("nests Title: a, b members under the package name", () => {
    expect(layoutInvestigationsForRx("ECG; Lipid profile: TC, HDL, LDL")).toEqual({
      kind: "list",
      items: [
        { kind: "package", label: "ECG", members: [] },
        {
          kind: "package",
          label: "Lipid profile",
          members: ["TC", "HDL", "LDL"],
        },
      ],
      note: null,
    });
    expect(
      rowsFromInvestigationItems([
        { kind: "package", label: "ECG", members: [] },
        {
          kind: "package",
          label: "Lipid profile",
          members: ["TC", "HDL", "LDL"],
        },
      ]),
    ).toEqual([
      { kind: "package", label: "ECG", members: [] },
      {
        kind: "package",
        label: "Lipid profile",
        members: ["TC", "HDL", "LDL"],
      },
    ]);
  });

  it("prints empty sibling packages as headings, same as filled ones", () => {
    expect(
      layoutInvestigationsForRx(
        "Routine tests: A/G ratio; CBC: Haemoglobin; KFT / RFT; Thyroid profile",
      ),
    ).toEqual({
      kind: "list",
      items: [
        {
          kind: "package",
          label: "Routine tests",
          members: ["A/G ratio"],
        },
        { kind: "package", label: "CBC", members: ["Haemoglobin"] },
        { kind: "package", label: "KFT / RFT", members: [] },
        { kind: "package", label: "Thyroid profile", members: [] },
      ],
      note: null,
    });
  });

  it("prints a lone package as a list, not a paragraph", () => {
    expect(
      layoutInvestigationsForRx("CBC: Haemoglobin, WBC count"),
    ).toEqual({
      kind: "list",
      items: [
        {
          kind: "package",
          label: "CBC",
          members: ["Haemoglobin", "WBC count"],
        },
      ],
      note: null,
    });
  });

  it("treats an empty CBC: basket as the package name only", () => {
    expect(layoutInvestigationsForRx("CBC:")).toEqual({
      kind: "paragraph",
      text: "CBC:",
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
