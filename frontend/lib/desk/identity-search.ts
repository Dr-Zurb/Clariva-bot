import { ageYearsFromIsoDate, type DeskAgeMode } from "@/lib/desk/age";

const MIN_NAME_LENGTH = 3;

export type DeskIdentityQuery = {
  name?: string;
  guardianName?: string;
  age?: number;
  gender?: string;
};

export function deskSearchAgeYears(
  mode: DeskAgeMode,
  ageRaw: string,
  dateOfBirth: string
): number | undefined {
  if (mode === "dob") {
    const years = ageYearsFromIsoDate(dateOfBirth);
    return years == null ? undefined : years;
  }
  const n = Number.parseInt(ageRaw.trim(), 10);
  if (!Number.isInteger(n) || n < 1) return undefined;
  if (mode === "years") return n;
  if (mode === "months") return n >= 12 ? Math.floor(n / 12) : 0;
  return 0;
}

export function isDeskIdentitySearchReady(query: DeskIdentityQuery): boolean {
  return (query.name ?? "").trim().length >= MIN_NAME_LENGTH;
}

export type DeskLookupSource = "search" | "live" | "empty-search" | "idle";

/** One result list: explicit search wins, else live form matches. */
export function resolveDeskLookup<T>(
  matches: T[] | null,
  liveHits: T[]
): { source: DeskLookupSource; rows: T[] } {
  if (matches && matches.length > 0) return { source: "search", rows: matches };
  if (liveHits.length > 0) return { source: "live", rows: liveHits };
  if (matches && matches.length === 0) return { source: "empty-search", rows: [] };
  return { source: "idle", rows: [] };
}

export function mergeDeskPatientIds<T extends { id: string }>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) {
    for (const row of list) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }
  return Array.from(byId.values());
}
