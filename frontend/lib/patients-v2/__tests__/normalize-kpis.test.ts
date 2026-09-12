import { describe, expect, it } from "vitest";
import { normalizePatientsKpis } from "@/lib/patients-v2/normalize-kpis";

describe("normalizePatientsKpis", () => {
  it("passes through the PKD shape", () => {
    const raw = {
      incomplete_consults: { count: 2, delta_7d: 1 },
      new_30d: { count: 5, delta_7d: 0 },
      followup_overdue: { count: 3, delta_7d: 2 },
      revisits_30d: { count: 4, delta_7d: 1 },
      cache_ttl_seconds: 60,
    };
    expect(normalizePatientsKpis(raw)).toEqual(raw);
  });

  it("zeros PKD tiles when the live API returns the older pr-03 object", () => {
    const normalized = normalizePatientsKpis({
      active_90d: { count: 10, delta_7d: 1 },
      new_30d: { count: 5, delta_7d: 0 },
      followup_overdue: { count: 3, delta_7d: 2 },
      open_episodes: { count: 7, delta_7d: 0 },
      possible_duplicates: { count: 1, delta_7d: 0 },
      cache_ttl_seconds: 60,
    });
    expect(normalized.incomplete_consults).toEqual({ count: 0, delta_7d: 0 });
    expect(normalized.revisits_30d).toEqual({ count: 0, delta_7d: 0 });
    expect(normalized.new_30d).toEqual({ count: 5, delta_7d: 0 });
    expect(normalized.followup_overdue).toEqual({ count: 3, delta_7d: 2 });
  });

  it("does not throw on empty or undefined payloads", () => {
    expect(normalizePatientsKpis(undefined).incomplete_consults.count).toBe(0);
    expect(normalizePatientsKpis({}).new_30d.count).toBe(0);
  });
});
