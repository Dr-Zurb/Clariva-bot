import { describe, expect, it } from "vitest";
import {
  quickResolveButtonResolutions,
  resolveQuickResolveAction,
} from "@/lib/service-reviews/quick-resolve";
import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";
import type { ServiceMatchAssistHint } from "@/types/service-staff-review";

const catalog = {
  version: 1,
  services: [
    { service_id: "svc-general", service_key: "general", label: "General consult" },
    { service_id: "svc-followup", service_key: "followup", label: "Follow-up" },
  ],
} as unknown as ServiceCatalogV1;

const hint: ServiceMatchAssistHint = {
  pattern_key: "p1",
  feature_snapshot_hash: "h1",
  total_resolutions: 8,
  top_resolutions: [
    { final_catalog_service_key: "general", count: 5, label: "General consult" },
    { final_catalog_service_key: "followup", count: 3, label: "Follow-up" },
    { final_catalog_service_key: "removed", count: 2, label: "Removed service" },
  ],
};

describe("resolveQuickResolveAction", () => {
  it("routes matching keys to confirm", () => {
    expect(resolveQuickResolveAction("general", "general", catalog)).toEqual({ kind: "confirm" });
  });

  it("routes different in-catalog keys to reassign without teaching append fields", () => {
    expect(resolveQuickResolveAction("general", "followup", catalog)).toEqual({
      kind: "reassign",
      catalogServiceKey: "followup",
      catalogServiceId: "svc-followup",
    });
  });

  it("returns null when resolution is not in catalog", () => {
    expect(resolveQuickResolveAction("general", "removed", catalog)).toBeNull();
  });
});

describe("quickResolveButtonResolutions", () => {
  it("returns top resolutions that can be acted on (max 2)", () => {
    expect(
      quickResolveButtonResolutions(hint, "general", catalog).map((h) => h.final_catalog_service_key)
    ).toEqual(["general", "followup"]);
  });

  it("omits unknown-catalog resolutions", () => {
    expect(
      quickResolveButtonResolutions(
        {
          ...hint,
          top_resolutions: [{ final_catalog_service_key: "removed", count: 2, label: "Removed" }],
        },
        "general",
        catalog
      )
    ).toEqual([]);
  });
});
