/**
 * Per-site lymphadenopathy model (obj-32).
 *
 * Each selected site carries its own laterality, size, character, and notes.
 * Stored on `ExamFindingEntry.attributes.sitesJson` as a JSON array.
 */

export const LYMPH_SITES_JSON_KEY = "sitesJson";

export type LymphSiteId =
  | "cervical"
  | "supraclavicular"
  | "axillary"
  | "epitrochlear"
  | "inguinal"
  | "generalized";

export type LymphLaterality = "Bilateral" | "Left" | "Right";

export type LymphSize = "≤1 cm" | "1–2 cm" | ">2 cm";

export interface LymphSiteCatalogItem {
  id: LymphSiteId;
  label: string;
}

export interface LymphSiteEntry {
  site: LymphSiteId;
  laterality?: LymphLaterality;
  size?: LymphSize;
  character?: string[];
  notes?: string;
}

export const LYMPH_SITE_CATALOG: readonly LymphSiteCatalogItem[] = [
  { id: "cervical", label: "Cervical" },
  { id: "supraclavicular", label: "Supraclavicular" },
  { id: "axillary", label: "Axillary" },
  { id: "epitrochlear", label: "Epitrochlear" },
  { id: "inguinal", label: "Inguinal" },
  { id: "generalized", label: "Generalized" },
] as const;

export const LYMPH_LATERALITY_CHIPS: readonly LymphLaterality[] = [
  "Bilateral",
  "Left",
  "Right",
] as const;

export const LYMPH_SIZE_CHIPS: readonly LymphSize[] = ["≤1 cm", "1–2 cm", ">2 cm"] as const;

export const LYMPH_CHARACTER_CHIPS = [
  "Mobile",
  "Tender",
  "Non-tender",
  "Fixed",
  "Matted",
  "Rubbery",
  "Hard",
] as const;

const LYMPH_SITE_ORDER = LYMPH_SITE_CATALOG.map((item) => item.id);

const SITE_LABEL_TO_ID = new Map(
  LYMPH_SITE_CATALOG.map((item) => [item.label.toLowerCase(), item.id]),
);

export function lymphSiteLabel(siteId: LymphSiteId): string {
  return LYMPH_SITE_CATALOG.find((item) => item.id === siteId)?.label ?? siteId;
}

export function resolveLymphSiteId(label: string): LymphSiteId | null {
  const normalized = label.trim().toLowerCase();
  const byLabel = SITE_LABEL_TO_ID.get(normalized);
  if (byLabel) return byLabel;
  const byId = LYMPH_SITE_ORDER.find((id) => id === normalized);
  return byId ?? null;
}

function splitCommaSeparated(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sanitizeCharacterList(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const values = raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length > 0 ? values : undefined;
  }
  if (typeof raw === "string") {
    const values = splitCommaSeparated(raw);
    return values.length > 0 ? values : undefined;
  }
  return undefined;
}

function sanitizeLymphSiteEntry(raw: unknown): LymphSiteEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const siteRaw = typeof row.site === "string" ? row.site.trim() : "";
  const site = resolveLymphSiteId(siteRaw);
  if (!site) return null;

  const entry: LymphSiteEntry = { site };

  if (typeof row.laterality === "string") {
    const lat = row.laterality.trim() as LymphLaterality;
    if (LYMPH_LATERALITY_CHIPS.includes(lat) && site !== "generalized") {
      entry.laterality = lat;
    }
  }

  if (typeof row.size === "string") {
    const size = row.size.trim() as LymphSize;
    if (LYMPH_SIZE_CHIPS.includes(size)) entry.size = size;
  }

  const character = sanitizeCharacterList(row.character);
  if (character?.length) entry.character = character;

  if (typeof row.notes === "string") {
    const notes = row.notes.trim();
    if (notes) entry.notes = notes;
  }

  return entry;
}

function sortLymphSites(sites: LymphSiteEntry[]): LymphSiteEntry[] {
  return [...sites].sort((a, b) => {
    const ai = LYMPH_SITE_ORDER.indexOf(a.site);
    const bi = LYMPH_SITE_ORDER.indexOf(b.site);
    return ai - bi;
  });
}

