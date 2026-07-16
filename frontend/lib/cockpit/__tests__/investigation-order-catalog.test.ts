import { describe, expect, it } from "vitest";
import {
  applyPanelSelectionToChips,
  canonicalizeOrderLabel,
  createCustomBasket,
  createImagingBasket,
  createPanelBasket,
  deriveInvestigationOrdersJson,
  inferPanelSelectionFromChips,
  isBasketCustomized,
  isBasketMembershipCustomized,
  labelsFromPanelSelection,
  mapResolvedTermsToCatalog,
  mergeInvestigationOrderLabels,
  occupiedOrderIdentityKeys,
  parseInvestigationOrdersFromFlat,
  resolveInvestigationOrderCatalog,
  serializeInvestigationOrdersToFlat,
  suggestInvestigationOrders,
} from "@/lib/cockpit/investigation-order-catalog";
import {
  getImagingViewById,
  getLabPanelById,
  IMAGING_ORDERS,
  IMAGING_VIEWS,
  LAB_ANALYTES,
  LAB_PANELS,
} from "@/lib/cockpit/lab-test-library";

const LIMITS = {
  maxChips: 40,
  maxChipLength: 200,
  maxTotalLength: 2000,
} as const;

describe("investigation-order-catalog (inv-lib-01/02)", () => {
  it("every panel analyte id resolves in LAB_ANALYTES", () => {
    const ids = new Set(LAB_ANALYTES.map((a) => a.id));
    for (const panel of LAB_PANELS) {
      for (const analyteId of panel.analyteIds) {
        expect(ids.has(analyteId)).toBe(true);
      }
    }
  });

  it("every imaging viewId resolves in IMAGING_VIEWS", () => {
    const ids = new Set(IMAGING_VIEWS.map((v) => v.id));
    for (const order of IMAGING_ORDERS) {
      for (const viewId of order.viewIds ?? []) {
        expect(ids.has(viewId)).toBe(true);
        expect(getImagingViewById(viewId)?.name).toBeTruthy();
      }
    }
  });

  it("ships imaging orders and an expanded analyte set", () => {
    expect(LAB_ANALYTES.length).toBeGreaterThanOrEqual(120);
    expect(LAB_PANELS.length).toBeGreaterThanOrEqual(25);
    expect(IMAGING_ORDERS.map((o) => o.id)).toEqual(
      expect.arrayContaining(["cxr", "ecg", "usg_abdomen", "usg_kub", "ct_chest"]),
    );
  });

  it("resolves panel and imaging labels to catalog values", () => {
    expect(resolveInvestigationOrderCatalog("LFT")).toBe("panel:lft");
    expect(resolveInvestigationOrderCatalog("Chest X-ray")).toBe("imaging:cxr");
    expect(resolveInvestigationOrderCatalog("Haemoglobin")).toBe("analyte:hb");
    expect(resolveInvestigationOrderCatalog("RFT")).toBe("panel:kft");
  });

  it("full panel selection commits the panel name (INV-D3)", () => {
    const panel = getLabPanelById("lft")!;
    expect(labelsFromPanelSelection("lft", panel.analyteIds)).toEqual(["LFT"]);
  });

  it("partial panel selection commits member names (INV-D3)", () => {
    expect(labelsFromPanelSelection("lft", ["sgot", "sgpt"])).toEqual([
      "SGOT (AST)",
      "SGPT (ALT)",
    ]);
  });

  it("infers full selection from a panel chip and partial from member chips", () => {
    const panel = getLabPanelById("lft")!;
    expect(inferPanelSelectionFromChips(["LFT"], "lft")).toEqual([
      ...panel.analyteIds,
    ]);
    expect(
      inferPanelSelectionFromChips(["SGOT (AST)", "SGPT (ALT)", "CBC"], "lft"),
    ).toEqual(["sgot", "sgpt"]);
  });

  it("rewrites a panel chip to members (and back) in place (INV-D3)", () => {
    expect(
      applyPanelSelectionToChips(["CBC", "LFT", "Chest X-ray"], "lft", [
        "sgot",
        "sgpt",
      ]),
    ).toEqual(["CBC", "SGOT (AST)", "SGPT (ALT)", "Chest X-ray"]);

    expect(
      applyPanelSelectionToChips(
        ["CBC", "SGOT (AST)", "SGPT (ALT)", "Chest X-ray"],
        "lft",
        getLabPanelById("lft")!.analyteIds,
      ),
    ).toEqual(["CBC", "LFT", "Chest X-ray"]);
  });

  it("clears a panel order when no members remain selected", () => {
    expect(applyPanelSelectionToChips(["LFT", "CBC"], "lft", [])).toEqual([
      "CBC",
    ]);
  });
});

