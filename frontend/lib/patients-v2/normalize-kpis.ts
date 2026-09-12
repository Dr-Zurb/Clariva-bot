import type { PatientsKpis } from "@/types/patient";

const EMPTY = { count: 0, delta_7d: 0 };

function asBucket(value: unknown): { count: number; delta_7d: number } {
  if (!value || typeof value !== "object") return { ...EMPTY };
  const v = value as { count?: unknown; delta_7d?: unknown };
  return {
    count: typeof v.count === "number" && Number.isFinite(v.count) ? v.count : 0,
    delta_7d:
      typeof v.delta_7d === "number" && Number.isFinite(v.delta_7d)
        ? v.delta_7d
        : 0,
  };
}

/**
 * Live `main` API still returns the older pr-03 KPI object
 * (`open_episodes`, `active_90d`). The patients strip reads the PKD
 * shape (`incomplete_consults`, `revisits_30d`). Missing buckets become 0
 * so a shape mismatch cannot white-screen the list.
 */
export function normalizePatientsKpis(raw: unknown): PatientsKpis {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    incomplete_consults: asBucket(o.incomplete_consults),
    new_30d: asBucket(o.new_30d),
    followup_overdue: asBucket(o.followup_overdue),
    revisits_30d: asBucket(o.revisits_30d),
    cache_ttl_seconds:
      typeof o.cache_ttl_seconds === "number" && Number.isFinite(o.cache_ttl_seconds)
        ? o.cache_ttl_seconds
        : 60,
  };
}
