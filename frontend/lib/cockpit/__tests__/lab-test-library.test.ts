import { describe, expect, it } from "vitest";
import {
  createCustomTestResultRow,
  getImagingOrderById,
  getLabPanelById,
  IMAGING_ORDERS,
  imagingOrderHasViews,
  isLabRangeProvisional,
  LAB_ANALYTES,
  LAB_PANELS,
  LAB_TEST_LIBRARY_VERSION,
  lookupImagingViewByAlias,
  lookupLabAnalyteByAlias,
  resolveLabAnalyteRange,
  scaffoldLabAnalyteRow,
  scaffoldLabPanel,
  suggestInterpretationFromRange,
} from "@/lib/cockpit/lab-test-library";

describe("lab-test-library (rpt-03)", () => {
  it("ships a versioned catalog with panels + analytes", () => {
    expect(LAB_TEST_LIBRARY_VERSION).toBe(7);
    expect(LAB_ANALYTES.length).toBeGreaterThanOrEqual(120);
    expect(LAB_PANELS.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        "cbc",
        "cbc_diff",
        "lft",
        "kft",
        "lipid",
        "thyroid",
        "hba1c_panel",
        "diabetes",
        "urine_routine",
        "electrolytes",
        "iron_studies",
        "vit_d_b12",
        "crp_esr",
        "coagulation",
        "cardiac",
        "fever",
        "hormones",
        "anc_profile",
        "torch",
        "pediatric",
        "autoimmune",
      ]),
    );
  });

  it("deepens high-traffic OPD panels (inv-lib enrichment E1)", () => {
    expect(getLabPanelById("cbc_diff")!.analyteIds).toEqual(
      expect.arrayContaining(["monocytes", "basophils", "anc", "abs_lymphocytes"]),
    );
    expect(getLabPanelById("lft")!.analyteIds).toEqual(
      expect.arrayContaining(["ibil", "ag_ratio"]),
    );
    expect(getLabPanelById("kft")!.analyteIds).toContain("egfr");
    expect(getLabPanelById("lipid")!.analyteIds).toEqual(
      expect.arrayContaining(["vldl", "non_hdl", "chol_hdl_ratio"]),
    );
    expect(getLabPanelById("thyroid")!.analyteIds).toEqual(
      expect.arrayContaining(["anti_tpo", "anti_tg", "tt3", "tt4"]),
    );
    expect(getLabPanelById("urine_routine")!.analyteIds.length).toBeGreaterThanOrEqual(10);
    expect(getLabPanelById("diabetes")!.analyteIds).toContain("rbs");
  });

  it("deepens fever / serology / cardiac / hormones (inv-lib enrichment E2)", () => {
    expect(getLabPanelById("fever")!.analyteIds).toEqual(
      expect.arrayContaining(["typhidot", "mp_antigen", "covid_ag", "blood_culture"]),
    );
    expect(getLabPanelById("serology")!.analyteIds).toEqual(
      expect.arrayContaining(["anti_hbs", "hbeag", "vdrl"]),
    );
    expect(getLabPanelById("cardiac")!.analyteIds).toEqual(
      expect.arrayContaining(["trop_t", "ck_total", "ldh"]),
    );
    expect(getLabPanelById("hormones")!.analyteIds).toEqual(
      expect.arrayContaining(["estradiol", "testosterone", "amh", "cortisol"]),
    );
  });

  it("pads common imaging orders (E2 + CT/MRI requisition set)", () => {
    expect(IMAGING_ORDERS.map((o) => o.id)).toEqual(
      expect.arrayContaining([
        "usg_kub",
        "usg_thyroid",
        "ct_chest",
        "ct_abdomen",
        "ct_pelvis",
        "mri_spine",
        "mri_ls",
        "doppler_ll",
        "doppler_carotid",
      ]),
    );
    expect(getImagingOrderById("ct_abdomen")?.requiresRequisition).toBe(true);
    expect(getImagingOrderById("ct_spine")?.relatedIds).toEqual(
      expect.arrayContaining(["ct_cervical", "ct_dorsal", "ct_ls"]),
    );
    expect(getImagingOrderById("ct_brain")?.relatedIds).toBeUndefined();
    expect(getImagingOrderById("mri_spine")?.relatedIds).toEqual(
      expect.arrayContaining(["mri_cervical", "mri_dorsal", "mri_ls"]),
    );
  });

  it("ships X-ray view baskets (INV-D6)", () => {
    expect(getImagingOrderById("cxr")!.viewIds).toEqual(["pa", "lateral"]);
    expect(getImagingOrderById("xray_knee")!.viewIds).toEqual(["ap", "lateral"]);
    expect(getImagingOrderById("xray_spine")!.viewIds).toEqual(["ap", "lateral"]);
    expect(getImagingOrderById("xray_kub")!.viewIds).toEqual(["ap", "erect"]);
    expect(imagingOrderHasViews(getImagingOrderById("ecg"))).toBe(false);
    expect(lookupImagingViewByAlias("lat")?.id).toBe("lateral");
    expect(lookupImagingViewByAlias("PA")?.id).toBe("pa");
  });

  it("resolves E1 enrichment aliases", () => {
    expect(lookupLabAnalyteByAlias("ANC")?.id).toBe("anc");
    expect(lookupLabAnalyteByAlias("eGFR")?.id).toBe("egfr");
    expect(lookupLabAnalyteByAlias("anti-TPO")?.id).toBe("anti_tpo");
    expect(lookupLabAnalyteByAlias("urine ketones")?.id).toBe("urine_ketones");
    expect(lookupLabAnalyteByAlias("s. creatinine")?.id).toBe("creatinine");
  });

  it("resolves E2 enrichment aliases", () => {
    expect(lookupLabAnalyteByAlias("Typhidot")?.id).toBe("typhidot");
    expect(lookupLabAnalyteByAlias("troponin t")?.id).toBe("trop_t");
    expect(lookupLabAnalyteByAlias("VDRL")?.id).toBe("vdrl");
    expect(lookupLabAnalyteByAlias("AMH")?.id).toBe("amh");
  });

  it("ships specialty packs (inv-lib enrichment E3)", () => {
    expect(getLabPanelById("anc_profile")!.analyteIds).toEqual(
      expect.arrayContaining(["blood_group", "ict", "gct_50", "rubella_igg"]),
    );
    expect(getLabPanelById("torch")!.analyteIds).toHaveLength(8);
    expect(getLabPanelById("pediatric")!.analyteIds).toEqual(
      expect.arrayContaining(["g6pd", "sickling", "reticulocyte"]),
    );
    expect(getLabPanelById("autoimmune")!.analyteIds).toEqual(
      expect.arrayContaining(["ana", "anti_dsdna", "anca", "c3", "c4"]),
    );
    expect(getLabPanelById("arthritis")!.analyteIds).toContain("hla_b27");
    expect(getLabPanelById("infertility")!.analyteIds).toContain("amh");
  });

  it("resolves E3 enrichment aliases", () => {
    expect(lookupLabAnalyteByAlias("blood group")?.id).toBe("blood_group");
    expect(lookupLabAnalyteByAlias("G6PD")?.id).toBe("g6pd");
    expect(lookupLabAnalyteByAlias("ANA")?.id).toBe("ana");
    expect(lookupLabAnalyteByAlias("HLA-B27")?.id).toBe("hla_b27");
  });

  it("marks all shipped ranges as unreviewed (provisional) until clinical pass", () => {
    for (const analyte of LAB_ANALYTES) {
      for (const r of [analyte.range, analyte.rangeMale, analyte.rangeFemale]) {
        if (!r) continue;
        expect(r.reviewed).toBe(false);
        expect(isLabRangeProvisional(r)).toBe(true);
      }
    }
  });

  describe("lookupLabAnalyteByAlias", () => {
    it("resolves known synonyms case-insensitively", () => {
      expect(lookupLabAnalyteByAlias("Hb")?.id).toBe("hb");
      expect(lookupLabAnalyteByAlias("HAEMOGLOBIN")?.id).toBe("hb");
      expect(lookupLabAnalyteByAlias("HGB")?.id).toBe("hb");
      expect(lookupLabAnalyteByAlias("SGPT (ALT)")?.id).toBe("sgpt");
      expect(lookupLabAnalyteByAlias("random blood sugar")?.id).toBe("rbs");
      expect(lookupLabAnalyteByAlias("  TSH  ")?.id).toBe("tsh");
    });

    it("returns undefined for unknown names", () => {
      expect(lookupLabAnalyteByAlias("Totally made up assay")).toBeUndefined();
      expect(lookupLabAnalyteByAlias("")).toBeUndefined();
      expect(lookupLabAnalyteByAlias(null)).toBeUndefined();
    });
  });

  describe("scaffoldLabPanel", () => {
    it("scaffolds CBC rows under one LabReport header with unit + range prefilled", () => {
      let n = 0;
      const scaffolded = scaffoldLabPanel("cbc", {
        source: "patient_report",
        createId: () => `id-${++n}`,
      });
      expect(scaffolded).not.toBeNull();
      const panel = getLabPanelById("cbc")!;
      expect(scaffolded!.report).toMatchObject({
        id: "id-1",
        kind: "lab",
        title: "CBC",
        entryMethod: "manual",
        attachmentIds: [],
      });
      expect(scaffolded!.rows).toHaveLength(panel.analyteIds.length);
      expect(scaffolded!.rows.every((r) => r.reportId === "id-1")).toBe(true);
      const hb = scaffolded!.rows.find((r) => r.name === "Haemoglobin");
      expect(hb).toMatchObject({
        unit: "g/dL",
        refLow: 12,
        refHigh: 17,
        value: null,
        interpretation: null,
      });
    });

    it("applies sex-split ranges when sex is provided", () => {
      const male = scaffoldLabPanel("cbc", {
        sex: "male",
        createId: () => crypto.randomUUID(),
      });
      const female = scaffoldLabPanel("cbc", {
        sex: "female",
        createId: () => crypto.randomUUID(),
      });
      const hbMale = male!.rows.find((r) => r.name === "Haemoglobin");
      const hbFemale = female!.rows.find((r) => r.name === "Haemoglobin");
      expect(hbMale?.refLow).toBe(13);
      expect(hbFemale?.refLow).toBe(12);
    });

    it("returns null for an unknown panel id", () => {
      expect(scaffoldLabPanel("nope")).toBeNull();
    });
  });

  describe("scaffoldLabAnalyteRow / createCustomTestResultRow", () => {
    it("prefills a single analyte by id or alias", () => {
      const row = scaffoldLabAnalyteRow("hba1c", { createId: () => "x1" });
      expect(row).toMatchObject({
        id: "x1",
        name: "HbA1c",
        unit: "%",
        reportId: null,
        refHigh: 5.6,
      });
      expect(scaffoldLabAnalyteRow("glycosylated haemoglobin")?.name).toBe("HbA1c");
    });

    it("creates an empty editable custom row", () => {
      expect(createCustomTestResultRow("in_clinic_poc", () => "c1")).toEqual({
        id: "c1",
        source: "in_clinic_poc",
        name: "",
        value: null,
        unit: null,
        date: null,
        interpretation: null,
        notes: null,
        reportId: null,
        refLow: null,
        refHigh: null,
        refText: null,
      });
    });
  });

  describe("suggestInterpretationFromRange (auto-flag truth table)", () => {
    it("flags low / high / normal from numeric value vs range", () => {
      expect(
        suggestInterpretationFromRange({ value: "9", refLow: 12, refHigh: 16 }),
      ).toBe("low");
      expect(
        suggestInterpretationFromRange({ value: "18", refLow: 12, refHigh: 16 }),
      ).toBe("high");
      expect(
        suggestInterpretationFromRange({ value: "14", refLow: 12, refHigh: 16 }),
      ).toBe("normal");
    });

    it("supports open-ended ranges (cholesterol-style upper only)", () => {
      expect(
        suggestInterpretationFromRange({ value: "220", refLow: null, refHigh: 200 }),
      ).toBe("high");
      expect(
        suggestInterpretationFromRange({ value: "180", refLow: null, refHigh: 200 }),
      ).toBe("normal");
      expect(
        suggestInterpretationFromRange({ value: "35", refLow: 40, refHigh: null }),
      ).toBe("low");
    });

    it("lets printed range win — skips numeric auto-flag when refText is set", () => {
      expect(
        suggestInterpretationFromRange({
          value: "9",
          refLow: 12,
          refHigh: 16,
          refText: "12–16 (lab printed)",
        }),
      ).toBeNull();
      expect(
        suggestInterpretationFromRange({
          value: "Positive",
          refText: "Negative",
        }),
      ).toBeNull();
    });

    it("returns null when value or range is non-numeric / missing", () => {
      expect(suggestInterpretationFromRange({ value: "trace", refLow: 0, refHigh: 5 })).toBeNull();
      expect(suggestInterpretationFromRange({ value: "10" })).toBeNull();
      expect(suggestInterpretationFromRange({ value: null, refLow: 1, refHigh: 2 })).toBeNull();
    });

    it("parses decorated numeric strings", () => {
      expect(
        suggestInterpretationFromRange({ value: ">250", refLow: null, refHigh: 200 }),
      ).toBe("high");
      expect(
        suggestInterpretationFromRange({ value: "7.8 %", refLow: null, refHigh: 5.6 }),
      ).toBe("high");
    });
  });

  describe("resolveLabAnalyteRange", () => {
    it("falls back to unsexed range when sex-specific is absent", () => {
      const wbc = LAB_ANALYTES.find((a) => a.id === "wbc")!;
      expect(resolveLabAnalyteRange(wbc, "male")).toEqual(wbc.range);
    });
  });
});