describe("investigation-order-catalog alias dedupe (inv-lib-03)", () => {
  it("canonicalizes analyte aliases to the preferred label", () => {
    expect(canonicalizeOrderLabel("hb")).toBe("Haemoglobin");
    expect(canonicalizeOrderLabel("CXR")).toBe("Chest X-ray");
  });

  it("does not add an alias when the canonical chip already exists", () => {
    expect(
      mergeInvestigationOrderLabels(["Haemoglobin"], ["hb"], LIMITS),
    ).toEqual(["Haemoglobin"]);
  });

  it("treats panel chips as occupying their member analytes", () => {
    const occupied = occupiedOrderIdentityKeys(["CBC"]);
    expect(occupied.has("panel:cbc")).toBe(true);
    expect(occupied.has("analyte:hb")).toBe(true);
    expect(
      mergeInvestigationOrderLabels(["CBC"], ["Haemoglobin"], LIMITS),
    ).toEqual(["CBC"]);
  });

  it("drops member chips when a covering panel is added", () => {
    expect(
      mergeInvestigationOrderLabels(
        ["Haemoglobin", "WBC count", "Chest X-ray"],
        ["CBC"],
        LIMITS,
      ),
    ).toEqual(["Chest X-ray", "CBC"]);
  });
});

describe("investigation-order-catalog local suggest (inv-lib-04)", () => {
  it("returns near-miss catalog suggestions for free text", () => {
    const suggestions = suggestInvestigationOrders("liver function");
    expect(suggestions.some((s) => s.id === "lft")).toBe(true);
  });

  it("returns no suggestions when the query exact-matches the catalog", () => {
    expect(suggestInvestigationOrders("LFT")).toEqual([]);
  });

  it("excludes occupied catalog entries from suggestions", () => {
    const occupied = occupiedOrderIdentityKeys(["LFT"]);
    const suggestions = suggestInvestigationOrders("liver", occupied);
    expect(suggestions.every((s) => s.id !== "lft")).toBe(true);
  });
});

describe("investigation-order-catalog AI term mapping (inv-lib-04)", () => {
  it("maps a clean AI term to its exact catalog entry", () => {
    const mapped = mapResolvedTermsToCatalog(["Liver function test"]);
    expect(mapped.map((e) => e.value)).toEqual(["panel:lft"]);
  });

  it("maps a near-miss AI term through the catalog fuzzy match", () => {
    const mapped = mapResolvedTermsToCatalog(["liver function"]);
    expect(mapped.some((e) => e.id === "lft")).toBe(true);
  });

  it("never surfaces a term with no catalog match (client-side constraint)", () => {
    const mapped = mapResolvedTermsToCatalog(["Zzzxqwerty"]);
    expect(mapped).toEqual([]);
  });

  it("dedupes terms that resolve to the same catalog entry", () => {
    const mapped = mapResolvedTermsToCatalog(["LFT", "Liver function test"]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]!.value).toBe("panel:lft");
  });

  it("skips terms already occupied by an existing order", () => {
    const occupied = occupiedOrderIdentityKeys(["LFT"]);
    const mapped = mapResolvedTermsToCatalog(["Liver function test"], occupied);
    expect(mapped).toEqual([]);
  });
});

