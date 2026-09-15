import { describe, expect, it } from "vitest";
import {
  filterDrugMasterCatalog,
  formatDrugMasterCaptureLine,
} from "@/lib/drug-master-catalog";
import type { DrugMasterRow } from "@/types/drug-master";

function drug(
  id: string,
  generic_name: string,
  brand_names: string[] = []
): DrugMasterRow {
  return {
    id,
    generic_name,
    brand_names,
    strength: null,
    form: null,
    route_default: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("filterDrugMasterCatalog", () => {
  const catalog = [
    drug("1", "Prednisolone"),
    drug("2", "Prednisone"),
    drug("3", "Paracetamol"),
    drug("4", "Telmisartan", ["Telma", "Telpres", "Tazloc"]),
  ];

  it("returns nothing below two characters", () => {
    expect(filterDrugMasterCatalog(catalog, "p")).toEqual([]);
  });

  it("ranks generic prefix matches first", () => {
    const rows = filterDrugMasterCatalog(catalog, "pred");
    expect(rows.map((r) => r.generic_name)).toEqual([
      "Prednisolone",
      "Prednisone",
    ]);
  });

  it("matches a brand query without requiring the generic prefix", () => {
    const rows = filterDrugMasterCatalog(catalog, "telpres");
    expect(rows).toEqual([catalog[3]]);
  });

  it("falls back to generic substring matches", () => {
    const rows = filterDrugMasterCatalog(catalog, "misart");
    expect(rows.map((r) => r.generic_name)).toEqual(["Telmisartan"]);
  });
});

describe("formatDrugMasterCaptureLine", () => {
  it("orders short form, name, then strength", () => {
    expect(
      formatDrugMasterCaptureLine({
        ...drug("1", "Prednisolone"),
        form: "tablet",
        strength: "10mg",
      })
    ).toBe("Tab Prednisolone 10mg");
    expect(
      formatDrugMasterCaptureLine({
        ...drug("2", "Methylprednisolone"),
        form: "injection",
        strength: "40mg",
      })
    ).toBe("Inj Methylprednisolone 40mg");
    expect(
      formatDrugMasterCaptureLine({
        ...drug("3", "Dextromethorphan"),
        form: "syrup",
        strength: "10mg",
      })
    ).toBe("Syp Dextromethorphan 10mg");
  });

  it("omits missing form or strength", () => {
    expect(formatDrugMasterCaptureLine(drug("1", "Multivitamin"))).toBe(
      "Multivitamin"
    );
  });
});
