/**
 * Doctor-saved / auto-promoted custom investigation orders.
 */
import { describe, expect, it } from "vitest";
import {
  doctorCustomOrdersToCatalogEntries,
  occupiedKeysFromOrders,
  parseOrderCatalogValue,
  resolveInvestigationOrderCatalog,
} from "@/lib/cockpit/investigation-order-catalog";
import {
  INVESTIGATIONS_CUSTOM_ORDER_AUTO_PROMOTE_USES,
  isInvestigationCustomOrderSaved,
  normalizeInvestigationCustomOrders,
  pinInvestigationCustomOrder,
  recordInvestigationCustomOrderUse,
  removeInvestigationCustomOrder,
  renameInvestigationCustomOrder,
  visibleInvestigationCustomOrders,
} from "@/lib/cockpit/investigations-custom-orders";
import type { InvestigationOrder } from "@/types/prescription";

const anemia: InvestigationOrder = {
  id: "custom:anemia workup",
  label: "Anemia workup",
  kind: "custom",
  members: [
    { id: "hb", label: "Hemoglobin", kind: "analyte" },
    { id: "ferritin", label: "Ferritin", kind: "analyte" },
  ],
};

describe("investigations-custom-orders", () => {
  it("normalizes, dedupes by id, and caps malformed rows", () => {
    const rows = normalizeInvestigationCustomOrders([
      {
        id: "custom:anemia workup",
        label: "Anemia workup",
        useCount: 1,
        pinned: false,
        updatedAt: "2026-07-01T00:00:00.000Z",
        members: [{ id: "hb", label: "Hemoglobin", kind: "analyte" }],
      },
      {
        id: "custom:anemia workup",
        label: "Anemia workup v2",
        useCount: 3,
        pinned: true,
        updatedAt: "2026-07-02T00:00:00.000Z",
      },
      { id: "", label: "bad" },
      null,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Anemia workup v2");
    expect(rows[0]?.pinned).toBe(true);
    expect(rows[0]?.useCount).toBe(3);
  });

  it("does not surface a custom order until pinned or auto-promoted", () => {
    const first = recordInvestigationCustomOrderUse([], anemia);
    expect(first.order.useCount).toBe(1);
    expect(first.order.pinned).toBe(false);
    expect(first.autoPromoted).toBe(false);
    expect(visibleInvestigationCustomOrders(first.orders)).toHaveLength(0);

    const second = recordInvestigationCustomOrderUse(first.orders, anemia);
    expect(second.order.useCount).toBe(
      INVESTIGATIONS_CUSTOM_ORDER_AUTO_PROMOTE_USES,
    );
    expect(second.order.pinned).toBe(true);
    expect(second.autoPromoted).toBe(true);
    expect(visibleInvestigationCustomOrders(second.orders)).toHaveLength(1);
  });

  it("pins immediately on explicit save", () => {
    const pinned = pinInvestigationCustomOrder([], anemia);
    expect(pinned[0]?.pinned).toBe(true);
    expect(pinned[0]?.useCount).toBe(1);
    expect(pinned[0]?.members).toHaveLength(2);
    expect(isInvestigationCustomOrderSaved(pinned, anemia.id)).toBe(true);
  });

  it("renames in place with a stable id", () => {
    const pinned = pinInvestigationCustomOrder([], anemia);
    const renamed = renameInvestigationCustomOrder(
      pinned,
      anemia.id,
      "anemia panel",
    );
    expect(renamed).toHaveLength(1);
    expect(renamed[0]?.id).toBe(anemia.id);
    expect(renamed[0]?.label).toBe("Anemia panel");
    expect(isInvestigationCustomOrderSaved(renamed, anemia.id)).toBe(true);
  });

  it("deletes from vocabulary without affecting other rows", () => {
    const pinned = pinInvestigationCustomOrder([], anemia);
    const withSecond = pinInvestigationCustomOrder(pinned, {
      id: "custom:fever workup",
      label: "Fever workup",
      kind: "custom",
      members: [],
    });
    expect(withSecond).toHaveLength(2);
    const next = removeInvestigationCustomOrder(withSecond, anemia.id);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("custom:fever workup");
    expect(isInvestigationCustomOrderSaved(next, anemia.id)).toBe(false);
  });

  it("merges visible customs into catalog resolve + occupied keys", () => {
    const pinned = pinInvestigationCustomOrder([], anemia);
    const extras = doctorCustomOrdersToCatalogEntries(
      visibleInvestigationCustomOrders(pinned),
    );
    expect(extras[0]?.kind).toBe("custom");
    expect(parseOrderCatalogValue(extras[0]!.value)).toEqual({
      kind: "custom",
      id: "anemia workup",
    });
    expect(resolveInvestigationOrderCatalog("Anemia workup", extras)).toBe(
      extras[0]?.value,
    );

    const occupied = occupiedKeysFromOrders([anemia]);
    expect(occupied.has("custom:anemia workup")).toBe(true);
    expect(occupied.has("custom:custom:anemia workup")).toBe(false);
  });
});