describe("investigation-order-catalog structured derivation (inv-lib-05 / INV-D8)", () => {
  it("returns an empty array for empty free text", () => {
    expect(deriveInvestigationOrdersJson("")).toEqual([]);
    expect(deriveInvestigationOrdersJson("   ")).toEqual([]);
  });

  it("resolves catalog-backed chips to kind + stable id", () => {
    const derived = deriveInvestigationOrdersJson("LFT; Chest X-ray; Haemoglobin");
    expect(derived[0]).toMatchObject({
      id: "lft",
      label: "LFT",
      kind: "panel",
      sourcePanelId: "lft",
    });
    expect(derived[0]!.members?.length).toBeGreaterThan(0);
    expect(derived[1]).toMatchObject({
      id: "cxr",
      label: "Chest X-ray",
      kind: "imaging",
      sourcePanelId: "cxr",
    });
    expect(derived[1]!.members?.map((m) => m.id)).toEqual(["pa", "lateral"]);
    expect(derived[2]).toEqual({ id: "hb", label: "Haemoglobin", kind: "analyte" });
  });

  it("marks unmatched chips as custom expandable baskets", () => {
    expect(deriveInvestigationOrdersJson("Zzzxqwerty scan")).toEqual([
      {
        id: "custom:zzzxqwerty scan",
        label: "Zzzxqwerty scan",
        kind: "custom",
        members: [],
      },
    ]);
  });

  it("labels join back to the flat string byte-identically (parity)", () => {
    const flat = "LFT; Chest X-ray; Custom order";
    const derived = deriveInvestigationOrdersJson(flat);
    expect(serializeInvestigationOrdersToFlat(derived)).toBe(flat);
  });

  it("encodes customized baskets as title + members (INV-D11)", () => {
    const basket = createPanelBasket("iron_studies")!;
    basket.members = [
      ...(basket.members ?? []),
      { id: "cbc", label: "CBC", kind: "panel" },
    ];
    basket.label = "Anemia workup";
    expect(isBasketCustomized(basket)).toBe(true);
    const flat = serializeInvestigationOrdersToFlat([basket]);
    expect(flat.startsWith("Anemia workup:")).toBe(true);
    expect(flat).toContain("CBC");
    const parsed = parseInvestigationOrdersFromFlat(flat);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.label).toBe("Anemia workup");
    expect(parsed[0]!.kind).toBe("custom");
    expect(parsed[0]!.members?.some((m) => m.label === "CBC")).toBe(true);
  });

  it("encodes customized X-ray view baskets (INV-D6)", () => {
    const basket = createImagingBasket("cxr")!;
    expect(isBasketCustomized(basket)).toBe(false);
    expect(serializeInvestigationOrdersToFlat([basket])).toBe("Chest X-ray");

    basket.members = [{ id: "pa", label: "PA", kind: "custom" }];
    expect(isBasketCustomized(basket)).toBe(true);
    expect(serializeInvestigationOrdersToFlat([basket])).toBe("Chest X-ray: PA");

    const parsed = parseInvestigationOrdersFromFlat("Chest X-ray: PA, Lateral");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      kind: "imaging",
      id: "cxr",
      label: "Chest X-ray",
    });
    expect(parsed[0]!.members?.map((m) => m.id)).toEqual(["pa", "lateral"]);
    // Membership matches template → still not customized in print sense after reseed...
    // Parsed from explicit list is customized relative to template only if ids differ.
    expect(isBasketCustomized(parsed[0]!)).toBe(false);

    const oblique = parseInvestigationOrdersFromFlat("Chest X-ray: PA, Oblique");
    expect(isBasketCustomized(oblique[0]!)).toBe(true);
    expect(serializeInvestigationOrdersToFlat(oblique)).toBe(
      "Chest X-ray: PA, Oblique",
    );

    expect(createImagingBasket("ecg")).toEqual({
      id: "ecg",
      label: "ECG",
      kind: "imaging",
    });
  });

  it("encodes CT/MRI requisition + related scans into flat TEXT", () => {
    const basket = createImagingBasket("ct_abdomen")!;
    expect(basket.requisition).toBeTruthy();
    expect(isBasketCustomized(basket)).toBe(false);
    expect(isBasketMembershipCustomized(basket)).toBe(false);
    expect(serializeInvestigationOrdersToFlat([basket])).toBe("CT abdomen");

    basket.requisition = {
      contrast: "contrast",
      site: null,
      urgency: "urgent",
      indication: "r/o appendicitis",
    };
    // Requisition alone is NOT a "custom package" — still prints on the Rx.
    expect(isBasketCustomized(basket)).toBe(false);
    expect(isBasketMembershipCustomized(basket)).toBe(false);
    expect(serializeInvestigationOrdersToFlat([basket])).toBe(
      "CT abdomen (CECT, urgent) — r/o appendicitis",
    );

    basket.members = [
      { id: "ct_pelvis", label: "CT pelvis", kind: "custom" },
    ];
    expect(isBasketCustomized(basket)).toBe(true);
    expect(isBasketMembershipCustomized(basket)).toBe(true);
    expect(serializeInvestigationOrdersToFlat([basket])).toBe(
      "CT abdomen (CECT, urgent): CT pelvis — r/o appendicitis",
    );

    const parsed = parseInvestigationOrdersFromFlat(
      "CT abdomen (CECT, urgent): CT pelvis — r/o appendicitis",
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      kind: "imaging",
      id: "ct_abdomen",
      label: "CT abdomen",
    });
    expect(parsed[0]!.requisition).toMatchObject({
      contrast: "contrast",
      urgency: "urgent",
      indication: "r/o appendicitis",
    });
    expect(parsed[0]!.members?.map((m) => m.id)).toEqual(["ct_pelvis"]);

    const indicationOnly = parseInvestigationOrdersFromFlat(
      "CT brain (plain) — headache",
    );
    expect(indicationOnly[0]?.id).toBe("ct_brain");
    expect(indicationOnly[0]?.requisition).toMatchObject({
      contrast: "plain",
      indication: "headache",
    });
    expect(isBasketMembershipCustomized(indicationOnly[0]!)).toBe(false);
  });

  it("lets custom orders expand with added members", () => {
    const basket = createCustomBasket("Pre-op pack");
    expect(basket).toMatchObject({
      kind: "custom",
      label: "Pre-op pack",
      members: [],
    });
    expect(serializeInvestigationOrdersToFlat([basket])).toBe("Pre-op pack");

    basket.members = [
      { id: "hb", label: "Haemoglobin", kind: "analyte" },
      { id: "cxr", label: "Chest X-ray", kind: "imaging" },
    ];
    expect(isBasketCustomized(basket)).toBe(true);
    expect(serializeInvestigationOrdersToFlat([basket])).toBe(
      "Pre-op pack: Haemoglobin, Chest X-ray",
    );
    const parsed = parseInvestigationOrdersFromFlat(
      "Pre-op pack: Haemoglobin, Chest X-ray",
    );
    expect(parsed[0]).toMatchObject({
      kind: "custom",
      label: "Pre-op pack",
    });
    expect(parsed[0]!.members?.map((m) => m.label)).toEqual([
      "Haemoglobin",
      "Chest X-ray",
    ]);
  });
});