/** Parse `sitesJson`; returns empty array when absent or invalid. */
export function parseLymphSites(attributes: Record<string, string>): LymphSiteEntry[] {
  const raw = attributes[LYMPH_SITES_JSON_KEY]?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const sites: LymphSiteEntry[] = [];
      for (const item of parsed) {
        const entry = sanitizeLymphSiteEntry(item);
        if (entry) sites.push(entry);
      }
      return sortLymphSites(sites);
    } catch {
      return [];
    }
  }
  return [];
}

/** Migrate flat legacy lymphadenopathy attrs into `sitesJson`. */
export function migrateLymphadenopathyAttributes(
  attributes: Record<string, string>,
): Record<string, string> {
  const existing = parseLymphSites(attributes);
  if (existing.length > 0) {
    return { [LYMPH_SITES_JSON_KEY]: serializeLymphSites(existing) };
  }

  const legacySites = splitCommaSeparated(attributes.sites);
  if (legacySites.length === 0) return attributes;

  const sharedCharacter = sanitizeCharacterList(attributes.character);
  const sharedNotes = attributes.notes?.trim();

  const sites: LymphSiteEntry[] = [];
  for (const label of legacySites) {
    const site = resolveLymphSiteId(label);
    if (!site) continue;
    const entry: LymphSiteEntry = { site };
    if (sharedCharacter?.length) entry.character = sharedCharacter;
    if (sharedNotes) entry.notes = sharedNotes;
    sites.push(entry);
  }

  if (sites.length === 0) return attributes;
  return { [LYMPH_SITES_JSON_KEY]: serializeLymphSites(sites) };
}

export function serializeLymphSites(sites: readonly LymphSiteEntry[]): string {
  const cleaned = sortLymphSites(
    sites
      .map((entry) => sanitizeLymphSiteEntry(entry))
      .filter((entry): entry is LymphSiteEntry => entry !== null),
  );
  return JSON.stringify(cleaned);
}

export function lymphAttributesHaveContent(attributes: Record<string, string>): boolean {
  return parseLymphSites(migrateLymphadenopathyAttributes(attributes)).length > 0;
}

function formatLymphSiteSegment(entry: LymphSiteEntry): string {
  const label = lymphSiteLabel(entry.site);
  const parts: string[] = [];
  if (entry.laterality) parts.push(entry.laterality);
  if (entry.size) parts.push(entry.size);
  if (entry.character?.length) parts.push(...entry.character);
  if (entry.notes?.trim()) parts.push(entry.notes.trim());
  return parts.length > 0 ? `${label} (${parts.join(", ")})` : label;
}

export function lymphPreviewParts(attributes: Record<string, string>): string[] {
  const sites = parseLymphSites(migrateLymphadenopathyAttributes(attributes));
  return sites.map(formatLymphSiteSegment);
}

export function lymphDerivedDetail(attributes: Record<string, string>): string {
  const sites = parseLymphSites(migrateLymphadenopathyAttributes(attributes));
  return sites
    .map((entry) => {
      const label = lymphSiteLabel(entry.site);
      const parts: string[] = [];
      if (entry.laterality) parts.push(entry.laterality.toLowerCase());
      if (entry.size) parts.push(entry.size);
      if (entry.character?.length) parts.push(...entry.character.map((c) => c.toLowerCase()));
      if (entry.notes?.trim()) parts.push(entry.notes.trim());
      return parts.length > 0 ? `${label}: ${parts.join(", ")}` : label;
    })
    .join("; ");
}

export function patchLymphSites(
  sites: readonly LymphSiteEntry[],
  siteId: LymphSiteId,
  patch: Partial<Omit<LymphSiteEntry, "site">>,
): LymphSiteEntry[] {
  const index = sites.findIndex((entry) => entry.site === siteId);
  if (index === -1) return [...sites];

  const current = sites[index]!;
  const merged = { ...current, ...patch, site: siteId };
  const next: LymphSiteEntry = { site: siteId };

  if (siteId !== "generalized" && merged.laterality) {
    next.laterality = merged.laterality;
  }
  if (merged.size) next.size = merged.size;
  if (merged.character?.length) next.character = merged.character;
  if (merged.notes?.trim()) next.notes = merged.notes.trim();

  const updated = [...sites];
  updated[index] = next;
  return updated;
}

export function toggleLymphSite(
  sites: readonly LymphSiteEntry[],
  siteId: LymphSiteId,
): LymphSiteEntry[] {
  const exists = sites.some((entry) => entry.site === siteId);
  if (exists) return sites.filter((entry) => entry.site !== siteId);
  return sortLymphSites([...sites, { site: siteId }]);
}
